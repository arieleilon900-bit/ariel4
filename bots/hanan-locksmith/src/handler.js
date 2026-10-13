// טיפול בהודעה נכנסת מלקוח, ובהודעות שחנן שולח מהאפליקציה (Coexistence).
import { runTurn } from './ai.js';
import { BUSINESS, MESSAGES, TEMPLATES, TIMING } from './config.js';
import { appendRow } from './sheets.js';
import { displayPhone, ilDateTimeLabel, inServiceWindow, nowIso, wazeLink, addHours } from './util.js';
import * as wa from './whatsapp.js';
import { handleOwnerCommand } from './owner.js';

const CONV_IDLE_HOURS = 72; // שיחה שלא זזה 3 ימים נחשבת סגורה, והודעה חדשה פותחת שיחה חדשה

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
export async function sendToOwner(env, text, now = new Date(), about = null, to = env.OWNER_PHONE) {
  if (!to) return { ok: false };
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(to).first();
  const open = inServiceWindow(c?.last_inbound_at, now);
  const r = open
    ? await wa.sendText(env, to, text)
    : await wa.sendTemplate(env, to, TEMPLATES.ownerAlert, [templateText(text)]);
  // נשלח בקיצור: שומרים את ההודעה המלאה לחנן, לרגע שהוא כותב לבוט או לוחץ "קיבלתי"
  if (!open && to === env.OWNER_PHONE) {
    await env.DB.prepare('INSERT INTO owner_outbox (text, about, created_at) VALUES (?, ?, ?)').bind(text, about, nowIso(now)).run();
  }
  const wamid = r.data?.messages?.[0]?.id;
  if (about && wamid) {
    await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(wamid, about, nowIso(now)).run();
  }
  return r;
}

// חנן כתב לבוט (או לחץ "קיבלתי"): שולחים לו במלואן את ההודעות והתמונות שהגיעו אליו בקיצור
export async function flushOwnerOutbox(env, now = new Date()) {
  const items = (await env.DB.prepare('SELECT * FROM owner_outbox WHERE sent = 0 AND created_at >= ? ORDER BY id LIMIT 8')
    .bind(new Date(now.getTime() - 48 * 3600000).toISOString()).all()).results;
  for (const it of items) {
    await env.DB.prepare('UPDATE owner_outbox SET sent = 1 WHERE id = ?').bind(it.id).run();
    if (it.text) {
      const r = await wa.sendText(env, env.OWNER_PHONE, it.text);
      const wamid = r.data?.messages?.[0]?.id;
      if (it.about && wamid) await env.DB.prepare('INSERT OR REPLACE INTO owner_refs (wamid, phone, created_at) VALUES (?, ?, ?)').bind(wamid, it.about, nowIso(now)).run();
    }
    if (it.media) await forwardPhotosToOwner(env, JSON.parse(it.media).slice(0, 3), now, it.about);
  }
}

// משתנה בתבנית: וואטסאפ לא מרשים ירידות שורה, טאבים או יותר מ-4 רווחים ברצף
export function templateText(text) {
  return String(text).replace(/[\t\r]+/g, ' ').replace(/\n+/g, ' | ').replace(/ {4,}/g, '   ').trim().slice(0, 1000);
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
  if (conv && (now.getTime() - new Date(conv.updated_at).getTime()) / 3600000 < CONV_IDLE_HOURS) return { conv, isNew: false };
  if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed' WHERE id = ?").bind(conv.id).run();
  // אם הודעה אחרת של אותו לקוח פתחה שיחה באותו רגע, האינדקס הייחודי מונע שיחה כפולה
  const res = await env.DB.prepare('INSERT OR IGNORE INTO conversations (phone, started_at, updated_at) VALUES (?, ?, ?)').bind(phone, nowIso(now), nowIso(now)).run();
  return { conv: await open(), isNew: !!res.meta?.changes };
}

