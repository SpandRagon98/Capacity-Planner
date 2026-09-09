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

export type PlannerTask = {
  id: string;
  title: string;
  planId?: string;
  parentId?: string;
  owner?: string;
  status: TaskStatus;
  priority: TaskPriority;
  timeHours?: number;
  plannedDate?: string;
  dueDate?: string;
  progress: number;
  notes?: string;
  createdAt: string;
  carryoverFrom?: string;
};

export type Workspace = { tasks: PlannerTask[]; plans: Plan[] };

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
  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${value.toUpperCase()}`;
}

export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readKey<T>(db: IDBDatabase, key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback);
    request.onerror = () => resolve(fallback);
  });
}

type LegacyTask = Partial<PlannerTask> & { plan?: string; plannedHours?: number; estimate?: number };

export async function loadWorkspace(): Promise<Workspace> {
  const db = await openDb();
  const [storedTasks, storedPlans] = await Promise.all([
    readKey<LegacyTask[]>(db, 'tasks', []),
    readKey<Plan[]>(db, 'plans', []),
  ]);
  const legacyPlanNames = [...new Set(storedTasks.map((task) => task.plan?.trim()).filter(Boolean) as string[])];
  const plans = storedPlans.length
    ? storedPlans
    : legacyPlanNames.map((name, index) => ({ id: makeId('PLAN'), name, color: PLAN_COLORS[index % PLAN_COLORS.length] }));
  const planByName = new Map(plans.map((plan) => [plan.name, plan.id]));
  const tasks = storedTasks.map((task) => ({
    id: task.id || makeId('TASK'),
    title: task.title || 'Untitled task',
    planId: task.planId || (task.plan ? planByName.get(task.plan) : undefined),
    parentId: task.parentId,
    owner: task.owner || undefined,
    status: task.status || 'Starting',
    priority: task.priority || 'Medium',
    timeHours: task.timeHours ?? (task.plannedHours ? task.plannedHours : task.estimate || undefined),
    plannedDate: task.plannedDate || undefined,
    dueDate: task.dueDate || undefined,
    progress: task.progress ?? 0,
    notes: task.notes || undefined,
    createdAt: task.createdAt || new Date().toISOString(),
    carryoverFrom: task.carryoverFrom,
  } satisfies PlannerTask));
  return { tasks, plans };
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.put(workspace.tasks, 'tasks');
    store.put(workspace.plans, 'plans');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function nextWorkingDay(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`);
  do date.setDate(date.getDate() + 1); while ([0, 6].includes(date.getDay()));
  return date.toISOString().slice(0, 10);
}

export function closeDay(tasks: PlannerTask[], dateText: string): PlannerTask[] {
  return tasks.map((task) => task.plannedDate === dateText && task.status !== 'Completed' && task.status !== 'Locked'
    ? { ...task, plannedDate: nextWorkingDay(dateText), carryoverFrom: dateText }
    : task);
}

export async function exportWorkbook(scope: 'All' | 'Tasks' | 'Plans', workspace: Workspace) {
  const XLSX = await import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();
  const planById = new Map(workspace.plans.map((plan) => [plan.id, plan]));
  const taskById = new Map(workspace.tasks.map((task) => [task.id, task]));
  const heading = { font: { name: 'Montserrat', bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '171717' } } };
  const title = { font: { name: 'Montserrat', bold: true, sz: 18 }, fill: { fgColor: { rgb: 'B0DBF6' } } };

  const addSheet = (name: string, rows: (string | number)[][], widths: number[]) => {
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
    sheet['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(range.e.c)}${range.e.r + 1}` };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };

  if (scope !== 'Tasks') {
    const planRows = workspace.plans.map((plan) => {
      const tasks = workspace.tasks.filter((task) => task.planId === plan.id);
      return [plan.id, plan.name, plan.description || '', plan.owner || '', plan.dueDate || '', tasks.filter((task) => !task.parentId).length, tasks.filter((task) => task.parentId).length, tasks.reduce((sum, task) => sum + (task.timeHours || 0), 0), tasks.filter((task) => task.status === 'Completed').length];
    });
    addSheet('Plans', [['Plans'], [], ['Plan ID', 'Plan', 'Description', 'Owner', 'Due', 'Tasks', 'Subtasks', 'Total time h', 'Completed'], ...planRows], [18, 28, 38, 20, 14, 10, 10, 14, 12]);
  }

  if (scope !== 'Plans') {
    const ordered = [...workspace.tasks].sort((a, b) => (a.parentId || a.id).localeCompare(b.parentId || b.id) || Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
    const taskRows = ordered.map((task) => [
      task.id,
      task.parentId ? 'Subtask' : 'Task',
      task.title,
      task.parentId ? taskById.get(task.parentId)?.title || '' : '',
      task.planId ? planById.get(task.planId)?.name || '' : 'Standalone',
      task.owner || '',
      task.status,
      task.timeHours ?? '',
      task.plannedDate || '',
      task.dueDate || '',
      task.notes || '',
    ]);
    addSheet('Tasks', [['Tasks and subtasks'], [], ['Task ID', 'Type', 'Task', 'Parent task', 'Plan', 'Owner', 'Status', 'Time h', 'Planned date', 'Due date', 'Notes'], ...taskRows], [18, 12, 34, 30, 26, 20, 16, 10, 14, 14, 40]);
  }

  XLSX.writeFile(workbook, `Capacity_Planner_${scope}_${todayIso()}.xlsx`);
}
