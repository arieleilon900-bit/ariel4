// Chatscope AI proxy (Cloudflare Worker).
// Keeps the Anthropic API key on the server so visitors don't need their own.
//
// Deploy:
//   1. npm create cloudflare@latest chatscope-ai   (choose "Hello World" Worker), replace src/index.js with this file
//   2. npx wrangler secret put ANTHROPIC_API_KEY
//   3. npx wrangler deploy
//   4. Put the Worker URL in AI_PROXY at the top of the AI section in index.html
//
// Optional: set ALLOWED_ORIGIN (e.g. https://your-site.com) as a Worker variable to block other sites.

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 3_000_000;   // bytes of chat the page may send
const MAX_TOKENS = 32000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'access-control-allow-origin': allowed === '*' ? '*' : allowed,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    if (allowed !== '*' && origin !== allowed) return new Response('Forbidden', { status: 403, headers: cors });

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: { message: 'הצ\'אט גדול מדי' } }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: { message: 'Bad JSON' } }, 400, cors); }

    // Only the page's own request shape goes through; the model and limits are fixed here.
    const upstream = {
      model: MODEL,
      max_tokens: Math.min(+body.max_tokens || MAX_TOKENS, MAX_TOKENS),
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: body.output_config,
      fallbacks: 'default',
      system: body.system,
      messages: body.messages,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(upstream),
    });
    // Stream the SSE response straight back to the page.
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'content-type': res.headers.get('content-type') || 'text/event-stream' },
    });
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });
}
