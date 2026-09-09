'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import {
  Archive, CalendarCheck2, CalendarDays, ChartNoAxesGantt, Check, ChevronRight, Circle,
  Clock3, Copy, Download, FileSpreadsheet, FolderKanban, History, Home, ListTodo,
  LockKeyhole, LogOut, Moon, Pencil, Plus, Search, Settings, Sun, Trash2, UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import {
  calculateEndTime, closeDay, exportWorkbook, loadWorkspace, makeId, Plan, PlannerTask, saveWorkspace,
  statusColors, TaskPriority, TaskStatus, todayIso, Workspace,
} from '@/lib/planner';

type View = 'Home' | 'Today' | 'Tasks' | 'Plans' | 'Gantt' | 'Workload' | 'Calendar' | 'History' | 'Export' | 'Settings';
type Theme = 'light' | 'dark';
type TaskDraftState = { open: boolean; task: PlannerTask | null; parentId?: string; planId?: string };

const navItems: { label: View; icon: typeof Home }[] = [
  { label: 'Home', icon: Home },
  { label: 'Today', icon: CalendarCheck2 },
  { label: 'Tasks', icon: ListTodo },
  { label: 'Plans', icon: FolderKanban },
  { label: 'Gantt', icon: ChartNoAxesGantt },
  { label: 'Workload', icon: UsersRound },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'History', icon: History },
  { label: 'Export', icon: FileSpreadsheet },
  { label: 'Settings', icon: Settings },
];

const viewCopy: Record<View, { title: string; subtitle: string }> = {
  Home: { title: 'Workspace', subtitle: 'A simple view of your tasks and plans.' },
  Today: { title: 'Today', subtitle: 'Only the work scheduled for today.' },
  Tasks: { title: 'Standalone tasks', subtitle: 'Tasks that are not part of a plan.' },
  Plans: { title: 'Plans', subtitle: 'Keep planned work separate and organized.' },
  Gantt: { title: 'Gantt chart', subtitle: 'See scheduled work and plan timing at a glance.' },
  Workload: { title: 'Workload', subtitle: 'Time entered across each owner.' },
  Calendar: { title: 'Calendar', subtitle: 'Browse work grouped by its planned date.' },
  History: { title: 'History', subtitle: 'A clear record of changes and completed work.' },
  Export: { title: 'Export', subtitle: 'Download clean Excel sheets for plans and tasks.' },
  Settings: { title: 'Settings', subtitle: 'Choose how the workspace looks and behaves.' },
};

const emptyTask = (): PlannerTask => ({
  id: makeId('TASK'), title: '', owners: [], status: 'Starting', priority: 'Medium', tags: [], dependencyIds: [], progress: 0,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (['spandan@gmail.com', 'mandhya@gmail.com'].includes(normalized) && password === 'data1234') {
      localStorage.setItem('tcp-session-email', normalized);
      onSuccess(normalized);
      return;
    }
    setError('Email or password is incorrect.');
  }
  return <main className="login-shell">
    <section className="login-panel">
      <div className="brand-lockup"><span className="brand-mark"><span /></span><span>Capexity</span></div>
      <div className="login-copy"><p className="eyebrow">Private workspace</p><h1>Plan less.<br />Finish more.</h1><p>Tasks, subtasks, plans, and time in one focused place.</p></div>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="login-email">Email address<Input id="login-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" /></label>
        <label htmlFor="login-password">Password<Input id="login-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Enter password" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" size="lg">Sign in</Button>
      </form>
      <p className="privacy-note"><LockKeyhole size={15} /> Data stays on this device</p>
    </section>
    <section className="login-visual" aria-label="Capexity workspace preview">
      <div className="visual-topline"><span>Simple planning</span><span>Local-first</span></div>
      <div className="visual-title"><p>Start anywhere</p><strong>Task.<br />Subtask.<br />Plan.</strong></div>
      <div className="visual-lines" aria-hidden="true"><span /><span /><span /></div>
    </section>
  </main>;
}

function EmptyState({ title, description, action, actionLabel }: { title: string; description: string; action?: () => void; actionLabel?: string }) {
  return <div className="empty-state"><span><ListTodo /></span><h3>{title}</h3><p>{description}</p>{action && <Button onClick={action}><Plus />{actionLabel || 'Add task'}</Button>}</div>;
}

function TimePicker({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  const [hour = '09', minute = '00'] = (value || '09:00').split(':');
  const setPart = (nextHour: string, nextMinute: string) => onChange(`${nextHour.padStart(2, '0')}:${nextMinute.padStart(2, '0')}`);
  return <Popover><PopoverTrigger type="button" className="time-trigger"><Clock3 />{value || 'Choose start time'}</PopoverTrigger><PopoverContent align="start" className="clock-popover">
    <p>Start time</p><output className="digital-time">{hour}:{minute}</output>
    <div className="clock-selects"><label htmlFor="clock-hour">Hour<NativeSelect id="clock-hour" value={hour} onChange={(event) => setPart(event.target.value, minute)}>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((item) => <NativeSelectOption value={item} key={item}>{item}</NativeSelectOption>)}</NativeSelect></label><span>:</span><label htmlFor="clock-minute">Minute<NativeSelect id="clock-minute" value={minute} onChange={(event) => setPart(hour, event.target.value)}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((item) => <NativeSelectOption value={item} key={item}>{item}</NativeSelectOption>)}</NativeSelect></label></div>
    <div className="clock-actions"><Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>Clear</Button><Button type="button" size="sm" onClick={() => setPart(hour, minute)}>Set time</Button></div>
  </PopoverContent></Popover>;
}

