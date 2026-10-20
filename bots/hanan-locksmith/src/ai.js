// השיחה עם הלקוח: Claude מקבל את ההיסטוריה ומחזיר תשובה + מה נאסף עד עכשיו (JSON מובנה).
import Anthropic from '@anthropic-ai/sdk';
import { SCHEMA, buildSystemParts, buildSystemPrompt, fallbackResult, normalize } from './prompt.js';

export { buildSystemPrompt };
export const MODEL = 'claude-opus-5-5';

// history: [{role:'user'|'assistant', text}] כבר כולל את ההודעה האחרונה של הלקוח
// image: {base64, mime} של תמונה שהגיעה בהודעה האחרונה (אופציונלי)
// הזמן שמותר לשיחה עם ה-AI: Cloudflare נותנים לעיבוד ברקע 30 שניות בסך הכל
const AI_TIMEOUT_MS = 18000;

// זיכרון זמני (prompt caching): ההוראות הקבועות נשמרות אצל Anthropic לשעה, וכל הודעה אחר כך
// משלמת עליהן בערך 5% מהמחיר. לשעה ולא ל-5 דקות, כי לקוח יכול לחזור עם תמונה אחרי רבע שעה
function systemBlocks({ stable, live }) {
  const blocks = [{ type: 'text', text: stable, cache_control: { type: 'ephemeral', ttl: '1h' } }];
  if (live) blocks.push({ type: 'text', text: live });
  return blocks;
}

// מחיר לפי מיליון טוקנים בדולרים: רגיל, כתיבה לזיכרון לשעה (פי 2), קריאה מהזיכרון, תשובה
const PRICES = {
  opus: { input: 4, write1h: 8, read: 0.2, output: 20 },
  sonnet: { input: 2, write1h: 4, read: 0.2, output: 10 },
  haiku: { input: 0.1, write1h: 0.2, read: 0.01, output: 0.5 },
};
const priceOf = (model = MODEL) => PRICES[Object.keys(PRICES).find((k) => String(model).includes(k)) || 'opus'];

export function usageOf(u = {}, model = MODEL) {
  const PRICE = priceOf(model);
  const input = u.input_tokens || 0;
  const write = u.cache_creation_input_tokens || 0;
  const read = u.cache_read_input_tokens || 0;
  const output = u.output_tokens || 0;
  const usd = (input * PRICE.input + write * PRICE.write1h + read * PRICE.read + output * PRICE.output) / 1e6;
  return { input, write, read, output, usd };
}

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
    const model = env.CLAUDE_MODEL || MODEL;
    // מודל גיבוי בצד של Anthropic קיים רק ל-Opus (ל-Haiku אין)
    const fallback = model.includes('opus') ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      ...fallback,
      system: systemBlocks(buildSystemParts({ now, returningCustomer, profileName, knowledge, afterHandoff })),
      messages,
      // שיחת קבלת פנייה קצרה: חשיבה קלה מספיקה, ועונה מהר יותר
      output_config: { effort: env.CLAUDE_EFFORT || 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
    if (response.stop_reason === 'refusal') return fallbackResult('refusal');
    if (response.stop_reason === 'max_tokens') return fallbackResult('max_tokens');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const result = normalize(JSON.parse(text));
    const usage = usageOf(response.usage, model);
    await ensureHebrew(client, model, result, usage);
    return { ...result, usage };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error('Claude rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}: ${err.message}`);
    else console.error('Claude turn failed', err);
    return fallbackResult(err instanceof Anthropic.APIError ? `error ${err.status ?? ''}`.trim() : 'error');
  }
}


// חנן קורא עברית: מה שנכתב בשבילו (תקלה, סיכום, שאלה, סיבת דחיפות) חייב להיות בעברית,
// גם אם הלקוח כתב בשפה אחרת וה-AI שכח לתרגם. בודקים בקוד, ואם צריך מתרגמים בקריאה קצרה נוספת
const OWNER_FIELDS = ['issue', 'summary_for_owner', 'question_for_owner', 'urgent_reason'];
export const needsHebrew = (t) => /[A-Za-z\u0400-\u04FF\u0600-\u06FF]{3}/.test(t || '') && !/[\u0590-\u05FF]/.test(t || '');
const TRANSLATE_SCHEMA = { type: 'object', additionalProperties: false, required: OWNER_FIELDS, properties: Object.fromEntries(OWNER_FIELDS.map((k) => [k, { type: 'string' }])) };

async function ensureHebrew(client, model, result, usage) {
  const todo = OWNER_FIELDS.filter((k) => needsHebrew(result[k]));
  if (!todo.length) return;
  try {
    const src = Object.fromEntries(OWNER_FIELDS.map((k) => [k, todo.includes(k) ? result[k] : '']));
    const r = await client.messages.create({
      model, max_tokens: 2000,
      system: 'תרגם לעברית פשוטה כל שדה ב-JSON. שמות, כתובות ודגמי רכב נשארים כמו שהם. שדה ריק נשאר ריק.',
      messages: [{ role: 'user', content: JSON.stringify(src) }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TRANSLATE_SCHEMA } },
    }, { timeout: 8000 });
    const out = JSON.parse(r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    for (const k of todo) if (out[k] && !needsHebrew(out[k])) result[k] = String(out[k]);
    const extra = usageOf(r.usage, model);
    for (const k of Object.keys(extra)) usage[k] += extra[k];
  } catch (err) {
    console.error('owner fields translation failed', err);
  }
}
