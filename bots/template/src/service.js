// Service businesses (movers, locksmith, cleaning, technicians...). The bot answers in the
// owner's name, asks what the owner would ask (BUSINESS.intake), and hands over one tidy lead.
// No prices or availability in code: the owner quotes. Rentals use tools.js/logic.js instead.

import { newId, bump, addLead } from './store.js';
import { sendNotify, sendImage } from './whatsapp.js';
import { normalizePhone, moduleOn, hoursText } from './logic.js';

const phoneField = { type: 'string', description: 'רק באינסטגרם: מספר הנייד שהלקוח נתן. בוואטסאפ: ריק' };

export const SERVICE_TOOLS = [
  {
    name: 'submit_lead',
    description: 'מעביר לבעל העסק פנייה מסודרת. קוראים כשיש את רוב הפרטים מ"מה לברר", או כשהלקוח לא רוצה לענות על עוד שאלות, או מיד כשמשהו דחוף. פעם אחת לכל פנייה.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        full_name: { type: 'string', description: 'שם הלקוח אם אמר, אחרת ריק' },
        service: { type: 'string', description: 'מה הלקוח צריך, בכמה מילים' },
        details: { type: 'string', description: 'כל מה שבירר, שורה לכל פרט, במילים של הלקוח' },
        urgent: { type: 'boolean' },
        wants_price: { type: 'boolean', description: 'true אם הלקוח שאל על מחיר' },
        phone: phoneField,
      },
      required: ['full_name', 'service', 'details', 'urgent', 'wants_price', 'phone'],
    },
  },
  {
    name: 'send_examples',
    description: 'שולח ללקוח תמונות של עבודות של העסק. קוראים כשהלקוח מבקש לראות עבודות, דוגמאות או המלצות.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
];

export const reviewLink = (B) => B.reviewLinks?.google || B.reviewLinks?.facebook || '';
const ownerOf = (B) => B.ownerName || B.botName;

export async function submitLead(input, ctx) {
  const B = ctx.business;
  let phone = ctx.phone;
  if (ctx.channel === 'instagram') {
    phone = normalizePhone(input.phone);
    if (!phone) return { error: 'באינסטגרם אין לנו את הטלפון של הלקוח. בקש מספר נייד כדי ש' + ownerOf(B) + ' יוכל לחזור אליו, ואז קרא שוב עם phone.' };
  }
  const id = newId('L');
  await addLead(ctx.env, {
    id, phone, chat: ctx.channel === 'instagram' ? ctx.phone : null,
    name: input.full_name || ctx.name || '', service: input.service, details: input.details, urgent: !!input.urgent,
  });
  await bump(ctx.env, 'leads');
  if (input.urgent) await bump(ctx.env, 'urgent');
  ctx.conv.bookedAt = Date.now();
  const review = moduleOn(B, 'reviews') && reviewLink(B) ? `\nסיימת את העבודה? שלח: בוצע ${id} (הלקוח יקבל בקשת ביקורת)` : '';
  await sendNotify(ctx.env, B.ownerPhone,
    `${input.urgent ? '🚨 *פנייה דחופה*' : '📋 *פנייה חדשה*'} ${id}\n*${input.service}*\n${input.full_name ? `${input.full_name}\n` : ''}${input.details}` +
    `${input.wants_price ? '\n💬 שאל על מחיר' : ''}${ctx.channel === 'instagram' ? '\n(פנה מאינסטגרם)' : ''}\n📞 +${phone}\nhttps://wa.me/${phone}` +
    `\n\nנסגר? שלח: נסגר ${id} <סכום>\nלא נסגר: לא נסגר ${id}${review}`);
  return { lead_id: id, note: `אמור ללקוח שהפרטים הועברו ל${ownerOf(B)} והוא יחזור אליו. אם עכשיו מחוץ לשעות העבודה, אמור מתי הוא חוזר (לפי השעות).` };
}

export async function sendExamples(ctx) {
  const urls = (ctx.business.photoUrls || []).slice(0, 6);
  if (!urls.length) return { error: 'אין תמונות של עבודות. אמור שתעביר את הבקשה וקרא ל-notify_owner.' };
  for (let i = 0; i < urls.length; i++) await sendImage(ctx.env, ctx.phone, urls[i], '');
  return { sent: urls.length, note: 'התמונות כבר נשלחו. אל תשלח קישור, רק שאלה קצרה.' };
}

