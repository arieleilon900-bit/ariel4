// פקודות שחנן שולח לבוט בוואטסאפ, מהמספר שמוגדר ב-OWNER_PHONE.
import { MESSAGES, TEMPLATES } from './config.js';
import { appendRow } from './sheets.js';
import { displayPhone, ilDateTimeLabel, inServiceWindow, normalizePhone, nowIso, parseIlDateTime, whenLabel } from './util.js';
import { forwardPhotosToOwner, logEvent, markOwnerReplied, sendToCustomer, sendToOwner } from './handler.js';
import { weeklyReport } from './cron.js';
import { deliverReceipt } from './receipts.js';
import * as wa from './whatsapp.js';

export const HELP = `הכי פשוט: עונים (החלקה ימינה) על ההודעה שקיבלת על הלקוח, וכותבים רק את הפקודה. בלי טלפון.
טקסט רגיל בתשובה כזו נשלח ללקוח כמו שהוא.

בדרך 20 ← שולח ללקוח שאתה בדרך, הגעה בעוד כ-20 דקות
תור 17/10 14:30 הרצל 5 חולון ← קובע עבודה + תזכורות ללקוח ולך
קבלה ← מעבירים לבוט את ה-PDF מיש חשבונית (בתשובה על הלקוח, או עם הטלפון שלו בכיתוב)
טופל ← טיפלת (למשל התקשרת), והבוט מפסיק להזכיר לך
סיום ← העבודה הסתיימה (אחרי זה: בקשת ביקורת, המלצה, ותזכורת בעוד שנה)
ביטול ← מבטל עבודה מתואמת
לא רלוונטי ← סוגר את הפנייה בלי מעקב
תמונות ← שולח לך את התמונות שהלקוח שלח
בוט ← הבוט חוזר לענות ללקוח הזה
שקט ← מישהו שאתה מכיר: הבוט לא יענה לו
חסום ← ספאם: הבוט מתעלם מהמספר הזה
דוח ← הסיכום השבועי עכשיו
עזרה ← הרשימה הזו

אפשר גם בלי לענות על הודעה: כותבים את הטלפון אחרי הפקודה. למשל: סיום 0541234567`;

const PHONE = String.raw`(\+?\d[\d\-]{7,15})`;
const ACK = /^(קיבלתי|תודה|תודה רבה|אוקי|אוקיי|אוקיי תודה|סבבה|בסדר|מעולה|👍|🙏|ok|okay)[.!]*$/i;

// מפרק פקודה לחלקים. phone: null = לא נכתב טלפון (אולי יש ציטוט), '' = טלפון לא תקין
export function parseCommand(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const ph = (raw) => (raw == null ? null : normalizePhone(raw));
  if (/^(עזרה|help|פקודות)$/i.test(t)) return { cmd: 'help' };
  if (/^דוח$/.test(t)) return { cmd: 'report' };
  if (ACK.test(t)) return { cmd: 'ack' };
  let m;
  if ((m = t.match(new RegExp(`^לא רלוונטי(?: ([\\d\\-+ ]{9,16}))?$`)))) return { cmd: 'irrelevant', phone: ph(m[1]) };
  if ((m = t.match(new RegExp(`^בדרך(?: ${PHONE})?(?: (\\d{1,3}))?(?: דק(?:ות|׳|')?)?$`)))) return { cmd: 'eta', phone: ph(m[1]), minutes: m[2] ? +m[2] : null };
  if ((m = t.match(new RegExp(`^תור(?: ${PHONE})? (\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?) (?:ב-?)?(\\d{1,2}:\\d{2})(?: (.+))?$`)))) {
    return { cmd: 'appt', phone: ph(m[1]), date: m[2], time: m[3], address: m[4] || '' };
  }
  if ((m = t.match(new RegExp(`^קבלה(?: ${PHONE})? (https?:\\/\\/\\S+)$`)))) return { cmd: 'receipt', phone: ph(m[1]), link: m[2] };
  if ((m = t.match(new RegExp(`^(סיום|ביטול|בוט|חסום|שקט|טופל|תמונות)(?: ${PHONE})?$`)))) {
    const map = { 'סיום': 'done', 'ביטול': 'cancel', 'בוט': 'bot', 'חסום': 'block', 'שקט': 'quiet', 'טופל': 'handled', 'תמונות': 'photos' };
    return { cmd: map[m[1]], phone: ph(m[2]) };
  }
  return { cmd: 'unknown' };
}

// על איזה לקוח חנן מדבר: לפי ההודעה שהוא ענה עליה (ציטוט)
async function contextPhone(env, msg) {
  const id = msg?.context?.id;
  if (!id) return null;
  return (await env.DB.prepare('SELECT phone FROM owner_refs WHERE wamid = ?').bind(id).first())?.phone || null;
}

