'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Bell, CalendarCheck2, CalendarDays, ChartGantt, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleCheckBig, Clock3, Download,
  FileSpreadsheet, Filter, FolderKanban, History, Home, ListTodo, LockKeyhole,
  LogOut, MoreHorizontal, Plus, Search, Settings, Sparkles, Upload, UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  closeDay, exportWorkbook, initialTasks, loadTasks, PlannerTask, saveTasks, statusColors, TaskStatus,
} from '@/lib/planner';

const navItems = [
  { label:'Home', icon:Home }, { label:'My Day', icon:CalendarCheck2 }, { label:'Tasks', icon:ListTodo },
  { label:'Plans', icon:FolderKanban }, { label:'Gantt', icon:ChartGantt }, { label:'Workload', icon:UsersRound },
  { label:'Calendar', icon:CalendarDays }, { label:'History', icon:History }, { label:'Exports', icon:FileSpreadsheet },
  { label:'Settings', icon:Settings },
];

const viewCopy: Record<string, { eyebrow:string; title:string; subtitle:string }> = {
  Home:{eyebrow:'Wednesday, 09 September',title:'Your workspace',subtitle:'Create a task to begin planning work and capacity.'},
  'My Day':{eyebrow:'Daily execution',title:'Wednesday, 09 September',subtitle:'Focus on the work planned today, including anything carried forward.'},
  Tasks:{eyebrow:'Task register',title:'All tasks',subtitle:'Search, filter, and update every commitment in one place.'},
  Plans:{eyebrow:'Plans hub',title:'Active plans',subtitle:'See progress, schedule windows, ownership, and plan risk.'},
  Gantt:{eyebrow:'Schedule planner',title:'Gantt timeline',subtitle:'Working-day timeline with progress, ownership, and dependency conflicts.'},
  Workload:{eyebrow:'Capacity planning',title:'Team workload',subtitle:'Planned hours against each owner’s available working capacity.'},
  Calendar:{eyebrow:'Calendar',title:'September 2026',subtitle:'Task dates, milestones, weekends, and holidays.'},
  History:{eyebrow:'Weekly review',title:'07–11 September',subtitle:'What was planned, completed, and carried forward.'},
  Exports:{eyebrow:'Export center',title:'Reports and backup',subtitle:'Create polished local workbooks or protect your on-device data.'},
  Settings:{eyebrow:'Local configuration',title:'Settings',subtitle:'Owners, work hours, holidays, status colors, and data controls.'},
};

const EMPTY_TASK: PlannerTask={id:'',title:'',plan:'',owner:'',status:'Starting',priority:'Medium',estimate:0,progress:0,startDate:'',dueDate:'',plannedDate:'',plannedHours:0};

function Login({ onSuccess }:{ onSuccess:(email:string)=>void }) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState('');
  function submit(event:{preventDefault:()=>void}){
    event.preventDefault();
    const normalized=email.trim().toLowerCase();
    const allowed=['spandan@gmail.com','mandhya@gmail.com'];
    if(allowed.includes(normalized)&&password==='data 1234'){
      localStorage.setItem('tcp-session-email',normalized);
      onSuccess(normalized);
      return;
    }
    setError('Email or password is incorrect.');
  }
  return <main className="login-shell">
    <section className="login-panel">
      <div className="brand-lockup"><span className="brand-mark"><span/></span><span>Capacity</span></div>
      <div className="login-copy"><p className="eyebrow">Local workspace</p><h1>Plan the work.<br/>See the capacity.</h1><p>Keep project plans, daily execution, and workload in one calm operating view.</p></div>
      <form onSubmit={submit} className="login-form">
        <label>Email address<Input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@company.com"/></label>
        <label>Password<Input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password"/></label>
        {error&&<p className="form-error" role="alert">{error}</p>}<Button type="submit" size="lg" className="sign-in-button">Sign in</Button>
      </form>
      <p className="privacy-note"><LockKeyhole size={14}/> Prototype access · data stays on this device</p>
    </section>
    <section className="login-visual" aria-label="Blank capacity workspace preview">
      <div className="visual-topline"><span>Your workspace</span><span>Local-first</span></div>
      <div className="visual-title"><p>Task and capacity planning</p><strong>Start with a clean slate.</strong></div>
      <div className="visual-chart visual-chart-empty" aria-hidden="true">{Array.from({length:12},(_,index)=><span key={index} className="visual-bar"/>)}</div>
      <div className="visual-card-row"><div><span>Tasks</span><strong>—</strong><small>Add your first task</small></div><div><span>Plans</span><strong>—</strong><small>Create work your way</small></div></div>
    </section>
  </main>;
}

