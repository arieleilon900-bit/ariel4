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

// הודעה לחנן (למספר שהוגדר ב-OWNER_PHONE)
export async function sendToOwner(env, text, now = new Date()) {
  const owner = env.OWNER_PHONE;
  if (!owner) return { ok: false };
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(owner).first();
  if (inServiceWindow(c?.last_inbound_at, now)) return wa.sendText(env, owner, text);
  return wa.sendTemplate(env, owner, TEMPLATES.ownerAlert, [text.replace(/\n+/g, ' | ').slice(0, 1000)]);
}

async function extractContent(env, msg) {
  switch (msg.type) {
    case 'text':
      return { text: msg.text?.body || '' };
    case 'image': {
      try {
        const media = await wa.downloadMedia(env, msg.image.id);
        return {
          text: msg.image.caption ? `[שלחתי תמונה] ${msg.image.caption}` : '[שלחתי תמונה]',
          image: { base64: wa.toBase64(media.bytes), mime: media.mime.split(';')[0] },
          photoId: msg.image.id,
        };
      } catch (err) {
        console.error('image download failed', err);
        return { text: '[שלחתי תמונה]', photoId: msg.image.id };
      }
    }
    case 'audio': {
      try {
        const media = await wa.downloadMedia(env, msg.audio.id);
        const out = await env.AI.run('@cf/openai/whisper', { audio: [...media.bytes] });
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
  const conv = await env.DB.prepare(
    "SELECT * FROM conversations WHERE phone = ? AND state IN ('bot','handoff') ORDER BY id DESC LIMIT 1",
  ).bind(phone).first();
  if (conv && (now.getTime() - new Date(conv.updated_at).getTime()) / 3600000 < CONV_IDLE_HOURS) return { conv, isNew: false };
  if (conv) await env.DB.prepare("UPDATE conversations SET state = 'closed' WHERE id = ?").bind(conv.id).run();
  const res = await env.DB.prepare('INSERT INTO conversations (phone, started_at, updated_at) VALUES (?, ?, ?)').bind(phone, nowIso(now), nowIso(now)).run();
  const id = res.meta?.last_row_id;
  return { conv: await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first(), isNew: true };
}

function ownerSummary(conv, result, phone, now) {
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

async function forwardPhotosToOwner(env, photoIds) {
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

export async function handleInbound(env, msg, contactName, now = new Date()) {
  const phone = msg.from;

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
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (0, 'owner', ?, ?, ?)").bind(msg.text?.body || `[${msg.type}]`, msg.id, nowIso(now)).run();
    await handleOwnerCommand(env, msg.text?.body || '', now);
    return;
  }

  const customer = await env.DB.prepare('SELECT * FROM customers WHERE phone = ?').bind(phone).first();
  if (customer?.blocked) return;

  wa.markRead(env, msg.id).catch(() => {});
  const content = await extractContent(env, msg);
  if (content.voice) await logEvent(env, 'voice', phone, now);

  const { conv, isNew } = await getOrCreateConversation(env, phone, now);
  if (isNew) await logEvent(env, 'lead', phone, now);

  await env.DB.prepare("INSERT INTO messages (conv_id, role, text, wa_id, created_at) VALUES (?, 'user', ?, ?, ?)").bind(conv.id, content.text, msg.id, nowIso(now)).run();
  const photos = JSON.parse(conv.photos || '[]');
  if (content.photoId) photos.push(content.photoId);
  await env.DB.prepare('UPDATE conversations SET updated_at = ?, photos = ?, location = COALESCE(?, location) WHERE id = ?')
    .bind(nowIso(now), JSON.stringify(photos), content.location || null, conv.id).run();

  // אחרי ההעברה לחנן: הבוט לא מנהל שיחה, רק מעביר לחנן את מה שנכתב
  if (conv.state === 'handoff') {
    await sendToOwner(env, `💬 ${displayPhone(phone)} כתב/ה: ${content.text}`, now);
    if (content.photoId) await forwardPhotosToOwner(env, [content.photoId]);
    const lastBot = await env.DB.prepare("SELECT text, created_at FROM messages WHERE conv_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").bind(conv.id).first();
    const recentlySaid = lastBot && lastBot.text === MESSAGES.waitingForOwner && (now.getTime() - new Date(lastBot.created_at).getTime()) < 30 * 60000;
    if (!recentlySaid) {
      await wa.sendText(env, phone, MESSAGES.waitingForOwner);
      await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, MESSAGES.waitingForOwner, nowIso(now)).run();
    }
    return;
  }

  // שיחה עם ה-AI
  const history = (await env.DB.prepare("SELECT role, text FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 30").bind(conv.id).all()).results.reverse();
  const returning = customer && customer.jobs_count > 0 ? customer : null;
  const result = await runTurn(env, { history, image: content.image || null, now, returningCustomer: returning });

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
    const fresh = await env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(conv.id).first();
    await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ?")
      .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
    await logEvent(env, result.urgent ? 'urgent' : 'handoff', phone, now);
    await sendToOwner(env, ownerSummary(fresh, result, phone, now), now);
    await forwardPhotosToOwner(env, JSON.parse(fresh.photos || '[]'));
    await appendRow(env, [
      ilDateTimeLabel(now), result.urgent ? 'פנייה דחופה' : 'פנייה חדשה', result.customer_name || customer?.name || '',
      displayPhone(phone), result.issue || fresh.issue || '', result.address || fresh.address || '', result.urgent ? 'כן' : '', result.summary_for_owner,
    ]);
  }
}

// חנן ענה ללקוח מהאפליקציה (Coexistence): הבוט מפסיק לנהל את השיחה הזו
export async function handleOwnerEcho(env, echo, now = new Date()) {
  const phone = echo.to;
  if (!phone) return;
  const conv = await env.DB.prepare("SELECT * FROM conversations WHERE phone = ? AND state IN ('bot','handoff') ORDER BY id DESC LIMIT 1").bind(phone).first();
  if (conv && conv.state === 'bot') {
    await env.DB.prepare("UPDATE conversations SET state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ?")
      .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
  }
  if (conv) {
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner', ?, ?)").bind(conv.id, echo.text?.body || `[${echo.type}]`, nowIso(now)).run();
  }
}

export { BUSINESS };
