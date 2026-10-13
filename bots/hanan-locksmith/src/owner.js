// פקודות שחנן שולח לבוט בוואטסאפ, מהמספר שמוגדר ב-OWNER_PHONE.
import { MESSAGES, TEMPLATES } from './config.js';
import { appendRow } from './sheets.js';
import { displayPhone, ilDateTimeLabel, normalizePhone, nowIso, parseIlDateTime, whenLabel } from './util.js';
import { logEvent, sendToCustomer, sendToOwner } from './handler.js';
import { weeklyReport } from './cron.js';
import { deliverReceipt } from './receipts.js';
import * as wa from './whatsapp.js';

export const HELP = `פקודות (כותבים לבוט מהטלפון שלך):
בדרך 0541234567 20 ← שולח ללקוח שאתה בדרך, הגעה בעוד כ-20 דקות
תור 0541234567 17/10 14:30 הרצל 5 חולון ← קובע עבודה + תזכורות ללקוח
קבלה: מעבירים לבוט את ה-PDF מיש חשבונית, ובכיתוב כותבים את הטלפון של הלקוח ← הבוט שולח לו את הקבלה וסוגר את העבודה
סיום 0541234567 ← העבודה הסתיימה (אחרי זה: בקשת ביקורת, המלצה, ותזכורת בעוד שנה)
ביטול 0541234567 ← מבטל עבודה מתואמת
לא רלוונטי 0541234567 ← סוגר את הפנייה בלי מעקב
בוט 0541234567 ← הבוט חוזר לענות למספר הזה
שקט 0541234567 ← מישהו שאתה מכיר: הבוט לא יענה לו (ההודעות ממשיכות להגיע אליך כרגיל)
חסום 0541234567 ← ספאם: הבוט מתעלם מהמספר הזה
דוח ← הסיכום השבועי עכשיו
עזרה ← הרשימה הזו`;

// מפרק פקודה לחלקים. מחזיר null אם זו לא פקודה מוכרת.
export function parseCommand(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (/^(עזרה|help)$/i.test(t)) return { cmd: 'help' };
  if (/^דוח$/.test(t)) return { cmd: 'report' };
  let m;
  if ((m = t.match(/^לא רלוונטי ([\d\-+ ]{9,16})$/))) return { cmd: 'irrelevant', phone: normalizePhone(m[1]) };
  if ((m = t.match(/^בדרך ([\d\-+]{9,16})(?: (\d{1,3}))?$/))) return { cmd: 'eta', phone: normalizePhone(m[1]), minutes: m[2] ? +m[2] : null };
  if ((m = t.match(/^תור ([\d\-+]{9,16}) (\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?) (\d{1,2}:\d{2})(?: (.+))?$/))) {
    return { cmd: 'appt', phone: normalizePhone(m[1]), date: m[2], time: m[3], address: m[4] || '' };
  }
  if ((m = t.match(/^קבלה ([\d\-+]{9,16}) (https?:\/\/\S+)$/))) return { cmd: 'receipt', phone: normalizePhone(m[1]), link: m[2] };
  if ((m = t.match(/^(סיום|ביטול|בוט|חסום|שקט) ([\d\-+]{9,16})$/))) {
    const map = { 'סיום': 'done', 'ביטול': 'cancel', 'בוט': 'bot', 'חסום': 'block', 'שקט': 'quiet' };
    return { cmd: map[m[1]], phone: normalizePhone(m[2]) };
  }
  return { cmd: 'unknown' };
}

