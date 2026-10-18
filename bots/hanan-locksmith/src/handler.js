// טיפול בהודעה נכנסת מלקוח, ובהודעות שחנן שולח מהאפליקציה (Coexistence).
import { runTurn } from './ai.js';
import { BUSINESS, MESSAGES, TEMPLATES, TIMING, msg as tmsg } from './config.js';
import { upsertLead } from './sheets.js';
import { displayPhone, ilDateTimeLabel, inServiceWindow, nowIso, wazeLink, addHours } from './util.js';
import * as wa from './whatsapp.js';
import { handleOwnerCommand } from './owner.js';
import { tableLink } from './table.js';
import { ownerHours } from './hours.js';
import { ownerByEmail, sendOwnerEmail } from './email.js';

const CONV_IDLE_HOURS = 72; // שיחה שלא זזה 3 ימים נחשבת סגורה, והודעה חדשה פותחת שיחה חדשה
// חנן כבר ענה ללקוח בעצמו, והשיחה שקטה 12 שעות: הודעה חדשה של הלקוח (למשל "אשמח לעוד עבודה") היא פנייה חדשה, והבוט עונה
const OWNER_HANDLED_IDLE_HOURS = 12;

// הבוט בהפסקה ("עצור בוט"): לא עונה ללקוחות, וכל הודעה עוברת ישר לחנן
export async function isPaused(env) {
  return (await env.DB.prepare("SELECT value FROM settings WHERE key = 'paused'").first())?.value === '1';
}

// השפה של הלקוח (נשמרת מהשיחה): he / en / ru / ar
export async function customerLang(env, phone) {
  return (await env.DB.prepare('SELECT lang FROM customers WHERE phone = ?').bind(phone).first())?.lang || 'he';
}

export async function logEvent(env, type, phone, now = new Date()) {
  await env.DB.prepare('INSERT INTO events (type, phone, created_at) VALUES (?, ?, ?)').bind(type, phone || null, nowIso(now)).run();
}

// שליחה ללקוח: טקסט חופשי בתוך חלון 24 שעות, אחרת תבנית מאושרת
export async function sendToCustomer(env, phone, text, template = null, now = new Date()) {
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(phone).first();
  if (inServiceWindow(c?.last_inbound_at, now)) return wa.sendText(env, phone, text);
  if (template) return wa.sendTemplate(env, phone, template.name, template.params || [], template.documentLink || null);
  console.warn('outside 24h window and no template, message not sent to', phone);
  return { ok: false };
}

// הודעה לחנן (למספר שהוגדר ב-OWNER_PHONE).
// about = הטלפון של הלקוח שההודעה עוסקת בו: אם חנן עונה (ציטוט) על ההודעה הזו, הבוט יודע על איזה לקוח מדובר
export async function sendToOwner(env, text, now = new Date(), about = null, to = env.OWNER_PHONE, opts = {}) {
  if (!to) return { ok: false };
  // לבעל העסק אין מספר וואטסאפ נפרד: הכל מגיע אליו במייל
  if (ownerByEmail(env) && to === env.OWNER_PHONE) return sendOwnerEmail(env, text, { about, now, retry: !!opts.retry });
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(to).first();
  const open = inServiceWindow(c?.last_inbound_at, now);
  const r = open
    ? await wa.sendText(env, to, text)
    : await wa.sendTemplate(env, to, TEMPLATES.ownerAlert, [templateText(text)]);
  // לא נשלח (UltraMsg לא מחובר וכו'): נשמר, וה-cron מנסה שוב כל 15 דקות
  if (!r.ok && wa.isUltra(env) && to === env.OWNER_PHONE && !opts.retry) {
    await env.DB.prepare('INSERT INTO owner_outbox (text, about, created_at, failed) VALUES (?, ?, ?, 1)').bind(text, about, nowIso(now)).run();
  }
  // נשלח בקיצור: שומרים את ההודעה המלאה לחנן, לרגע שהוא כותב לבוט או לוחץ "קיבלתי"
  if (!open && to === env.OWNER_PHONE) {
    await env.DB.prepare('INSERT INTO owner_outbox (text, about, created_at) VALUES (?, ?, ?)').bind(text, about, nowIso(now)).run();
  }
  const wamid = r.data?.messages?.[0]?.id;
  if (about && wamid) {
    await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(wamid, about, nowIso(now)).run();
  }
  if (about) await rememberRef(env, text, about, now);
  return r;
}

// UltraMsg: כשחנן עונה (ציטוט) על הודעה, מקבלים את הטקסט שלה ולא את המזהה. לכן זוכרים גם לפי הטקסט
export const refKey = (text) => `b:${String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`;
export async function rememberRef(env, text, about, now = new Date()) {
  if (!text || !about) return;
  await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(refKey(text), about, nowIso(now)).run();
}

// חנן כתב לבוט (או לחץ "קיבלתי"): שולחים לו במלואן את ההודעות והתמונות שהגיעו אליו בקיצור
export async function flushOwnerOutbox(env, now = new Date()) {
  const all = (await env.DB.prepare('SELECT * FROM owner_outbox WHERE sent = 0 AND created_at >= ? ORDER BY id DESC')
    .bind(new Date(now.getTime() - 48 * 3600000).toISOString()).all()).results;
  if (!all.length) return;
  await env.DB.prepare('UPDATE owner_outbox SET sent = 1 WHERE sent = 0').run();
  // החדשות קודם (פנייה דחופה של עכשיו חשובה יותר מאתמול). לכל היותר 5, כדי לא לעבור את המגבלות של השרת
  const items = all.slice(0, 5).reverse();
  if (all.length > 5) await wa.sendText(env, env.OWNER_PHONE, `יש עוד ${all.length - 5} הודעות ישנות יותר. הנה ה-5 האחרונות:`);
  for (const it of items) {
    if (it.text) {
      const r = await wa.sendText(env, env.OWNER_PHONE, it.text);
      const wamid = r.data?.messages?.[0]?.id;
      if (it.about && wamid) await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(wamid, it.about, nowIso(now)).run();
    }
    if (it.media) await forwardPhotosToOwner(env, JSON.parse(it.media).slice(0, 2), now, it.about);
  }
}

