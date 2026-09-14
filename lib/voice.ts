import {
  calculateEndTime,
  makeId,
  todayIso,
  type ActivityEvent,
  type PlannerTask,
  type TaskStatus,
  type Workspace,
} from './planner';

export type VoiceIntent = {
  op: 'create' | 'update' | 'delete';
  id?: string;
  title?: string;
  parentId?: string;
  planId?: string;
  status?: TaskStatus;
  date?: string;
  start?: string;
  hours?: number;
};

export type VoiceInterpretation = {
  actions: VoiceIntent[];
  question: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/** High-certainty commands are handled locally, so they spend zero Claude tokens. */
export function localVoiceCommand(workspace: Workspace, transcript: string): VoiceIntent[] | null {
  const text = transcript.trim().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
  const lower = text.toLocaleLowerCase();
  let title: string | undefined;
  const create = lower.match(/^(?:add|create)(?: a| a new| new)? task (.+)$/i);
  if (create) {
    title = text.slice(text.length - create[1].length).trim();
    // Let Claude interpret dates, times, hierarchy, and multi-action requests.
    if (/\b(and|tomorrow|today|at|under|inside|subtask|plan|due|hours?|minutes?|after|before|on)\b/i.test(title))
      return null;
    return title ? [{ op: 'create', title, date: todayIso() }] : null;
  }
  const hindiCreate = text.match(/^(.+?)\s+(?:टास्क|कार्य)\s+(?:बनाओ|जोड़ो|जोडो)$/u);
  if (hindiCreate) {
    if (/कल|आज|सुबह|शाम|बजे|घंटे|योजना|नीचे/u.test(hindiCreate[1])) return null;
    return [{ op: 'create', title: hindiCreate[1].trim(), date: todayIso() }];
  }
  const hinglishCreate = text.match(/^(.+?)\s+task\s+add\s+karo$/i);
  if (hinglishCreate) {
    if (/\b(kal|aaj|subah|shaam|baje|ghante|under|plan|and)\b/i.test(hinglishCreate[1])) return null;
    return [{ op: 'create', title: hinglishCreate[1].trim(), date: todayIso() }];
  }

  const change = lower.match(/^(complete|finish|delete|remove) task (.+)$/i);
  if (!change) return null;
  title = text.slice(text.length - change[2].length).trim();
  const matches = workspace.tasks.filter((task) => !task.archived && task.title.toLocaleLowerCase() === title!.toLocaleLowerCase());
  if (matches.length !== 1) return null;
  return [{ op: ['delete', 'remove'].includes(change[1]) ? 'delete' : 'update', id: matches[0].id, ...(['delete', 'remove'].includes(change[1]) ? {} : { status: 'Completed' as TaskStatus }) }];
}

export function workspaceFingerprint(workspace: Workspace): string {
  return JSON.stringify({
    tasks: workspace.tasks.map((task) => [task.id, task.updatedAt]),
    plans: workspace.plans.map((plan) => [plan.id, plan.name]),
  });
}

export function voiceContext(workspace: Workspace, transcript: string) {
  const words = transcript.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const scored = workspace.tasks
    .filter((task) => !task.archived)
    .map((task) => {
      const title = task.title.toLocaleLowerCase();
      const score = words.reduce((total, word) => total + (title.includes(word) ? 2 : 0), 0);
      return { task, score };
    })
    .sort((a, b) => b.score - a.score || b.task.updatedAt.localeCompare(a.task.updatedAt));
  return {
    tasks: scored.slice(0, 20).map(({ task }) => ({
      id: task.id,
      title: task.title.slice(0, 80),
      status: task.status,
      date: task.plannedDate || '',
      parentId: task.parentId || '',
      planId: task.planId || '',
    })),
    plans: workspace.plans.slice(0, 15).map((plan) => ({ id: plan.id, name: plan.name.slice(0, 60) })),
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: string): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return true;
}

function validateAction(action: VoiceIntent, workspace: Workspace): void {
  if (!['create', 'update', 'delete'].includes(action.op)) throw new Error('Voice action is invalid');
  if (action.op === 'create') {
    if (!action.title?.trim()) throw new Error('A new task needs a title');
    if (action.parentId && !workspace.tasks.some((task) => task.id === action.parentId))
      throw new Error('The parent task was not found');
    if (action.planId && !workspace.plans.some((plan) => plan.id === action.planId))
      throw new Error('The plan was not found');
  } else if (!action.id || !workspace.tasks.some((task) => task.id === action.id && !task.archived)) {
    throw new Error('The task to change was not found. Please try again.');
  }
  if (action.date !== undefined && !validDate(action.date)) throw new Error('The task date is invalid');
  if (action.start !== undefined && !validTime(action.start)) throw new Error('The start time is invalid');
  if (action.hours !== undefined && (!Number.isFinite(action.hours) || action.hours <= 0 || action.hours > 24))
    throw new Error('The time to complete must be between 0 and 24 hours');
  if (action.status !== undefined && !['Starting', 'In Progress', 'Completed', 'Locked'].includes(action.status))
    throw new Error('The task status is invalid');
  if (action.title !== undefined && (!action.title.trim() || action.title.length > 200))
    throw new Error('Task titles must be 1–200 characters');
}

function descendants(tasks: PlannerTask[], id: string): Set<string> {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
        ids.add(task.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function voiceDeleteSummary(workspace: Workspace, actions: VoiceIntent[]): string[] {
  return actions
    .filter((action) => action.op === 'delete')
    .map((action) => {
      const task = workspace.tasks.find((item) => item.id === action.id);
      if (!task) return 'Unknown task';
      const children = descendants(workspace.tasks, task.id).size - 1;
      return `${task.title}${children ? ` and ${children} subtask${children === 1 ? '' : 's'}` : ''}`;
    });
}

export function applyVoiceActions(workspace: Workspace, actions: VoiceIntent[]): Workspace {
  if (!actions.length || actions.length > 8) throw new Error('Please give at most eight task changes at once');
  const next: Workspace = { ...workspace, tasks: [...workspace.tasks], activity: [...workspace.activity] };
  for (const action of actions) {
    validateAction(action, next);
    const now = new Date().toISOString();
    let taskId = action.id || '';
    let description = '';
    if (action.op === 'create') {
      taskId = makeId('TASK');
      const parent = next.tasks.find((task) => task.id === action.parentId);
      const startTime = action.start;
      const timeHours = action.hours;
      const task: PlannerTask = {
        id: taskId,
        title: action.title!.trim(),
        parentId: parent?.id,
        planId: action.planId || parent?.planId,
        owners: [],
        status: action.status || 'Starting',
        priority: 'Medium',
        timeHours,
        startTime,
        endTime: calculateEndTime(startTime, timeHours),
        plannedDate: action.date || todayIso(),
        tags: [],
        dependencyIds: [],
        progress: action.status === 'Completed' ? 100 : 0,
        createdAt: now,
        updatedAt: now,
        completedAt: action.status === 'Completed' ? now : undefined,
      };
      next.tasks.push(task);
      description = `Created “${task.title}” by voice`;
    } else if (action.op === 'update') {
      const index = next.tasks.findIndex((task) => task.id === action.id);
      const previous = next.tasks[index];
      const status = action.status || previous.status;
      const startTime = action.start ?? previous.startTime;
      const timeHours = action.hours ?? previous.timeHours;
      const task: PlannerTask = {
        ...previous,
        title: action.title?.trim() || previous.title,
        status,
        plannedDate: action.date || previous.plannedDate,
        startTime,
        timeHours,
        endTime: calculateEndTime(startTime, timeHours),
        progress: action.status ? (status === 'Completed' ? 100 : 0) : previous.progress,
        completedAt: status === 'Completed' ? previous.completedAt || now : undefined,
        updatedAt: now,
      };
      next.tasks[index] = task;
      description = `Updated “${task.title}” by voice`;
    } else {
      const target = next.tasks.find((task) => task.id === action.id)!;
      const ids = descendants(next.tasks, target.id);
      next.tasks = next.tasks.filter((task) => !ids.has(task.id));
      description = `Deleted “${target.title}” by voice`;
    }
    const event: ActivityEvent = { id: `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, taskId: action.op === 'delete' ? undefined : taskId, description, createdAt: now };
    next.activity.push(event);
  }
  return next;
}