function TaskDrawer({ state, plans, tasks, onOpenChange, onSave }: {
  state: TaskDraftState; plans: Plan[]; tasks: PlannerTask[];
  onOpenChange: (open: boolean) => void; onSave: (task: PlannerTask) => void;
}) {
  const { state: sidebarState, isMobile } = useSidebar();
  const [draft, setDraft] = useState<PlannerTask>(emptyTask);
  useEffect(() => {
    if (!state.open) return;
    const parent = tasks.find((task) => task.id === state.parentId);
    queueMicrotask(() => setDraft(state.task ? { ...state.task } : { ...emptyTask(), parentId: state.parentId, planId: state.planId || parent?.planId }));
  }, [state.open, state.task, state.parentId, state.planId, tasks]);
  const field = <K extends keyof PlannerTask>(key: K, value: PlannerTask[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const topLevelTasks = tasks.filter((task) => !task.parentId && task.id !== draft.id);
  const parent = tasks.find((task) => task.id === draft.parentId);
  function selectParent(parentId: string) {
    const selectedParent = tasks.find((task) => task.id === parentId);
    setDraft((current) => ({ ...current, parentId: parentId || undefined, planId: selectedParent?.planId || current.planId }));
  }
  function updateDuration(value?: number) {
    setDraft((current) => ({ ...current, timeHours: value, endTime: calculateEndTime(current.startTime, value) }));
  }
  function updateStartTime(value?: string) {
    setDraft((current) => ({ ...current, startTime: value, endTime: calculateEndTime(value, current.timeHours) }));
  }
  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim(), owners: draft.owners.map((owner) => owner.trim()).filter(Boolean), tags: draft.tags.map((tag) => tag.trim()).filter(Boolean), endTime: calculateEndTime(draft.startTime, draft.timeHours), progress: draft.status === 'Completed' ? 100 : draft.progress, updatedAt: new Date().toISOString() });
    onOpenChange(false);
  }
  const editorStyle = { '--task-editor-left': isMobile ? '0px' : sidebarState === 'collapsed' ? '3rem' : '16rem' } as CSSProperties;
  return <Sheet open={state.open} onOpenChange={onOpenChange}><SheetContent className="editor-sheet task-editor-sheet" style={editorStyle}>
    <SheetHeader><p className="eyebrow">{draft.parentId ? 'Subtask' : 'Task'}</p><SheetTitle>{state.task ? 'Edit task' : draft.parentId ? 'Add subtask' : 'Add task'}</SheetTitle><SheetDescription>Only the title is required. Add time or dates when useful.</SheetDescription></SheetHeader>
    <form id="task-form" onSubmit={submit} className="editor-form task-editor-form">
      <label className="wide" htmlFor="task-title">Title<Input id="task-title" value={draft.title} onChange={(event) => field('title', event.target.value)} placeholder="What needs to be done?" /></label>
      <label htmlFor="task-plan">Plan<NativeSelect id="task-plan" value={draft.planId || ''} onChange={(event) => field('planId', event.target.value || undefined)} disabled={Boolean(parent)}><NativeSelectOption value="">No plan</NativeSelectOption>{plans.map((plan) => <NativeSelectOption key={plan.id} value={plan.id}>{plan.name}</NativeSelectOption>)}</NativeSelect></label>
      <label htmlFor="task-parent">Parent task<NativeSelect id="task-parent" value={draft.parentId || ''} onChange={(event) => selectParent(event.target.value)} disabled={Boolean(state.parentId)}><NativeSelectOption value="">None</NativeSelectOption>{topLevelTasks.map((task) => <NativeSelectOption key={task.id} value={task.id}>{task.title}</NativeSelectOption>)}</NativeSelect></label>
      <label htmlFor="task-owners">Owners <small>separate names with commas</small><Input id="task-owners" value={draft.owners.join(', ')} onChange={(event) => field('owners', event.target.value.split(',').map((owner) => owner.trimStart()))} placeholder="Alex, Priya, Sam" /></label>
      <label htmlFor="task-time">Time to complete <small>hours</small><Input id="task-time" type="number" min="0" step="0.25" value={draft.timeHours ?? ''} onChange={(event) => updateDuration(event.target.value === '' ? undefined : Number(event.target.value))} placeholder="e.g. 1.5" /></label>
      <div className="editor-time-field"><span>Start time <small>optional</small></span><TimePicker value={draft.startTime} onChange={updateStartTime} /></div>
      <div className="end-time-field"><span>End time</span><output>{draft.endTime || 'Calculated automatically'}</output></div>
      <label htmlFor="task-status">Status<NativeSelect id="task-status" value={draft.status} onChange={(event) => field('status', event.target.value as TaskStatus)}>{Object.keys(statusColors).map((status) => <NativeSelectOption key={status}>{status}</NativeSelectOption>)}</NativeSelect></label>
      <label htmlFor="task-priority">Priority<NativeSelect id="task-priority" value={draft.priority} onChange={(event) => field('priority', event.target.value as TaskPriority)}><NativeSelectOption>Low</NativeSelectOption><NativeSelectOption>Medium</NativeSelectOption><NativeSelectOption>High</NativeSelectOption></NativeSelect></label>
      <label htmlFor="task-planned-date">Planned date <small>optional</small><Input id="task-planned-date" type="date" value={draft.plannedDate || ''} onChange={(event) => field('plannedDate', event.target.value || undefined)} /></label>
      <label htmlFor="task-due-date">Due date <small>optional</small><Input id="task-due-date" type="date" value={draft.dueDate || ''} onChange={(event) => field('dueDate', event.target.value || undefined)} /></label>
      <label htmlFor="task-progress">Progress <small>{draft.progress}%</small><input id="task-progress" type="range" min="0" max="100" step="5" value={draft.progress} onChange={(event) => field('progress', Number(event.target.value))} /></label>
      <label htmlFor="task-tags">Tags <small>separate with commas</small><Input id="task-tags" value={draft.tags.join(', ')} onChange={(event) => field('tags', event.target.value.split(',').map((tag) => tag.trimStart()))} placeholder="Design, Review" /></label>
      <label className="span-two" htmlFor="task-dependencies">Depends on <small>optional</small><NativeSelect id="task-dependencies" value={draft.dependencyIds[0] || ''} onChange={(event) => field('dependencyIds', event.target.value ? [event.target.value] : [])}><NativeSelectOption value="">No dependency</NativeSelectOption>{tasks.filter((task) => task.id !== draft.id && task.id !== draft.parentId).map((task) => <NativeSelectOption value={task.id} key={task.id}>{task.title}</NativeSelectOption>)}</NativeSelect></label>
      <label className="wide" htmlFor="task-notes">Notes <small>optional</small><textarea id="task-notes" value={draft.notes || ''} onChange={(event) => field('notes', event.target.value || undefined)} placeholder="Add a short note" /></label>
    </form>
    <SheetFooter><Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="task-form">Save task</Button></SheetFooter>
  </SheetContent></Sheet>;
}