function EmptyState({title,description,action}:{title:string;description:string;action?:()=>void}){
  return <div className="empty-state"><span><ListTodo/></span><h3>{title}</h3><p>{description}</p>{action&&<Button onClick={action}><Plus/> Create your first task</Button>}</div>;
}

function TaskDrawer({ open, task, onOpenChange, onSave }:{open:boolean;task:PlannerTask|null;onOpenChange:(open:boolean)=>void;onSave:(task:PlannerTask)=>void}) {
  const [draft,setDraft]=useState<PlannerTask>(EMPTY_TASK);
  useEffect(()=>setDraft(task??{...EMPTY_TASK,id:`TCP-${Math.floor(Date.now()/1000).toString().slice(-3)}`}),[task,open]);
  const field=<K extends keyof PlannerTask>(key:K,value:PlannerTask[K])=>setDraft(current=>({...current,[key]:value}));
  function submit(event:{preventDefault:()=>void}){event.preventDefault();if(!draft.title.trim())return;onSave({...draft,title:draft.title.trim(),progress:draft.status==='Completed'?100:draft.progress});onOpenChange(false)}
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="task-drawer sm:max-w-[520px]">
    <SheetHeader className="drawer-header"><p className="eyebrow">{task?'Task details':'Quick create'}</p><SheetTitle>{task?task.id:'New task'}</SheetTitle><SheetDescription>{task?'Changes are saved to this device.':'Add the essentials now. Refine the schedule later.'}</SheetDescription></SheetHeader>
    <form id="task-form" onSubmit={submit} className="drawer-form">
      <label className="wide">Task title<Input autoFocus value={draft.title} onChange={e=>field('title',e.target.value)} placeholder="What needs to be done?"/></label>
      <label>Plan<Input value={draft.plan} onChange={e=>field('plan',e.target.value)} placeholder="Add a plan name"/></label>
      <label>Owner<Input value={draft.owner} onChange={e=>field('owner',e.target.value)} placeholder="Add an owner"/></label>
      <label>Status<NativeSelect value={draft.status} onChange={e=>field('status',e.target.value as TaskStatus)}>{Object.keys(statusColors).map(status=><NativeSelectOption key={status}>{status}</NativeSelectOption>)}</NativeSelect></label>
      <label>Priority<NativeSelect value={draft.priority} onChange={e=>field('priority',e.target.value as PlannerTask['priority'])}><NativeSelectOption>Low</NativeSelectOption><NativeSelectOption>Medium</NativeSelectOption><NativeSelectOption>High</NativeSelectOption></NativeSelect></label>
      <label>Estimate hours<Input type="number" min="0" step="0.5" value={draft.estimate} onChange={e=>field('estimate',Number(e.target.value))}/></label>
      <label>Planned hours<Input type="number" min="0" step="0.5" value={draft.plannedHours} onChange={e=>field('plannedHours',Number(e.target.value))}/></label>
      <label>Start date<Input type="date" value={draft.startDate} onChange={e=>field('startDate',e.target.value)}/></label>
      <label>Due date<Input type="date" value={draft.dueDate} onChange={e=>field('dueDate',e.target.value)}/></label>
      <label className="wide">Progress <span>{draft.progress}%</span><Input type="range" min="0" max="100" step="5" value={draft.progress} onChange={e=>field('progress',Number(e.target.value))}/></label>
      <label className="wide">Notes<textarea value={draft.notes??''} onChange={e=>field('notes',e.target.value)} placeholder="Add context, decisions, or handoff notes."/></label>
    </form>
    <SheetFooter className="drawer-footer"><Button variant="outline" type="button" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" form="task-form">{task?'Save changes':'Create task'}</Button></SheetFooter>
  </SheetContent></Sheet>;
}

