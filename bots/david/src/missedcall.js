// A call nobody answered becomes a WhatsApp message to the caller.
//
// Any phone provider can report the call: POST /missed-call?token=MISSED_CALL_TOKEN
// with the caller's number (JSON, form or query string; field from / From / caller /
// phone / number). Twilio, Voicenter, an Android automation app: all the same to us.
// The business sets "forward when unanswered" on its line to the provider's number.
//
// Rules so this never turns into spam:
// - mobile numbers only (an Israeli landline has no WhatsApp), never hidden numbers
// - at most one message per number per cooldownHours (default 24)
// - not to the owner, the cleaner or the tech partner
// - not to someone who wrote "הסר", and not while the caller is already chatting with us
// - at night (quietHours) the message waits and goes out in the morning
// The guest's reply lands in the normal bot conversation, with a note that they called.

import { normalizePhone, isIsraeliMobile, israelHour, inQuietHours } from './logic.js';
import { getConv, bump, logMissedCall, setMissedCall, lastMissedCallMessage, queuedMissedCalls } from './store.js';
import { sendTemplate, sendNotify } from './whatsapp.js';
import { reportProblem } from './monitor.js';

const HOUR = 3600e3;
const ACTIVE_CHAT = HOUR;          // the caller wrote to us in the last hour: the bot is already on it
const NOTE_WINDOW = 48 * HOUR;     // a reply within 48h of our message gets the "they called" note

export const DEFAULT_MISSED_CALL = {
  enabled: false,
  cooldownHours: 24,
  quietHours: { from: 22, to: 8 },
  notifyOwner: true,
  foreignNumbers: true,
  text: 'היי, ראינו שהתקשרת ל{name} ולא הספקנו לענות 🙏 אפשר לכתוב לי כאן במה אפשר לעזור, ואחזור אליך מיד.',
};

export const missedCallConfig = (business) => ({ ...DEFAULT_MISSED_CALL, ...(business?.missedCall || {}) });

function messageText(ctx) {
  return missedCallConfig(ctx.business).text.replaceAll('{name}', ctx.business.botName || 'העסק');
}

// Pull the caller's number out of whatever the provider sent.
export function callerFrom(params) {
  for (const k of ['from', 'From', 'caller', 'Caller', 'callerId', 'CallerID', 'caller_id', 'phone', 'number', 'ani', 'ANI']) {
    if (params?.[k]) return String(params[k]);
  }
  return '';
}

// Returns { status: 'sent' | 'queued' | 'skipped' | 'failed', reason?, phone }.
export async function handleMissedCall(ctx, { from, source = '' }, now = Date.now()) {
  const env = ctx.env;
  const cfg = missedCallConfig(ctx.business);
  const phone = normalizePhone(from);
  const skip = async (reason) => {
    if (phone) await logMissedCall(env, { phone, ts: now, status: 'skipped', reason, source });
    return { status: 'skipped', reason, phone };
  };

  if (!cfg.enabled) return skip('disabled');
  if (!phone) return { status: 'skipped', reason: 'hidden_number', phone: '' };
  if (phone.startsWith('972') && !isIsraeliMobile(phone)) return skip('landline');
  if (!phone.startsWith('972') && !cfg.foreignNumbers) return skip('foreign');
  const staff = [ctx.business.ownerPhone, ctx.business.cleanerPhone, ctx.agency?.techPhone].filter(Boolean);
  if (staff.includes(phone)) return skip('staff');

  const conv = await getConv(env, phone);
  if (conv.optedOut) return skip('opted_out');
  if (conv.lastUserAt && now - conv.lastUserAt < ACTIVE_CHAT) return skip('active_chat');
  if (await lastMissedCallMessage(env, phone, now - cfg.cooldownHours * HOUR)) return skip('cooldown');

  if (inQuietHours(israelHour(now), cfg.quietHours)) {
    await logMissedCall(env, { phone, ts: now, status: 'queued', source });
    return { status: 'queued', phone };
  }
  const id = await logMissedCall(env, { phone, ts: now, status: 'queued', source });
  return sendMissedCallMessage(ctx, { id, phone, ts: now });
}

async function sendMissedCallMessage(ctx, row) {
  const env = ctx.env;
  const B = ctx.business;
  const text = messageText(ctx);
  try {
    await sendTemplate(env, row.phone, ctx.templates?.missed_call, [B.botName || 'העסק'], text);
  } catch (e) {
    await setMissedCall(env, row.id, 'failed', e.message);
    await reportProblem(ctx, 'הודעה על שיחה שלא נענתה לא נשלחה',
      `${e.message}. בלי תבנית missed_call מאושרת ב-Meta אי אפשר לפנות ראשונים ללקוח.`, { guest: row.phone });
    return { status: 'failed', reason: e.message, phone: row.phone };
  }
  await setMissedCall(env, row.id, 'sent');
  await bump(env, 'missedCalls');
  if (missedCallConfig(B).notifyOwner && B.ownerPhone) {
    const when = new Date(row.ts).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    try {
      await sendNotify(env, B.ownerPhone, `📞 *שיחה שלא נענתה* (${when}) מ-+${row.phone}\nשלחתי לו וואטסאפ, והבוט ממשיך איתו משם.\nhttps://wa.me/${row.phone}`);
    } catch (e) {
      await reportProblem(ctx, 'התראה לבעל העסק על שיחה שלא נענתה נכשלה', e.message);
    }
  }
  return { status: 'sent', phone: row.phone };
}

// Hourly cron: once quiet hours are over, send what waited overnight.
export async function flushQueuedMissedCalls(ctx, now = Date.now()) {
  const cfg = missedCallConfig(ctx.business);
  if (!cfg.enabled || inQuietHours(israelHour(now), cfg.quietHours)) return 0;
  let sent = 0;
  for (const row of await queuedMissedCalls(ctx.env)) {
    if (now - row.ts > 24 * HOUR) { await setMissedCall(ctx.env, row.id, 'skipped', 'expired'); continue; }
    const conv = await getConv(ctx.env, row.phone);
    if (conv.optedOut) { await setMissedCall(ctx.env, row.id, 'skipped', 'opted_out'); continue; }
    if (conv.lastUserAt && conv.lastUserAt > row.ts) { await setMissedCall(ctx.env, row.id, 'skipped', 'guest_wrote'); continue; }
    const r = await sendMissedCallMessage(ctx, row);
    if (r.status === 'sent') sent++;
  }
  return sent;
}

// For handleMessage: if this guest is answering our missed-call message, tell the model.
export async function missedCallNote(ctx, phone, conv, now = Date.now()) {
  if (String(phone).startsWith('ig:')) return '';
  const row = await lastMissedCallMessage(ctx.env, phone, now - NOTE_WINDOW);
  if (!row || row.status !== 'sent') return '';
  if (conv.lastUserAt && conv.lastUserAt > row.ts) return ''; // already talked since
  return `[הלקוח התקשר ל${ctx.business.botName} ולא נענה. קיבל ממך בוואטסאפ: "${messageText(ctx)}". זו התשובה הראשונה שלו. אל תתנצל שוב, פשוט תעזור.]`;
}

// Twilio expects TwiML back. Default: reject as busy (no voice minutes billed).
export function twimlResponse(cfg) {
  const body = cfg.voiceText
    ? `<Say language="he-IL">${String(cfg.voiceText).replace(/[<>&]/g, '')}</Say><Hangup/>`
    : '<Reject reason="busy"/>';
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { 'content-type': 'text/xml' } });
}