function PlanDrawer({ open, plan, onOpenChange, onSave }: { open: boolean; plan: Plan | null; onOpenChange: (open: boolean) => void; onSave: (plan: Plan) => void }) {
  const [draft, setDraft] = useState<Plan>({ id: '', name: '', color: '#8CC8F0' });
  useEffect(() => {
    if (open) queueMicrotask(() => setDraft(plan ? { ...plan } : { id: makeId('PLAN'), name: '', color: '#8CC8F0' }));
  }, [open, plan]);
  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onSave({ ...draft, name: draft.name.trim() });
    onOpenChange(false);
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="editor-sheet sm:max-w-[500px]">
    <SheetHeader><p className="eyebrow">Plan</p><SheetTitle>{plan ? 'Edit plan' : 'Create plan'}</SheetTitle><SheetDescription>A plan groups related tasks and subtasks.</SheetDescription></SheetHeader>
    <form id="plan-form" onSubmit={submit} className="editor-form one-column">
      <label htmlFor="plan-name">Plan name<Input id="plan-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Website launch" /></label>
      <label htmlFor="plan-description">Description <small>optional</small><textarea id="plan-description" value={draft.description || ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value || undefined }))} placeholder="What is this plan for?" /></label>
      <label htmlFor="plan-owner">Owner <small>optional</small><Input id="plan-owner" value={draft.owner || ''} onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value || undefined }))} placeholder="Name" /></label>
      <label htmlFor="plan-due-date">Due date <small>optional</small><Input id="plan-due-date" type="date" value={draft.dueDate || ''} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value || undefined }))} /></label>
    </form>
    <SheetFooter><Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="plan-form">Save plan</Button></SheetFooter>
  </SheetContent></Sheet>;
}

type TaskActions = {
  onEdit: (task: PlannerTask) => void; onAddSubtask: (task: PlannerTask) => void; onToggle: (task: PlannerTask) => void;
  onDuplicate: (task: PlannerTask) => void; onArchive: (task: PlannerTask) => void; onDelete: (task: PlannerTask) => void;
};

