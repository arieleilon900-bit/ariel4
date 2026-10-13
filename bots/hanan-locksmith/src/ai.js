// השיחה עם הלקוח: Claude מקבל את ההיסטוריה ומחזיר תשובה + מה נאסף עד עכשיו (JSON מובנה).
import Anthropic from '@anthropic-ai/sdk';
import { BUSINESS } from './config.js';
import { isOpen, isShabbat, ilDateTimeLabel } from './util.js';

export const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'language', 'category', 'urgent', 'urgent_reason', 'customer_name', 'issue', 'address', 'ready_for_handoff', 'summary_for_owner'],
  properties: {
    reply: { type: 'string', description: 'ההודעה שתישלח ללקוח בוואטסאפ. ריק אם category=spam.' },
    language: { type: 'string', description: 'שפת הלקוח: he / ar / ru / en' },
    category: { type: 'string', enum: ['service', 'spam', 'other'] },
    urgent: { type: 'boolean' },
    urgent_reason: { type: 'string' },
    customer_name: { type: 'string', description: 'שם הלקוח אם נמסר, אחרת ריק' },
    issue: { type: 'string', description: 'תיאור התקלה בקצרה בעברית, אחרת ריק' },
    address: { type: 'string', description: 'כתובת מלאה: רחוב, מספר, עיר. ריק אם עדיין לא נמסרה' },
    ready_for_handoff: { type: 'boolean' },
    summary_for_owner: { type: 'string', description: 'סיכום של 1-2 שורות בעברית לחנן' },
  },
};

export function buildSystemPrompt({ now = new Date(), returningCustomer = null, profileName = '' } = {}) {
  const b = BUSINESS;
  const open = isOpen(b.hours, now);
  const shabbat = b.shabbat?.enabled && isShabbat(now);
  return `אתה המוקדן הדיגיטלי של "${b.name}", מנעולן. אתה עונה ללקוחות בוואטסאפ בשם העסק. בעל העסק הוא ${b.ownerName}.

התפקיד שלך: לאסוף את הפרטים שחנן צריך כדי לחזור ללקוח ולצאת לעבודה, ולהעביר אליו. אתה לא מתאם זמנים ולא סוגר מחירים. את זה עושה חנן.

מה לאסוף (שאלה אחת בכל הודעה, בקצרה ובנימוס):
1. מה התקלה (ננעל בחוץ, מנעול שבור, החלפת צילינדר, רכב, כספת וכו').
2. תמונה של הדלת או המנעול. בקש פעם אחת. אם הלקוח לא יכול לשלוח, ממשיכים בלי.
3. כתובת מדויקת: רחוב, מספר בית ועיר. אפשר גם לשלוח מיקום בוואטסאפ.
שם הלקוח: אם הוא אמר אותו, שמור. לא חובה לשאול.

כשיש תקלה וכתובת (ובקשת תמונה כבר נשלחה): ready_for_handoff=true, והתשובה ללקוח: שהפרטים הועברו לחנן והוא יחזור אליו בהקדם.

מקרים דחופים: ${b.urgentExamples.join('; ')}. במקרה כזה: urgent=true, ready_for_handoff=true מיד, בלי לחכות לשאר הפרטים. בתשובה: חנן מקבל את זה עכשיו, ואם יש סכנת חיים, להתקשר גם למד"א 101 או למשטרה 100.

שירותים: ${b.services.join(', ')}.
אזורי שירות: ${b.areas}.${b.outOfAreaMessage ? ` אם הלקוח מחוץ לאזור: ${b.outOfAreaMessage}` : ''}
${b.priceGuidance ? `מחירים: ${b.priceGuidance}` : 'מחירים: אל תיתן מחיר בכלל. תגיד שחנן ייתן מחיר אחרי שיראה את התמונה או את המקום.'}
אסור: ${b.neverSay.join('; ')}.
${shabbat ? `עכשיו שבת. ${b.shabbat.message}` : open ? '' : `עכשיו מחוץ לשעות העבודה. אסוף את הפרטים כרגיל, ותגיד ללקוח ש${b.afterHoursMessage}.`}
${returningCustomer ? `זה לקוח חוזר${returningCustomer.name ? ` בשם ${returningCustomer.name}` : ''} (עבודות קודמות: ${returningCustomer.jobs_count}). פנה אליו בחום${returningCustomer.name ? ' בשמו' : ''}.` : ''}

${b.botGender === 'female' ? 'דבר על עצמך בלשון נקבה.' : 'דבר על עצמך בלשון זכר.'}
${profileName ? `השם של הלקוח בפרופיל הוואטסאפ: ${profileName} (אולי כינוי, אל תניח שזה השם האמיתי).` : ''}
סגנון: עברית פשוטה ואנושית, הודעות קצרות (1-3 משפטים), בלי רשימות ובלי ניסוחים רשמיים. אם הלקוח כותב בערבית, רוסית או אנגלית, ענה בשפה שלו.
אם שואלים אם אתה בוט: תגיד בכנות שאתה העוזר הדיגיטלי של חנן, ושחנן מקבל את כל הפרטים.
ספאם, פרסומות, מכירות, הודעות שלא קשורות לשירות: category=spam, reply ריק.
זמן נוכחי בישראל: ${ilDateTimeLabel(now)}.`;
}

// history: [{role:'user'|'assistant', text}] כבר כולל את ההודעה האחרונה של הלקוח
// image: {base64, mime} של תמונה שהגיעה בהודעה האחרונה (אופציונלי)
// הזמן שמותר לשיחה עם ה-AI: Cloudflare נותנים לעיבוד ברקע 30 שניות בסך הכל
const AI_TIMEOUT_MS = 13000;

export async function runTurn(env, { history, image = null, now = new Date(), returningCustomer = null, profileName = '' }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
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
      system: buildSystemPrompt({ now, returningCustomer, profileName }),
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

// אם ה-AI נכשל, לא משאירים לקוח בלי תשובה: מעבירים ישר לחנן
function fallbackResult(reason) {
  return {
    reply: 'קיבלנו את ההודעה שלך, חנן יחזור אליך בהקדם 🙏',
    language: 'he', category: 'service', urgent: false, urgent_reason: '',
    customer_name: '', issue: '', address: '', ready_for_handoff: true,
    summary_for_owner: `הבוט לא הצליח לנהל את השיחה (${reason}). כדאי לחזור ללקוח ישירות.`,
    failed: true,
  };
}

function normalize(r) {
  return {
    reply: String(r.reply || ''),
    language: String(r.language || 'he'),
    category: ['service', 'spam', 'other'].includes(r.category) ? r.category : 'service',
    urgent: !!r.urgent,
    urgent_reason: String(r.urgent_reason || ''),
    customer_name: String(r.customer_name || ''),
    issue: String(r.issue || ''),
    address: String(r.address || ''),
    ready_for_handoff: !!r.ready_for_handoff,
    summary_for_owner: String(r.summary_for_owner || ''),
  };
}