// משתנה בתבנית: וואטסאפ לא מרשים ירידות שורה, טאבים או יותר מ-4 רווחים ברצף
export function templateText(text) {
  return String(text).replace(/[\t\r]+/g, ' ').replace(/\n+/g, ' | ').replace(/ {4,}/g, '   ').trim().slice(0, 850);
}

async function extractContent(env, msg) {
  switch (msg.type) {
    case 'text':
      return { text: msg.text?.body || '' };
    case 'image': {
      return {
        text: msg.image.caption ? `[שלחתי תמונה] ${msg.image.caption}` : '[שלחתי תמונה]',
        image: await imageForAi(env, msg.image.id),
        photoId: msg.image.id,
      };
    }
    case 'video':
      // ה-AI לא רואה סרטונים: חנן מקבל את הסרטון עצמו, וה-AI יודע שנשלח סרטון
      return { text: msg.video?.caption ? `[שלחתי סרטון] ${msg.video.caption}` : '[שלחתי סרטון]', photoId: `video:${msg.video?.id}` };
    case 'audio': {
      try {
        const media = await wa.downloadMedia(env, msg.audio.id);
        const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
          audio: wa.toBase64(media.bytes),
          vad_filter: true,
          initial_prompt: 'הודעה קולית ללקוח של מנעולן: דלת, מנעול, צילינדר, פריצה, כתובת.',
        });
        const transcript = String(out?.text || '').trim();
        return { text: transcript ? `[הודעה קולית] ${transcript}` : '[שלחתי הודעה קולית שלא הצלחתם לשמוע]', voice: true };
      } catch (err) {
        console.error('voice transcription failed', err);
        return { text: '[שלחתי הודעה קולית שלא הצלחתם לשמוע]', voice: true };
      }
    }
    case 'location': {
      const l = msg.location || {};
      const addr = [l.name, l.address].filter(Boolean).join(', ');
      return { text: `[שלחתי מיקום] ${addr}`.trim(), location: wazeLink({ lat: l.latitude, lng: l.longitude }) };
    }
    case 'button':
      return { text: msg.button?.text || '' };
    case 'interactive':
      return { text: msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '' };
    default:
      return { text: `[שלחתי ${msg.type}]` };
  }
}

async function getOrCreateConversation(env, phone, now) {
  const open = () => env.DB.prepare("SELECT * FROM conversations WHERE phone = ? AND state IN ('bot','handoff') ORDER BY id DESC LIMIT 1").bind(phone).first();
  const conv = await open();
  const idleHours = conv ? (now.getTime() - new Date(conv.updated_at).getTime()) / 3600000 : 0;
  const ownerDone = conv?.state === 'handoff' && conv.owner_replied_at && idleHours >= OWNER_HANDLED_IDLE_HOURS && !conv.summary_due_at;
  if (conv && idleHours < CONV_IDLE_HOURS && !ownerDone) return { conv, isNew: false };
  if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed' WHERE id = ?").bind(conv.id).run();
  // אם הודעה אחרת של אותו לקוח פתחה שיחה באותו רגע, האינדקס הייחודי מונע שיחה כפולה
  const res = await env.DB.prepare('INSERT OR IGNORE INTO conversations (phone, started_at, updated_at) VALUES (?, ?, ?)').bind(phone, nowIso(now), nowIso(now)).run();
  return { conv: await open(), isNew: !!res.meta?.changes };
}

export function ownerSummary(conv, result, phone, now) {
  // הסדר שחנן ביקש: כתובת מדויקת, סוג התקלה, שם וטלפון, דחיפות, תמונות
  const nav = conv.location || wazeLink({ address: result.address || conv.address });
  const lines = [
    result.urgent ? '🚨 פנייה דחופה!' : '🔔 פנייה חדשה',
    `כתובת: ${result.address || conv.address || '(לא נמסרה)'}`,
    ...(nav ? [`ניווט: ${nav}`] : []),
    `תקלה: ${result.issue || conv.issue || '(לא פורט)'}`,
    `שם: ${result.customer_name || '(לא נמסר)'}`,
    `טלפון: ${displayPhone(phone)}`,
  ];
  if (result.urgent && result.urgent_reason) lines.push(`למה דחוף: ${result.urgent_reason}`);
  if (result.summary_for_owner) lines.push('', result.summary_for_owner);
  lines.push('', `וואטסאפ ללקוח: https://wa.me/${phone}`, `התקבל: ${ilDateTimeLabel(now)}`);
  return lines.join('\n');
}

// הודעה לחנן יחד עם התמונות. במייל: הכל באותו מייל
export async function notifyOwner(env, text, media, now = new Date(), about = null) {
  if (ownerByEmail(env)) return sendOwnerEmail(env, text, { about, media, now });
  await sendToOwner(env, text, now, about);
  if (media.length) await forwardPhotosToOwner(env, media, now, about);
}

