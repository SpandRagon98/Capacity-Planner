export type TaskStatus = 'Starting' | 'In Progress' | 'Completed' | 'Locked';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export type Plan = {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  color: string;
};

export type PresentationTemplate = {
  name: string;
  organization?: string;
  accentColor: string;
  footer?: string;
};

export type PlannerTask = {
  id: string;
  title: string;
  planId?: string;
  parentId?: string;
  owners: string[];
  status: TaskStatus;
  priority: TaskPriority;
  timeHours?: number;
  startTime?: string;
  endTime?: string;
  plannedDate?: string;
  dueDate?: string;
  tags: string[];
  dependencyIds: string[];
  progress: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archived?: boolean;
  carryoverFrom?: string;
};

export type ActivityEvent = {
  id: string;
  taskId?: string;
  description: string;
  createdAt: string;
};

export type Workspace = {
  tasks: PlannerTask[];
  plans: Plan[];
  activity: ActivityEvent[];
  presentationTemplate?: PresentationTemplate;
};
export type WorkspaceSummary = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  version: number;
  role: 'owner' | 'editor';
};
export type WorkspaceStoreConfig = { endpoint?: string; email: string };

export const statusColors: Record<TaskStatus, string> = {
  Starting: '#8CC8F0',
  'In Progress': '#C58ADD',
  Completed: '#88B968',
  Locked: '#F08C86',
};

const PLAN_COLORS = ['#8CC8F0', '#C58ADD', '#88B968', '#F08C86', '#E8B65C'];
const DB_NAME = 'task-capacity-planner-v2';
const STORE = 'planner';