function HomeView({tasks,onOpen,onCreate}:{tasks:PlannerTask[];onOpen:(task:PlannerTask)=>void;onCreate:()=>void}) {
  if(!tasks.length)return <section className="panel empty-panel"><EmptyState title="Your workspace is ready" description="Create a task to begin building your plan, daily queue, and workload forecast." action={onCreate}/></section>;
  const today=tasks.filter(t=>t.plannedDate==='2026-09-09'); const planned=today.reduce((sum,t)=>sum+t.plannedHours,0); const completed=today.filter(t=>t.status==='Completed').length;
  const workload=[7,8,9,10,11].map((date,index)=>({day:['Mon','Tue','Wed','Thu','Fri'][index],planned:tasks.filter(t=>t.plannedDate===`2026-09-${String(date).padStart(2,'0')}`).reduce((sum,t)=>sum+t.plannedHours,0),tone:['#B0DBF6','#C3D1AC','#EFB0F6','#FDB1AF','#B0DBF6'][index]}));
  const plans=[...new Set(tasks.map(t=>t.plan).filter(Boolean))];
  return <>
    <section className="kpi-grid">
      <article className="kpi-card accent-blue"><span>Today’s utilization</span><strong>{Math.round(planned/8*100)}%</strong><p>{planned} of 8 hours planned</p><i><Sparkles size={14}/> Healthy</i></article>
      <article className="kpi-card"><span>Scheduled today</span><strong>{today.length}</strong><p>Across 3 active plans</p><i>2 due today</i></article>
      <article className="kpi-card"><span>Completed today</span><strong>{completed}</strong><p>{today.filter(t=>t.status==='Completed').reduce((s,t)=>s+t.plannedHours,0)} hours of work</p><i className="positive"><Check size={14}/> On plan</i></article>
      <article className="kpi-card accent-coral"><span>Carryover</span><strong>{tasks.filter(t=>t.carryoverFrom).length}</strong><p>{tasks.filter(t=>t.carryoverFrom).reduce((s,t)=>s+t.plannedHours,0)} hours moved forward</p><i>Needs review</i></article>
    </section>
    <section className="dashboard-grid">
      <article className="panel workload-panel"><div className="panel-heading"><div><span>Weekly workload</span><strong>Planned hours vs capacity</strong></div><button>All owners <ChevronDown size={14}/></button></div><div className="chart-wrap"><div className="chart-axis"><span>10h</span><span>8h</span><span>4h</span><span>0h</span></div><div className="chart-grid"><i className="capacity-line"><span>8h capacity</span></i>{workload.map(day=><div className="day-column" key={day.day}><div className="bar-track"><div className="bar-fill" style={{height:`${Math.min(day.planned/10*100,100)}%`,background:day.tone}}><span>{day.planned}h</span></div></div><b>{day.day}</b></div>)}</div></div><div className="chart-legend"><span><i className="legend-dot"/> Planned hours</span><span><i className="legend-line"/> Daily capacity</span><button>View workload →</button></div></article>
      <article className="panel health-panel"><div className="panel-heading"><div><span>Plan health</span><strong>Active commitments</strong></div><button aria-label="Plan health options"><MoreHorizontal/></button></div><div className="health-list">{plans.slice(0,3).map((name,index)=>{const list=tasks.filter(t=>t.plan===name);const progress=Math.round(list.reduce((s,t)=>s+t.progress,0)/list.length);const color=['#B0DBF6','#FDB1AF','#C3D1AC'][index];return <div className="health-item" key={name}><div className="health-main"><span className="plan-color" style={{background:color}}/><div><strong>{name}</strong><small>{list.length} {list.length===1?'task':'tasks'}</small></div><b>{progress}%</b></div><div className="health-progress"><span style={{width:`${progress}%`,background:color}}/></div><div className="health-meta"><span>{progress<50?'Needs attention':'On track'}</span><span>{[...new Set(list.map(t=>t.owner).filter(Boolean))].length} owners</span></div></div>})}</div><button className="panel-link">View all plans <span>→</span></button></article>
    </section>
    <section className="panel next-panel"><div className="panel-heading"><div><span>My day</span><strong>Next up</strong></div><button>Open full day →</button></div><div className="task-table">{today.map((task,index)=><button className="task-row" key={task.id} onClick={()=>onOpen(task)}><span className="task-time">{['09:00','11:30','14:00','15:30'][index]??'16:00'}</span><span className="task-check"><Check size={14}/></span><div className="task-name"><strong>{task.title}</strong><small>{task.carryoverFrom?`Carried over from 08 Sep`:task.plan}</small></div><span className="task-hours"><Clock3 size={14}/>{task.plannedHours}h</span><div className="task-progress"><span><i style={{width:`${task.progress}%`,background:statusColors[task.status]}}/></span><b>{task.progress}%</b></div><span>→</span></button>)}</div></section>
  </>;
}