export async function forwardPhotosToOwner(env, photoIds, now = new Date(), about = null) {
  if (!photoIds.length) return;
  if (ownerByEmail(env)) {
    const what = photoIds.length === 1 ? 'תמונה' : `${photoIds.length} תמונות`;
    return sendOwnerEmail(env, `📷 ${what} מהלקוח${about ? ` ${displayPhone(about)}` : ''}`, { about, media: photoIds, now });
  }
  if (!env.OWNER_PHONE) return;
  // תמונה אפשר לשלוח רק בתוך 24 שעות מההודעה האחרונה של חנן לבוט. אחרת: מסבירים לו איך לקבל אותן
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(env.OWNER_PHONE).first();
  if (!inServiceWindow(c?.last_inbound_at, now)) {
    await env.DB.prepare('INSERT INTO owner_outbox (about, media, created_at) VALUES (?, ?, ?)').bind(about, JSON.stringify(photoIds), nowIso(now)).run();
    if (about) {
      const what = photoIds.length === 1 ? 'תמונה' : `${photoIds.length} תמונות`;
      const r = await wa.sendTemplate(env, env.OWNER_PHONE, TEMPLATES.ownerAlert, [templateText(`הלקוח ${displayPhone(about)} שלח ${what}. אפשר גם לכתוב לי: תמונות ${displayPhone(about)}`)]);
      const wamid = r.data?.messages?.[0]?.id;
      if (wamid) await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(wamid, about, nowIso(now)).run();
    }
    return;
  }
  for (const id of photoIds) {
    try {
      const isVideo = String(id).startsWith('video:');
      // הטלפון של הלקוח בכיתוב: אם חנן עונה על התמונה, הבוט יודע למי
      const caption = `${isVideo ? 'סרטון' : 'תמונה'} מהלקוח${about ? ` ${displayPhone(about)} · wa.me/${about}` : ''}`;
      if (about) await rememberRef(env, caption, about, now);
      const realId = isVideo ? String(id).slice(6) : id;
      // UltraMsg: הקובץ כבר בקישור, שולחים אותו ישר בלי להוריד
      if (wa.isUltra(env)) {
        await (isVideo ? wa.sendVideoById(env, env.OWNER_PHONE, realId, caption) : wa.sendImageById(env, env.OWNER_PHONE, realId, caption));
        continue;
      }
      const media = await wa.downloadMedia(env, realId);
      if (isVideo) {
        const vid = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
        await wa.sendVideoById(env, env.OWNER_PHONE, vid, caption);
        continue;
      }
      const newId = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
      await wa.sendImageById(env, env.OWNER_PHONE, newId, caption);
    } catch (err) {
      console.error('forward photo failed', err);
    }
  }
}

