const CAPEXITY_SHEET_ID = '1R-LLLQOODXI-B1mDF8JubHD4RuWUCU7U0iJoCh_Z5uE';
const CAPEXITY_TAB = 'Capexity Workspaces';
const CAPEXITY_ACCESS_KEY = 'data1234';
const CAPEXITY_USERS = ['spandan@gmail.com', 'mandhya@gmail.com'];

function doGet() {
  return jsonResponse({ ok: true, service: 'Capexity Google Sheets storage' });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const request = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    authorize(request);
    const sheet = getWorkspaceSheet();
    if (request.action === 'list') return jsonResponse(listWorkspaces(sheet, request.email));
    if (request.action === 'create') return jsonResponse(createWorkspace(sheet, request.name));
    if (request.action === 'load') return jsonResponse(loadWorkspace(sheet, request.id));
    if (request.action === 'save') return jsonResponse(saveWorkspace(sheet, request));
    return jsonResponse({ error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ error: error && error.message ? error.message : 'Request failed' });
  } finally {
    lock.releaseLock();
  }
}

function authorize(request) {
  const email = String(request.email || '').trim().toLowerCase();
  if (request.accessKey !== CAPEXITY_ACCESS_KEY) throw new Error('Access denied');
  if (CAPEXITY_USERS.indexOf(email) === -1) throw new Error('This email cannot access Capexity');
}

function getWorkspaceSheet() {
  const book = SpreadsheetApp.openById(CAPEXITY_SHEET_ID);
  let sheet = book.getSheetByName(CAPEXITY_TAB);
  if (!sheet) {
    sheet = book.insertSheet(CAPEXITY_TAB);
    sheet.getRange(1, 1, 1, 6).setValues([['Workspace ID', 'Name', 'Description', 'Updated At', 'Version', 'Workspace JSON']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#171717').setFontColor('#ffffff');
    sheet.setColumnWidths(1, 1, 190);
    sheet.setColumnWidths(2, 1, 220);
    sheet.setColumnWidths(3, 1, 320);
    sheet.setColumnWidths(4, 2, 150);
    sheet.setColumnWidth(6, 440);
  }
  return sheet;
}

function rows(sheet) {
  const lastRow = sheet.getLastRow();
  return lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 6).getValues();
}

function summary(row) {
  return {
    id: String(row[0]),
    name: String(row[1]),
    description: String(row[2] || ''),
    updatedAt: row[3] instanceof Date ? row[3].toISOString() : String(row[3]),
    version: Number(row[4]) || 1,
    role: 'editor',
  };
}

function listWorkspaces(sheet, email) {
  return { workspaces: rows(sheet).map(summary).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); }), email: email };
}

function createWorkspace(sheet, name) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Workspace name is required');
  const id = 'WORKSPACE-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const now = new Date();
  const workspace = { tasks: [], plans: [], activity: [] };
  const row = [id, cleanName, '', now, 1, JSON.stringify(workspace)];
  sheet.appendRow(row);
  return { workspace: summary(row) };
}

function findWorkspace(sheet, id) {
  const values = rows(sheet);
  const index = values.findIndex(function (row) { return String(row[0]) === String(id); });
  if (index === -1) throw new Error('Workspace not found');
  return { row: values[index], sheetRow: index + 2 };
}

function loadWorkspace(sheet, id) {
  const found = findWorkspace(sheet, id);
  let workspace;
  try { workspace = JSON.parse(String(found.row[5] || '{}')); } catch (error) { throw new Error('Workspace data is invalid'); }
  return { workspace: workspace, meta: summary(found.row) };
}

function saveWorkspace(sheet, request) {
  const found = findWorkspace(sheet, request.id);
  const currentVersion = Number(found.row[4]) || 1;
  if (currentVersion !== Number(request.expectedVersion)) {
    const latest = loadWorkspace(sheet, request.id);
    return { error: 'Workspace changed', conflict: true, workspace: latest.workspace, meta: latest.meta };
  }
  if (!request.workspace || !Array.isArray(request.workspace.tasks) || !Array.isArray(request.workspace.plans)) throw new Error('Workspace data is invalid');
  const updatedAt = new Date();
  const version = currentVersion + 1;
  sheet.getRange(found.sheetRow, 4, 1, 3).setValues([[updatedAt, version, JSON.stringify(request.workspace)]]);
  return { saved: true, version: version, updatedAt: updatedAt.toISOString() };
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