function MyDayView({tasks,onChange,onOpen,onCloseDay}:{tasks:PlannerTask[];onChange:(task:PlannerTask)=>void;onOpen:(task:PlannerTask)=>void;onCloseDay:()=>void}) {
  const today=tasks.filter(t=>t.plannedDate==='2026-09-09'); const planned=today.reduce((s,t)=>s+t.plannedHours,0);
  if(!today.length)return <section className="panel empty-panel"><EmptyState title="Nothing planned for today" description="Tasks scheduled for 09 September will appear here."/></section>;
  return <div className="myday-layout"><section className="panel day-main"><div className="day-summary"><div><span>Capacity</span><strong>8h</strong></div><div><span>Planned</span><strong>{planned}h</strong></div><div><span>Utilization</span><strong>{Math.round(planned/8*100)}%</strong></div><Button variant="outline" onClick={onCloseDay}>Review & close day</Button></div>
    <div className="day-list">{today.map((task,index)=><article className="day-task" key={task.id}><div className="day-time"><span>{['09:00','11:30','14:00','15:30'][index]??'16:00'}</span><i/></div><div className="day-card" style={{'--task-color':statusColors[task.status]} as React.CSSProperties}><div className="day-card-top"><div><small>{task.carryoverFrom?'Carryover from Tuesday':task.plan}</small><button onClick={()=>onOpen(task)}>{task.title}</button></div><span className="status-pill" style={{background:statusColors[task.status]}}>{task.status}</span></div><div className="day-card-bottom"><span><Clock3/> {task.plannedHours}h planned</span><span>{task.progress}% complete</span><div className="quick-actions"><Button variant="ghost" size="sm" onClick={()=>onChange({...task,progress:Math.min(100,task.progress+10),status:task.progress+10>=100?'Completed':'In Progress'})}>+10%</Button><Button variant="ghost" size="sm" onClick={()=>onChange({...task,progress:100,status:'Completed'})}><CircleCheckBig/> Complete</Button></div></div></div></article>)}</div>
  </section><aside className="panel day-aside"><span className="eyebrow">Day pulse</span><h3>{today.filter(t=>t.status==='Completed').length} of {today.length} tasks done</h3><Progress value={today.length?today.filter(t=>t.status==='Completed').length/today.length*100:0}/><div className="aside-stat"><span>Hours completed</span><strong>{today.filter(t=>t.status==='Completed').reduce((s,t)=>s+t.plannedHours,0)}h</strong></div><div className="aside-stat"><span>Still planned</span><strong>{today.filter(t=>t.status!=='Completed').reduce((s,t)=>s+t.plannedHours,0)}h</strong></div><p>Incomplete work moves to the next working day when you close today. Historical rows remain unchanged.</p></aside></div>;
}

function TasksView({tasks,onOpen}:{tasks:PlannerTask[];onOpen:(task:PlannerTask)=>void}) {
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('All');
  const filtered=tasks.filter(t=>(t.title+t.plan+t.owner).toLowerCase().includes(query.toLowerCase())&&(status==='All'||t.status===status));
  return <section className="panel data-panel"><div className="table-tools"><div className="inline-search"><Search/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks…"/></div><NativeSelect value={status} onChange={e=>setStatus(e.target.value)}><NativeSelectOption>All</NativeSelectOption>{Object.keys(statusColors).map(s=><NativeSelectOption key={s}>{s}</NativeSelectOption>)}</NativeSelect><Button variant="outline"><Filter/> More filters</Button></div><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Task</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Estimate</TableHead><TableHead>Progress</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{filtered.map(task=><TableRow key={task.id} onClick={()=>onOpen(task)} className="clickable-row"><TableCell>{task.id}</TableCell><TableCell><strong>{task.title}</strong><small>{task.plan||'No plan'}</small></TableCell><TableCell>{task.owner||'Unassigned'}</TableCell><TableCell><span className="status-pill" style={{background:statusColors[task.status]}}>{task.status}</span></TableCell><TableCell>{task.estimate}h</TableCell><TableCell><div className="table-progress"><Progress value={task.progress}/><span>{task.progress}%</span></div></TableCell><TableCell>{task.dueDate||'—'}</TableCell></TableRow>)}{!filtered.length&&<TableRow><TableCell colSpan={7}><EmptyState title={tasks.length?'No matching tasks':'No tasks yet'} description={tasks.length?'Try a different search or status filter.':'Use New task to create the first item in your workspace.'}/></TableCell></TableRow>}</TableBody></Table></section>;
}