function TaskRow({ task, subtasks, plan, onEdit, onAddSubtask, onToggle, onDuplicate, onArchive, onDelete }: {
  task: PlannerTask; subtasks: PlannerTask[]; plan?: Plan;
} & TaskActions) {
  return <div className="task-group">
    <div className={`simple-task-row ${task.status === 'Completed' ? 'is-complete' : ''}`}>
      <button className="complete-button" aria-label={task.status === 'Completed' ? 'Mark incomplete' : 'Mark complete'} onClick={() => onToggle(task)}>{task.status === 'Completed' ? <Check /> : <Circle />}</button>
      <div className="task-copy"><strong>{task.title}</strong><small>{plan?.name || 'Standalone'}{task.owners.length ? ` · ${task.owners.join(', ')}` : ''}</small></div>
      {task.timeHours !== undefined && <span className="time-chip"><Clock3 />{task.timeHours}h</span>}
      {task.startTime && <span className="schedule-chip">{task.startTime}{task.endTime ? ` – ${task.endTime}` : ''}</span>}
      {task.dueDate && <span className="date-chip">Due {task.dueDate}</span>}
      <span className="status-dot" style={{ background: statusColors[task.status] }}>{task.status}</span>
      <div className="row-actions"><Button variant="ghost" size="sm" onClick={() => onAddSubtask(task)}><Plus /> Subtask</Button><Button variant="ghost" size="icon-sm" aria-label="Duplicate task" title="Duplicate" onClick={() => onDuplicate(task)}><Copy /></Button><Button variant="ghost" size="icon-sm" aria-label="Archive task" title="Archive" onClick={() => onArchive(task)}><Archive /></Button><Button variant="ghost" size="icon-sm" aria-label="Delete task" title="Delete" onClick={() => onDelete(task)}><Trash2 /></Button><Button variant="ghost" size="icon-sm" aria-label="Edit task" onClick={() => onEdit(task)}><Pencil /></Button></div>
    </div>
    {subtasks.map((child) => <div className={`simple-task-row subtask-row ${child.status === 'Completed' ? 'is-complete' : ''}`} key={child.id}>
      <ChevronRight className="subtask-arrow" />
      <button className="complete-button" aria-label={child.status === 'Completed' ? 'Mark incomplete' : 'Mark complete'} onClick={() => onToggle(child)}>{child.status === 'Completed' ? <Check /> : <Circle />}</button>
      <div className="task-copy"><strong>{child.title}</strong><small>Subtask{child.owners.length ? ` · ${child.owners.join(', ')}` : ''}</small></div>
      {child.timeHours !== undefined && <span className="time-chip"><Clock3 />{child.timeHours}h</span>}
      {child.startTime && <span className="schedule-chip">{child.startTime}{child.endTime ? ` – ${child.endTime}` : ''}</span>}
      {child.dueDate && <span className="date-chip">Due {child.dueDate}</span>}
      <span className="status-dot" style={{ background: statusColors[child.status] }}>{child.status}</span>
      <div className="row-actions"><Button variant="ghost" size="icon-sm" aria-label="Duplicate subtask" title="Duplicate" onClick={() => onDuplicate(child)}><Copy /></Button><Button variant="ghost" size="icon-sm" aria-label="Archive subtask" title="Archive" onClick={() => onArchive(child)}><Archive /></Button><Button variant="ghost" size="icon-sm" aria-label="Delete subtask" title="Delete" onClick={() => onDelete(child)}><Trash2 /></Button><Button variant="ghost" size="icon-sm" aria-label="Edit subtask" onClick={() => onEdit(child)}><Pencil /></Button></div>
    </div>)}
  </div>;
}

