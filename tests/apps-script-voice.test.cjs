const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const values = {
    ANTHROPIC_API_KEY: 'test-only-api-key',
    CAPEXITY_VOICE_TOKEN: 'separate-test-token-of-32-chars',
  };
  const requests = [];
  const store = {
    getProperty: (key) => values[key] ?? null,
    setProperty: (key, value) => { values[key] = value; },
    getProperties: () => ({ ...values }),
    deleteProperty: (key) => { delete values[key]; },
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => store },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    UrlFetchApp: {
      fetch: (url, options) => {
        requests.push({ url, options });
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ actions: [{ op: 'create', title: 'Test task' }], question: '' }) }],
            usage: { input_tokens: 142, output_tokens: 21 },
          }),
        };
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(source, context);
  const request = {
    email: 'spandan@gmail.com',
    voiceToken: values.CAPEXITY_VOICE_TOKEN,
    transcript: 'Kal review task add karo',
    today: '2026-09-14',
    tasks: [],
    plans: [],
  };
  return { context, request, requests, values };
}

test('Claude key stays server-side and only transcript/task context is sent', () => {
  const { context, request, requests, values } = setup();
  const result = context.interpretVoice(request);
  assert.equal(result.actions[0].title, 'Test task');
  assert.equal(result.usage.inputTokens, 142);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].options.headers['x-api-key'], values.ANTHROPIC_API_KEY);
  assert.equal(JSON.stringify(result).includes(values.ANTHROPIC_API_KEY), false);
  const body = JSON.parse(requests[0].options.payload);
  assert.equal(body.model, 'claude-haiku-4-5');
  assert.equal(body.max_tokens, 500);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].content.includes(request.transcript), true);
});

test('voice requires its own token and limits each account to 40 requests daily', () => {
  const { context, request, requests } = setup();
  assert.throws(() => context.interpretVoice({ ...request, voiceToken: 'wrong' }), /incorrect/);
  assert.equal(requests.length, 0);
  for (let index = 0; index < 40; index++) context.interpretVoice(request);
  assert.throws(() => context.interpretVoice(request), /Daily voice limit/);
  assert.equal(requests.length, 40);
});