// הודעות שאין מה לעשות איתן: תגובות (לייק), הודעות מערכת, הודעות שנמחקו
const IGNORED_TYPES = new Set(['reaction', 'system', 'unsupported', 'ephemeral', 'request_welcome']);
// לקוח שמבקש להפסיק לקבל הודעות (חובה לפי הכללים של וואטסאפ)
const OPT_OUT = /^\s*(הסר|הסירו|הסירו אותי|תסירו|תסירו אותי|הסרה|stop|unsubscribe|תפסיקו לשלוח|אל תשלחו לי)\s*[.!]*\s*$/i;
// כמה לחכות לפני תשובה, כדי לאסוף כמה הודעות ששולחים ברצף לתשובה אחת
const burstWaitMs = (env) => (env.BURST_WAIT_MS != null ? +env.BURST_WAIT_MS : 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function handleInbound(env, msg, contactName, now = new Date()) {
  const phone = msg.from;
  if (IGNORED_TYPES.has(msg.type)) return;
  // הודעה בלי שום אות או מספר (ריקה, רק "?", ".", אימוג'י, 👍): לא עונים עליה ולא מבזבזים קריאה ל-AI
  if (msg.type === 'text' && !/[\p{L}\p{N}]/u.test(msg.text?.body || '')) return;
  // מצב בדיקה (TEST_PHONES = רשימת מספרים מופרדת בפסיקים): הבוט עונה רק להם ולחנן, וכל השאר לא מקבלים כלום
  if (env.TEST_PHONES && phone !== env.OWNER_PHONE && phone !== env.ADMIN_PHONE
    && !String(env.TEST_PHONES).split(',').map((p) => p.trim()).includes(phone)) return;

  // הודעה שכבר טופלה (Meta לפעמים שולחים פעמיים)
  const dup = await env.DB.prepare('SELECT 1 FROM messages WHERE wa_id = ?').bind(msg.id).first();
  if (dup) return;

  // לקוח: יצירה או עדכון
  await env.DB.prepare(
    `INSERT INTO customers (phone, name, first_seen, last_inbound_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET last_inbound_at = excluded.last_inbound_at, name = COALESCE(customers.name, excluded.name)`,
  ).bind(phone, contactName || null, nowIso(now), nowIso(now)).run();

  // פקודות מחנן (ומאריאל: מנהל המערכת יכול לשלוח את אותן פקודות)
  if ((env.OWNER_PHONE && phone === env.OWNER_PHONE) || (env.ADMIN_PHONE && phone === env.ADMIN_PHONE)) {
    const ownerText = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '';
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (0, 'owner', ?, ?, ?)").bind(ownerText || `[${msg.type}]`, msg.id, nowIso(now)).run();
    if (phone === env.OWNER_PHONE) await flushOwnerOutbox(env, now);
    await handleOwnerCommand(env, ownerText, now, msg, phone);
    return;
  }

  const customer = await env.DB.prepare('SELECT * FROM customers WHERE phone = ?').bind(phone).first();
  if (customer?.blocked) return;

  // אנשים שחנן כבר מדבר איתם (חברים, ספקים, לקוחות קבועים): הבוט שותק, וחנן רואה את ההודעה באפליקציה שלו
  if (customer?.known) {
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (0, 'user', ?, ?, ?)").bind(msg.text?.body || `[${msg.type}]`, msg.id, nowIso(now)).run();
    if (env.FORWARD_KNOWN === '1') await sendToOwner(env, `💬 ${displayPhone(phone)} (מוכר) כתב/ה: ${msg.text?.body || `[${msg.type}]`}`, now, phone);
    return;
  }

  // הסרה מרשימת התפוצה: לא שולחים לו יותר תזכורות, מעקבים, ביקורות והמלצות
  const optText = msg.type === 'text' ? msg.text?.body : msg.type === 'button' ? msg.button?.text : '';
  if (optText && (OPT_OUT.test(optText) || (msg.type === 'button' && /stop|הפסק|הסר/i.test(optText)))) {
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (0, 'user', ?, ?, ?)").bind(optText, msg.id, nowIso(now)).run();
    await env.DB.prepare('UPDATE customers SET opted_out = 1 WHERE phone = ?').bind(phone).run();
    await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE phone = ? AND state IN ('bot','handoff')").bind(phone).run();
    await wa.sendText(env, phone, tmsg(await customerLang(env, phone), 'optedOut'));
    await logEvent(env, 'opt_out', phone, now);
    return;
  }

  wa.markRead(env, msg.id).catch(() => {});
  const content = await extractContent(env, msg);
  if (content.voice) await logEvent(env, 'voice', phone, now);

  // מספר שסומן כספאם ביממה האחרונה: ההודעה עדיין נבדקת (אולי ה-AI טעה), אבל לא נספרת כפנייה חדשה
  const recentSpam = await env.DB.prepare("SELECT 1 FROM conversations WHERE phone = ? AND state = 'spam' AND updated_at >= ? LIMIT 1")
    .bind(phone, new Date(now.getTime() - 24 * 3600000).toISOString()).first();
  const { conv, isNew } = await getOrCreateConversation(env, phone, now);
  if (isNew && !recentSpam) await logEvent(env, 'lead', phone, now);

  const ins = await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, media_id, created_at) VALUES (?, 'user', ?, ?, ?, ?)")
    .bind(conv.id, content.text, msg.id, content.photoId || null, nowIso(now)).run();
  const myId = ins.meta?.last_row_id;
  if (content.photoId) {
    await env.DB.prepare("UPDATE conversations SET photos = json_insert(photos, '$[#]', ?) WHERE id = ?").bind(content.photoId, conv.id).run();
  }
  await env.DB.prepare('UPDATE conversations SET updated_at = ?, location = COALESCE(?, location) WHERE id = ?')
    .bind(nowIso(now), content.location || null, conv.id).run();

  // אחרי ההעברה לחנן:
  // - חנן עוד לא ענה: הבוט ממשיך לדבר עם הלקוח (ממשיך למטה), ושולח לחנן רק עדכון כשיש משהו חדש וחשוב
  // - חנן כבר ענה ללקוח: הוא מטפל. כשהמספר משותף לאפליקציה שלו (UltraMsg / 360dialog / Dualhook) הוא רואה את ההודעות שם, אז הבוט שותק
  const paused = await isPaused(env);
  if (!paused && conv.state === 'handoff' && conv.owner_replied_at && wa.sharesOwnerApp(env)) return;
  // בוט בהפסקה, או חנן ענה בלי אפליקציה משותפת: כל הודעה מגיעה אליו כמו שהיא
  if (paused || (conv.state === 'handoff' && conv.owner_replied_at)) {
    await sendToOwner(env, `💬 ${customer?.name || ''} ${displayPhone(phone)} כתב/ה: ${content.text}`.trim(), now, phone);
    if (content.photoId) await forwardPhotosToOwner(env, [content.photoId], now, phone);
    const lastBot = await env.DB.prepare("SELECT text, created_at FROM messages WHERE conv_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").bind(conv.id).first();
    const waitingText = tmsg(customer?.lang || 'he', 'waitingForOwner');
    const recentlySaid = lastBot && lastBot.text === waitingText && (now.getTime() - new Date(lastBot.created_at).getTime()) < 30 * 60000;
    if (!recentlySaid) {
      await wa.sendText(env, phone, waitingText);
      await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, waitingText, nowIso(now)).run();
    }
    return;
  }

  // הגנה מלולאה (למשל מענה אוטומטי של הלקוח שעונה לבוט שוב ושוב): יותר מ-12 תשובות של הבוט בשעה → עוצרים ומעבירים לחנן
  const botReplies = (await env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE conv_id = ? AND role = 'assistant' AND created_at >= ?").bind(conv.id, new Date(now.getTime() - 3600000).toISOString()).first())?.n || 0;
  if (botReplies >= 12) {
    const moved = await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = COALESCE(handed_off_at, ?), owner_replied_at = COALESCE(owner_replied_at, ?) WHERE id = ? AND state IN ('bot','handoff')").bind(nowIso(now), nowIso(now), conv.id).run();
    if (moved.meta?.changes) await sendToOwner(env, `⚠️ השיחה עם ${displayPhone(phone)} ארוכה מדי (אולי מענה אוטומטי). הבוט הפסיק לענות לו. אם זה לקוח אמיתי, כדאי לחזור אליו. וואטסאפ: https://wa.me/${phone}`, now, phone);
    return;
  }

  // לקוחות שולחים כמה הודעות ברצף (טקסט, תמונה, עוד טקסט). מחכים רגע, ורק ההודעה האחרונה מקבלת תשובה, על הכל ביחד
  const wait = burstWaitMs(env);
  if (wait > 0) {
    await sleep(wait);
    const latest = await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'user'").bind(conv.id).first();
    if (latest?.id !== myId) return;
  }

  await aiRespond(env, { conv, phone, customer, contactName, myId, content, now });
}

