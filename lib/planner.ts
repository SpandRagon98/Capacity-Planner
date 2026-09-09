export type TaskStatus = 'Starting' | 'In Progress' | 'Completed' | 'Locked';

export type PlannerTask = {
  id: string;
  title: string;
  plan: string;
  owner: string;
  status: TaskStatus;
  priority: 'Low' | 'Medium' | 'High';
  estimate: number;
  progress: number;
  startDate: string;
  dueDate: string;
  plannedDate: string;
  plannedHours: number;
  carryoverFrom?: string;
  notes?: string;
};

export const statusColors: Record<TaskStatus, string> = {
  Starting: '#B0DBF6',
  'In Progress': '#EFB0F6',
  Completed: '#C3D1AC',
  Locked: '#FDB1AF',
};

export const initialTasks: PlannerTask[] = [];

const DB_NAME = 'task-capacity-planner-v2';
const STORE = 'planner';
const KEY = 'tasks';

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

export async function loadTasks(): Promise<PlannerTask[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as PlannerTask[] | undefined) ?? initialTasks);
    request.onerror = () => resolve(initialTasks);
  });
}

export async function saveTasks(tasks: PlannerTask[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(tasks, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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

type ExportKind = 'Daily' | 'Weekly' | 'Plan';

export async function exportWorkbook(kind: ExportKind, tasks: PlannerTask[]) {
  const XLSX = await import('xlsx-js-style');
  const today = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();
  const titleStyle = { font:{ name:'Montserrat', bold:true, sz:18, color:{ rgb:'111111' } }, fill:{ fgColor:{ rgb:'B0DBF6' } }, alignment:{ vertical:'center' as const } };
  const headerStyle = { font:{ name:'Montserrat', bold:true, color:{ rgb:'FFFFFF' } }, fill:{ fgColor:{ rgb:'111111' } }, alignment:{ vertical:'center' as const }, border:{ bottom:{ style:'thin', color:{ rgb:'E8E8EB' } } } };
  const bodyBorder = { top:{ style:'thin', color:{ rgb:'E8E8EB' } }, bottom:{ style:'thin', color:{ rgb:'E8E8EB' } }, left:{ style:'thin', color:{ rgb:'E8E8EB' } }, right:{ style:'thin', color:{ rgb:'E8E8EB' } } };

  const addSheet = (name: string, rows: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let c=range.s.c;c<=range.e.c;c++) {
      const title = ws[XLSX.utils.encode_cell({r:0,c})]; if (title) title.s = titleStyle;
      const header = ws[XLSX.utils.encode_cell({r:2,c})]; if (header) header.s = headerStyle;
    }
    for (let r=3;r<=range.e.r;r++) for (let c=range.s.c;c<=range.e.c;c++) {
      const cell = ws[XLSX.utils.encode_cell({r,c})];
      if (cell) cell.s = { font:{ name:'Montserrat', sz:10 }, border:bodyBorder, alignment:{ vertical:'center', wrapText:true } };
    }
    ws['!cols'] = [{wch:13},{wch:34},{wch:26},{wch:15},{wch:14},{wch:12},{wch:12},{wch:14}];
    ws['!rows'] = [{hpt:30},{hpt:8},{hpt:24}];
    ws['!autofilter'] = { ref:`A3:${XLSX.utils.encode_col(range.e.c)}${range.e.r+1}` };
    ws['!freeze'] = { xSplit:0, ySplit:3, topLeftCell:'A4', activePane:'bottomLeft', state:'frozen' };
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  const taskRows = tasks.map(t => [t.id,t.title,t.plan,t.owner,t.status,t.estimate,t.progress/100,t.dueDate]);
  addSheet(kind === 'Plan' ? 'Task Register' : 'Tasks', [[`${kind} ${kind === 'Daily' ? 'Tasks' : kind === 'Weekly' ? 'Review' : 'Plan Export'}`],[],['ID','Task','Plan','Owner','Status','Estimate h','Progress','Due'],...taskRows]);
  const summary = kind === 'Daily'
    ? [['Daily Summary'],[],['Date','Capacity','Planned h','Utilization','Completed','Pending','Carried in'],[today,8,6.5,.8125,tasks.filter(t=>t.status==='Completed').length,tasks.filter(t=>t.status!=='Completed').length,tasks.filter(t=>t.carryoverFrom).length]]
    : [['Weekly Summary'],[],['Week','Capacity','Planned h','Utilization','Completed','Carryover'],['07–11 Sep 2026',40,33.25,.83125,tasks.filter(t=>t.status==='Completed').length,tasks.filter(t=>t.carryoverFrom).length]];
  addSheet(kind === 'Plan' ? 'Plan Overview' : kind === 'Daily' ? 'Daily Summary' : 'Weekly Summary', summary);
  if (kind === 'Plan') addSheet('Dependencies', [['Dependencies'],[],['From task','Relationship','To task','Conflict']]);
  const planName=(tasks.find(task=>task.plan)?.plan||'Workspace').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'');
  XLSX.writeFile(wb, kind === 'Daily' ? `Daily_Tasks_${today}.xlsx` : kind === 'Weekly' ? `Weekly_Review_${today}.xlsx` : `Plan_${planName}_${today}.xlsx`);
}