function PlansView({tasks}:{tasks:PlannerTask[]}) {
  const plans=[...new Set(tasks.map(t=>t.plan).filter(Boolean))];
  if(!plans.length)return <section className="panel empty-panel"><EmptyState title="No plans yet" description="Add a plan name while creating a task and it will appear here automatically."/></section>;
  return <section className="plan-grid">{plans.map((name,index)=>{const list=tasks.filter(t=>t.plan===name);const hours=list.reduce((s,t)=>s+t.estimate,0);const progress=hours?Math.round(list.reduce((s,t)=>s+t.progress*t.estimate,0)/hours):0;const due=list.map(t=>t.dueDate).filter(Boolean).sort().at(-1)||'No due date';return <article className="plan-card" key={name}><span className="plan-band" style={{background:['#B0DBF6','#FDB1AF','#C3D1AC','#EFB0F6'][index%4]}}/><div className="plan-card-head"><span>{list.length} {list.length===1?'task':'tasks'}</span><button><MoreHorizontal/></button></div><h3>{name}</h3><p>{due}</p><Progress value={progress}/><div className="plan-stats"><div><span>Progress</span><strong>{progress}%</strong></div><div><span>Estimated</span><strong>{hours}h</strong></div></div></article>})}</section>;
}

function GanttView({tasks,onOpen}:{tasks:PlannerTask[];onOpen:(task:PlannerTask)=>void}) {
  if(!tasks.length)return <section className="panel empty-panel"><EmptyState title="No schedule to show" description="Add tasks with dates to build the Gantt timeline."/></section>;
  const firstPlan=tasks.find(t=>t.plan)?.plan; const list=firstPlan?tasks.filter(t=>t.plan===firstPlan):tasks;
  return <section className="panel gantt-panel"><div className="gantt-tools"><div className="segmented"><button>Day</button><button className="active">Week</button><button>Month</button></div><Button variant="outline">Today</Button><span>Holiday shading on</span></div><div className="gantt-scroll"><div className="gantt-header"><strong>Task / owner</strong>{Array.from({length:14},(_,i)=><span className={i===5||i===6||i===12||i===13?'weekend':''} key={i}>{7+i}</span>)}</div>{list.map((task,index)=><button className="gantt-row" key={task.id} onClick={()=>onOpen(task)}><div><strong>{task.title}</strong><small>{task.owner} · {task.estimate}h</small></div>{Array.from({length:14},(_,i)=><span className={i===5||i===6||i===12||i===13?'weekend':''} key={i}/>)}<i className="gantt-bar" style={{left:`calc(260px + ${(index*2+1)*52}px)`,width:`${Math.max(104,task.estimate*15)}px`,background:statusColors[task.status]}}><b style={{width:`${task.progress}%`}}/>{task.status}</i></button>)}</div><div className="gantt-note"><AlertTriangle/> Dependency conflict: QA export workbook starts before “Validate source logic” is complete.</div></section>;
}

function WorkloadView({tasks}:{tasks:PlannerTask[]}) {
  const owners=[...new Set(tasks.map(t=>t.owner).filter(Boolean))]; const days=['Mon 7','Tue 8','Wed 9','Thu 10','Fri 11'];
  if(!owners.length)return <section className="panel empty-panel"><EmptyState title="No workload data" description="Assign an owner and planned date to a task to calculate capacity."/></section>;
  const values=Object.fromEntries(owners.map(owner=>[owner,[7,8,9,10,11].map(date=>tasks.filter(t=>t.owner===owner&&t.plannedDate===`2026-09-${String(date).padStart(2,'0')}`).reduce((sum,t)=>sum+t.plannedHours,0))])) as Record<string,number[]>;
  return <section className="panel workload-table"><div className="workload-legend"><span><i className="load-under"/>Under 85%</span><span><i className="load-healthy"/>85–100%</span><span><i className="load-over"/>Overloaded</span></div><div className="load-grid"><div className="load-head"><strong>Owner</strong>{days.map(day=><strong key={day}>{day}<small>8h capacity</small></strong>)}<strong>Weekly</strong></div>{owners.map(owner=>{const total=values[owner].reduce((s,v)=>s+v,0);return <div className="load-row" key={owner}><div><span className="avatar">{owner.slice(0,2).toUpperCase()}</span><strong>{owner}</strong></div>{values[owner].map((hours,index)=>{const p=Math.round(hours/8*100);return <button className={p>100?'over':p>=85?'healthy':'under'} key={index}><strong>{hours}/8h</strong><small>{p}%</small></button>})}<div className={total>40?'over':'healthy'}><strong>{total}/40h</strong><small>{Math.round(total/40*100)}%</small></div></div>})}</div></section>;
}