export function ownerSummary(conv, result, phone, now) {
  const lines = [
    result.urgent ? '🚨 פנייה דחופה!' : '🔔 פנייה חדשה',
    `שם: ${result.customer_name || '(לא נמסר)'}`,
    `טלפון: ${displayPhone(phone)}`,
    `תקלה: ${result.issue || conv.issue || '(לא פורט)'}`,
    `כתובת: ${result.address || conv.address || '(לא נמסרה)'}`,
  ];
  const nav = conv.location || wazeLink({ address: result.address || conv.address });
  if (nav) lines.push(`ניווט: ${nav}`);
  if (result.urgent && result.urgent_reason) lines.push(`למה דחוף: ${result.urgent_reason}`);
  if (result.summary_for_owner) lines.push('', result.summary_for_owner);
  lines.push('', `לוואטסאפ איתו: https://wa.me/${phone}`, `התקבל: ${ilDateTimeLabel(now)}`);
  return lines.join('\n');
}

export async function forwardPhotosToOwner(env, photoIds, now = new Date(), about = null) {
  if (!photoIds.length || !env.OWNER_PHONE) return;
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
      const media = await wa.downloadMedia(env, id);
      const newId = await wa.uploadMedia(env, media.bytes, media.mime.split(';')[0]);
      await wa.sendImageById(env, env.OWNER_PHONE, newId, 'תמונה מהלקוח');
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

  // הודעה שכבר טופלה (Meta לפעמים שולחים פעמיים)
  const dup = await env.DB.prepare('SELECT 1 FROM messages WHERE wa_id = ?').bind(msg.id).first();
  if (dup) return;

  // לקוח: יצירה או עדכון
  await env.DB.prepare(
    `INSERT INTO customers (phone, name, first_seen, last_inbound_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET last_inbound_at = excluded.last_inbound_at, name = COALESCE(customers.name, excluded.name)`,
  ).bind(phone, contactName || null, nowIso(now), nowIso(now)).run();

  // פקודות מחנן
  if (env.OWNER_PHONE && phone === env.OWNER_PHONE) {
    const ownerText = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '';
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (0, 'owner', ?, ?, ?)").bind(ownerText || `[${msg.type}]`, msg.id, nowIso(now)).run();
    await flushOwnerOutbox(env, now);
    await handleOwnerCommand(env, ownerText, now, msg);
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
    await wa.sendText(env, phone, MESSAGES.optedOut);
    await logEvent(env, 'opt_out', phone, now);
    return;
  }

  wa.markRead(env, msg.id).catch(() => {});
  const content = await extractContent(env, msg);
  if (content.voice) await logEvent(env, 'voice', phone, now);

  const { conv, isNew } = await getOrCreateConversation(env, phone, now);
  if (isNew) await logEvent(env, 'lead', phone, now);

  const ins = await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, media_id, created_at) VALUES (?, 'user', ?, ?, ?, ?)")
    .bind(conv.id, content.text, msg.id, content.photoId || null, nowIso(now)).run();
  const myId = ins.meta?.last_row_id;
  if (content.photoId) {
    await env.DB.prepare("UPDATE conversations SET photos = json_insert(photos, '$[#]', ?) WHERE id = ?").bind(content.photoId, conv.id).run();
  }
  await env.DB.prepare('UPDATE conversations SET updated_at = ?, location = COALESCE(?, location) WHERE id = ?')
    .bind(nowIso(now), content.location || null, conv.id).run();

  // אחרי ההעברה לחנן: הבוט לא מנהל שיחה, רק מעביר לחנן את מה שנכתב
  if (conv.state === 'handoff') {
    await sendToOwner(env, `💬 ${customer?.name || ''} ${displayPhone(phone)} כתב/ה: ${content.text}`.trim(), now, phone);
    if (content.photoId) await forwardPhotosToOwner(env, [content.photoId], now, phone);
    const lastBot = await env.DB.prepare("SELECT text, created_at FROM messages WHERE conv_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").bind(conv.id).first();
    const recentlySaid = lastBot && lastBot.text === MESSAGES.waitingForOwner && (now.getTime() - new Date(lastBot.created_at).getTime()) < 30 * 60000;
    if (!recentlySaid) {
      await wa.sendText(env, phone, MESSAGES.waitingForOwner);
      await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, MESSAGES.waitingForOwner, nowIso(now)).run();
    }
    return;
  }

  // לקוחות שולחים כמה הודעות ברצף (טקסט, תמונה, עוד טקסט). מחכים רגע, ורק ההודעה האחרונה מקבלת תשובה, על הכל ביחד
  const wait = burstWaitMs(env);
  if (wait > 0) {
    await sleep(wait);
    const latest = await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'user'").bind(conv.id).first();
    if (latest?.id !== myId) return;
  }

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
  const result = await runTurn(env, { history, image, now, returningCustomer: returning, profileName: contactName || customer?.name || '' });
  if (result.failed) await reportAiFailure(env, phone, result.summary_for_owner, now);

  // בזמן שה-AI חשב, חנן אולי כבר ענה ללקוח מהאפליקציה: לא עונים במקומו
  const state = (await env.DB.prepare('SELECT state FROM conversations WHERE id = ?').bind(conv.id).first())?.state;
  if (state !== 'bot') return;

  if (result.category === 'spam') {
    await env.DB.prepare("UPDATE conversations SET state = 'spam' WHERE id = ?").bind(conv.id).run();
    await logEvent(env, 'spam', phone, now);
    return;
  }

  if (result.reply) {
    await wa.sendText(env, phone, result.reply);
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, result.reply, nowIso(now)).run();
  }
  if (result.customer_name) await env.DB.prepare('UPDATE customers SET name = ? WHERE phone = ?').bind(result.customer_name, phone).run();
  if (result.language) await env.DB.prepare('UPDATE customers SET lang = ? WHERE phone = ?').bind(result.language, phone).run();
  await env.DB.prepare('UPDATE conversations SET issue = COALESCE(NULLIF(?, \'\'), issue), address = COALESCE(NULLIF(?, \'\'), address), urgent = MAX(urgent, ?) WHERE id = ?')
    .bind(result.issue, result.address, result.urgent ? 1 : 0, conv.id).run();

  if (result.ready_for_handoff) {
    // רק פעם אחת: אם שתי הודעות הגיעו ביחד, רק אחת מעבירה לחנן
    const moved = await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ? AND state = 'bot'")
      .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
    if (!moved.meta?.changes) return;
    const fresh = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conv.id).first();
    const name = result.customer_name || customer?.name || contactName || '';
    await logEvent(env, result.urgent ? 'urgent' : 'handoff', phone, now);
    await sendToOwner(env, ownerSummary(fresh, { ...result, customer_name: name }, phone, now), now, phone);
    await forwardPhotosToOwner(env, JSON.parse(fresh.photos || '[]'), now, phone);
    await appendRow(env, [
      ilDateTimeLabel(now), result.urgent ? 'פנייה דחופה' : 'פנייה חדשה', name,
      displayPhone(phone), result.issue || fresh.issue || '', result.address || fresh.address || '', result.urgent ? 'כן' : '', result.summary_for_owner,
    ]);
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

