// פקודות שחנן שולח לבוט בוואטסאפ, מהמספר שמוגדר ב-OWNER_PHONE.
import { FEATURES, MESSAGES, TEMPLATES } from './config.js';
import { upsertLead } from './sheets.js';
import { displayPhone, ilParts, inServiceWindow, normalizePhone, nowIso, parseIlDateTime, whenLabel } from './util.js';
import { aiRespond, forwardPhotosToOwner, isPaused, logEvent, markOwnerReplied, sendToCustomer, sendToOwner } from './handler.js';
import { weeklyReport } from './cron.js';
import { deliverReceipt } from './receipts.js';
import * as wa from './whatsapp.js';

const HELP_TEXT = `הכי פשוט: עונים (החלקה ימינה) על ההודעה שקיבלת על הלקוח, וכותבים רק את הפקודה. בלי טלפון.
טקסט רגיל בתשובה כזו נשלח ללקוח כמו שהוא.

בדרך 20 ← שולח ללקוח שאתה בדרך, הגעה בעוד כ-20 דקות
תור 17/10 14:30 הרצל 5 חולון ← קובע עבודה + תזכורות ללקוח ולך
__RECEIPT_LINE__טופל ← טיפלת (למשל התקשרת), והבוט מפסיק להזכיר לך
סיום ← העבודה הסתיימה (אחרי זה: בקשת ביקורת, המלצה, ותזכורת בעוד שנה)
ביטול ← מבטל עבודה מתואמת
לא רלוונטי ← סוגר את הפנייה בלי מעקב
תמונות ← שולח לך את התמונות שהלקוח שלח
בוט ← הבוט חוזר לענות ללקוח הזה
שקט ← מישהו שאתה מכיר: הבוט לא יענה לו
חסום ← ספאם: הבוט מתעלם מהמספר הזה
למד החלפת צילינדר עולה 250-450 ₪ כולל הגעה ← הבוט יודע את זה מעכשיו ועונה ככה ללקוחות
מה למדת ← רשימת כל מה שלימדת את הבוט
שכח 3 ← מוחק את שורה 3 מהרשימה
דוח ← הסיכום השבועי עכשיו
סטטוס ← מה קורה עכשיו: פניות היום, מחכים לך, הבוט פועל או בהפסקה
עצור בוט ← הבוט מפסיק לענות ללקוחות, והכל מגיע ישר אליך
הפעל בוט ← הבוט חוזר לעבוד
עזרה ← הרשימה הזו

אפשר גם בלי לענות על הודעה: כותבים את הטלפון אחרי הפקודה. למשל: סיום 0541234567`;
export const HELP = HELP_TEXT.replace('__RECEIPT_LINE__', FEATURES.receipts ? 'קבלה ← מעבירים לבוט את ה-PDF מיש חשבונית (בתשובה על הלקוח, או עם הטלפון שלו בכיתוב)\n' : '');

const PHONE = String.raw`(\+?\d[\d\-]{7,15})`;
// מילים שפותחות פקודה: טקסט שמתחיל בהן לא נשלח ללקוח גם אם לא הבנו אותו
const COMMAND_START = /^(בדרך|תור|סיום|ביטול|טופל|קבלה|תמונות|בוט|חסום|שקט|לא רלוונטי|דוח|עזרה)(\s|$)/;
const ACK_WORDS = /^(קיבלתי|תודה|רבה|אוקי|אוקיי|אוק|סבבה|בסדר|מעולה|יופי|אחלה|טוב|ok|okay|thanks|thx|כן|לא)$/i;
// אישור קצר ("סבבה תודה", "👍👍"): לא פקודה ולא הודעה ללקוח
function isAck(t) {
  const words = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true; // רק אימוג'י או סימנים
  return words.length <= 3 && words.every((w) => ACK_WORDS.test(w));
}
// שגיאות כתיב נפוצות בפקודות
const ALIASES = { 'סיים': 'סיום', 'סיימתי': 'סיום', 'גמרתי': 'סיום', 'בטל': 'ביטול', 'טיפלתי': 'טופל', 'תמונה': 'תמונות', 'חסימה': 'חסום' };