// ה-AI עונה ללקוח על כל מה שכתב עד עכשיו (myId = ההודעה האחרונה שלו)
export async function aiRespond(env, { conv, phone, customer, contactName = '', myId, content, now = new Date() }) {
  const afterHandoff = conv.state === 'handoff';
  const lastBotBefore = (await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'assistant'").bind(conv.id).first())?.id || 0;
  // תמונה שנשלחה ברצף הזה (אם לא בהודעה הנוכחית): ה-AI רואה גם אותה
  let image = content.image || null;
  if (!image) {
    const lastBotId = (await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'assistant'").bind(conv.id).first())?.id || 0;
    const pending = await env.DB.prepare("SELECT media_id FROM messages WHERE conv_id = ? AND role = 'user' AND media_id IS NOT NULL AND id > ? ORDER BY id DESC LIMIT 1").bind(conv.id, lastBotId).first();
    if (pending?.media_id) image = await imageForAi(env, pending.media_id);
  }

  // שיחה עם ה-AI
  const history = (await env.DB.prepare("SELECT role, text FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 30").bind(conv.id).all()).results.reverse();
  const returning = customer && customer.jobs_count > 0 ? customer : null;
  const knowledge = (await env.DB.prepare('SELECT text FROM knowledge ORDER BY id').all()).results.map((r) => r.text);
  const result = await runTurn(env, { history, image, now, returningCustomer: returning, profileName: contactName || customer?.name || '', knowledge, afterHandoff });
  if (result.failed) await reportAiFailure(env, phone, result.summary_for_owner, now);

  // בזמן שה-AI חשב, הלקוח כתב עוד הודעה: היא תקבל תשובה על הכל ביחד
  const newest = await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'user'").bind(conv.id).first();
  if (newest?.id !== myId) return;

  if (afterHandoff) return afterHandoffTurn(env, { conv, phone, customer, contactName, content, result, lastBotBefore, now });

  // בזמן שה-AI חשב, השיחה עברה לחנן (הודעה קודמת, או שחנן ענה מהאפליקציה): ההודעה הזו עוברת אליו
  const state = (await env.DB.prepare('SELECT state FROM conversations WHERE id = ?').bind(conv.id).first())?.state;
  if (state !== 'bot') {
    // הסיכום לחנן עוד מחכה לסוף השיחה: הפרטים נכנסים אליו, בלי הודעה נפרדת
    const pend = await env.DB.prepare('SELECT summary_due_at FROM conversations WHERE id = ?').bind(conv.id).first();
    if (state === 'handoff' && pend?.summary_due_at) {
      await env.DB.prepare('UPDATE conversations SET issue = COALESCE(NULLIF(?, \'\'), issue), address = COALESCE(NULLIF(?, \'\'), address), urgent = MAX(urgent, ?) WHERE id = ?')
        .bind(result.issue, result.address, result.urgent ? 1 : 0, conv.id).run();
      await scheduleSummary(env, conv.id, { kind: 'new', note: result.summary_for_owner }, now);
      if (result.urgent) await flushSummary(env, conv.id, now, { urgent_reason: result.urgent_reason });
      return;
    }
    if (state === 'handoff') {
      await sendToOwner(env, `${result.urgent ? '🚨 דחוף! ' : ''}💬 ${customer?.name || ''} ${displayPhone(phone)} כתב/ה: ${content.text}`.trim(), now, phone);
      if (content.photoId) await forwardPhotosToOwner(env, [content.photoId], now, phone);
      if (result.urgent) await env.DB.prepare('UPDATE conversations SET urgent = 1 WHERE id = ?').bind(conv.id).run();
    }
    return;
  }

  if (result.category === 'spam') {
    await env.DB.prepare("UPDATE conversations SET state = 'spam', updated_at = ? WHERE id = ?").bind(nowIso(now), conv.id).run();
    // הודעה אחת לחנן ביממה על כל מספר ספאם, לא אחת על כל הודעה
    const notified = await env.DB.prepare("SELECT 1 FROM events WHERE type = 'spam' AND phone = ? AND created_at >= ?").bind(phone, new Date(now.getTime() - 24 * 3600000).toISOString()).first();
    await logEvent(env, 'spam', phone, now);
    if (notified) return;
    // חנן תמיד יודע, למקרה שה-AI טעה. בלילה ובשבת: ההודעה מחכה לו ומגיעה כשהוא כותב לבוט
    const note = `סיננתי כספאם הודעה מ-${displayPhone(phone)}: "${String(content.text).slice(0, 120)}". ${ownerByEmail(env) ? 'אם זה לקוח, לחץ למטה "בדרך / תור / סיימתי" ואז "שהבוט יענה לו".' : 'אם זה לקוח, ענה על ההודעה הזו: בוט'}`;
    if (ownerHours(now)) await sendToOwner(env, note, now, phone);
    else await env.DB.prepare('INSERT INTO owner_outbox (text, about, created_at) VALUES (?, ?, ?)').bind(note, phone, nowIso(now)).run();
    return;
  }

  // לקוח שביקש הסרה וחזר עם פנייה אמיתית: חוזר להיות לקוח רגיל (תודה או אישור לא מספיקים)
  if (customer?.opted_out && result.category === 'service' && (result.issue || result.ready_for_handoff) && !result.customer_done) {
    await env.DB.prepare('UPDATE customers SET opted_out = 0 WHERE phone = ?').bind(phone).run();
  }

  if (result.reply) {
    // נשמר רק אם נשלח: אחרת ה-cron רואה שהלקוח לא קיבל תשובה ומעביר לחנן
    const sentReply = await wa.sendText(env, phone, result.reply);
    if (sentReply.ok) await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, result.reply, nowIso(now)).run();
  }
  if (result.customer_name) await env.DB.prepare('UPDATE customers SET name = ? WHERE phone = ?').bind(result.customer_name, phone).run();
  if (result.language) await env.DB.prepare('UPDATE customers SET lang = ? WHERE phone = ?').bind(result.language, phone).run();
  await env.DB.prepare('UPDATE conversations SET issue = COALESCE(NULLIF(?, \'\'), issue), address = COALESCE(NULLIF(?, \'\'), address), urgent = MAX(urgent, ?) WHERE id = ?')
    .bind(result.issue, result.address, result.urgent ? 1 : 0, conv.id).run();
  // שאלה שהבוט לא ידע לענות: נכנסת לסיכום לחנן, והסיכום יוצא גם אם עוד חסרים פרטים. הבוט ממשיך את השיחה
  if (result.question_for_owner) {
    await addOwnerQuestion(env, conv.id, result.question_for_owner);
    if (!result.customer_done) result.ready_for_handoff = true;
  }

  // הלקוח כבר לא צריך: סוגרים בלי תזכורות ובלי מעקב
  if (result.customer_done && !result.ready_for_handoff) {
    await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1, customer_nudges = 9 WHERE id = ?").bind(conv.id).run();
    await logEvent(env, 'customer_done', phone, now);
    await upsertLead(env, phone, { status: 'הלקוח ויתר', name: customer?.name || contactName || '', issue: result.issue, address: result.address, note: result.summary_for_owner }, now);
    return;
  }

  if (result.ready_for_handoff) {
    // רק פעם אחת: אם שתי הודעות הגיעו ביחד, רק אחת מעבירה לחנן
    const moved = await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ? AND state = 'bot'")
      .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
    if (!moved.meta?.changes) {
      // תור אחר כבר העביר לחנן. אם הסיכום עוד מחכה, הוא פשוט יכלול גם את זה
      if ((await env.DB.prepare('SELECT summary_due_at FROM conversations WHERE id = ?').bind(conv.id).first())?.summary_due_at) {
        await scheduleSummary(env, conv.id, { kind: 'new', note: result.summary_for_owner }, now);
        if (result.urgent) await flushSummary(env, conv.id, now, { urgent_reason: result.urgent_reason });
        return;
      }
      await sendToOwner(env, `${result.urgent ? '🚨 דחוף! ' : ''}💬 ${displayPhone(phone)} כתב/ה: ${content.text}`, now, phone);
      return;
    }
    // הסיכום לחנן לא יוצא מיד: הבוט ממשיך לדבר עם הלקוח, וחנן מקבל דוח אחד כשהלקוח סיים לכתוב.
    // דחוף: מיד
    await scheduleSummary(env, conv.id, { kind: 'new', note: result.summary_for_owner }, now);
    if (result.urgent) await flushSummary(env, conv.id, now, { urgent_reason: result.urgent_reason });
  }
}

// הלקוח כותב אחרי שהפנייה כבר אצל חנן (וחנן עוד לא ענה): הבוט ממשיך את השיחה בעצמו,
// וחנן מקבל סיכום מעודכן אחד רק כשהבוט סיים לאסוף את מה שהשתנה (או מיד, אם זה דחוף). לא הודעה על כל הודעה
async function afterHandoffTurn(env, { conv, phone, customer, contactName, content, result, lastBotBefore, now }) {
  const fresh = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conv.id).first();
  if (fresh?.state !== 'handoff') return;
  const name = result.customer_name || customer?.name || contactName || '';
  // ה-AI לא ענה: לא משאירים את הלקוח בלי כלום, וחנן מקבל את ההודעה כמו שהיא
  if (result.failed) {
    await sendToOwner(env, `💬 ${`${name} ${displayPhone(phone)}`.trim()} כתב/ה: ${content.text}`, now, phone);
    if (content.photoId) await forwardPhotosToOwner(env, [content.photoId], now, phone);
    return;
  }
  // חנן ענה בזמן שה-AI חשב: הוא מטפל
  if (fresh.owner_replied_at && wa.sharesOwnerApp(env)) return;
  if (result.reply) {
    const sentReply = await wa.sendText(env, phone, result.reply);
    if (sentReply.ok) await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, result.reply, nowIso(now)).run();
  }
  if (result.customer_name) await env.DB.prepare('UPDATE customers SET name = ? WHERE phone = ?').bind(result.customer_name, phone).run();
  await env.DB.prepare('UPDATE conversations SET issue = COALESCE(NULLIF(?, \'\'), issue), address = COALESCE(NULLIF(?, \'\'), address), urgent = MAX(urgent, ?) WHERE id = ?')
    .bind(result.issue, result.address, result.urgent ? 1 : 0, conv.id).run();
  const becameUrgent = result.urgent && !fresh.urgent;
  if (result.question_for_owner) {
    await addOwnerQuestion(env, conv.id, result.question_for_owner);
    result.ready_for_handoff = true;
  }
  // הסיכום לחנן עוד לא יצא (הלקוח עדיין באמצע השיחה): כל מה שנאסף נכנס לסיכום אחד, והשעון מתחיל מחדש
  if (fresh.summary_due_at) {
    if (result.customer_done && fresh.summary_kind === 'new') {
      // הלקוח ויתר לפני שחנן שמע עליו: לא מטרידים את חנן בכלל
      await env.DB.prepare("UPDATE conversations SET summary_due_at = NULL, state = 'closed', followup_sent = 1, customer_nudges = 9 WHERE id = ?").bind(conv.id).run();
      await logEvent(env, 'customer_done', phone, now);
      await upsertLead(env, phone, { status: 'הלקוח ויתר', name, issue: updatedIssue(fresh, result), address: result.address || fresh.address, note: result.summary_for_owner }, now);
      return;
    }
    const kind = result.customer_done ? 'cancel' : (result.ready_for_handoff ? 'update' : fresh.summary_kind);
    await scheduleSummary(env, conv.id, { kind, note: result.summary_for_owner || (result.customer_done ? 'הלקוח כתב שכבר לא צריך.' : '') }, now);
    if (becameUrgent) await flushSummary(env, conv.id, now, { becameUrgent: true, urgent_reason: result.urgent_reason });
    return;
  }
  if (!result.ready_for_handoff && !becameUrgent && !result.customer_done) return; // עדיין אוסף פרטים, או סתם תודה
  await scheduleSummary(env, conv.id, { kind: result.customer_done ? 'cancel' : 'update', note: result.summary_for_owner || (result.customer_done ? 'הלקוח כתב שכבר לא צריך.' : '') }, now);
  if (becameUrgent) await flushSummary(env, conv.id, now, { becameUrgent: true, urgent_reason: result.urgent_reason });
}