export function makeId(prefix: 'TASK' | 'PLAN') {
  const value =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${value.toUpperCase()}`;
}

export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function calculateEndTime(startTime?: string, durationHours?: number) {
  if (!startTime || durationHours === undefined || durationHours < 0)
    return undefined;
  const [hours, minutes] = startTime.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  const totalMinutes =
    (hours * 60 + minutes + Math.round(durationHours * 60)) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readKey<T>(db: IDBDatabase, key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const request = db
      .transaction(STORE, 'readonly')
      .objectStore(STORE)
      .get(key);
    request.onsuccess = () =>
      resolve((request.result as T | undefined) ?? fallback);
    request.onerror = () => resolve(fallback);
  });
}

type LegacyTask = Partial<PlannerTask> & {
  owner?: string;
  plan?: string;
  plannedHours?: number;
  estimate?: number;
};

export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDb();
  const [storedTasks, storedPlans, activity] = await Promise.all([
    readKey<LegacyTask[]>(db, 'tasks', []),
    readKey<Plan[]>(db, 'plans', []),
    readKey<ActivityEvent[]>(db, 'activity', []),
  ]);
  const legacyPlanNames = [
    ...new Set(
      storedTasks.map((task) => task.plan?.trim()).filter(Boolean) as string[],
    ),
  ];
  const plans = storedPlans.length
    ? storedPlans
    : legacyPlanNames.map((name, index) => ({
        id: makeId('PLAN'),
        name,
        color: PLAN_COLORS[index % PLAN_COLORS.length],
      }));
  const planByName = new Map(plans.map((plan) => [plan.name, plan.id]));
  const tasks = storedTasks.map((task) => {
    const timeHours =
      task.timeHours ??
      (task.plannedHours ? task.plannedHours : task.estimate || undefined);
    const owners = Array.isArray(task.owners)
      ? task.owners.filter(Boolean)
      : task.owner
        ? [task.owner]
        : [];
    return {
      id: task.id || makeId('TASK'),
      title: task.title || 'Untitled task',
      planId:
        task.planId || (task.plan ? planByName.get(task.plan) : undefined),
      parentId: task.parentId,
      owners,
      status: task.status || 'Starting',
      priority: task.priority || 'Medium',
      timeHours,
      startTime: task.startTime || undefined,
      endTime: task.endTime || calculateEndTime(task.startTime, timeHours),
      plannedDate: task.plannedDate || undefined,
      dueDate: task.dueDate || undefined,
      tags: Array.isArray(task.tags) ? task.tags.filter(Boolean) : [],
      dependencyIds: Array.isArray(task.dependencyIds)
        ? task.dependencyIds.filter(Boolean)
        : [],
      progress: task.progress ?? 0,
      notes: task.notes || undefined,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
      completedAt: task.completedAt,
      archived: Boolean(task.archived),
      carryoverFrom: task.carryoverFrom,
    } satisfies PlannerTask;
  });
  return { tasks, plans, activity };
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.put(workspace.tasks, 'tasks');
    store.put(workspace.plans, 'plans');
    store.put(workspace.activity, 'activity');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

const EMPTY_WORKSPACE = (): Workspace => ({
  tasks: [],
  plans: [],
  activity: [],
});
const LOCAL_INDEX_KEY = 'shared-workspace-index';
const GOOGLE_SHEET_ACCESS_KEY = 'data1234';

function putKey<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function localListWorkspaces(email: string) {
  const db = await openDb();
  const workspaces = await readKey<WorkspaceSummary[]>(db, LOCAL_INDEX_KEY, []);
  return { workspaces, email };
}

async function localCreateWorkspace(name: string) {
  const db = await openDb();
  const now = new Date().toISOString();
  const id = `WORKSPACE-${makeId('PLAN').slice(5)}`;
  const workspace: WorkspaceSummary = {
    id,
    name,
    description: '',
    updatedAt: now,
    version: 1,
    role: 'owner',
  };
  const index = await readKey<WorkspaceSummary[]>(db, LOCAL_INDEX_KEY, []);
  await Promise.all([
    putKey(db, LOCAL_INDEX_KEY, [workspace, ...index]),
    putKey(db, `workspace:${id}`, EMPTY_WORKSPACE()),
  ]);
  return { workspace };
}

async function localLoadWorkspace(id: string) {
  const db = await openDb();
  const index = await readKey<WorkspaceSummary[]>(db, LOCAL_INDEX_KEY, []);
  const meta = index.find((item) => item.id === id);
  if (!meta) throw new Error('Workspace not found');
  const workspace = await readKey<Workspace>(
    db,
    `workspace:${id}`,
    EMPTY_WORKSPACE(),
  );
  return { workspace, meta };
}

async function localSaveWorkspace(
  id: string,
  workspace: Workspace,
  expectedVersion: number,
) {
  const db = await openDb();
  const index = await readKey<WorkspaceSummary[]>(db, LOCAL_INDEX_KEY, []);
  const current = index.find((item) => item.id === id);
  if (!current) throw new Error('Workspace not found');
  if (current.version !== expectedVersion) {
    const latest = await readKey<Workspace>(
      db,
      `workspace:${id}`,
      EMPTY_WORKSPACE(),
    );
    throw Object.assign(new Error('Workspace changed'), {
      status: 409,
      value: { workspace: latest, meta: current },
    });
  }
  const updatedAt = new Date().toISOString();
  const version = current.version + 1;
  const nextIndex = index.map((item) =>
    item.id === id ? { ...item, updatedAt, version } : item,
  );
  await Promise.all([
    putKey(db, LOCAL_INDEX_KEY, nextIndex),
    putKey(db, `workspace:${id}`, workspace),
  ]);
  return { saved: true as const, version, updatedAt };
}

async function sheetRequest<T>(
  config: WorkspaceStoreConfig,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!config.endpoint) throw new Error('Google Sheets is not connected');
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      accessKey: GOOGLE_SHEET_ACCESS_KEY,
      email: config.email,
      ...payload,
    }),
    redirect: 'follow',
  });
  const value = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    conflict?: boolean;
  };
  if (!response.ok || value.error)
    throw Object.assign(
      new Error(value.error || 'Google Sheets request failed'),
      { status: value.conflict ? 409 : response.status, value },
    );
  return value;
}

export async function listSharedWorkspaces(config: WorkspaceStoreConfig) {
  return config.endpoint
    ? sheetRequest<{ workspaces: WorkspaceSummary[]; email: string }>(
        config,
        'list',
      )
    : localListWorkspaces(config.email);
}

export async function createSharedWorkspace(
  config: WorkspaceStoreConfig,
  name: string,
) {
  return config.endpoint
    ? sheetRequest<{ workspace: WorkspaceSummary }>(config, 'create', { name })
    : localCreateWorkspace(name);
}

export async function loadSharedWorkspace(
  config: WorkspaceStoreConfig,
  id: string,
) {
  return config.endpoint
    ? sheetRequest<{ workspace: Workspace; meta: WorkspaceSummary }>(
        config,
        'load',
        { id },
      )
    : localLoadWorkspace(id);
}

export async function saveSharedWorkspace(
  config: WorkspaceStoreConfig,
  id: string,
  workspace: Workspace,
  expectedVersion: number,
) {
  return config.endpoint
    ? sheetRequest<{ saved: true; version: number; updatedAt: string }>(
        config,
        'save',
        { id, workspace, expectedVersion },
      )
    : localSaveWorkspace(id, workspace, expectedVersion);
}

export function nextWorkingDay(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`);
  do date.setDate(date.getDate() + 1);
  while ([0, 6].includes(date.getDay()));
  return date.toISOString().slice(0, 10);
}