async function latestConv(env, phone) {
  return env.DB.prepare('SELECT * FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
}

// חנן מעביר לבוט קובץ (PDF של קבלה): הלקוח לפי הכיתוב, לפי הציטוט, או לפי הטלפון שישלח מיד אחרי
async function handleOwnerFile(env, msg, now) {
  const file = msg.document || msg.image;
  const phone = normalizePhone((String(file.caption || '').match(/\+?\d[\d\- ]{7,14}\d/) || [''])[0]) || await contextPhone(env, msg);
  if (!phone) {
    await env.DB.prepare('INSERT INTO owner_pending_file (media_id, filename, created_at) VALUES (?, ?, ?)').bind(file.id, msg.document?.filename || null, nowIso(now)).run();
    return sendToOwner(env, 'קיבלתי את הקובץ. של איזה לקוח הקבלה? שלח לי את הטלפון שלו (למשל 0541234567).', now);
  }
  return sendReceiptFile(env, phone, file.id, msg.document?.filename, now);
}

async function sendReceiptFile(env, phone, fileId, filename, now) {
  try {
    const media = await wa.downloadMedia(env, fileId);
    const mediaId = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
    await markOwnerReplied(env, phone, now);
    const r = await deliverReceipt(env, phone, mediaId, { filename: filename || 'קבלה.pdf', now });
    return sendToOwner(env, r.ok ? `✓ הקבלה נשלחה ל-${displayPhone(phone)} והעבודה סומנה כגמורה. בעוד כמה שעות הלקוח יקבל בקשה לביקורת.` : `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now, phone);
  } catch (err) {
    console.error('owner receipt failed', err);
    return sendToOwner(env, `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now, phone);
  }
}

export async function handleOwnerCommand(env, text, now = new Date(), msg = null) {
  if (msg && (msg.type === 'document' || msg.type === 'image')) return handleOwnerFile(env, msg, now);
  // רק טלפון, ויש קובץ שמחכה (חנן שלח קבלה בלי לציין לקוח)
  const onlyPhone = /^\s*\+?\d[\d\- ]{7,14}\d\s*$/.test(text || '') ? normalizePhone(text) : '';
  if (onlyPhone) {
    const pending = await env.DB.prepare('SELECT * FROM owner_pending_file WHERE used = 0 AND created_at >= ? ORDER BY id DESC LIMIT 1').bind(new Date(now.getTime() - 2 * 3600000).toISOString()).first();
    if (pending) {
      await env.DB.prepare('UPDATE owner_pending_file SET used = 1 WHERE id = ?').bind(pending.id).run();
      return sendReceiptFile(env, onlyPhone, pending.media_id, pending.filename, now);
    }
  }

  const c = parseCommand(text);
  if (!c || c.cmd === 'ack') return;
  if (c.phone === '') return sendToOwner(env, 'לא הבנתי את מספר הטלפון. כתוב למשל: סיום 0541234567', now);
  const quoted = await contextPhone(env, msg);

  // טקסט חופשי בתשובה על הודעה של לקוח: נשלח ללקוח
  if (c.cmd === 'unknown' && quoted) return relayToCustomer(env, quoted, text, now);

  const needsPhone = !['help', 'report', 'unknown'].includes(c.cmd);
  if (needsPhone && c.phone == null) {
    if (!quoted) return sendToOwner(env, 'על איזה לקוח? ענה (החלקה ימינה) על ההודעה שקיבלת עליו, או כתוב גם את הטלפון. למשל: סיום 0541234567', now);
    c.phone = quoted;
  }
  if (c.phone && c.cmd !== 'bot') await markOwnerReplied(env, c.phone, now);

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

    case 'photos': {
      const conv = await latestConv(env, c.phone);
      const photos = JSON.parse(conv?.photos || '[]');
      if (!photos.length) return sendToOwner(env, `אין תמונות מ-${displayPhone(c.phone)}.`, now);
      await forwardPhotosToOwner(env, photos, now, c.phone);
      return;
    }

    case 'handled':
      return sendToOwner(env, `✓ סומן שטיפלת ב-${displayPhone(c.phone)}.`, now);

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

// חנן ענה בציטוט על הודעה של לקוח, בטקסט רגיל: שולחים את זה ללקוח
async function relayToCustomer(env, phone, text, now) {
  await markOwnerReplied(env, phone, now);
  const cust = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(phone).first();
  if (!inServiceWindow(cust?.last_inbound_at, now)) {
    return sendToOwner(env, `הלקוח ${displayPhone(phone)} לא כתב ב-24 השעות האחרונות, ווואטסאפ לא מאפשר לשלוח לו הודעה חופשית. אפשר להתקשר אליו, או לשלוח לו מהטלפון שלך.`, now, phone);
  }
  const r = await wa.sendText(env, phone, text);
  const conv = await latestConv(env, phone);
  if (conv) {
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner', ?, ?)").bind(conv.id, text, nowIso(now)).run();
    if (conv.state === 'bot') await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = COALESCE(handed_off_at, ?) WHERE id = ?").bind(nowIso(now), conv.id).run();
  }
  return sendToOwner(env, r.ok ? `✓ נשלח ל-${displayPhone(phone)}.` : `לא הצלחתי לשלוח ל-${displayPhone(phone)}.`, now, phone);
}