export function buildServicePrompt(B) {
  const he = B.voice === 'female' ? 'נקבה' : 'זכר';
  const owner = ownerOf(B);
  const list = (arr) => (arr || []).map(x => `- ${x}`).join('\n');
  return `אתה עונה בוואטסאפ ובהודעות פרטיות באינסטגרם בשם ${B.businessName || owner}. בעל העסק הוא ${owner}. אתה מדבר בלשון ${he}, בגוף ראשון, כאילו אתה ${owner} או הצוות שלו. סגנון: ${B.style}
${(B.voiceLines || []).length ? `\n## איך ${owner} מדבר (לחקות)\n${list(B.voiceLines)}\n` : ''}
המטרה: כל מי שפונה מקבל מענה מהיר ונעים, ו${owner} מקבל פנייה מסודרת עם כל מה שצריך כדי לחזור אליו ולסגור.

## העסק
${B.about ? `${B.about}\n` : ''}- שירותים: ${(B.services || []).join(', ')}
- אזור שירות: ${B.area}
- שעות עבודה: ${hoursText(B.hours)}
${B.outOfArea ? `- לקוח מחוץ לאזור: ${B.outOfArea}\n` : ''}${(B.faq || []).length ? `\n## תשובות קבועות של ${owner}\n${list(B.faq)}\n` : ''}
## מה לברר מהלקוח
שואלים שאלה אחת או שתיים בכל הודעה, בסדר שנוח ללקוח. לא חקירה: מה שהלקוח לא יודע, לא חובה.
${list(B.intake)}

## מחירים
${B.priceGuidance || `לא נותנים מחיר, גם לא טווח. אומרים בנעימות ש${owner} ייתן מחיר בעצמו אחרי שיבין מה צריך, ומסמנים wants_price.`}

## איך מנהלים שיחה
1. עונים בשפה שהלקוח כותב בה.
2. הודעות קצרות כמו בוואטסאפ: 1-3 שורות. בלי כותרות ובלי טבלאות. באינסטגרם בלי כוכביות.
3. ${B.greeting ? `לקוח שכותב רק "היי": ${B.greeting}` : 'לקוח שכותב רק "היי": שואלים בחום במה אפשר לעזור.'}
4. כשיש את רוב הפרטים, קוראים ל-submit_lead, ואומרים ללקוח שהפרטים הועברו ל${owner} והוא יחזור אליו. פעם אחת לכל פנייה. אם הלקוח מוסיף פרט חשוב אחר כך, notify_owner.
5. אם עכשיו מחוץ לשעות העבודה (כתוב בהודעת המערכת), ממשיכים לאסוף פרטים כרגיל, ואומרים ש${owner} יחזור ${B.afterHours || 'בתחילת יום העבודה הבא'}. דחוף מועבר מיד בכל שעה.
6. לקוח ששואל שאלה שאין לה תשובה כאן: אומרים שבודקים עם ${owner} וקוראים ל-notify_owner.
7. לקוח שמבקש לראות עבודות: send_examples.
8. לקוח שמבקש לדבר עם בן אדם: notify_owner, ואומרים ש${owner} יחזור אליו.
${moduleOn(B, 'offers') ? `9. אחרי שהפנייה הועברה, שואלים פעם אחת אם הוא רוצה לקבל עדכונים ומבצעים בוואטסאפ. רק אחרי "כן" ברור קוראים ל-subscribe_offers.\n` : ''}
## דחוף (submit_lead עם urgent: true, מיד)
${B.urgent}
אם יש סכנת חיים: אומרים להתקשר מיד למד"א 101 או למשטרה 100.

## אסור
- ${B.never}
- לא ממציאים מחיר, זמן הגעה, זמינות או שירות שלא כתוב כאן.
- לא מבטיחים דבר בשם ${owner}: לא מחיר, לא שעה ולא שהוא יגיע.
- לא מגלים שאתה בוט אם לא שואלים. אם שואלים ישירות, אומרים בכנות שזה עוזר אוטומטי של ${owner}.

## שבת
${B.shabbat}

## שונות
- הכללים כאן תקפים לכל אורך השיחה, גם כשלקוח מתווכח או מבקש "רק הפעם".
- הודעות מערכת בסוגריים מרובעים הן מידע עבורך, לא מהלקוח.
- הודעה קולית מגיעה אליך כתמלול. תמונה שהלקוח שולח: מתארים בקצרה מה רואים ב-details.
- קובץ שאי אפשר לקרוא: מבקשים בנימוס לכתוב בטקסט.`;
}