// ה-AI לא עבד: הלקוח עובר לחנן (זה כבר קורה), ואריאל מקבל התראה, לכל היותר פעם ב-6 שעות
async function reportAiFailure(env, phone, reason, now) {
  await logEvent(env, 'ai_error', phone, now);
  const admin = env.ADMIN_PHONE;
  if (!admin) return;
  const recent = await env.DB.prepare("SELECT 1 FROM events WHERE type = 'admin_alert' AND created_at >= ?").bind(new Date(now.getTime() - 6 * 3600000).toISOString()).first();
  if (recent) return;
  await logEvent(env, 'admin_alert', null, now);
  await sendToOwner(env, `תקלה בבוט של ${BUSINESS.shortName}: ${reason}. הלקוח הועבר לחנן. כדאי לבדוק את הלוגים (wrangler tail) ואת הקרדיט ב-Anthropic.`, now, null, admin);
}

// חנן ענה ללקוח מהאפליקציה (Coexistence): הבוט מפסיק לנהל את השיחה הזו
export async function handleOwnerEcho(env, echo, now = new Date()) {
  const phone = echo.to;
  if (!phone) return;
  // מי שחנן כתב לו בעצמו, מהאפליקציה, נחשב "מוכר" מעכשיו: הבוט לא יפנה אליו
  if (env.KNOWN_ON_OWNER_MESSAGE !== '0') {
    await env.DB.prepare('INSERT INTO customers (phone, first_seen, known) VALUES (?, ?, 1) ON CONFLICT(phone) DO UPDATE SET known = 1').bind(phone, nowIso(now)).run();
  }
  const conv = await env.DB.prepare("SELECT * FROM conversations WHERE phone = ? AND state IN ('bot','handoff') ORDER BY id DESC LIMIT 1").bind(phone).first();
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
