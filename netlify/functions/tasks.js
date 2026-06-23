// Google Sheets database via the Sheets REST API.
// Tabs: Tasks (active), Meta (settings), Log (completed = memory).
// GET  -> { pinned, context, glossary, tasks, log }
// POST -> overwrites all three from the body
// ?debug=1 -> env + connection + write test
const VERSION = 'v10';

const { JWT } = require('google-auth-library');
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const TASK_HEADER = ['id', 'text', 'category', 'priority', 'done', 'dueDate', 'createdAt'];
const LOG_HEADER = ['text', 'category', 'dueDate', 'completedAt'];

async function getToken() {
  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await jwt.getAccessToken();
  return token;
}
async function api(token, method, path, body) {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + path;
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Sheets ' + r.status + ': ' + (data.error && data.error.message || 'unknown'));
  return data;
}
async function ensureTabs(token, titles) {
  const meta = await api(token, 'GET', '?fields=sheets.properties.title');
  const have = (meta.sheets || []).map(s => s.properties.title);
  const missing = titles.filter(t => !have.includes(t));
  if (missing.length) {
    try { await api(token, 'POST', ':batchUpdate', { requests: missing.map(title => ({ addSheet: { properties: { title } } })) }); } catch (e) {}
  }
}
async function readTab(token, tab) {
  const d = await api(token, 'GET', '/values/' + encodeURIComponent(tab + '!A1:Z100000'));
  return d.values || [];
}
async function writeTab(token, tab, values) {
  await api(token, 'POST', '/values/' + encodeURIComponent(tab + '!A1:Z100000') + ':clear', {});
  await api(token, 'PUT', '/values/' + encodeURIComponent(tab + '!A1') + '?valueInputOption=RAW', { values });
}
function rowsToObjs(rows, fallbackHeader) {
  const header = rows[0] || fallbackHeader;
  return rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { o[h] = r[i]; }); return o; });
}

exports.handler = async (event) => {
  if (event.queryStringParameters && event.queryStringParameters.debug === '1') {
    const pk = process.env.GOOGLE_PRIVATE_KEY || '';
    const info = {
      version: VERSION,
      sheetId_exactValue: JSON.stringify(SHEET_ID), sheetId_length: SHEET_ID.length,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
      privateKey_present: !!pk, privateKey_startsWith: pk.slice(0, 27),
      anthropicKey_present: !!process.env.ANTHROPIC_API_KEY
    };
    try {
      const token = await getToken();
      const meta = await api(token, 'GET', '?fields=properties.title,sheets.properties.title');
      info.connection = 'OK';
      info.spreadsheetTitle = meta.properties && meta.properties.title;
      info.existingTabs = (meta.sheets || []).map(s => s.properties.title);
      try { await ensureTabs(token, ['_diag']); await writeTab(token, '_diag', [['ts', 'note'], [new Date().toISOString(), 'write-test']]); info.writeTest = 'OK'; }
      catch (we) { info.writeTest = 'FAILED'; info.writeError = String((we && we.message) || we); }
    } catch (e) { info.connection = 'FAILED'; info.connectionError = String((e && e.message) || e); }
    return json(200, info);
  }

  try {
    const token = await getToken();
    await ensureTabs(token, ['Tasks', 'Meta', 'Log']);

    if (event.httpMethod === 'GET') {
      const tasks = rowsToObjs(await readTab(token, 'Tasks'), TASK_HEADER).filter(o => o.id).map(o => ({
        id: o.id, text: o.text || '', category: o.category || 'Unsorted', priority: o.priority || 'medium',
        done: String(o.done).toLowerCase() === 'true', dueDate: o.dueDate || '', createdAt: o.createdAt || ''
      }));
      const metaRows = await readTab(token, 'Meta');
      const meta = {}; metaRows.slice(1).forEach(r => { if (r[0]) meta[r[0]] = r[1]; });
      let glossary = []; try { glossary = JSON.parse(meta.glossary || '[]'); } catch (e) {}
      const log = rowsToObjs(await readTab(token, 'Log'), LOG_HEADER).filter(o => o.text).map(o => ({
        text: o.text || '', category: o.category || '', dueDate: o.dueDate || '', completedAt: o.completedAt || ''
      }));
      return json(200, { pinned: meta.pinned || '', context: meta.context || '', glossary, tasks, log });
    }

    if (event.httpMethod === 'POST') {
      const { pinned = '', context = '', glossary = [], tasks = [], log = [] } = JSON.parse(event.body || '{}');
      await writeTab(token, 'Tasks', [TASK_HEADER].concat(tasks.map(t => [
        String(t.id), t.text || '', t.category || 'Unsorted', t.priority || 'medium', t.done ? 'true' : 'false', t.dueDate || '', t.createdAt || new Date().toISOString()
      ])));
      await writeTab(token, 'Meta', [['key', 'value'], ['pinned', pinned], ['context', context], ['glossary', JSON.stringify(glossary || [])]]);
      await writeTab(token, 'Log', [LOG_HEADER].concat((log || []).map(e => [e.text || '', e.category || '', e.dueDate || '', e.completedAt || ''])));
      return json(200, { ok: true, version: VERSION });
    }
    return { statusCode: 405, body: 'Method not allowed' };
  } catch (e) {
    return json(500, { error: String((e && e.message) || e) });
  }
};
function json(code, obj) { return { statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) }; }
