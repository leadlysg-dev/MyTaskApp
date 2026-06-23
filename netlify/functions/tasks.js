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
