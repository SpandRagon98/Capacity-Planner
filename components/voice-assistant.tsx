'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  interpretVoiceCommand,
  todayIso,
  type Workspace,
  type WorkspaceStoreConfig,
} from '@/lib/planner';
import {
  localVoiceCommand,
  voiceContext,
  voiceDeleteSummary,
  workspaceFingerprint,
  type VoiceIntent,
} from '@/lib/voice';

type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionError = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function speechConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function VoiceAssistant({
  open,
  onOpenChange,
  workspace,
  workspaceId,
  config,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  workspaceId: string;
  config: WorkspaceStoreConfig;
  onApply: (actions: VoiceIntent[], fingerprint: string, workspaceId: string) => void;
}) {
  const [language, setLanguage] = useState('en-IN');
  const [transcript, setTranscript] = useState('');
  const [voiceToken, setVoiceToken] = useState('');
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);
  const [pending, setPending] = useState<{ actions: VoiceIntent[]; fingerprint: string; workspaceId: string } | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const onApplyRef = useRef(onApply);
  const spokenRef = useRef('');
  const closedRef = useRef(false);

  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  useEffect(() => {
    queueMicrotask(() => {
      setVoiceToken(sessionStorage.getItem('capexity-voice-token') || '');
      setSupported(Boolean(speechConstructor()));
    });
  }, []);

  useEffect(() => {
    if (open) {
      closedRef.current = false;
      return;
    }
    closedRef.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    queueMicrotask(() => {
      setListening(false);
      setPending(null);
    });
  }, [open]);

  async function runCommand(text: string) {
    const clean = text.trim();
    if (closedRef.current || !clean) return;
    if (clean.length > 800) {
      setNotice('Please split this into shorter commands (maximum 800 characters).');
      return;
    }
    const fingerprint = workspaceFingerprint(workspace);
    const local = localVoiceCommand(workspace, clean);
    if (local) {
      setUsage({ inputTokens: 0, outputTokens: 0 });
      if (local.some((action) => action.op === 'delete')) {
        setPending({ actions: local, fingerprint, workspaceId });
        setNotice('Please confirm the deletion below. Nothing has been changed yet.');
      } else {
        try {
          onApplyRef.current(local, fingerprint, workspaceId);
          setNotice('Task change applied without using Claude tokens. Check the sync badge for save status.');
          setTranscript('');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Could not apply the task change');
        }
      }
      return;
    }
    if (!config.endpoint) {
      setNotice('Connect Google Sheets storage in Settings before using Claude voice commands.');
      return;
    }
    if (!voiceToken.trim()) {
      setNotice('Enter the separate voice access token configured in Apps Script.');
      return;
    }
    setPending(null);
    setBusy(true);
    setNotice('Understanding your task command…');
    try {
      const context = voiceContext(workspace, clean);
      const result = await interpretVoiceCommand(config, {
        voiceToken: voiceToken.trim(),
        transcript: clean,
        today: todayIso(),
        tasks: context.tasks,
        plans: context.plans,
      });
      if (closedRef.current) return;
      const allowedTasks = new Set(context.tasks.map((task) => task.id));
      const allowedPlans = new Set(context.plans.map((plan) => plan.id));
      for (const action of result.actions) {
        if (action.op !== 'create' && (!action.id || !allowedTasks.has(action.id)))
          throw new Error('Claude could not identify an exact task. Please use its full name and try again.');
        if (action.parentId && !allowedTasks.has(action.parentId))
          throw new Error('Claude could not identify the parent task.');
        if (action.planId && !allowedPlans.has(action.planId))
          throw new Error('Claude could not identify the plan.');
      }
      setUsage(result.usage || null);
      if (result.question) {
        setNotice(result.question);
        return;
      }
      if (!result.actions.length) {
        setNotice('No task change was found. Please say what you want to add or change.');
        return;
      }
      if (result.actions.some((action) => action.op === 'delete')) {
        setPending({ actions: result.actions, fingerprint, workspaceId });
        setNotice('Please confirm the deletion below. Nothing has been changed yet.');
        return;
      }
      onApplyRef.current(result.actions, fingerprint, workspaceId);
      setNotice(`${result.actions.length} task change${result.actions.length === 1 ? '' : 's'} applied. Check the workspace sync badge for save status.`);
      setTranscript('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not understand this command');
    } finally {
      if (!closedRef.current) setBusy(false);
    }
  }

  function startListening() {
    const Constructor = speechConstructor();
    if (!Constructor) {
      setNotice('Speech recognition is unavailable in this browser. You can type the command below.');
      return;
    }
    if (recognitionRef.current) return;
    setNotice('');
    setPending(null);
    spokenRef.current = '';
    const recognition = new Constructor();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const parts = Array.from(event.results);
      const final = parts.filter((part) => part.isFinal).map((part) => part[0]?.transcript || '').join(' ').trim();
      const interim = parts.filter((part) => !part.isFinal).map((part) => part[0]?.transcript || '').join(' ').trim();
      spokenRef.current = final || interim;
      setTranscript([final, interim].filter(Boolean).join(' '));
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') setNotice(`Microphone error: ${event.error}. You can type the command instead.`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (spokenRef.current.trim()) void runCommand(spokenRef.current);
      else setNotice((current) => current || 'No speech was detected. Try again or type the command.');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setNotice('Could not start microphone recognition. Check browser permissions.');
    }
  }

  function confirmPending() {
    if (!pending) return;
    try {
      onApplyRef.current(pending.actions, pending.fingerprint, pending.workspaceId);
      setNotice(`${pending.actions.length} task change${pending.actions.length === 1 ? '' : 's'} applied. Check the workspace sync badge for save status.`);
      setPending(null);
      setTranscript('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not apply the task changes');
      setPending(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="voice-sheet">
        <SheetHeader>
          <p className="eyebrow">Voice assistant</p>
          <SheetTitle>Tell Capexity what to do</SheetTitle>
          <SheetDescription>
            Speak or type in English, Hindi or Hinglish. Simple changes save automatically; deletions need confirmation.
          </SheetDescription>
        </SheetHeader>
        <div className="voice-content">
          <div className="voice-mic-row">
            <Button
              type="button"
              size="lg"
              disabled={busy || !supported}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              onClick={() => listening ? recognitionRef.current?.stop() : startListening()}
            >
              {listening ? <MicOff /> : <Mic />}
              {listening ? 'Stop listening' : 'Speak a command'}
            </Button>
            <NativeSelect aria-label="Speech language" value={language} onChange={(event) => setLanguage(event.target.value)} disabled={listening}>
              <NativeSelectOption value="en-IN">English / Hinglish</NativeSelectOption>
              <NativeSelectOption value="hi-IN">Hindi</NativeSelectOption>
            </NativeSelect>
          </div>
          {!supported && <p className="voice-hint">This browser does not provide speech recognition. Typed commands still work.</p>}
          <p className="voice-hint">The microphone stops after each command. Browser speech recognition may use your browser provider’s online service; only the transcript is sent to Claude.</p>
          <label className="voice-field" htmlFor="voice-transcript">
            Command transcript
            <Textarea
              id="voice-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              maxLength={800}
              placeholder="Add a task to review the deck tomorrow at 10 AM for one hour…"
            />
          </label>
          <label className="voice-field" htmlFor="voice-access-token">
            Voice access token <small>this browser session only; not your Claude API key</small>
            <Input
              id="voice-access-token"
              type="password"
              autoComplete="off"
              value={voiceToken}
              onChange={(event) => {
                setVoiceToken(event.target.value);
                sessionStorage.setItem('capexity-voice-token', event.target.value);
              }}
              placeholder="Enter the separate token from Apps Script"
            />
          </label>
          <Button type="button" disabled={busy || listening || !transcript.trim()} onClick={() => void runCommand(transcript)}>
            <Sparkles /> {busy ? 'Understanding…' : 'Run typed command'}
          </Button>
          {notice && <output className="voice-notice">{notice}</output>}
          {pending && (
            <div className="voice-confirm">
              <strong>Confirm task deletion</strong>
              <ul>{voiceDeleteSummary(workspace, pending.actions).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
              <div>
                <Button type="button" variant="destructive" onClick={confirmPending}>Delete and apply</Button>
                <Button type="button" variant="outline" onClick={() => { setPending(null); setNotice('Deletion cancelled.'); }}>Cancel</Button>
              </div>
            </div>
          )}
          {usage && <small className="voice-usage">Last Claude request: {usage.inputTokens} input + {usage.outputTokens} output tokens.</small>}
          {!config.endpoint && <p className="voice-hint">Simple add/complete commands work locally. For Hindi, Hinglish, scheduling and more complex instructions, connect your Google Sheets Apps Script in Settings. The Claude key stays in that script’s private properties.</p>}
          <details className="voice-setup">
            <summary>How to enable Claude voice commands</summary>
            <ol>
              <li>Update and redeploy the Capexity Google Apps Script code.</li>
              <li>In Apps Script Project Settings, add a new Claude key as <code>ANTHROPIC_API_KEY</code>.</li>
              <li>Add a separate random secret of at least 24 characters as <code>CAPEXITY_VOICE_TOKEN</code>.</li>
              <li>Paste only that separate voice token above, never the Claude API key.</li>
            </ol>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}