function CalendarView({tasks}:{tasks:PlannerTask[]}) {
  const offset=2; return <section className="panel calendar-panel"><div className="calendar-toolbar"><div><Button variant="outline" size="icon-sm"><ChevronLeft/></Button><Button variant="outline" size="icon-sm"><ChevronRight/></Button></div><span>India holidays · Week starts Monday</span></div><div className="month-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><strong key={d}>{d}</strong>)}{Array.from({length:35},(_,i)=>{const day=i-offset+1;const list=tasks.filter(t=>Number(t.plannedDate.slice(8))===day);return <div key={i} className={day<1||day>30?'outside':(i%7===5||i%7===6)?'weekend':''}><span>{day>0&&day<=30?day:''}</span>{day===9&&<i className="today-dot">Today</i>}{list.slice(0,2).map(t=><small key={t.id} style={{background:statusColors[t.status]}}>{t.title}</small>)}</div>})}</div></section>;
}

function HistoryView({tasks}:{tasks:PlannerTask[]}) {
  if(!tasks.length)return <section className="panel empty-panel"><EmptyState title="No activity yet" description="Task updates, completions, and carryover events will appear here."/></section>;
  const days=[['Mon 7','5 done','1 rolled'],['Tue 8','4 done','2 rolled'],['Wed 9',`${tasks.filter(t=>t.status==='Completed').length} done`,`${tasks.filter(t=>t.carryoverFrom).length} carried`],['Thu 10','—','Planned'],['Fri 11','—','Planned']];
  return <><section className="history-strip">{days.map(([day,done,rolled],index)=><article className={index===2?'current':''} key={day}><span>{day}</span><strong>{done}</strong><small>{rolled}</small></article>)}</section><section className="history-grid"><article className="panel"><div className="panel-heading"><div><span>Progress changes</span><strong>This week</strong></div></div><div className="activity-list">{tasks.slice(0,5).map((t,i)=><div key={t.id}><span className="activity-icon" style={{background:statusColors[t.status]}}>{i%2?'↗':'✓'}</span><div><strong>{t.title}</strong><small>{i%2?`Progress changed to ${t.progress}%`:`${t.status} · ${t.owner}`}</small></div><time>{['Today 14:42','Today 11:18','Tue 16:02','Tue 10:31','Mon 17:45'][i]}</time></div>)}</div></article><article className="panel week-summary"><div className="panel-heading"><div><span>Weekly summary</span><strong>Planned vs done</strong></div></div><div className="donut" style={{'--value':'68%'} as React.CSSProperties}><div><strong>68%</strong><span>complete</span></div></div><div className="summary-lines"><span><i style={{background:'#111'}}/>24.5h completed</span><span><i style={{background:'#EFB0F6'}}/>8.75h remaining</span><span><i style={{background:'#FDB1AF'}}/>3 carryover events</span></div></article></section></>;
}

function ExportsView({tasks,onMessage}:{tasks:PlannerTask[];onMessage:(message:string)=>void}) {
  const cards:[string,string,string[], 'Daily'|'Weekly'|'Plan'][]=[['Daily tasks','Selected day',['Daily Summary','Tasks','Activity'],'Daily'],['Weekly review','Selected week',['Weekly Summary','Daily Breakdown','Carryover'],'Weekly'],['Full plan','Selected plan',['Plan Overview','Task Register','Dependencies'],'Plan']];
  async function run(kind:'Daily'|'Weekly'|'Plan'){onMessage('Preparing Excel workbook…');await exportWorkbook(kind,tasks);onMessage(`${kind} workbook downloaded`)}
  function backup(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),tasks},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Capacity_Backup_2026-09-09.json';a.click();URL.revokeObjectURL(url);onMessage('Backup downloaded')}
  return <section className="export-grid">{cards.map(([title,subtitle,sheets,kind])=><article className="export-card" key={title}><span className="export-icon"><FileSpreadsheet/></span><h3>{title}</h3><p>{subtitle}</p><div>{sheets.map(s=><span key={s}><Check/>{s}</span>)}</div><Button disabled={!tasks.length} onClick={()=>run(kind)}><Download/> Export XLSX</Button></article>)}<article className="export-card backup-card"><span className="export-icon"><LockKeyhole/></span><h3>Backup local data</h3><p>Portable JSON · all plans, tasks, settings, and history</p><div><span><Check/>Versioned backup</span><span><Check/>Stays on device</span><span><Check/>Ready to restore</span></div><Button variant="outline" disabled={!tasks.length} onClick={backup}><Download/> Download backup</Button></article></section>;
}