export function closeDay(
  tasks: PlannerTask[],
  dateText: string,
): PlannerTask[] {
  return tasks.map((task) =>
    task.plannedDate === dateText &&
    task.status !== 'Completed' &&
    task.status !== 'Locked'
      ? {
          ...task,
          plannedDate: nextWorkingDay(dateText),
          carryoverFrom: dateText,
        }
      : task,
  );
}

export async function exportWorkbook(
  scope: 'All' | 'Tasks' | 'Plans',
  workspace: Workspace,
) {
  const XLSX = await import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();
  const planById = new Map(workspace.plans.map((plan) => [plan.id, plan]));
  const taskById = new Map(workspace.tasks.map((task) => [task.id, task]));
  const heading = {
    font: { name: 'Montserrat', bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '171717' } },
  };
  const title = {
    font: { name: 'Montserrat', bold: true, sz: 18 },
    fill: { fgColor: { rgb: 'B0DBF6' } },
  };

  const addSheet = (
    name: string,
    rows: (string | number)[][],
    widths: number[],
  ) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const titleCell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      const headingCell = sheet[XLSX.utils.encode_cell({ r: 2, c: column })];
      if (titleCell) titleCell.s = title;
      if (headingCell) headingCell.s = heading;
    }
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    sheet['!rows'] = [{ hpt: 30 }, { hpt: 8 }, { hpt: 24 }];
    sheet['!autofilter'] = {
      ref: `A3:${XLSX.utils.encode_col(range.e.c)}${range.e.r + 1}`,
    };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };

  if (scope !== 'Tasks') {
    const planRows = workspace.plans.map((plan) => {
      const tasks = workspace.tasks.filter((task) => task.planId === plan.id);
      return [
        plan.id,
        plan.name,
        plan.description || '',
        plan.owner || '',
        plan.dueDate || '',
        tasks.filter((task) => !task.parentId).length,
        tasks.filter((task) => task.parentId).length,
        tasks.reduce((sum, task) => sum + (task.timeHours || 0), 0),
        tasks.filter((task) => task.status === 'Completed').length,
      ];
    });
    addSheet(
      'Plans',
      [
        ['Plans'],
        [],
        [
          'Plan ID',
          'Plan',
          'Description',
          'Owner',
          'Due',
          'Tasks',
          'Subtasks',
          'Total time h',
          'Completed',
        ],
        ...planRows,
      ],
      [18, 28, 38, 20, 14, 10, 10, 14, 12],
    );
  }

  if (scope !== 'Plans') {
    const ordered = [...workspace.tasks].sort(
      (a, b) =>
        (a.parentId || a.id).localeCompare(b.parentId || b.id) ||
        Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)),
    );
    const taskRows = ordered.map((task) => [
      task.id,
      task.parentId ? 'Subtask' : 'Task',
      task.title,
      task.parentId ? taskById.get(task.parentId)?.title || '' : '',
      task.planId ? planById.get(task.planId)?.name || '' : 'Standalone',
      task.owners.join(', '),
      task.status,
      task.timeHours ?? '',
      task.startTime || '',
      task.endTime || '',
      task.plannedDate || '',
      task.dueDate || '',
      task.progress,
      task.tags.join(', '),
      task.dependencyIds.map((id) => taskById.get(id)?.title || id).join(', '),
      task.notes || '',
    ]);
    addSheet(
      'Tasks',
      [
        ['Tasks and subtasks'],
        [],
        [
          'Task ID',
          'Type',
          'Task',
          'Parent task',
          'Plan',
          'Owners',
          'Status',
          'Time h',
          'Start time',
          'End time',
          'Planned date',
          'Due date',
          'Progress %',
          'Tags',
          'Dependencies',
          'Notes',
        ],
        ...taskRows,
      ],
      [18, 12, 34, 30, 26, 28, 16, 10, 12, 12, 14, 14, 12, 24, 30, 40],
    );
  }

  XLSX.writeFile(workbook, `Capexity_${scope}_${todayIso()}.xlsx`);
}

