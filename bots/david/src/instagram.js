// Instagram DMs (Instagram API with Instagram Login). Same webhook URL and the same
// Meta signature scheme as WhatsApp; the payload has object: "instagram".
//
// A guest on Instagram has no phone number, only an Instagram-scoped id (IGSID).
// Inside the bot that guest is "ig:<IGSID>", so conversations, dedupe and usage
// all work unchanged, and sendText/sendImage route by that prefix.
//
// Env: IG_TOKEN (long-lived Instagram user access token with
// instagram_business_manage_messages), optional IG_USER_ID (default "me"),
// optional IG_APP_SECRET (if the Instagram app's secret differs from WA_APP_SECRET).

import { getSetting, putSetting } from './store.js';

const IG_GRAPH = 'https://graph.instagram.com/v21.0';
const TOKEN_KEY = 'ig_token';

// The refreshed token in D1 wins over the IG_TOKEN secret it started from.
async function igToken(env) {
  try { return (await getSetting(env, TOKEN_KEY))?.value || env.IG_TOKEN; }
  catch { return env.IG_TOKEN; }
}

// Long-lived Instagram tokens last 60 days; refreshing gives another 60.
// Called weekly from the cron. Returns days left on the new token.
export async function refreshInstagramToken(env) {
  const token = await igToken(env);
  if (!token) return null;
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json?.error?.message || `Instagram token refresh ${res.status}`);
  await putSetting(env, TOKEN_KEY, json.access_token);
  return Math.round((json.expires_in || 0) / 86400);
}
export const IG_PREFIX = 'ig:';
export const isInstagram = (to) => String(to).startsWith(IG_PREFIX);

// Instagram caps a text message at 1000 bytes (Hebrew is 2 bytes a letter), so
// long replies are split, preferably at a line break or a space.
const MAX_BYTES = 950;
const bytes = (s) => new TextEncoder().encode(s).length;

export function splitForInstagram(text) {
  const out = [];
  let rest = String(text).trim();
  while (rest && bytes(rest) > MAX_BYTES) {
    let cut = rest.length;
    while (cut > 1 && bytes(rest.slice(0, cut)) > MAX_BYTES) cut = Math.floor(cut * 0.9);
    const nl = rest.lastIndexOf('\n', cut);
    const sp = rest.lastIndexOf(' ', cut);
    const at = nl > cut * 0.5 ? nl : sp > cut * 0.5 ? sp : cut;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Pull guest messages out of an Instagram webhook. Same shape as WhatsApp's
// incomingMessages, so handleMessage doesn't care where a message came from.
export function incomingInstagram(payload) {
  if (payload?.object !== 'instagram') return [];
  const out = [];
  for (const entry of payload.entry || []) {
    for (const ev of entry.messaging || []) {
      const m = ev.message;
      const sender = ev.sender?.id;
      // Skip our own replies (echo), reads, reactions, deletions, and anything we sent.
      if (!m || m.is_echo || m.is_deleted || m.is_unsupported || !sender || sender === entry.id) continue;
      const att = (m.attachments || [])[0];
      const type = m.text ? 'text' : att?.type === 'audio' ? 'audio' : att?.type === 'image' ? 'image' : att?.type || 'unsupported';
      out.push({
        id: m.mid, from: IG_PREFIX + sender, name: '', type, channel: 'instagram',
        mediaUrl: (type === 'audio' || type === 'image') ? att?.payload?.url || null : null,
        caption: '',
        text: m.text || (m.quick_reply?.payload ? m.quick_reply.payload : ''),
        storyReply: !!m.reply_to?.story,
      });
    }
  }
  return out;
}

async function post(env, body) {
  const token = await igToken(env);
  if (!token) throw new Error('IG_TOKEN לא מוגדר, אי אפשר לענות באינסטגרם');
  const res = await fetch(`${IG_GRAPH}/${env.IG_USER_ID || 'me'}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Instagram ${res.status}`);
    err.code = json?.error?.code;
    throw err;
  }
  return json;
}

const igsid = (to) => String(to).slice(IG_PREFIX.length);

export async function sendInstagramText(env, to, text) {
  let last;
  // WhatsApp *bold* shows as literal asterisks on Instagram.
  const plain = String(text).replace(/\*([^*\n]+)\*/g, '$1');
  for (const part of splitForInstagram(plain)) {
    last = await post(env, { recipient: { id: igsid(to) }, message: { text: part } });
  }
  return last;
}

export async function sendInstagramImage(env, to, url) {
  return post(env, { recipient: { id: igsid(to) }, message: { attachment: { type: 'image', payload: { url } } } });
}

// The guest's @username, for alerts to the owner. Needs the app's profile access;
// if it fails we simply don't show it.
export async function instagramUsername(env, to) {
  if (!env.IG_TOKEN || env.OUTBOX || env.DRY_RUN === '1') return '';
  try {
    const res = await fetch(`${IG_GRAPH}/${igsid(to)}?fields=username,name`, { headers: { authorization: `Bearer ${await igToken(env)}` } });
    if (!res.ok) return '';
    const j = await res.json();
    return j.username || '';
  } catch { return ''; }
}

// Attachments arrive as a CDN URL (no media id, no token needed).
export async function downloadUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`media download ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get('content-type') || '' };
}
