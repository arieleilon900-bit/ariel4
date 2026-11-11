// One customer message in, one WhatsApp reply out. Runs the Claude tool loop and
// records what every model call cost.

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import { TOOLS, runTool } from './tools.js';
import { israelToday } from './logic.js';
import { logUsage } from './store.js';

export const MODEL = 'claude-haiku-5-5';
// USD per million tokens, Claude Haiku 5.5, prompts up to 100K tokens
// (ours are ~10K). Cache reads 0.1x input, 5-minute cache writes 1.25x input.
const PRICE = { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 };
const MAX_STEPS = 8;
export const FALLBACK_REPLY = 'תודה על הפנייה! אני בודק ונחזור אליך ממש בקרוב 🙏';

export function costMicros(u) {
  // micro-dollars = tokens × (USD per million tokens)
  return Math.round(
    (u.input_tokens || 0) * PRICE.input +
    (u.output_tokens || 0) * PRICE.output +
    (u.cache_read_input_tokens || 0) * PRICE.cacheRead +
    (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite,
  );
}

let cachedPrompt = null;

// Returns { text, problem } — problem is set when the guest got the fallback reply.
export async function reply(ctx, userText, images = []) {
  const client = ctx.client || new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY });
  cachedPrompt = cachedPrompt || buildSystemPrompt(ctx.business, ctx.apartments);

  // Stored history is text only. Follow-ups can leave two assistant turns in a row,
  // so merge same-role neighbours.
  const history = [];
  for (const m of ctx.conv.messages) {
    const prev = history[history.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n\n' + m.text;
    else history.push({ role: m.role, content: m.text });
  }
  const messages = [
    ...history,
    { role: 'user', content: [
      ...images,
      { type: 'text', text: `[תאריך היום: ${israelToday()}${ctx.name ? `, שם בוואטסאפ: ${ctx.name}` : ''}]\n${userText}` },
    ] },
  ];

  let text = '';
  let problem = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: ctx.effort || 'medium' },
      cache_control: { type: 'ephemeral' },
      system: cachedPrompt,
      tools: TOOLS,
      messages,
    });
    if (res.usage) {
      await logUsage(ctx.env, {
        phone: ctx.phone, model: res.model || MODEL,
        input: res.usage.input_tokens || 0, output: res.usage.output_tokens || 0,
        cacheRead: res.usage.cache_read_input_tokens || 0, cacheWrite: res.usage.cache_creation_input_tokens || 0,
        costMicros: costMicros(res.usage),
      });
    }

    // Haiku has no server-side fallback: a declined request stays declined.
    if (res.stop_reason === 'refusal') { problem = `המודל סירב לענות (${res.stop_details?.category || 'ללא קטגוריה'})`; break; }
    if (res.stop_reason === 'max_tokens') { problem = 'התשובה נחתכה (max_tokens)'; break; }

    const blockText = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const calls = res.content.filter(b => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: res.content }); // thinking blocks go back unchanged

    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use' || !calls.length) {
      text = blockText;
      if (!text) problem = 'המודל החזיר תשובה ריקה';
      break;
    }

    const results = await Promise.all(calls.map(async c => {
      const out = await runTool(c.name, c.input, ctx);
      return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out?.error ? { is_error: true } : {}) };
    }));
    messages.push({ role: 'user', content: results });
    if (step === MAX_STEPS - 1) problem = 'הבוט נתקע בלולאת כלים';
  }

  text = text || FALLBACK_REPLY;
  ctx.conv.messages.push({ role: 'user', text: userText }, { role: 'assistant', text });
  return { text, problem };
}