function pptDate(value?: string) {
  if (!value) return 'Not set';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export async function exportPlanPresentation(plan: Plan, workspace: Workspace) {
  const pptxModule = await import('pptxgenjs');
  const PptxGenJS = pptxModule.default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Capexity';
  pptx.subject = plan.name;
  pptx.title = `${plan.name} plan`;
  pptx.company = workspace.presentationTemplate?.organization || '';
  pptx.theme = {
    headFontFace: 'Montserrat',
    bodyFontFace: 'Montserrat',
  };

  const template = workspace.presentationTemplate || {
    name: 'Capexity plan',
    accentColor: plan.color || '#8CC8F0',
    footer: 'Generated with Capexity',
  };
  const accent = (template.accentColor || plan.color || '#8CC8F0').replace(
    '#',
    '',
  );
  const ink = '171717';
  const muted = '6C6F75';
  const line = 'DFE2E6';
  const white = 'FFFFFF';
  const planTasks = workspace.tasks.filter(
    (task) => task.planId === plan.id && !task.archived,
  );
  const completed = planTasks.filter(
    (task) => task.status === 'Completed',
  ).length;
  const hours = planTasks.reduce((sum, task) => sum + (task.timeHours || 0), 0);
  const progress = planTasks.length
    ? Math.round((completed / planTasks.length) * 100)
    : 0;
  const addFooter = (slide: PptxGenJS.Slide, page: number) => {
    slide.addText(template.footer || 'Generated with Capexity', {
      x: 0.65,
      y: 7.12,
      w: 8.6,
      h: 0.18,
      fontFace: 'Montserrat',
      fontSize: 9,
      color: muted,
      margin: 0,
    });
    slide.addText(String(page), {
      x: 12.05,
      y: 7.12,
      w: 0.55,
      h: 0.18,
      fontFace: 'Montserrat',
      fontSize: 9,
      color: muted,
      align: 'right',
      margin: 0,
    });
  };

  const cover = pptx.addSlide({});
  cover.background = { color: 'F7F8FA' };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.24,
    h: 7.5,
    fill: { color: accent },
    line: { color: accent },
  });
  cover.addText(template.organization || 'CAPEXITY', {
    x: 0.82,
    y: 0.72,
    w: 7.5,
    h: 0.3,
    fontFace: 'Montserrat',
    fontSize: 12,
    bold: true,
    color: muted,
    charSpacing: 2,
    margin: 0,
  });
  cover.addText(plan.name, {
    x: 0.82,
    y: 2.25,
    w: 10.8,
    h: 1.25,
    fontFace: 'Montserrat',
    fontSize: 42,
    bold: true,
    color: ink,
    breakLine: false,
    fit: 'shrink',
    margin: 0,
  });
  if (plan.description)
    cover.addText(plan.description, {
      x: 0.84,
      y: 3.72,
      w: 8.6,
      h: 0.7,
      fontFace: 'Montserrat',
      fontSize: 17,
      color: muted,
      fit: 'shrink',
      margin: 0,
    });
  cover.addText(`Due ${pptDate(plan.dueDate)}`, {
    x: 0.84,
    y: 5.92,
    w: 4.2,
    h: 0.28,
    fontFace: 'Montserrat',
    fontSize: 13,
    color: ink,
    bold: true,
    margin: 0,
  });
  addFooter(cover, 1);

  const overview = pptx.addSlide({});
  overview.background = { color: white };
  overview.addText('Plan overview', {
    x: 0.65,
    y: 0.5,
    w: 6.6,
    h: 0.48,
    fontFace: 'Montserrat',
    fontSize: 28,
    bold: true,
    color: ink,
    margin: 0,
  });
  overview.addShape(pptx.ShapeType.line, {
    x: 0.65,
    y: 1.17,
    w: 12.05,
    h: 0,
    line: { color: line, width: 1 },
  });
  const metrics = [
    ['Tasks and subtasks', String(planTasks.length)],
    ['Completed', `${completed} of ${planTasks.length}`],
    ['Progress', `${progress}%`],
    ['Time entered', hours ? `${hours} hours` : 'Not entered'],
  ];
  metrics.forEach(([label, value], index) => {
    const y = 1.72 + index * 0.92;
    overview.addText(label, {
      x: 0.75,
      y,
      w: 2.6,
      h: 0.28,
      fontFace: 'Montserrat',
      fontSize: 13,
      color: muted,
      margin: 0,
    });
    overview.addText(value, {
      x: 3.55,
      y: y - 0.06,
      w: 3.1,
      h: 0.38,
      fontFace: 'Montserrat',
      fontSize: 20,
      bold: true,
      color: ink,
      margin: 0,
    });
  });
  overview.addText('Schedule', {
    x: 7.3,
    y: 1.72,
    w: 2.2,
    h: 0.3,
    fontFace: 'Montserrat',
    fontSize: 13,
    color: muted,
    margin: 0,
  });
  overview.addText(
    `${pptDate(
      planTasks
        .map((task) => task.plannedDate)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b))[0],
    )}\n${pptDate(
      plan.dueDate ||
        planTasks
          .map((task) => task.dueDate)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b))
          .at(-1),
    )}`,
    {
      x: 7.3,
      y: 2.15,
      w: 4.3,
      h: 1.2,
      fontFace: 'Montserrat',
      fontSize: 21,
      bold: true,
      color: ink,
      breakLine: false,
      margin: 0,
    },
  );
  overview.addShape(pptx.ShapeType.rect, {
    x: 7.3,
    y: 4.18,
    w: 4.7,
    h: 0.22,
    fill: { color: 'E9ECF0' },
    line: { color: 'E9ECF0' },
  });
  overview.addShape(pptx.ShapeType.rect, {
    x: 7.3,
    y: 4.18,
    w: Math.max(0.06, (4.7 * progress) / 100),
    h: 0.22,
    fill: { color: accent },
    line: { color: accent },
  });
  overview.addText(`${progress}% complete`, {
    x: 7.3,
    y: 4.58,
    w: 4.7,
    h: 0.28,
    fontFace: 'Montserrat',
    fontSize: 13,
    bold: true,
    color: ink,
    margin: 0,
  });
  addFooter(overview, 2);

  const dated = planTasks
    .filter((task) => task.plannedDate || task.dueDate)
    .sort((a, b) =>
      (a.plannedDate || a.dueDate || '').localeCompare(
        b.plannedDate || b.dueDate || '',
      ),
    );
  const schedule = pptx.addSlide({});
  schedule.background = { color: white };
  schedule.addText('Plan schedule', {
    x: 0.65,
    y: 0.5,
    w: 6.6,
    h: 0.48,
    fontFace: 'Montserrat',
    fontSize: 28,
    bold: true,
    color: ink,
    margin: 0,
  });
  schedule.addTable(
    [
      [
        { text: 'Task', options: { bold: true } },
        { text: 'Owners', options: { bold: true } },
        { text: 'Start', options: { bold: true } },
        { text: 'Due', options: { bold: true } },
        { text: 'Progress', options: { bold: true } },
      ],
      ...dated
        .slice(0, 11)
        .map((task) =>
          [
            task.title,
            task.owners.join(', ') || 'Unassigned',
            pptDate(task.plannedDate),
            pptDate(task.dueDate),
            `${task.progress}%`,
          ].map((text) => ({ text })),
        ),
    ],
    {
      x: 0.65,
      y: 1.35,
      w: 12.05,
      h: 5.45,
      border: { type: 'solid', color: line, pt: 0.7 },
      fill: { color: white },
      color: ink,
      fontFace: 'Montserrat',
      fontSize: 12,
      margin: 0.1,
      rowH: 0.42,
      colW: [4.25, 2.5, 1.65, 1.65, 1.45],
      valign: 'middle',
      breakLine: false,
    },
  );
  if (!dated.length)
    schedule.addText('No dated tasks have been added to this plan.', {
      x: 0.68,
      y: 1.55,
      w: 8.3,
      h: 0.4,
      fontFace: 'Montserrat',
      fontSize: 17,
      color: muted,
      margin: 0,
    });
  addFooter(schedule, 3);

  const pages = Math.max(1, Math.ceil(planTasks.length / 12));
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    const detail = pptx.addSlide({});
    detail.background = { color: white };
    detail.addText(pageIndex ? 'Task detail continued' : 'Task detail', {
      x: 0.65,
      y: 0.5,
      w: 8,
      h: 0.48,
      fontFace: 'Montserrat',
      fontSize: 28,
      bold: true,
      color: ink,
      margin: 0,
    });
    const rows = planTasks.slice(pageIndex * 12, pageIndex * 12 + 12);
    detail.addTable(
      [
        [
          { text: 'Task', options: { bold: true } },
          { text: 'Type', options: { bold: true } },
          { text: 'Status', options: { bold: true } },
          { text: 'Priority', options: { bold: true } },
          { text: 'Time', options: { bold: true } },
        ],
        ...rows.map((task) =>
          [
            task.title,
            task.parentId ? 'Subtask' : 'Task',
            task.status,
            task.priority,
            task.timeHours === undefined ? '' : `${task.timeHours}h`,
          ].map((text) => ({ text })),
        ),
      ],
      {
        x: 0.65,
        y: 1.35,
        w: 12.05,
        h: 5.45,
        border: { type: 'solid', color: line, pt: 0.7 },
        fill: { color: white },
        color: ink,
        fontFace: 'Montserrat',
        fontSize: 12,
        margin: 0.1,
        rowH: 0.42,
        colW: [5.3, 1.55, 2.05, 1.55, 1.6],
        valign: 'middle',
        breakLine: false,
      },
    );
    if (!rows.length)
      detail.addText('This plan has no tasks yet.', {
        x: 0.68,
        y: 1.55,
        w: 8.3,
        h: 0.4,
        fontFace: 'Montserrat',
        fontSize: 17,
        color: muted,
        margin: 0,
      });
    addFooter(detail, 4 + pageIndex);
  }

  const safeName = plan.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Plan';
  await pptx.writeFile({ fileName: `Capexity_${safeName}_${todayIso()}.pptx` });
}
import type PptxGenJS from 'pptxgenjs';