function SettingsView({tasks,onRestore,onMessage}:{tasks:PlannerTask[];onRestore:(tasks:PlannerTask[])=>void;onMessage:(message:string)=>void}) {
  async function restore(file:File){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.tasks))throw new Error();onRestore(data.tasks);onMessage('Backup restored')}catch{onMessage('This backup file could not be read')}}
  return <section className="settings-layout"><nav className="settings-nav"><button className="active">Work schedule</button><button>Owners</button><button>Holidays & time off</button><button>Statuses & colors</button><button>Exports</button><button>Data</button></nav><div className="settings-content"><article className="panel settings-section"><h3>Work schedule</h3><p>Configure these values before using automatic allocation and utilization.</p><div className="settings-form"><label>Working hours per day<Input type="number" placeholder="Hours"/></label><label>Week starts<NativeSelect defaultValue=""><NativeSelectOption value="" disabled>Select a day</NativeSelectOption><NativeSelectOption>Monday</NativeSelectOption><NativeSelectOption>Sunday</NativeSelectOption></NativeSelect></label><label>Timezone<Input placeholder="Select a timezone"/></label></div><div className="weekday-row">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><button key={d}>{d}</button>)}</div></article><article className="panel settings-section"><h3>Status colors</h3><p>Labels stay visible so color is never the only signal.</p><div className="status-settings">{Object.entries(statusColors).map(([status,color])=><div key={status}><i style={{background:color}}/><span>{status}</span><code>{color}</code><Button variant="ghost" size="sm">Edit</Button></div>)}</div></article><article className="panel settings-section"><h3>Data on this device</h3><p>{tasks.length} tasks are stored in IndexedDB. Restore validates the selected backup before replacing local data.</p><label className="restore-button"><Upload/> Restore backup<input type="file" accept="application/json" onChange={e=>e.target.files?.[0]&&restore(e.target.files[0])}/></label></article></div></section>;
}

