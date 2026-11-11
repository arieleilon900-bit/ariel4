// One customer message in, one WhatsApp reply out. Runs the Claude tool loop.

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './prompt.js';
import { TOOLS, runTool } from './tools.js';
import { israelToday } from './logic.js';

const MODEL = 'claude-opus-5-5';
const MAX_STEPS = 8;
const FALLBACK_REPLY = 'תודה על הפנייה! אני בודק ונחזור אליך ממש בקרוב 🙏';

let cachedPrompt = null;

export async function reply(ctx, userText) {
  const client = ctx.client || new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY });
  cachedPrompt = cachedPrompt || buildSystemPrompt(ctx.business, ctx.apartments);

  // Stored history is text only, so earlier turns never replay thinking blocks.
  // Follow-ups can leave two assistant turns in a row; merge same-role neighbours.
  const history = [];
  for (const m of ctx.conv.messages) {
    const prev = history[history.length - 1];
    if (prev && prev.role === m.role) prev.content += '\n\n' + m.text;
    else history.push({ role: m.role, content: m.text });
  }
  const today = israelToday();
  const messages = [
    ...history,
    { role: 'user', content: `[תאריך היום: ${today}${ctx.name ? `, שם בוואטסאפ: ${ctx.name}` : ''}]\n${userText}` },
  ];

  let text = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: cachedPrompt,
      tools: TOOLS,
      messages,
    });

    if (res.stop_reason === 'refusal') {
      console.warn('refusal', res.stop_details);
      text = FALLBACK_REPLY;
      break;
    }

    const blockText = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const calls = res.content.filter(b => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use' || !calls.length) { text = blockText; break; }

    const results = await Promise.all(calls.map(async c => ({
      type: 'tool_result',
      tool_use_id: c.id,
      content: JSON.stringify(await runTool(c.name, c.input, ctx)),
    })));
    messages.push({ role: 'user', content: results });
  }

  text = text || FALLBACK_REPLY;
  ctx.conv.messages.push({ role: 'user', text: userText }, { role: 'assistant', text });
  return text;
}
