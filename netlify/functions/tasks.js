// Google Sheets = your database.
// GET  -> { pinned, context, glossary, tasks }
// POST -> overwrites the sheet with { pinned, context, glossary, tasks }

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

async function getDoc() {
  const jwt = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, jwt);
  await doc.loadInfo();
  return doc;
}

async function getOrCreate(doc, title, headers) {
  let sheet = doc.sheetsByTitle[title];
  if (!sheet) sheet = await doc.addSheet({ title, headerValues: headers });
  return sheet;
}

exports.handler = async (event) => {
  // ---- Diagnostic mode: /.netlify/functions/tasks?debug=1 ----
  // Shows what the DEPLOYED function actually reads + tests the live connection.
  // Reveals no secrets (only the non-secret sheet ID, email, and key sanity).
  if (event.queryStringParameters && event.queryStringParameters.debug === '1') {
    const sheetId = process.env.GOOGLE_SHEET_ID || '';
    const pk = process.env.GOOGLE_PRIVATE_KEY || '';
    const info = {
      sheetId_exactValue: JSON.stringify(sheetId),          // quotes/spaces/newlines become visible here
      sheetId_length: sheetId.length,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
      privateKey_present: !!pk,
      privateKey_startsWith: pk.slice(0, 27),
      privateKey_hasEscapedNewlines: pk.includes('\\n'),
      privateKey_hasRealNewlines: pk.includes('\n'),
      anthropicKey_present: !!process.env.ANTHROPIC_API_KEY
    };
    try {
      const doc = await getDoc();
      info.connection = 'OK';
      info.spreadsheetTitle = doc.title;
      // Write test on an isolated _diag tab (does not touch your real data)
      try {
        const diag = await getOrCreate(doc, '_diag', ['ts', 'note']);
        await diag.clearRows();
        await diag.addRows([{ ts: new Date().toISOString(), note: 'write-test' }]);
        const rows = await diag.getRows();
        info.writeTest = 'OK';
        info.writeRowsNow = rows.length;
      } catch (we) {
        info.writeTest = 'FAILED';
        info.writeError = String((we && we.message) || we);
      }
    } catch (e) {
      info.connection = 'FAILED';
      info.connectionError = String((e && e.message) || e);
    }
    return json(200, info);
  }

  try {
    const doc = await getDoc();
    const tasksSheet = await getOrCreate(doc, 'Tasks', ['id', 'text', 'category', 'priority', 'done', 'dueDate', 'createdAt']);
    const metaSheet = await getOrCreate(doc, 'Meta', ['key', 'value']);

    if (event.httpMethod === 'GET') {
      const rows = await tasksSheet.getRows();
      const tasks = rows.map(r => ({
        id: r.get('id'),
        text: r.get('text'),
        category: r.get('category') || 'Unsorted',
        priority: r.get('priority') || 'medium',
        done: String(r.get('done')).toLowerCase() === 'true',
        dueDate: r.get('dueDate') || '',
        createdAt: r.get('createdAt') || ''
      }));
      const metaRows = await metaSheet.getRows();
      const meta = {};
      metaRows.forEach(r => { meta[r.get('key')] = r.get('value'); });
      let glossary = [];
      try { glossary = JSON.parse(meta.glossary || '[]'); } catch (e) { glossary = []; }
      return json(200, { pinned: meta.pinned || '', context: meta.context || '', glossary, tasks });
    }

    if (event.httpMethod === 'POST') {
      const { pinned = '', context = '', glossary = [], tasks = [] } = JSON.parse(event.body || '{}');

      await tasksSheet.clearRows();
      if (tasks.length) {
        await tasksSheet.addRows(tasks.map(t => ({
          id: String(t.id),
          text: t.text || '',
          category: t.category || 'Unsorted',
          priority: t.priority || 'medium',
          done: t.done ? 'true' : 'false',
          dueDate: t.dueDate || '',
          createdAt: t.createdAt || new Date().toISOString()
        })));
      }

      await metaSheet.clearRows();
      await metaSheet.addRows([
        { key: 'pinned', value: pinned },
        { key: 'context', value: context },
        { key: 'glossary', value: JSON.stringify(glossary || []) }
      ]);

      return json(200, { ok: true });
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (e) {
    return json(500, { error: String((e && e.message) || e) });
  }
};

function json(code, obj) {
  return { statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