function TaskList({ tasks, plans, emptyTitle, emptyDescription, onCreate, ...actions }: {
  tasks: PlannerTask[]; plans: Plan[]; emptyTitle: string; emptyDescription: string;
  onCreate?: () => void;
} & TaskActions) {
  if (!tasks.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={onCreate} />;
  const ids = new Set(tasks.map((task) => task.id));
  const roots = tasks.filter((task) => !task.parentId || !ids.has(task.parentId));
  return <div className="task-list">{roots.map((task) => <TaskRow key={task.id} task={task} subtasks={tasks.filter((child) => child.parentId === task.id)} plan={plans.find((plan) => plan.id === task.planId)} {...actions} />)}</div>;
}

function HomeView({ workspace, onCreateTask, onCreatePlan, ...actions }: {
  workspace: Workspace; onCreateTask: () => void; onCreatePlan: () => void;
} & TaskActions) {
  const roots = workspace.tasks.filter((task) => !task.parentId);
  const subtasks = workspace.tasks.filter((task) => task.parentId);
  const totalTime = workspace.tasks.reduce((sum, task) => sum + (task.timeHours || 0), 0);
  return <>
    <section className="quick-create-grid"><button onClick={onCreateTask}><span><ListTodo /></span><strong>Add a task</strong><small>Standalone or inside a plan</small><Plus /></button><button onClick={onCreatePlan}><span><FolderKanban /></span><strong>Create a plan</strong><small>Group related work</small><Plus /></button></section>
    <section className="summary-grid"><article><span>Tasks</span><strong>{roots.length}</strong></article><article><span>Subtasks</span><strong>{subtasks.length}</strong></article><article><span>Plans</span><strong>{workspace.plans.length}</strong></article><article><span>Time entered</span><strong>{totalTime || '—'}{totalTime ? 'h' : ''}</strong></article></section>
    <section className="surface"><div className="section-heading"><div><h2>Recent tasks</h2><p>Your newest standalone and planned tasks.</p></div></div><TaskList tasks={workspace.tasks.filter((task) => !task.archived).slice(-8).reverse()} plans={workspace.plans} emptyTitle="Start with a task or a plan" emptyDescription="Tasks can stand alone, sit inside a plan, or have subtasks." {...actions} onCreate={onCreateTask} /></section>
  </>;
}

function TasksView({ workspace, onCreate, ...actions }: { workspace: Workspace; onCreate: () => void } & TaskActions) {
  const [query, setQuery] = useState('');
  const standalone = workspace.tasks.filter((task) => !task.planId && !task.archived && task.title.toLowerCase().includes(query.toLowerCase()));
  return <section className="surface"><div className="list-toolbar"><div className="inline-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search standalone tasks" /></div><Button onClick={onCreate}><Plus /> Add task</Button></div><TaskList tasks={standalone} plans={workspace.plans} emptyTitle="No standalone tasks" emptyDescription="Create a task without choosing a plan. You can still add subtasks beneath it." {...actions} onCreate={onCreate} /></section>;
}

function PlansView({ workspace, onCreatePlan, onEditPlan, onCreateTask, ...actions }: {
  workspace: Workspace; onCreatePlan: () => void; onEditPlan: (plan: Plan) => void; onCreateTask: (planId: string) => void;
} & TaskActions) {
  const [selectedId, setSelectedId] = useState<string | null>(workspace.plans[0]?.id || null);
  const selectedPlan = workspace.plans.find((plan) => plan.id === selectedId) || workspace.plans[0];
  if (!workspace.plans.length) return <section className="surface"><EmptyState title="No plans yet" description="Create a plan, then add tasks and subtasks under it." action={onCreatePlan} actionLabel="Create plan" /></section>;
  const planTasks = workspace.tasks.filter((task) => task.planId === selectedPlan.id && !task.archived);
  const completed = planTasks.filter((task) => task.status === 'Completed').length;
  const progress = planTasks.length ? Math.round(completed / planTasks.length * 100) : 0;
  return <div className="plans-layout">
    <aside className="plan-list"><Button onClick={onCreatePlan}><Plus /> New plan</Button>{workspace.plans.map((plan) => { const count = workspace.tasks.filter((task) => task.planId === plan.id).length; return <button className={plan.id === selectedPlan.id ? 'active' : ''} key={plan.id} onClick={() => setSelectedId(plan.id)}><i style={{ background: plan.color }} /><span><strong>{plan.name}</strong><small>{count} {count === 1 ? 'item' : 'items'}</small></span><ChevronRight /></button>; })}</aside>
    <section className="surface plan-workspace"><div className="section-heading"><div><span className="plan-kicker" style={{ background: selectedPlan.color }} /> <p>Plan</p><h2>{selectedPlan.name}</h2><p>{selectedPlan.description || 'No description added.'}</p></div><div className="heading-actions"><Button variant="outline" onClick={() => onEditPlan(selectedPlan)}><Pencil /> Edit plan</Button><Button onClick={() => onCreateTask(selectedPlan.id)}><Plus /> Add task</Button></div></div><div className="plan-progress"><span>{progress}% complete</span><Progress value={progress} /></div><div className="plan-gantt-heading"><div><h3>Plan schedule</h3><p>Planned date starts each bar; due date sets its finish.</p></div></div><GanttChart tasks={planTasks} plans={workspace.plans} onEdit={actions.onEdit} emptyAction={() => onCreateTask(selectedPlan.id)} /><div className="plan-task-heading"><h3>Tasks and subtasks</h3></div><TaskList tasks={planTasks} plans={workspace.plans} emptyTitle="This plan has no tasks" emptyDescription="Add a task now. You can add subtasks beneath it afterward." {...actions} onCreate={() => onCreateTask(selectedPlan.id)} /></section>
  </div>;
}

function TodayView({ workspace, onCloseDay, ...actions }: { workspace: Workspace; onCloseDay: () => void } & TaskActions) {
  const today = todayIso();
  const tasks = workspace.tasks.filter((task) => task.plannedDate === today && !task.archived).sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
  const isFriday = new Date(`${today}T12:00:00`).getDay() === 5;
  return <section className="surface"><div className="section-heading"><div><h2>{new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{tasks.reduce((sum, task) => sum + (task.timeHours || 0), 0)} hours entered · automatically matched to today</p>{isFriday && <p className="friday-note">Friday check-in: close the day to carry unfinished work into Monday.</p>}</div>{tasks.length > 0 && <Button variant="outline" onClick={onCloseDay}>Close day</Button>}</div><TaskList tasks={tasks} plans={workspace.plans} emptyTitle="Nothing scheduled today" emptyDescription="Set a task’s planned date to today and it will appear here automatically." {...actions} /></section>;
}

function addDays(dateText: string, amount: number) {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dayDistance(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
}

function GanttChart({ tasks, plans, onEdit, emptyAction }: { tasks: PlannerTask[]; plans: Plan[]; onEdit: (task: PlannerTask) => void; emptyAction?: () => void }) {
  const scheduled = tasks.filter((task) => !task.archived && (task.plannedDate || task.dueDate)).sort((a, b) => (a.plannedDate || a.dueDate || '').localeCompare(b.plannedDate || b.dueDate || ''));
  const datedValues = scheduled.flatMap((task) => [task.plannedDate, task.dueDate].filter(Boolean) as string[]).sort();
  const rangeStart = datedValues[0] || todayIso();
  const lastDate = datedValues.at(-1) || addDays(rangeStart, 6);
  const dayCount = Math.min(21, Math.max(7, dayDistance(rangeStart, lastDate) + 1));
  const dates = Array.from({ length: dayCount }, (_, index) => addDays(rangeStart, index));
  return <div className="gantt-shell">
    <div className="gantt-scroll">
      <div className="gantt-grid" style={{ '--gantt-days': dayCount } as CSSProperties}>
        <div className="gantt-corner">Task</div>{dates.map((date) => <time className={date === todayIso() ? 'is-today' : ''} key={date}><b>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</b><span>{new Date(`${date}T12:00:00`).getDate()}</span></time>)}
        {scheduled.map((task) => { const start = task.plannedDate || task.dueDate || rangeStart; const end = task.dueDate && task.dueDate >= start ? task.dueDate : start; const columnStart = Math.min(dayCount - 1, Math.max(0, dayDistance(rangeStart, start))); const span = Math.max(1, Math.min(dayCount - columnStart, dayDistance(start, end) + 1)); const plan = plans.find((item) => item.id === task.planId); return <div className="gantt-row" key={task.id}>
          <button className={`gantt-label ${task.parentId ? 'is-subtask' : ''}`} onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.owners.join(', ') || 'Unassigned'}</small></button>
          <div className="gantt-track">{dates.map((date) => <i className={date === todayIso() ? 'is-today' : ''} key={date} />)}<button className="gantt-bar" style={{ gridColumn: `${columnStart + 1} / span ${span}`, background: plan?.color || '#8CC8F0' }} onClick={() => onEdit(task)} title={`${task.title}: ${start} to ${end}`}><span style={{ width: `${task.progress}%` }} /><b>{task.progress}%</b></button></div>
        </div>; })}
      </div>
    </div>
    {!scheduled.length && <div className="gantt-empty"><ChartNoAxesGantt /><div><strong>No dated tasks yet</strong><p>Add planned and due dates to build this chart.</p></div>{emptyAction && <Button size="sm" onClick={emptyAction}><Plus /> Add task</Button>}</div>}
  </div>;
}

function GanttView({ workspace, ...actions }: { workspace: Workspace } & TaskActions) {
  const activeTasks = workspace.tasks.filter((task) => !task.archived);
  return <section className="surface"><div className="section-heading"><div><h2>All scheduled work</h2><p>Click a task or bar to edit its dates.</p></div></div><GanttChart tasks={activeTasks} plans={workspace.plans} onEdit={actions.onEdit} /></section>;
}

function CalendarView({ workspace, ...actions }: { workspace: Workspace } & TaskActions) {
  const dated = workspace.tasks.filter((task) => !task.archived && task.plannedDate);
  const dates = [...new Set(dated.map((task) => task.plannedDate as string))].sort();
  if (!dates.length) return <section className="surface"><EmptyState title="Calendar is clear" description="Tasks appear here automatically when you add a planned date." /></section>;
  return <div className="calendar-groups">{dates.map((date) => <section className="surface" key={date}><div className="calendar-date"><time>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><span>{dated.filter((task) => task.plannedDate === date).reduce((sum, task) => sum + (task.timeHours || 0), 0)}h</span></div><TaskList tasks={dated.filter((task) => task.plannedDate === date)} plans={workspace.plans} emptyTitle="No tasks" emptyDescription="" {...actions} /></section>)}</div>;
}

function HistoryView({ workspace }: { workspace: Workspace }) {
  if (!workspace.activity.length) return <section className="surface"><EmptyState title="No activity yet" description="Task creation, updates, completion, duplication, archiving, and deletion will appear here." /></section>;
  return <section className="surface history-list">{[...workspace.activity].reverse().map((event) => <article key={event.id}><span /><div><strong>{event.description}</strong><time>{new Date(event.createdAt).toLocaleString()}</time></div></article>)}</section>;
}

function WorkloadView({ tasks }: { tasks: PlannerTask[] }) {
  const activeTasks = tasks.filter((task) => !task.archived);
  const owners = [...new Set(activeTasks.flatMap((task) => task.owners).map((owner) => owner.trim()).filter(Boolean))];
  if (!owners.length) return <section className="surface"><EmptyState title="No workload yet" description="Add an owner and optional time to a task to see workload totals." /></section>;
  return <section className="surface workload-simple">{owners.map((owner) => { const assigned = activeTasks.filter((task) => task.owners.includes(owner)); const hours = assigned.reduce((sum, task) => sum + (task.timeHours || 0), 0); const todayHours = assigned.filter((task) => task.plannedDate === todayIso() && task.status !== 'Completed').reduce((sum, task) => sum + (task.timeHours || 0), 0); const complete = assigned.filter((task) => task.status === 'Completed').length; return <article className={todayHours > 8 ? 'over-capacity' : ''} key={owner}><span className="avatar">{owner.slice(0, 2).toUpperCase()}</span><div><strong>{owner}</strong><small>{assigned.length} items · {complete} completed{todayHours > 8 ? ` · ${todayHours}h today (over capacity)` : ''}</small></div><b>{hours || '—'}{hours ? 'h' : ''}</b></article>; })}</section>;
}

function ExportView({ workspace, onMessage }: { workspace: Workspace; onMessage: (message: string) => void }) {
  const cards: { scope: 'All' | 'Tasks' | 'Plans'; title: string; copy: string }[] = [
    { scope: 'All', title: 'Full workspace', copy: 'Separate Plans and Tasks sheets in one workbook.' },
    { scope: 'Tasks', title: 'Tasks only', copy: 'Standalone and planned tasks with their subtasks.' },
    { scope: 'Plans', title: 'Plans only', copy: 'Plan summary, item counts, time, and completion.' },
  ];
  return <section className="export-simple">{cards.map((card) => <article className="surface" key={card.scope}><span className="export-icon"><FileSpreadsheet /></span><h3>{card.title}</h3><p>{card.copy}</p><Button disabled={!workspace.tasks.length && !workspace.plans.length} onClick={() => { void exportWorkbook(card.scope, workspace); onMessage(`${card.title} export created`); }}><Download /> Export Excel</Button></article>)}</section>;
}

function SettingsView({ theme, workspace, onThemeChange, onRestore, onMessage }: { theme: Theme; workspace: Workspace; onThemeChange: (theme: Theme) => void; onRestore: (workspace: Workspace) => void; onMessage: (message: string) => void }) {
  function backup() { const url = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `Capexity_backup_${todayIso()}.json`; link.click(); URL.revokeObjectURL(url); onMessage('Backup downloaded'); }
  function restore(file?: File) { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { if (typeof reader.result !== 'string') throw new Error(); const value = JSON.parse(reader.result) as Workspace; if (!Array.isArray(value.tasks) || !Array.isArray(value.plans)) throw new Error(); onRestore({ tasks: value.tasks, plans: value.plans, activity: Array.isArray(value.activity) ? value.activity : [] }); onMessage('Backup restored'); } catch { onMessage('That backup file is not valid'); } }; reader.readAsText(file); }
  return <section className="settings-simple"><article className="surface"><div className="setting-row"><span className="setting-icon">{theme === 'dark' ? <Moon /> : <Sun />}</span><div><h3>Dark mode</h3><p>Use a darker interface across the entire app.</p></div><Switch checked={theme === 'dark'} onCheckedChange={(checked) => onThemeChange(checked ? 'dark' : 'light')} aria-label="Toggle dark mode" /></div></article><article className="surface"><div className="setting-row"><span className="setting-icon"><Download /></span><div><h3>Backup and restore</h3><p>Keep a portable JSON copy of all local plans, tasks, and history.</p></div><div className="setting-actions"><Button variant="outline" onClick={backup}>Download backup</Button><label className="restore-button">Restore<input type="file" accept="application/json" onChange={(event) => restore(event.target.files?.[0])} /></label></div></div></article><article className="surface"><h3>How the workspace works</h3><div className="help-steps"><span><b>1</b><p><strong>Create a plan</strong> when several tasks belong together.</p></span><span><b>2</b><p><strong>Create a standalone task</strong> when it does not need a plan.</p></span><span><b>3</b><p><strong>Add a subtask</strong> from any main task.</p></span><span><b>4</b><p><strong>Enter time only if useful.</strong> It is always optional.</p></span></div></article></section>;
}

function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [active, setActive] = useState<View>('Home');
  const [workspace, setWorkspace] = useState<Workspace>({ tasks: [], plans: [], activity: [] });
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => typeof window !== 'undefined' && localStorage.getItem('tcp-theme') === 'dark' ? 'dark' : 'light');
  const [taskState, setTaskState] = useState<TaskDraftState>({ open: false, task: null });
  const [planState, setPlanState] = useState<{ open: boolean; plan: Plan | null }>({ open: false, plan: null });
  const [message, setMessage] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => {
    void loadWorkspace().then((value) => { setWorkspace(value); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: Workspace) => {
    setWorkspace(next);
    void saveWorkspace(next).catch(() => setMessage('Could not save this change'));
  }, []);
  const saveTask = useCallback((task: PlannerTask) => {
    const existing = workspace.tasks.find((item) => item.id === task.id);
    const now = new Date().toISOString();
    const nextTask = { ...task, updatedAt: now, completedAt: task.status === 'Completed' ? task.completedAt || now : undefined };
    const description = !existing ? `Created “${task.title}”` : existing.status !== 'Completed' && task.status === 'Completed' ? `Completed “${task.title}”` : `Updated “${task.title}”`;
    persist({ ...workspace, tasks: existing ? workspace.tasks.map((item) => item.id === task.id ? nextTask : item) : [...workspace.tasks, nextTask], activity: [...workspace.activity, { id: `${task.id}-${Date.now()}`, taskId: task.id, description, createdAt: now }] });
  }, [persist, workspace]);
  const savePlan = useCallback((plan: Plan) => {
    persist({ ...workspace, plans: workspace.plans.some((item) => item.id === plan.id) ? workspace.plans.map((item) => item.id === plan.id ? plan : item) : [...workspace.plans, plan] });
  }, [persist, workspace]);
  const toggleTask = useCallback((task: PlannerTask) => saveTask({ ...task, status: task.status === 'Completed' ? 'Starting' : 'Completed', progress: task.status === 'Completed' ? 0 : 100 }), [saveTask]);
  const duplicateTask = useCallback((task: PlannerTask) => {
    const now = new Date().toISOString();
    const duplicate = { ...task, id: makeId('TASK'), title: `${task.title} copy`, status: 'Starting' as TaskStatus, progress: 0, createdAt: now, updatedAt: now, completedAt: undefined, archived: false };
    persist({ ...workspace, tasks: [...workspace.tasks, duplicate], activity: [...workspace.activity, { id: `${duplicate.id}-${Date.now()}`, taskId: duplicate.id, description: `Duplicated “${task.title}”`, createdAt: now }] });
    setTaskState({ open: true, task: duplicate });
    setMessage('Task duplicated — edit the copy now');
  }, [persist, workspace]);
  const archiveTask = useCallback((task: PlannerTask) => {
    const now = new Date().toISOString();
    persist({ ...workspace, tasks: workspace.tasks.map((item) => item.id === task.id || item.parentId === task.id ? { ...item, archived: true, updatedAt: now } : item), activity: [...workspace.activity, { id: `${task.id}-${Date.now()}`, taskId: task.id, description: `Archived “${task.title}”`, createdAt: now }] });
    setMessage('Task archived');
  }, [persist, workspace]);
  const deleteTask = useCallback((task: PlannerTask) => {
    if (!window.confirm(`Delete “${task.title}”${task.parentId ? '' : ' and its subtasks'}?`)) return;
    const now = new Date().toISOString();
    persist({ ...workspace, tasks: workspace.tasks.filter((item) => item.id !== task.id && item.parentId !== task.id), activity: [...workspace.activity, { id: `${task.id}-${Date.now()}`, description: `Deleted “${task.title}”`, createdAt: now }] });
    setMessage('Task deleted');
  }, [persist, workspace]);
  const changeTheme = (next: Theme) => { setTheme(next); localStorage.setItem('tcp-theme', next); document.documentElement.classList.toggle('dark', next === 'dark'); };
  const openTask = (task: PlannerTask | null = null, parentId?: string, planId?: string) => setTaskState({ open: true, task, parentId, planId });

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = { name: 'create_task', title: 'Create task', description: 'Create a standalone task in Capexity.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, owners: { type: 'array', items: { type: 'string' } }, timeHours: { type: 'number' }, startTime: { type: 'string' }, plannedDate: { type: 'string' } }, required: ['title'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input: unknown) { const value = input as { title?: unknown; owners?: unknown; timeHours?: unknown; startTime?: unknown; plannedDate?: unknown }; if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('title is required'); const owners = Array.isArray(value.owners) ? value.owners.filter((owner): owner is string => typeof owner === 'string' && Boolean(owner.trim())).map((owner) => owner.trim()) : []; const timeHours = typeof value.timeHours === 'number' ? value.timeHours : undefined; const startTime = typeof value.startTime === 'string' ? value.startTime : undefined; const task = { ...emptyTask(), title: value.title.trim(), owners, timeHours, startTime, endTime: calculateEndTime(startTime, timeHours), plannedDate: typeof value.plannedDate === 'string' ? value.plannedDate : undefined }; saveTask(task); setActive('Tasks'); return { id: task.id, status: 'created' }; } };
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch { /* Unsupported preview context. */ }
    return () => lifecycle.abort();
  }, [saveTask]);

  const content = (() => {
    const common = { onEdit: (task: PlannerTask) => openTask(task), onAddSubtask: (task: PlannerTask) => openTask(null, task.id, task.planId), onToggle: toggleTask, onDuplicate: duplicateTask, onArchive: archiveTask, onDelete: deleteTask };
    if (active === 'Home') return <HomeView workspace={workspace} onCreateTask={() => openTask()} onCreatePlan={() => setPlanState({ open: true, plan: null })} {...common} />;
    if (active === 'Today') return <TodayView workspace={workspace} {...common} onCloseDay={() => { persist({ ...workspace, tasks: closeDay(workspace.tasks, todayIso()) }); setMessage('Incomplete work moved to the next working day'); }} />;
    if (active === 'Tasks') return <TasksView workspace={workspace} onCreate={() => openTask()} {...common} />;
    if (active === 'Plans') return <PlansView workspace={workspace} onCreatePlan={() => setPlanState({ open: true, plan: null })} onEditPlan={(plan) => setPlanState({ open: true, plan })} onCreateTask={(planId) => openTask(null, undefined, planId)} {...common} />;
    if (active === 'Gantt') return <GanttView workspace={workspace} {...common} />;
    if (active === 'Workload') return <WorkloadView tasks={workspace.tasks} />;
    if (active === 'Calendar') return <CalendarView workspace={workspace} {...common} />;
    if (active === 'History') return <HistoryView workspace={workspace} />;
    if (active === 'Export') return <ExportView workspace={workspace} onMessage={setMessage} />;
    return <SettingsView theme={theme} workspace={workspace} onThemeChange={changeTheme} onRestore={persist} onMessage={setMessage} />;
  })();

  if (!loaded) return <main className="boot-screen"><span className="brand-mark"><span /></span></main>;
  const profile = email.split('@')[0];
  return <SidebarProvider><Sidebar className="planner-sidebar" collapsible="icon"><SidebarHeader><div className="sidebar-brand"><span className="brand-mark"><span /></span><strong>Capexity</strong></div></SidebarHeader><SidebarContent><SidebarMenu>{navItems.map((item) => <SidebarMenuItem key={item.label}><SidebarMenuButton isActive={active === item.label} tooltip={item.label} onClick={() => setActive(item.label)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="sidebar-profile"><span className="avatar">{profile.slice(0, 2).toUpperCase()}</span><div><strong>{profile}</strong><small>{email}</small></div><button aria-label="Sign out" onClick={onSignOut}><LogOut /></button></div></SidebarFooter></Sidebar>
    <SidebarInset className="app-canvas"><header className="topbar"><div><SidebarTrigger /><span>{active}</span></div><div><Button variant="outline" onClick={() => setPlanState({ open: true, plan: null })}><FolderKanban /> New plan</Button><Button onClick={() => openTask()}><Plus /> New task</Button></div></header><main className="workspace"><div className="page-heading"><div><h1>{viewCopy[active].title}</h1><p>{viewCopy[active].subtitle}</p></div></div><div className="view-stage" key={active}>{content}</div></main>{message && <button className="toast-message" onClick={() => setMessage('')}>{message}<span>×</span></button>}</SidebarInset>
    <TaskDrawer state={taskState} plans={workspace.plans} tasks={workspace.tasks} onOpenChange={(open) => setTaskState((current) => ({ ...current, open }))} onSave={saveTask} />
    <PlanDrawer open={planState.open} plan={planState.plan} onOpenChange={(open) => setPlanState((current) => ({ ...current, open }))} onSave={savePlan} />
  </SidebarProvider>;
}

export default function App() {
  const [signedInEmail, setSignedInEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', localStorage.getItem('tcp-theme') === 'dark');
    queueMicrotask(() => setSignedInEmail(localStorage.getItem('tcp-session-email')));
  }, []);
  if (signedInEmail === undefined) return <main className="boot-screen"><span className="brand-mark"><span /></span></main>;
  if (!signedInEmail) return <Login onSuccess={setSignedInEmail} />;
  return <Dashboard email={signedInEmail} onSignOut={() => { localStorage.removeItem('tcp-session-email'); setSignedInEmail(null); }} />;
}