// מפרק פקודה לחלקים. phone: null = לא נכתב טלפון (אולי יש ציטוט), '' = טלפון לא תקין
export function parseCommand(text) {
  let t = String(text || '').trim().replace(/\s+/g, ' ').replace(/[.!?,׳"]+$/u, '').trim();
  if (!t) return null;
  const first = t.split(' ')[0];
  if (ALIASES[first]) t = ALIASES[first] + t.slice(first.length);
  // טלפון עם רווחים אחרי פקודה של מילה אחת ("סיום 054 123 4567")
  if (/^(סיום|ביטול|בוט|חסום|שקט|טופל|תמונות) [\d+]/.test(t)) t = t.replace(/(\+?\d[\d\- ]{7,15}\d)$/, (m) => m.replace(/ /g, ''));
  const ph = (raw) => (raw == null ? null : normalizePhone(raw));
  let m0;
  if (/^(עזרה|help|פקודות)$/i.test(t)) return { cmd: 'help' };
  if (/^דוח$/.test(t)) return { cmd: 'report' };
  if (/^סטטוס$/.test(t)) return { cmd: 'status' };
  if ((m0 = String(text || '').trim().match(/^(?:למד|תלמד)[:\s]+([\s\S]{3,})$/))) return { cmd: 'learn', fact: m0[1].trim() };
  if (/^(מה למדת|מה אתה יודע|רשימה)$/.test(t)) return { cmd: 'knowledge' };
  if ((m0 = t.match(/^שכח (\d{1,3})$/))) return { cmd: 'forget', n: +m0[1] };
  if (/^(עצור|עצור בוט|הפסק בוט)$/.test(t)) return { cmd: 'pause' };
  if (/^(הפעל|הפעל בוט|המשך בוט)$/.test(t)) return { cmd: 'resume' };
  if (isAck(t)) return { cmd: 'ack' };
  let m;
  if ((m = t.match(new RegExp(`^לא רלוונטי(?: ([\\d\\-+ ]{9,16}))?$`)))) return { cmd: 'irrelevant', phone: ph(m[1]) };
  if ((m = t.match(new RegExp(`^בדרך(?: ${PHONE})?(?: (\\d{1,3}))?(?: דק(?:ות|׳|')?)?$`)))) return { cmd: 'eta', phone: ph(m[1]), minutes: m[2] ? +m[2] : null };
  if ((m = t.match(new RegExp(`^תור(?: ${PHONE})? (היום|מחר|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?) (?:בשעה |ב-?)?(\\d{1,2}:\\d{2})(?: (.+))?$`)))) {
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
  const ref = id ? (await env.DB.prepare('SELECT phone FROM owner_refs WHERE wamid = ?').bind(id).first())?.phone : null;
  if (ref) return ref;
  // UltraMsg: המזהה של ההודעה המצוטטת לא תמיד ידוע, אבל הטקסט שלה כן. לוקחים את הטלפון של הלקוח מתוכו
  const m = String(msg?.context?.body || '').match(/(?:\+?972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/);
  return m ? normalizePhone(m[0]) : null;
}

async function latestConv(env, phone) {
  return env.DB.prepare('SELECT * FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
}

// חנן מעביר לבוט קובץ (PDF של קבלה): הלקוח לפי הכיתוב, לפי הציטוט, או לפי הטלפון שישלח מיד אחרי
async function handleOwnerFile(env, msg, now) {
  const file = msg.document;
  if (!FEATURES.receipts) return relayFileToCustomer(env, msg, now);
  if (!/pdf/i.test(file.mime_type || '') && !/\.pdf$/i.test(file.filename || '')) {
    return sendToOwner(env, 'קיבלתי קובץ, אבל רק PDF של קבלה נשלח ללקוח אוטומטית. את השאר שלח ללקוח מהטלפון שלך.', now);
  }
  const quoted = await contextPhone(env, msg);
  const captioned = normalizePhone((String(file.caption || '').match(/\+?\d[\d\- ]{7,14}\d/) || [''])[0]);
  // ציטוט של לקוח אחד וטלפון של לקוח אחר בכיתוב: לא מנחשים, שואלים
  const phone = quoted && captioned && quoted !== captioned ? '' : (captioned || quoted);
  if (quoted && captioned && quoted !== captioned) {
    await env.DB.prepare('INSERT INTO owner_pending_file (media_id, filename, created_at) VALUES (?, ?, ?)').bind(file.id, msg.document?.filename || null, nowIso(now)).run();
    return sendToOwner(env, `הקבלה בתשובה על ${displayPhone(quoted)}, אבל בכיתוב כתוב ${displayPhone(captioned)}. למי לשלוח? שלח לי את הטלפון.`, now);
  }
  if (!phone) {
    await env.DB.prepare('INSERT INTO owner_pending_file (media_id, filename, created_at) VALUES (?, ?, ?)').bind(file.id, msg.document?.filename || null, nowIso(now)).run();
    const waiting = (await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_pending_file WHERE used = 0 AND created_at >= ?').bind(new Date(now.getTime() - 2 * 3600000).toISOString()).first())?.n || 1;
    return sendToOwner(env, waiting > 1
      ? `קיבלתי את הקובץ "${msg.document?.filename || 'קבלה'}". יש ${waiting} קבלות שמחכות לטלפון. שלח טלפונים לפי הסדר שבו שלחת את הקבצים, אחד בכל הודעה.`
      : 'קיבלתי את הקובץ. של איזה לקוח הקבלה? שלח לי את הטלפון שלו (למשל 0541234567).', now);
  }
  return sendReceiptFile(env, phone, file.id, msg.document?.filename, now);
}

// חנן שלח תמונה: בתשובה על לקוח → נשלחת ללקוח כתמונה (לא כקבלה)
async function handleOwnerImage(env, msg, now) {
  const phone = await contextPhone(env, msg);
  if (!phone) return sendToOwner(env, 'קיבלתי תמונה. כדי לשלוח אותה ללקוח, שלח אותה בתשובה (החלקה ימינה) על ההודעה שלו.', now);
  const cust = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(phone).first();
  if (!inServiceWindow(cust?.last_inbound_at, now)) {
    return sendToOwner(env, `הלקוח ${displayPhone(phone)} לא כתב ב-24 השעות האחרונות, ווואטסאפ לא מאפשר לשלוח לו תמונה. שלח לו מהטלפון שלך.`, now, phone);
  }
  try {
    const media = await wa.downloadMedia(env, msg.image.id);
    const id = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
    const r = await wa.sendImageById(env, phone, id, msg.image.caption || '');
    await markOwnerReplied(env, phone, now);
    const conv = await latestConv(env, phone);
    if (conv) {
      await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner', ?, ?)").bind(conv.id, `[תמונה מחנן] ${msg.image.caption || ''}`.trim(), nowIso(now)).run();
      if (conv.state === 'bot') await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = COALESCE(handed_off_at, ?) WHERE id = ?").bind(nowIso(now), conv.id).run();
    }
    return sendToOwner(env, r.ok ? `✓ התמונה נשלחה ל-${displayPhone(phone)}.` : `לא הצלחתי לשלוח ל-${displayPhone(phone)}.`, now, phone);
  } catch (err) {
    console.error('owner image relay failed', err);
    return sendToOwner(env, `לא הצלחתי לשלוח את התמונה ל-${displayPhone(phone)}.`, now, phone);
  }
}

async function sendReceiptFile(env, phone, fileId, filename, now) {
  try {
    const media = await wa.downloadMedia(env, fileId);
    const mediaId = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
    await markOwnerReplied(env, phone, now);
    const r = await deliverReceipt(env, phone, mediaId, { filename: filename || 'קבלה.pdf', now });
    return sendToOwner(env, r.ok ? `✓ הקבלה נשלחה ל-${displayPhone(phone)}${filename ? ` (${filename})` : ''} והעבודה סומנה כגמורה. בעוד כמה שעות הלקוח יקבל בקשה לביקורת.` : `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now, phone);
  } catch (err) {
    console.error('owner receipt failed', err);
    return sendToOwner(env, `לא הצלחתי לשלוח את הקבלה ל-${displayPhone(phone)}. נסה שוב בעוד כמה דקות.`, now, phone);
  }
}

export async function handleOwnerCommand(env, text, now = new Date(), msg = null, from = env.OWNER_PHONE) {
  // אריאל (מנהל) מקבל את התשובות לטלפון שלו, לא של חנן
  if (from && from !== env.OWNER_PHONE) env = { ...env, OWNER_PHONE: from };
  if (msg && msg.type === 'document') return handleOwnerFile(env, msg, now);
  if (msg && msg.type === 'image') return handleOwnerImage(env, msg, now);
  // רק טלפון, ויש קובץ שמחכה (חנן שלח קבלה בלי לציין לקוח)
  const onlyPhone = !FEATURES.receipts ? '' : /^\s*\+?\d[\d\- ]{7,14}\d\s*$/.test(text || '') ? normalizePhone(text) : '';
  if (onlyPhone) {
    // לפי הסדר: הקובץ הראשון שנשלח מקבל את הטלפון הראשון
    const pending = await env.DB.prepare('SELECT * FROM owner_pending_file WHERE used = 0 AND created_at >= ? ORDER BY id ASC LIMIT 1').bind(new Date(now.getTime() - 2 * 3600000).toISOString()).first();
    if (pending) {
      await env.DB.prepare('UPDATE owner_pending_file SET used = 1 WHERE id = ?').bind(pending.id).run();
      return sendReceiptFile(env, onlyPhone, pending.media_id, pending.filename, now);
    }
  }

  const c = parseCommand(text);
  if (!c) return;
  const quoted = await contextPhone(env, msg);
  if (c.cmd === 'ack') {
    // לחיצה על "קיבלתי" או "תודה" סתם: שקט. אבל "כן"/"בסדר" בתשובה על לקוח: אומרים לחנן שזה לא נשלח
    if (quoted && msg?.type === 'text') return sendToOwner(env, `"${String(text).slice(0, 30)}" לא נשלח ל-${displayPhone(quoted)}. אם רצית לשלוח לו, כתוב משפט מלא.`, now, quoted);
    return;
  }
  if (c.phone === '') return sendToOwner(env, 'לא הבנתי את מספר הטלפון. כתוב למשל: סיום 0541234567', now);

  // טקסט חופשי בתשובה על הודעה של לקוח: נשלח ללקוח. אבל לא פקודה שלא הבנו, ולא מילה בודדת
  if (c.cmd === 'unknown' && quoted) {
    const t = String(text).trim();
    if (COMMAND_START.test(t)) return sendToOwner(env, `לא הבנתי את הפקודה "${t.slice(0, 40)}", ולא שלחתי אותה ללקוח. דוגמאות: בדרך 20 / תור 17/10 14:30 / תור מחר 9:00 / סיום. כתוב "עזרה" לרשימה.`, now, quoted);
    if (t.split(/\s+/).length >= 2 && /\p{L}/u.test(t)) return relayToCustomer(env, quoted, text, now);
    return sendToOwner(env, `לא הבנתי את "${t.slice(0, 40)}". אם זו פקודה, כתוב "עזרה" לרשימה. אם זו הודעה ללקוח, כתוב משפט מלא.`, now, quoted);
  }

  const needsPhone = !['help', 'report', 'unknown', 'status', 'pause', 'resume', 'learn', 'knowledge', 'forget'].includes(c.cmd);
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

    case 'learn': {
      const fact = c.fact.slice(0, 500);
      await env.DB.prepare('INSERT INTO knowledge (text, created_at) VALUES (?, ?)').bind(fact, nowIso(now)).run();
      const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM knowledge').first())?.n || 1;
      return sendToOwner(env, `✓ למדתי (${n}): ${fact}\nמעכשיו אני עונה ככה ללקוחות. לבטל: שכח ${n}`, now);
    }

    case 'knowledge': {
      const rows = (await env.DB.prepare('SELECT text FROM knowledge ORDER BY id').all()).results;
      if (!rows.length) return sendToOwner(env, 'עוד לא לימדת אותי כלום. כתוב למשל: למד אני לא עובד בשבת, חוזר במוצאי שבת', now);
      return sendToOwner(env, `מה שלימדת אותי:\n${rows.map((r, i) => `${i + 1}. ${r.text}`).join('\n')}\n\nלמחוק: שכח ומספר. למשל: שכח 2`, now);
    }

    case 'forget': {
      const rows = (await env.DB.prepare('SELECT id, text FROM knowledge ORDER BY id').all()).results;
      const row = rows[c.n - 1];
      if (!row) return sendToOwner(env, `אין שורה ${c.n}. כתוב "מה למדת" לרשימה.`, now);
      await env.DB.prepare('DELETE FROM knowledge WHERE id = ?').bind(row.id).run();
      return sendToOwner(env, `✓ שכחתי: ${row.text}`, now);
    }

    case 'pause':
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('paused', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
      await logEvent(env, 'paused', null, now);
      return sendToOwner(env, '⏸ הבוט בהפסקה. הוא לא עונה ללקוחות, וכל הודעה מגיעה אליך. להחזיר: הפעל בוט', now);

    case 'resume':
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('paused', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
      await logEvent(env, 'resumed', null, now);
      return sendToOwner(env, '▶️ הבוט חזר לעבוד.', now);

    case 'status': {
      const dayStart = new Date(now.getTime() - 24 * 3600000).toISOString();
      const leads = (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'lead' AND created_at >= ?").bind(dayStart).first())?.n || 0;
      const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM conversations WHERE state = 'handoff' AND owner_replied_at IS NULL AND handed_off_at >= ?").bind(dayStart).first())?.n || 0;
      const talking = (await env.DB.prepare("SELECT COUNT(*) AS n FROM conversations WHERE state = 'bot' AND updated_at >= ?").bind(dayStart).first())?.n || 0;
      const jobs = (await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'open' AND scheduled_at >= ?").bind(nowIso(now)).first())?.n || 0;
      const errors = (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('ai_error','send_failed') AND created_at >= ?").bind(dayStart).first())?.n || 0;
      return sendToOwner(env, [
        (await isPaused(env)) ? '⏸ הבוט בהפסקה' : '▶️ הבוט פועל',
        `פניות ב-24 השעות האחרונות: ${leads}`,
        `הבוט מדבר עכשיו עם: ${talking}`,
        `מחכים לך (עוד לא טיפלת): ${waiting}`,
        `עבודות מתואמות קדימה: ${jobs}`,
        errors ? `תקלות ב-24 שעות: ${errors}` : 'תקלות: אין',
      ].join('\n'), now);
    }

    case 'eta': {
      const min = c.minutes || 30;
      const r = await sendToCustomer(env, c.phone, MESSAGES.eta(min), { name: TEMPLATES.eta, params: [String(min)] }, now);
      await logEvent(env, 'eta', c.phone, now);
      if (r.ok) await upsertLead(env, c.phone, { status: `חנן בדרך (כ-${min} דק׳)` }, now);
      return sendToOwner(env, r.ok ? `✓ נשלח ל-${displayPhone(c.phone)} שאתה בדרך (כ-${min} דק׳).` : `לא הצלחתי לשלוח ל-${displayPhone(c.phone)}.`, now);
    }

    case 'appt': {
      let dateStr = c.date;
      if (c.date === 'היום' || c.date === 'מחר') {
        const p = ilParts(c.date === 'מחר' ? new Date(now.getTime() + 86400000) : now);
        dateStr = `${p.d}/${p.m}/${p.y}`;
      }
      const at = parseIlDateTime(dateStr, c.time, now);
      if (!at) return sendToOwner(env, 'לא הבנתי את התאריך או השעה. כתוב למשל: תור 17/10 14:30', now);
      if (at.getTime() < now.getTime()) return sendToOwner(env, `התאריך והשעה כבר עברו (${whenLabel(at, now)}). כתוב שוב עם תאריך עתידי.`, now);
      const conv = await latestConv(env, c.phone);
      await env.DB.prepare('INSERT INTO jobs (phone, conv_id, issue, address, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(c.phone, conv?.id || null, conv?.issue || null, c.address || conv?.address || null, at.toISOString(), nowIso(now)).run();
      if (conv) await env.DB.prepare("UPDATE conversations SET followup_sent = 1 WHERE id = ?").bind(conv.id).run();
      await upsertLead(env, c.phone, { status: `תור נקבע: ${whenLabel(at, now)}`, address: c.address }, now);
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
      await upsertLead(env, c.phone, { status: 'עבודה הסתיימה', issue: job.issue, address: job.address }, now);
      return sendToOwner(env, `✓ סומן כגמור: ${displayPhone(c.phone)}. בעוד כמה שעות הלקוח יקבל בקשה לביקורת.`, now);
    }

    case 'receipt': {
      if (!FEATURES.receipts) return sendToOwner(env, 'שליחת קבלות דרך הבוט כבויה.', now);
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
      await upsertLead(env, c.phone, { status: 'חנן טיפל' }, now);
      return sendToOwner(env, `✓ סומן שטיפלת ב-${displayPhone(c.phone)}.`, now);

    case 'cancel': {
      await env.DB.prepare("UPDATE jobs SET status = 'cancelled' WHERE phone = ? AND status = 'open'").bind(c.phone).run();
      await upsertLead(env, c.phone, { status: 'עבודה בוטלה' }, now);
      return sendToOwner(env, `✓ בוטלה העבודה של ${displayPhone(c.phone)}.`, now);
    }

    case 'irrelevant': {
      const conv = await latestConv(env, c.phone);
      if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE id = ?").bind(conv.id).run();
      await upsertLead(env, c.phone, { status: 'לא רלוונטי' }, now);
      return sendToOwner(env, `✓ הפנייה של ${displayPhone(c.phone)} נסגרה, בלי מעקב.`, now);
    }

    case 'quiet': {
      await env.DB.prepare('INSERT INTO customers (phone, first_seen, known) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(c.phone, nowIso(now)).run();
      await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE phone = ? AND state IN ('bot','handoff')").bind(c.phone).run();
      return sendToOwner(env, `✓ ${displayPhone(c.phone)} סומן כמוכר. הבוט לא יענה לו. כדי להחזיר: בוט ${displayPhone(c.phone)}`, now);
    }

    case 'bot': {
      await env.DB.prepare('UPDATE customers SET known = 0, blocked = 0 WHERE phone = ?').bind(c.phone).run();
      const conv = await latestConv(env, c.phone);
      await sendToOwner(env, `✓ הבוט חזר לטפל ב-${displayPhone(c.phone)}.`, now);
      if (!conv) return;
      await env.DB.prepare("UPDATE conversations SET state = 'bot', updated_at = ?, owner_replied_at = NULL, customer_nudges = 0, owner_nudges = 0 WHERE id = ?").bind(nowIso(now), conv.id).run();
      // הלקוח כתב ולא קיבל תשובה (למשל סומן בטעות כספאם): הבוט עונה לו עכשיו
      const last = await env.DB.prepare("SELECT id, role, text FROM messages WHERE conv_id = ? AND role IN ('user','assistant','owner') ORDER BY id DESC LIMIT 1").bind(conv.id).first();
      if (last?.role === 'user') {
        const customer = await env.DB.prepare('SELECT * FROM customers WHERE phone = ?').bind(c.phone).first();
        const fresh = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conv.id).first();
        await aiRespond(env, { conv: fresh, phone: c.phone, customer, myId: last.id, content: { text: last.text }, now });
      }
      return;
    }

    case 'block': {
      await env.DB.prepare('INSERT INTO customers (phone, first_seen, blocked) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET blocked = 1').bind(c.phone, nowIso(now)).run();
      await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE phone = ? AND state IN ('bot','handoff')").bind(c.phone).run();
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
  const tip = '\nאם זו תשובה שתמיד נכונה, כתוב "למד" ואחריה את התשובה, והבוט יענה ככה בעצמו.';
  const learned = (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'relay'").first())?.n || 0;
  await logEvent(env, 'relay', phone, now);
  return sendToOwner(env, r.ok ? `✓ נשלח ל-${displayPhone(phone)}: "${String(text).slice(0, 60)}"${learned < 3 ? tip : ''}` : `לא הצלחתי לשלוח ל-${displayPhone(phone)}.`, now, phone);
}

// קבצים (כשהקבלות כבויות): קובץ בתשובה על לקוח נשלח אליו כמו שהוא
async function relayFileToCustomer(env, msg, now) {
  const phone = await contextPhone(env, msg);
  if (!phone) return sendToOwner(env, 'קיבלתי קובץ. כדי לשלוח אותו ללקוח, שלח אותו בתשובה (החלקה ימינה) על ההודעה שלו.', now);
  const cust = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(phone).first();
  if (!inServiceWindow(cust?.last_inbound_at, now)) {
    return sendToOwner(env, `הלקוח ${displayPhone(phone)} לא כתב ב-24 השעות האחרונות, ווואטסאפ לא מאפשר לשלוח לו קובץ. שלח לו מהטלפון שלך.`, now, phone);
  }
  try {
    const media = await wa.downloadMedia(env, msg.document.id);
    const id = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
    const r = await wa.sendDocument(env, phone, id, msg.document.filename || 'קובץ', msg.document.caption || '');
    await markOwnerReplied(env, phone, now);
    return sendToOwner(env, r.ok ? `✓ הקובץ נשלח ל-${displayPhone(phone)}.` : `לא הצלחתי לשלוח ל-${displayPhone(phone)}.`, now, phone);
  } catch (err) {
    console.error('owner file relay failed', err);
    return sendToOwner(env, `לא הצלחתי לשלוח את הקובץ ל-${displayPhone(phone)}.`, now, phone);
  }
}