const updatedIssue = (conv, result) => result.issue || conv.issue || '';

async function addOwnerQuestion(env, convId, q) {
  await env.DB.prepare("UPDATE conversations SET owner_questions = CASE WHEN owner_questions IS NULL OR owner_questions = '' THEN ? ELSE owner_questions || char(10) || ? END WHERE id = ?")
    .bind(String(q).slice(0, 300), String(q).slice(0, 300), convId).run();
}

// השאלות שהלקוח מחכה להן, בראש ההודעה לחנן
function withQuestions(text, conv) {
  const qs = String(conv.owner_questions || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (!qs.length) return text;
  const lines = text.split('\n');
  lines.splice(1, 0, `❓ הלקוח מחכה לתשובה ממך: ${qs.join(' / ')}`);
  return lines.join('\n');
}

// כמה דקות של שקט מהלקוח לפני שחנן מקבל את הסיכום. ככה הוא מקבל דוח אחד בסוף השיחה, לא הודעה על כל הודעה
const settleMinutes = (env) => (env.SUMMARY_SETTLE_MIN != null && env.SUMMARY_SETTLE_MIN !== '' ? +env.SUMMARY_SETTLE_MIN : 3);
// וגם אם הלקוח ממשיך לכתוב בלי הפסקה, חנן לא מחכה יותר מזה
const SETTLE_CAP_MINUTES = 15;

// קובע (או דוחה) את הסיכום לחנן. כל הודעה של הלקוח מתחילה את השעון מחדש
async function scheduleSummary(env, convId, { kind, note = '' }, now) {
  const c = await env.DB.prepare('SELECT summary_due_at, summary_since, summary_kind FROM conversations WHERE id = ?').bind(convId).first();
  const pending = !!c?.summary_due_at;
  const since = pending ? c.summary_since : nowIso(now);
  // פנייה חדשה שעוד לא נשלחה נשארת "פנייה חדשה" גם אם הלקוח הוסיף פרטים
  const finalKind = pending && c.summary_kind === 'new' ? 'new' : kind;
  const due = new Date(Math.min(now.getTime() + settleMinutes(env) * 60000, new Date(since).getTime() + SETTLE_CAP_MINUTES * 60000)).toISOString();
  await env.DB.prepare("UPDATE conversations SET summary_due_at = ?, summary_since = ?, summary_kind = ?, owner_note = COALESCE(NULLIF(?, ''), owner_note) WHERE id = ?")
    .bind(due, since, finalKind, note || '', convId).run();
  if (settleMinutes(env) <= 0) await flushSummary(env, convId, now);
}

// שולח לחנן את הסיכום שמחכה (נקרא מה-cron כל דקה, או מיד כשזה דחוף)
export async function flushSummary(env, convId, now = new Date(), extra = {}) {
  const c = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(convId).first();
  if (!c?.summary_due_at) return;
  // רק פעם אחת, גם אם שני תהליכים הגיעו ביחד
  const claim = await env.DB.prepare('UPDATE conversations SET summary_due_at = NULL WHERE id = ? AND summary_due_at = ?').bind(convId, c.summary_due_at).run();
  if (!claim.meta?.changes) return;
  const phone = c.phone;
  const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(phone).first();
  const name = cust?.name || '';
  const urgent = !!c.urgent;
  const res = { customer_name: name, urgent, urgent_reason: extra.urgent_reason || '', summary_for_owner: c.owner_note || '' };

  if (c.summary_kind === 'new') {
    await logEvent(env, urgent ? 'urgent' : 'handoff', phone, now);
    // הודעות קוליות: חנן מקבל את התמלול המלא, לא רק את הסיכום של ה-AI
    const voices = (await env.DB.prepare("SELECT text FROM messages WHERE conv_id = ? AND role = 'user' AND text LIKE '[הודעה קולית]%' ORDER BY id").bind(convId).all()).results;
    const voiceText = voices.map((v) => v.text.replace('[הודעה קולית] ', '🎤 ')).join('\n');
    const table = await tableLink(env);
    const summaryText = withQuestions(ownerSummary(c, res, phone, now), c) + (table ? `\nכל הלקוחות בטבלה: ${table}` : '');
    await env.DB.prepare("UPDATE conversations SET owner_questions = NULL WHERE id = ?").bind(convId).run();
    await notifyOwner(env, voiceText ? `${summaryText}\n\nמה נאמר בהקלטה:\n${voiceText}` : summaryText, JSON.parse(c.photos || '[]'), now, phone);
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner_update', '', ?)").bind(convId, nowIso(now)).run();
    // התזכורות לחנן נספרות מרגע שהסיכום הגיע אליו
    await env.DB.prepare('UPDATE conversations SET handed_off_at = ? WHERE id = ?').bind(nowIso(now), convId).run();
    await upsertLead(env, phone, { status: urgent ? 'דחוף, הועבר לחנן' : 'הועבר לחנן', name, issue: c.issue || '', address: c.address || '', urgent, note: c.owner_note || '' }, now);
    return;
  }

  // עדכון לפנייה שחנן כבר קיבל: סיכום מעודכן אחד, עם התמונות שהגיעו מאז הסיכום הקודם
  const cancel = c.summary_kind === 'cancel';
  const lastUpdate = (await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'owner_update'").bind(convId).first())?.id || 0;
  const media = (await env.DB.prepare("SELECT media_id FROM messages WHERE conv_id = ? AND role = 'user' AND media_id IS NOT NULL AND id > ? ORDER BY id").bind(convId, lastUpdate).all()).results.map((r) => r.media_id);
  const hasQ = !!String(c.owner_questions || '').trim();
  const body = withQuestions(ownerSummary(c, res, phone, now)
    .replace(/^(🔔 פנייה חדשה|🚨 פנייה דחופה!)/, extra.becameUrgent ? '🚨 עדכון דחוף לפנייה' : (cancel ? '❎ הלקוח ביטל' : (hasQ ? '❓ שאלה חדשה מהלקוח' : '🔄 עדכון לפנייה'))), c);
  await env.DB.prepare("UPDATE conversations SET owner_questions = NULL WHERE id = ?").bind(convId).run();
  await notifyOwner(env, body, media, now, phone);
  await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner_update', '', ?)").bind(convId, nowIso(now)).run();
  if (cancel) {
    await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE id = ?").bind(convId).run();
    await upsertLead(env, phone, { status: 'הלקוח ויתר' }, now);
  } else {
    await upsertLead(env, phone, { status: urgent && extra.becameUrgent ? 'דחוף, הועבר לחנן' : 'עודכן לחנן', issue: c.issue || '', address: c.address || '', urgent, note: c.owner_note || '' }, now);
  }
}

// כל הסיכומים שהגיע הזמן שלהם (cron כל דקה)
export async function flushDueSummaries(env, now = new Date()) {
  const due = (await env.DB.prepare('SELECT id FROM conversations WHERE summary_due_at IS NOT NULL AND summary_due_at <= ?').bind(nowIso(now)).all()).results;
  for (const r of due) {
    try { await flushSummary(env, r.id, now); } catch (err) { console.error('summary flush failed', r.id, err); }
  }
}

// תמונה שהלקוח שלח, בשביל ה-AI (תמונות גדולות מדי לא שולחים ל-AI, אבל חנן מקבל אותן)
async function imageForAi(env, mediaId) {
  try {
    const media = await wa.downloadMedia(env, mediaId);
    const mime = media.mime.split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime) || media.bytes.length > 3_500_000) return null;
    return { base64: wa.toBase64(media.bytes), mime };
  } catch (err) {
    console.error('image download failed', err);
    return null;
  }
}

