// Everything the bot remembers lives in one KV namespace (BOT_KV):
//   conv:<phone>      the conversation (text only) + follow-up state, 30 days
//   booking:<id>      a booking request (pending / confirmed / cancelled)
//   referral:<id>     a lead passed to a partner (sent / closed / lost)
//   stat:<weekStart>  weekly counters
//   seen:<msgId>      WhatsApp message ids already handled (webhooks retry)

import { weekStart } from './logic.js';

const MONTH = 60 * 60 * 24 * 30;
const KEEP_TURNS = 40;

export function newId(prefix) {
  return prefix + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase();
}

export async function alreadySeen(env, msgId) {
  const key = 'seen:' + msgId;
  if (await env.BOT_KV.get(key)) return true;
  await env.BOT_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 2 });
  return false;
}

export async function getConv(env, phone) {
  return (await env.BOT_KV.get('conv:' + phone, 'json')) || { phone, messages: [], createdAt: Date.now() };
}

export async function saveConv(env, conv) {
  conv.messages = conv.messages.slice(-KEEP_TURNS);
  // History must start with a user turn.
  while (conv.messages.length && conv.messages[0].role !== 'user') conv.messages.shift();
  conv.updatedAt = Date.now();
  await env.BOT_KV.put('conv:' + conv.phone, JSON.stringify(conv), { expirationTtl: MONTH });
}

export async function putRecord(env, kind, rec) {
  await env.BOT_KV.put(`${kind}:${rec.id}`, JSON.stringify(rec), { expirationTtl: MONTH * 13 });
}

export async function getRecord(env, kind, id) {
  return env.BOT_KV.get(`${kind}:${String(id).toUpperCase()}`, 'json');
}

export async function listRecords(env, kind) {
  const out = [];
  let cursor;
  do {
    const page = await env.BOT_KV.list({ prefix: kind + ':', cursor });
    for (const k of page.keys) {
      const v = await env.BOT_KV.get(k.name, 'json');
      if (v) out.push(v);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

export async function bump(env, field, by = 1, t = Date.now()) {
  const key = 'stat:' + weekStart(t);
  const s = (await env.BOT_KV.get(key, 'json')) || {};
  s[field] = (s[field] || 0) + by;
  await env.BOT_KV.put(key, JSON.stringify(s), { expirationTtl: MONTH * 13 });
}

export async function getStats(env, week) {
  return (await env.BOT_KV.get('stat:' + week, 'json')) || {};
}

// Pending requests hold the dates for 48 hours so two guests can't take the same night.
export function activeBookings(bookings, aptId, now = Date.now()) {
  return bookings.filter(b => b.aptId === aptId && (
    b.status === 'confirmed' || (b.status === 'pending' && now - b.createdAt < 48 * 3600 * 1000)
  ));
}