async function latestConv(env, phone) {
  return env.DB.prepare('SELECT * FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
}

// חנן מעביר לבוט קובץ (PDF של קבלה) עם הטלפון של הלקוח בכיתוב
async function handleOwnerFile(env, msg, now) {
  const file = msg.document || msg.image;
  const phone = normalizePhone((String(file.caption || '').match(/\+?\d[\d\- ]{7,14}\d/) || [''])[0]);
  if (!phone) return sendToOwner(env, 'קיבלתי קובץ, אבל לא ראיתי טלפון של לקוח. שלח שוב, ובכיתוב של הקובץ כתוב את הטלפון שלו (למשל 0541234567).', now);
  try {
    const media = await wa.downloadMedia(env, file.id);
    const mediaId = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
    const r = await deliverReceipt(env, phone, mediaId, { filename: msg.document?.filename || 'קבלה.pdf', now });
    return sendToOwner(env, r.ok ? `✓ הקבלה נשלחה ל-${displayPhone(phone)} והעבודה סומנה כגמורה. בעוד כמה שעות הלקוח יקבל בקשה לביקורת.` : `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now);
  } catch (err) {
    console.error('owner receipt failed', err);
    return sendToOwner(env, `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now);
  }
}

export async function handleOwnerCommand(env, text, now = new Date(), msg = null) {
  if (msg && (msg.type === 'document' || msg.type === 'image')) return handleOwnerFile(env, msg, now);
  const c = parseCommand(text);
  if (!c) return;
  if (c.phone === '') return sendToOwner(env, 'לא הבנתי את מספר הטלפון. כתוב למשל: סיום 0541234567', now);

  switch (c.cmd) {
    case 'help':
      return sendToOwner(env, HELP, now);

    case 'report':
      return weeklyReport(env, now);

    case 'eta': {
      const min = c.minutes || 30;
      const r = await sendToCustomer(env, c.phone, MESSAGES.eta(min), { name: TEMPLATES.eta, params: [String(min)] }, now);
      await logEvent(env, 'eta', c.phone, now);
      return sendToOwner(env, r.ok ? `✓ נשלח ל-${displayPhone(c.phone)} שאתה בדרך (כ-${min} דק׳).` : `לא הצלחתי לשלוח ל-${displayPhone(c.phone)}.`, now);
    }

    case 'appt': {
      const at = parseIlDateTime(c.date, c.time, now);
      if (!at) return sendToOwner(env, 'לא הבנתי את התאריך או השעה. כתוב למשל: תור 0541234567 17/10 14:30', now);
      const conv = await latestConv(env, c.phone);
      await env.DB.prepare('INSERT INTO jobs (phone, conv_id, issue, address, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(c.phone, conv?.id || null, conv?.issue || null, c.address || conv?.address || null, at.toISOString(), nowIso(now)).run();
      if (conv) await env.DB.prepare("UPDATE conversations SET followup_sent = 1 WHERE id = ?").bind(conv.id).run();
      return sendToOwner(env, `✓ נקבעה עבודה ל-${displayPhone(c.phone)}: ${whenLabel(at, now)}. הלקוח יקבל תזכורת יום לפני ושעתיים לפני, ואתה תקבל תזכורת בבוקר ושעה לפני.`, now);
    }

    case 'done': {
      let job = await env.DB.prepare("SELECT * FROM jobs WHERE phone = ? AND status = 'open' ORDER BY id DESC LIMIT 1").bind(c.phone).first();
      const conv = await latestConv(env, c.phone);
      if (!job) {
        const res = await env.DB.prepare('INSERT INTO jobs (phone, conv_id, issue, address, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(c.phone, conv?.id || null, conv?.issue || null, conv?.address || null, nowIso(now)).run();
        job = { id: res.meta?.last_row_id, issue: conv?.issue, address: conv?.address };
      }
      await env.DB.prepare("UPDATE jobs SET status = 'done', done_at = ? WHERE id = ?").bind(nowIso(now), job.id).run();
      await env.DB.prepare('UPDATE customers SET jobs_count = jobs_count + 1 WHERE phone = ?').bind(c.phone).run();
      if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE id = ?").bind(conv.id).run();
      const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(c.phone).first();
      await appendRow(env, [ilDateTimeLabel(now), 'עבודה הסתיימה', cust?.name || '', displayPhone(c.phone), job.issue || '', job.address || '', '', '']);
      return sendToOwner(env, `✓ סומן כגמור: ${displayPhone(c.phone)}. בעוד כמה שעות הלקוח יקבל בקשה לביקורת.`, now);
    }

    case 'receipt': {
      const r = await deliverReceipt(env, c.phone, c.link, { now });
      return sendToOwner(env, r.ok ? `✓ הקבלה נשלחה ל-${displayPhone(c.phone)} והעבודה סומנה כגמורה.` : `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(c.phone)}.`, now);
    }

    case 'cancel': {
      await env.DB.prepare("UPDATE jobs SET status = 'cancelled' WHERE phone = ? AND status = 'open'").bind(c.phone).run();
      return sendToOwner(env, `✓ בוטלה העבודה של ${displayPhone(c.phone)}.`, now);
    }

    case 'irrelevant': {
      const conv = await latestConv(env, c.phone);
      if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE id = ?").bind(conv.id).run();
      return sendToOwner(env, `✓ הפנייה של ${displayPhone(c.phone)} נסגרה, בלי מעקב.`, now);
    }

    case 'quiet': {
      await env.DB.prepare('INSERT INTO customers (phone, first_seen, known) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(c.phone, nowIso(now)).run();
      return sendToOwner(env, `✓ ${displayPhone(c.phone)} סומן כמוכר. הבוט לא יענה לו. כדי להחזיר: בוט ${displayPhone(c.phone)}`, now);
    }

    case 'bot': {
      await env.DB.prepare('UPDATE customers SET known = 0, blocked = 0 WHERE phone = ?').bind(c.phone).run();
      const conv = await latestConv(env, c.phone);
      if (conv) await env.DB.prepare("UPDATE conversations SET state = 'bot', updated_at = ? WHERE id = ?").bind(nowIso(now), conv.id).run();
      return sendToOwner(env, `✓ הבוט חזר לטפל ב-${displayPhone(c.phone)}.`, now);
    }

    case 'block': {
      await env.DB.prepare('INSERT INTO customers (phone, first_seen, blocked) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET blocked = 1').bind(c.phone, nowIso(now)).run();
      return sendToOwner(env, `✓ המספר ${displayPhone(c.phone)} חסום. הבוט יתעלם ממנו.`, now);
    }

    default:
      return sendToOwner(env, `לא הכרתי את הפקודה. כתוב "עזרה" לרשימת הפקודות.`, now);
  }
}