// הודעה שלא נמסרה: נרשם בדוח, ואריאל מקבל התראה (לכל היותר פעם ב-6 שעות)
export async function handleFailedStatus(env, st, now = new Date()) {
  const err = st.errors?.[0] || {};
  console.error('message not delivered', st.recipient_id, err.code, err.title);
  await logEvent(env, 'send_failed', st.recipient_id, now);
  await adminAlert(env, `הודעה ל-${displayPhone(st.recipient_id)} לא נמסרה (${err.code || ''} ${err.title || ''}).`.replace(/\s+\)/, ')'), now);
}

async function adminAlert(env, text, now) {
  const admin = env.ADMIN_PHONE;
  if (!admin) return;
  const recent = await env.DB.prepare("SELECT 1 FROM events WHERE type = 'admin_alert' AND created_at >= ?").bind(new Date(now.getTime() - 6 * 3600000).toISOString()).first();
  if (recent) return;
  await logEvent(env, 'admin_alert', null, now);
  await sendToOwner(env, `תקלה בבוט של ${BUSINESS.shortName}: ${text} כדאי לבדוק (npx wrangler tail).`, now, null, admin);
}

// ה-AI לא עבד: הלקוח עובר לחנן (זה כבר קורה), ואריאל מקבל התראה, לכל היותר פעם ב-6 שעות
async function reportAiFailure(env, phone, reason, now) {
  await logEvent(env, 'ai_error', phone, now);
  await adminAlert(env, `${reason}. הלקוח הועבר לחנן. לבדוק גם את הקרדיט ב-Anthropic.`, now);
}

