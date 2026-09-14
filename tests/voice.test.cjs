const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'voice.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exported = { exports: {} };
let sequence = 0;
const planner = {
  makeId: () => `TASK-${++sequence}`,
  todayIso: () => '2026-09-14',
  calculateEndTime: (start, hours) => {
    if (!start || hours === undefined) return undefined;
    const [h, m] = start.split(':').map(Number);
    const total = (h * 60 + m + Math.round(hours * 60)) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  },
};
new Function('require', 'module', 'exports', compiled)(
  (id) => {
    assert.equal(id, './planner');
    return planner;
  },
  exported,
  exported.exports,
);
const { applyVoiceActions, localVoiceCommand, voiceContext, voiceDeleteSummary, workspaceFingerprint } = exported.exports;

function task(id, title, parentId) {
  return {
    id, title, parentId, owners: [], status: 'Starting', priority: 'Medium',
    tags: [], dependencyIds: [], progress: 0, createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  };
}
function workspace(tasks = []) { return { tasks, plans: [], activity: [] }; }

test('creates a dated scheduled task without mutating the old workspace', () => {
  const before = workspace();
  const after = applyVoiceActions(before, [{ op: 'create', title: 'Review deck', start: '10:15', hours: 1.5 }]);
  assert.equal(before.tasks.length, 0);
  assert.equal(after.tasks[0].title, 'Review deck');
  assert.equal(after.tasks[0].plannedDate, '2026-09-14');
  assert.equal(after.tasks[0].endTime, '11:45');
  assert.equal(after.activity.length, 1);
});

test('updates only the chosen task and marks it completed', () => {
  const before = workspace([task('A', 'Send report'), task('B', 'Call vendor')]);
  const after = applyVoiceActions(before, [{ op: 'update', id: 'A', status: 'Completed' }]);
  assert.equal(after.tasks[0].status, 'Completed');
  assert.equal(after.tasks[0].progress, 100);
  assert.equal(after.tasks[1].status, 'Starting');
  assert.equal(before.tasks[0].status, 'Starting');
});

test('deletes a parent and all nested descendants only', () => {
  const before = workspace([task('A', 'Parent'), task('B', 'Child', 'A'), task('C', 'Grandchild', 'B'), task('D', 'Other')]);
  assert.deepEqual(voiceDeleteSummary(before, [{ op: 'delete', id: 'A' }]), ['Parent and 2 subtasks']);
  const after = applyVoiceActions(before, [{ op: 'delete', id: 'A' }]);
  assert.deepEqual(after.tasks.map((item) => item.id), ['D']);
});

test('rejects unknown targets, invalid dates and oversized command batches', () => {
  const current = workspace([task('A', 'Known task')]);
  assert.throws(() => applyVoiceActions(current, [{ op: 'delete', id: 'Z' }]), /not found/);
  assert.throws(() => applyVoiceActions(current, [{ op: 'create', title: 'Wrong date', date: '2026-02-30' }]), /date is invalid/);
  assert.throws(() => applyVoiceActions(current, Array.from({ length: 9 }, () => ({ op: 'create', title: 'Too many' }))), /at most eight/);
  assert.equal(current.tasks.length, 1);
});

test('sends only a short, relevant task context and detects stale workspaces', () => {
  const current = workspace([task('A', 'Review the budget'), task('B', 'Buy groceries')]);
  const context = voiceContext(current, 'mark budget done');
  assert.equal(context.tasks[0].id, 'A');
  const fingerprint = workspaceFingerprint(current);
  current.tasks[0].updatedAt = '2026-09-14T01:00:00Z';
  assert.notEqual(workspaceFingerprint(current), fingerprint);
});

test('uses zero-token local actions only for unambiguous commands', () => {
  const current = workspace([task('A', 'Send report')]);
  assert.deepEqual(localVoiceCommand(current, 'add task Buy milk'), [{ op: 'create', title: 'Buy milk', date: '2026-09-14' }]);
  assert.deepEqual(localVoiceCommand(current, 'complete task Send report'), [{ op: 'update', id: 'A', status: 'Completed' }]);
  assert.deepEqual(localVoiceCommand(current, 'delete task Send report'), [{ op: 'delete', id: 'A' }]);
  assert.equal(localVoiceCommand(current, 'add task Review deck tomorrow'), null);
  assert.equal(localVoiceCommand(current, 'कल budget टास्क बनाओ'), null);
});
