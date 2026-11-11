// Cloudflare Worker entry: WhatsApp webhook + hourly cron.
//
// Env (wrangler secrets / vars): ANTHROPIC_API_KEY, WA_TOKEN, WA_PHONE_NUMBER_ID,
// WA_APP_SECRET, WA_VERIFY_TOKEN, optional WA_NOTIFY_TEMPLATE, DRY_RUN=1 for testing.
// KV binding: BOT_KV.

import { BUSINESS, APARTMENTS, PARTNERS, DRAFT } from './config.js';
import { verifyWebhook, validSignature, incomingMessages, sendText } from './whatsapp.js';
import { alreadySeen, getConv, saveConv, bump } from './store.js';
import { reply } from './agent.js';
import { handleOwner, scheduled } from './owner.js';

const OPT_OUT = /^(הסר|הסירו|stop|unsubscribe)\b/i;
const NEW_INQUIRY_GAP = 3 * 24 * 3600e3; // a guest quiet for 3 days counts as a new inquiry

function baseCtx(env) {
  return { env, business: BUSINESS, apartments: APARTMENTS, partners: PARTNERS };
}

export async function handleMessage(env, msg, extra = {}) {
  const ctx = { ...baseCtx(env), ...extra, phone: msg.from, name: msg.name };
  if (ctx.business.ownerPhone && msg.from === ctx.business.ownerPhone) return handleOwner(ctx, msg.text);

  const conv = await getConv(env, msg.from);
  ctx.conv = conv;
  if (!conv.lastUserAt || Date.now() - conv.lastUserAt > NEW_INQUIRY_GAP) {
    await bump(env, 'inquiries');
    Object.assign(conv, { quotedAt: null, bookedAt: null, referredAt: null, followups: 0 });
  }
  conv.lastUserAt = Date.now();
  conv.name = msg.name || conv.name;

  if (OPT_OUT.test(msg.text)) {
    conv.optedOut = true;
    await saveConv(env, conv);
    return sendText(env, msg.from, 'הוסרת, לא נשלח לך הודעות יזומות. אם תרצה שוב, פשוט תכתוב 🙂');
  }

  const text = msg.text || (msg.type === 'audio'
    ? '[הלקוח שלח הודעה קולית שאי אפשר לשמוע]'
    : `[הלקוח שלח ${msg.type} שאי אפשר לקרוא]`);
  const answer = await reply(ctx, text);
  await saveConv(env, conv);
  return sendText(env, msg.from, answer);
}

export default {
  async fetch(req, env, execCtx) {
    const url = new URL(req.url);
    if (url.pathname !== '/webhook') return new Response('ok');
    if (req.method === 'GET') return verifyWebhook(url, env);
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const raw = await req.text();
    if (!(await validSignature(raw, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET))) {
      return new Response('Bad signature', { status: 401 });
    }
    if (DRAFT && env.ALLOW_DRAFT !== '1') {
      console.warn('config.js is still DRAFT; ignoring webhook');
      return new Response('ok');
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

    // Answer Meta at once; the reply is sent in the background.
    execCtx.waitUntil((async () => {
      for (const msg of incomingMessages(payload)) {
        if (await alreadySeen(env, msg.id)) continue;
        try { await handleMessage(env, msg); }
        catch (e) {
          console.error('message failed', e);
          try { await sendText(env, msg.from, 'תודה על הפנייה! נחזור אליך ממש בקרוב 🙏'); } catch {}
        }
      }
    })());
    return new Response('ok');
  },

  async scheduled(event, env, execCtx) {
    if (DRAFT && env.ALLOW_DRAFT !== '1') return;
    execCtx.waitUntil(scheduled(baseCtx(env)));
  },
};