// חנן ענה ללקוח מהאפליקציה (Coexistence): הבוט מפסיק לנהל את השיחה הזו
export async function handleOwnerEcho(env, echo, now = new Date()) {
  const phone = echo.to;
  if (!phone) return;
  const conv = await env.DB.prepare("SELECT * FROM conversations WHERE phone = ? AND state IN ('bot','handoff') ORDER BY id DESC LIMIT 1").bind(phone).first();
  // מי שחנן כתב לו בעצמו, ואין איתו פנייה פתוחה (חבר, ספק, לקוח קבוע): נחשב "מוכר", והבוט לא יפנה אליו.
  // לקוח עם פנייה פתוחה לא הופך ל"מוכר": חנן פשוט לוקח את השיחה הזו
  if (env.KNOWN_ON_OWNER_MESSAGE !== '0' && !conv) {
    await env.DB.prepare('INSERT INTO customers (phone, first_seen, known) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(phone, nowIso(now)).run();
  }
  if (conv && conv.state === 'bot') {
    await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ?")
      .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
  }
  if (conv) await markOwnerReplied(env, phone, now);
  if (conv) {
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner', ?, ?)").bind(conv.id, echo.text?.body || `[${echo.type}]`, nowIso(now)).run();
  }
}

export { BUSINESS };

// חנן טיפל בלקוח (ענה מהאפליקציה או שלח פקודה עליו): מפסיקים להזכיר לו
export async function markOwnerReplied(env, phone, now = new Date()) {
  await env.DB.prepare("UPDATE conversations SET owner_replied_at = COALESCE(owner_replied_at, ?) WHERE id = (SELECT id FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1)")
    .bind(nowIso(now), phone).run();
}

// בזמן החיבור (Coexistence), Meta יכולים לשלוח את אנשי הקשר וההיסטוריה של חנן מהאפליקציה.
// כל מספר שמופיע שם מסומן כ"מוכר", כדי שהבוט לא יפנה לאנשים שחנן כבר מדבר איתם.
export async function importKnownContacts(env, value, now = new Date()) {
  const phones = new Set();
  const walk = (o, key = '') => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, key));
    if (o && typeof o === 'object') return Object.entries(o).forEach(([k, v]) => walk(v, k));
    if (['wa_id', 'from', 'to', 'phone_number'].includes(key) && /^\d{11,13}$/.test(String(o))) phones.add(String(o));
  };
  walk(value);
  phones.delete(String(env.OWNER_PHONE || ''));
  for (const p of phones) {
    await env.DB.prepare('INSERT INTO customers (phone, first_seen, known) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(p, nowIso(now)).run();
  }
  return phones.size;
}
