// Sorts a brain-dump into Personal / Leadly / School + priority.
// Calls Anthropic server-side so your API key never reaches the browser.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { items } = JSON.parse(event.body || '{}');
    if (!Array.isArray(items) || items.length === 0) {
      return json(400, { error: 'No items to sort' });
    }

    const list = items.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const prompt =
      "You are filing a person's brain-dump of to-do items into exactly one category each.\n" +
      "Categories:\n" +
      "- Personal: home, health, errands, family, friends, money, appointments, life admin.\n" +
      "- Leadly: tasks for their startup/business called Leadly — product, customers, sales, marketing, ops, hiring, meetings.\n" +
      "- School: studying, classes, assignments, exams, readings, tuition.\n" +
      "Also assign a priority: high, medium, or low.\n" +
      "Return ONLY a JSON array, no markdown, no commentary, one object per item IN THE SAME ORDER, like:\n" +
      '[{"category":"Leadly","priority":"high"}]\n\n' +
      "Items:\n" + list;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await res.json();
    if (data.error) return json(502, { error: data.error.message || 'Anthropic error' });

    let txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    txt = txt.replace(/```json/g, '').replace(/```/g, '').trim();
    const results = JSON.parse(txt);

    return json(200, { results });
  } catch (e) {
    return json(500, { error: String((e && e.message) || e) });
  }
};

function json(code, obj) {
  return { statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