function Dashboard({email,onSignOut}:{email:string;onSignOut:()=>void}) {
  const [active,setActive]=useState('Home'); const [tasks,setTasks]=useState<PlannerTask[]>(initialTasks); const [loaded,setLoaded]=useState(false); const [drawerOpen,setDrawerOpen]=useState(false); const [selected,setSelected]=useState<PlannerTask|null>(null); const [message,setMessage]=useState('');
  const displayName=email.split('@')[0].replace(/^./,letter=>letter.toUpperCase());
  useEffect(()=>{void loadTasks().then(data=>{setTasks(data);setLoaded(true)}).catch(()=>setLoaded(true))},[]); useEffect(()=>{if(loaded)void saveTasks(tasks)},[tasks,loaded]); useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),2600);return()=>clearTimeout(timer)},[message]);
  const upsert=useCallback((task:PlannerTask)=>{setTasks(current=>{const exists=current.some(t=>t.id===task.id);return exists?current.map(t=>t.id===task.id?task:t):[task,...current]});setMessage('Task saved to this device')},[]);
  const openTask=(task:PlannerTask|null)=>{setSelected(task);setDrawerOpen(true)};
  useEffect(()=>{
    const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options?:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();
    const tool={name:'create_task',title:'Create task',description:'Create a task in the local Capacity planner and show it in the task register.',inputSchema:{type:'object',properties:{title:{type:'string'},owner:{type:'string'},estimateHours:{type:'number'},dueDate:{type:'string'}},required:['title'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input:unknown){const value=input as {title?:unknown;owner?:unknown;estimateHours?:unknown;dueDate?:unknown};if(typeof value.title!=='string'||!value.title.trim())throw new Error('title is required');const estimate=typeof value.estimateHours==='number'?value.estimateHours:0;const dueDate=typeof value.dueDate==='string'?value.dueDate:'';const task:PlannerTask={id:`TCP-${Date.now().toString().slice(-4)}`,title:value.title.trim(),plan:'',owner:typeof value.owner==='string'?value.owner:'',status:'Starting',priority:'Medium',estimate,progress:0,startDate:'',dueDate,plannedDate:dueDate,plannedHours:estimate};upsert(task);setActive('Tasks');return{id:task.id,status:'created',title:task.title}}};
    try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}return()=>lifecycle.abort();
  },[upsert]);
  const content=(()=>{
    if(active==='Home')return <HomeView tasks={tasks} onOpen={openTask} onCreate={()=>openTask(null)}/>;
    if(active==='My Day')return <MyDayView tasks={tasks} onChange={upsert} onOpen={openTask} onCloseDay={()=>{setTasks(closeDay(tasks,'2026-09-09'));setMessage('Incomplete work moved to Thursday')}}/>;
    if(active==='Tasks')return <TasksView tasks={tasks} onOpen={openTask}/>;
    if(active==='Plans')return <PlansView tasks={tasks}/>;
    if(active==='Gantt')return <GanttView tasks={tasks} onOpen={openTask}/>;
    if(active==='Workload')return <WorkloadView tasks={tasks}/>;
    if(active==='Calendar')return <CalendarView tasks={tasks}/>;
    if(active==='History')return <HistoryView tasks={tasks}/>;
    if(active==='Exports')return <ExportsView tasks={tasks} onMessage={setMessage}/>;
    return <SettingsView tasks={tasks} onRestore={setTasks} onMessage={setMessage}/>;
  })();
  const heading=active==='Home'?{...viewCopy.Home,title:`Good morning, ${displayName}`} : viewCopy[active];
  return <SidebarProvider defaultOpen><Sidebar collapsible="icon" className="planner-sidebar"><SidebarHeader className="sidebar-brand"><div className="brand-mark"><span/></div><div className="brand-name">Capacity</div></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{navItems.map(item=><SidebarMenuItem key={item.label}><SidebarMenuButton tooltip={item.label} isActive={active===item.label} onClick={()=>setActive(item.label)}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Sign out" onClick={onSignOut}><LogOut/><span>Sign out</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu><div className="sidebar-profile"><span className="avatar">{displayName.slice(0,2).toUpperCase()}</span><div><strong>{displayName}</strong><small>Local workspace</small></div></div></SidebarFooter></Sidebar>
    <SidebarInset className="app-canvas"><header className="topbar"><div className="topbar-left"><SidebarTrigger/><span className="crumb">Workspace</span><span className="crumb-divider">/</span><strong>{active}</strong></div><div className="topbar-actions"><button className="search-button" onClick={()=>setActive('Tasks')}><Search size={16}/><span>Search anything</span><kbd>⌘ K</kbd></button><Button variant="ghost" size="icon" aria-label="Notifications"><Bell/></Button><Button className="new-task" onClick={()=>openTask(null)}><Plus/> New task</Button></div></header><div className="workspace"><div className="page-heading"><div><p className="eyebrow">{heading.eyebrow}</p><h1>{heading.title}</h1><p>{heading.subtitle}</p></div>{['Home','My Day','Workload','History'].includes(active)&&<Button variant="outline">This week <ChevronDown/></Button>}</div><div key={active} className="view-stage">{content}</div></div>{message&&<output className="toast-message" aria-live="polite"><Check/> {message}</output>}<TaskDrawer open={drawerOpen} task={selected} onOpenChange={setDrawerOpen} onSave={upsert}/></SidebarInset>
  </SidebarProvider>;
}

export default function App(){const [signedInEmail,setSignedInEmail]=useState<string|null|undefined>(undefined);useEffect(()=>{localStorage.removeItem('tcp-session');setSignedInEmail(localStorage.getItem('tcp-session-email'))},[]);if(signedInEmail===undefined)return <main className="boot-screen"><span className="brand-mark"><span/></span></main>;if(!signedInEmail)return <Login onSuccess={setSignedInEmail}/>;return <Dashboard email={signedInEmail} onSignOut={()=>{localStorage.removeItem('tcp-session-email');setSignedInEmail(null)}}/>}
