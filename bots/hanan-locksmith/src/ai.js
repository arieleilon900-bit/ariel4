// השיחה עם הלקוח: Claude מקבל את ההיסטוריה ומחזיר תשובה + מה נאסף עד עכשיו (JSON מובנה).
import Anthropic from '@anthropic-ai/sdk';
import { SCHEMA, buildSystemPrompt, fallbackResult, normalize } from './prompt.js';

export { buildSystemPrompt };
export const MODEL = 'claude-opus-5-5';

// history: [{role:'user'|'assistant', text}] כבר כולל את ההודעה האחרונה של הלקוח
// image: {base64, mime} של תמונה שהגיעה בהודעה האחרונה (אופציונלי)
// הזמן שמותר לשיחה עם ה-AI: Cloudflare נותנים לעיבוד ברקע 30 שניות בסך הכל
const AI_TIMEOUT_MS = 10000;

export async function runTurn(env, { history, image = null, now = new Date(), returningCustomer = null, profileName = '', knowledge = [], afterHandoff = false }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const messages = [];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role && typeof last.content === 'string') last.content += `\n${m.text}`;
    else messages.push({ role, content: m.text });
  }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(פנייה חדשה)' });
  if (image && messages[messages.length - 1].role === 'user') {
    const lastMsg = messages[messages.length - 1];
    lastMsg.content = [
      { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
      { type: 'text', text: String(lastMsg.content) },
    ];
  }

  try {
    const response = await client.beta.messages.create({
      model: env.CLAUDE_MODEL || MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: buildSystemPrompt({ now, returningCustomer, profileName, knowledge, afterHandoff }),
      messages,
      // שיחת קבלת פנייה קצרה: חשיבה קלה מספיקה, ועונה מהר יותר
      output_config: { effort: env.CLAUDE_EFFORT || 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
    if (response.stop_reason === 'refusal') return fallbackResult('refusal');
    if (response.stop_reason === 'max_tokens') return fallbackResult('max_tokens');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return normalize(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error('Claude rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}: ${err.message}`);
    else console.error('Claude turn failed', err);
    return fallbackResult(err instanceof Anthropic.APIError ? `error ${err.status ?? ''}`.trim() : 'error');
  }
}

