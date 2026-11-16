// /api/chat: השרת של ההדגמות. מקבל את השיחה מהדף, שואל את Claude, ומחזיר תשובה של "בעל העסק".
// המפתח (ANTHROPIC_API_KEY) נשמר רק כאן בשרת. בלי מפתח, או בכל תקלה, הדף ממשיך עם המוח המובנה שלו.
import Anthropic from '@anthropic-ai/sdk';
import { BOTS, QUOTE_TOOL, isVacation, israelToday, promptFor, quote, schemaFor } from '../../lib/bots.js';

const MODEL = 'claude-sonnet-5-5';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// הגנה פשוטה מפני שימוש לרעה: מגבלת קצב לכל כתובת (בתוך אותו שרת)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = hits.get(ip) || [];
  const recent = w.filter((t) => now - t < 10 * 60e3); recent.push(now); hits.set(ip, recent);
  return recent.length > 40;
}

export async function onRequestGet({ env }) {
  return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY });
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 503);
  const origin = request.headers.get('origin') || '';
  if (origin && !/^https:\/\/([a-z0-9-]+\.)?onerishon-(david|demo)\.pages\.dev$/.test(origin)) return json({ error: 'origin' }, 403);
  if (limited(request.headers.get('cf-connecting-ip') || 'x')) return json({ error: 'rate_limited' }, 429);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const bot = BOTS.includes(body.bot) ? body.bot : null;
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  if (!bot || !msgs.length || msgs.length > 60) return json({ error: 'bad_request' }, 400);
  const messages = [];
  for (const m of msgs.slice(-40)) {
    const role = m.role === 'assistant' ? 'assistant' : 'user', content = String(m.content || '').slice(0, 800);
    if (!content) continue;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += '\n' + content; else messages.push({ role, content });
  }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(פנייה חדשה)' });
  if (messages[messages.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400);

  const today = israelToday();
  const memory = body.memory && typeof body.memory === 'object' ? { name: String(body.memory.name || '').slice(0, 30), apt: String(body.memory.apt || '').slice(0, 40) } : null;
  const sent = Array.isArray(body.sent) ? body.sent.map(String).filter((x) => /^[123]$/.test(x)) : [];
  const system = promptFor(bot, today, { memory, sent });
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 25000, maxRetries: 1 });
  const tools = isVacation(bot) ? [QUOTE_TOOL] : undefined;
  try {
    for (let round = 0; round < 5; round++) {
      const res = await client.beta.messages.create({
        model: env.CLAUDE_MODEL || MODEL, max_tokens: 4000, system, messages, ...(tools ? { tools } : {}),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schemaFor(bot) } },
      });
      if (res.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: res.content });
        const results = res.content.filter((b) => b.type === 'tool_use').map((b) => {
          let out; try { out = JSON.stringify(quote(bot, today, b.input || {})); } catch (e) { return { type: 'tool_result', tool_use_id: b.id, content: String(e.message || e), is_error: true }; }
          return { type: 'tool_result', tool_use_id: b.id, content: out };
        });
        messages.push({ role: 'user', content: results });
        continue;
      }
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return json({ error: res.stop_reason }, 502);
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const out = JSON.parse(text);
      if (!out.reply) return json({ error: 'empty' }, 502);
      if (!isVacation(bot)) out.route = '';
      return json(out);
    }
    return json({ error: 'too_many_rounds' }, 502);
  } catch (err) {
    console.error('demo chat failed', bot, err?.status || '', err?.message || err);
    return json({ error: 'ai_failed' }, 502);
  }
}
