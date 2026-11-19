// Cloudflare Worker entry: WhatsApp + Instagram webhook, /missed-call, /health,
// and the hourly cron.
//
// Env (wrangler secrets / vars): ANTHROPIC_API_KEY, WA_TOKEN, WA_PHONE_NUMBER_ID,
// WA_APP_SECRET, WA_VERIFY_TOKEN, optional WA_NOTIFY_TEMPLATE, HEALTH_TOKEN,
// optional IG_TOKEN / IG_USER_ID / IG_APP_SECRET (Instagram DMs),
// optional MISSED_CALL_TOKEN (missed calls), DRY_RUN=1 for testing. D1 binding: DB.

import { BUSINESS, APARTMENTS, PARTNERS, AGENCY, TEMPLATES, DRAFT } from './config.js';
import { verifyWebhook, validSignature, incomingMessages, sendText } from './whatsapp.js';
import { alreadySeen, getConv, saveConv, bump, lastError, usageBetween, unsubscribe } from './store.js';
import { transcribe, imageBlock } from './media.js';
import { reply, FALLBACK_REPLY } from './agent.js';
import { handleOwner, scheduled } from './owner.js';
import { reportProblem } from './monitor.js';
import { incomingInstagram, isInstagram } from './instagram.js';
import { handleMissedCall, callerFrom, savedFrom, missedCallNote, missedCallConfig, twimlResponse } from './missedcall.js';

const OPT_OUT = /^\s*(הסר|הסירו|הסירו אותי|stop|unsubscribe)\s*[.!]?\s*$/i;
const NEW_INQUIRY_GAP = 3 * 24 * 3600e3; // a guest quiet for 3 days counts as a new inquiry

function baseCtx(env) {
  return { env, business: BUSINESS, apartments: APARTMENTS, partners: PARTNERS, agency: AGENCY, templates: TEMPLATES };
}

export async function handleMessage(env, msg, extra = {}) {
  const channel = isInstagram(msg.from) ? 'instagram' : 'whatsapp';
  const ctx = { ...baseCtx(env), ...extra, phone: msg.from, name: msg.name, channel };
  if (channel === 'whatsapp' && ctx.business.ownerPhone && msg.from === ctx.business.ownerPhone) return handleOwner(ctx, msg.text, msg);

  const conv = await getConv(env, msg.from);
  ctx.conv = conv;
  ctx.note = await missedCallNote(ctx, msg.from, conv);
  if (ctx.note) await bump(env, 'missedCallReplies');
  if (!conv.lastUserAt || Date.now() - conv.lastUserAt > NEW_INQUIRY_GAP) {
    await bump(env, 'inquiries');
    Object.assign(conv, { quotedAt: null, bookedAt: null, referredAt: null, followups: 0 });
  }
  conv.lastUserAt = Date.now();
  conv.name = msg.name || conv.name;

  if (OPT_OUT.test(msg.text)) {
    conv.optedOut = true;
    await saveConv(env, conv);
    await unsubscribe(env, msg.from);
    return sendText(env, msg.from, 'הוסרת, לא נשלח לך הודעות יזומות. אם תרצה שוב, פשוט תכתוב 🙂');
  }

  // Voice notes are transcribed; photos go to the model as images.
  let text = msg.text;
  const images = [];
  const media = msg.mediaUrl ? { url: msg.mediaUrl } : msg.mediaId;
  if (msg.type === 'audio' && media) {
    try { text = `[הודעה קולית, תמלול:] ${await transcribe(env, media)}`; }
    catch (e) {
      text = '[הלקוח שלח הודעה קולית שאי אפשר לשמוע. בקש בנימוס לכתוב.]';
      await reportProblem(ctx, 'תמלול נכשל', e.message, { guest: msg.from });
    }
  } else if (msg.type === 'image' && media) {
    try { images.push(await imageBlock(env, media)); text = `[הלקוח שלח תמונה]${msg.caption ? ' ' + msg.caption : ''}`; }
    catch (e) { text = `[הלקוח שלח תמונה שאי אפשר לפתוח]${msg.caption ? ' ' + msg.caption : ''}`; }
  } else if (!text && msg.type === 'story_mention') {
    text = '[הלקוח תייג את העסק בסטורי שלו. תודה קצרה וחמה, ושאלה אם אפשר לעזור במשהו.]';
  } else if (!text) {
    text = `[הלקוח שלח ${msg.type} שאי אפשר לקרוא. בקש בנימוס לכתוב בטקסט.]`;
  }
  const out = await reply(ctx, text, images);
  await saveConv(env, conv);
  await sendText(env, msg.from, out.text);
  if (out.problem) await reportProblem(ctx, 'הבוט לא ענה כמו שצריך', `${out.problem}. ההודעה של הלקוח: "${text.slice(0, 200)}"`, { guest: msg.from });
}

// POST /missed-call?token=... from the phone provider (see missedcall.js).
async function missedCallEndpoint(req, env, url, execCtx) {
  const token = url.searchParams.get('token') || req.headers.get('x-token');
  if (!env.MISSED_CALL_TOKEN || token !== env.MISSED_CALL_TOKEN) return new Response('Forbidden', { status: 403 });
  const params = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') || '';
    const raw = await req.text();
    try {
      if (type.includes('json')) Object.assign(params, JSON.parse(raw || '{}'));
      else Object.assign(params, Object.fromEntries(new URLSearchParams(raw)));
    } catch { return new Response('Bad body', { status: 400 }); }
  }
  delete params.token;
  const isTwilio = !!params.CallSid;
  // Twilio also calls when the forwarded call was answered somewhere; only no-answer counts.
  const answered = ['completed', 'in-progress'].includes(params.DialCallStatus);
  const ctx = baseCtx(env);
  const job = (async () => {
    if (DRAFT && env.ALLOW_DRAFT !== '1') return { status: 'skipped', reason: 'draft' };
    if (answered) return { status: 'skipped', reason: 'answered' };
    try {
      return await handleMissedCall(ctx, { from: callerFrom(params), saved: savedFrom(params), source: params.source || (isTwilio ? 'twilio' : '') });
    } catch (e) {
      await reportProblem(ctx, 'תקלה בטיפול בשיחה שלא נענתה', e.stack || e.message);
      return { status: 'failed', reason: e.message };
    }
  })();
  // Phone providers want an instant answer; Twilio wants TwiML.
  if (isTwilio) { execCtx.waitUntil(job); return twimlResponse(missedCallConfig(ctx.business)); }
  return Response.json(await job);
}

async function health(env, url) {
  if (!env.HEALTH_TOKEN || url.searchParams.get('token') !== env.HEALTH_TOKEN) return new Response('Forbidden', { status: 403 });
  try {
    const err = await lastError(env);
    const u = await usageBetween(env, Date.now() - 86400e3, Date.now());
    return Response.json({
      ok: true, draft: DRAFT,
      last24h: { modelCalls: u.calls, guests: u.guests, costUsd: +(u.micros / 1e6).toFixed(3) },
      lastError: err ? { at: new Date(err.ts).toISOString(), kind: err.kind, detail: err.detail } : null,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export default {
  async fetch(req, env, execCtx) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return health(env, url);
    if (url.pathname === '/missed-call') return missedCallEndpoint(req, env, url, execCtx);
    if (url.pathname !== '/webhook') return new Response('ok');
    if (req.method === 'GET') return verifyWebhook(url, env);
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const raw = await req.text();
    // WhatsApp and Instagram share this URL; the Instagram app may have its own secret.
    const sig = req.headers.get('x-hub-signature-256');
    if (!(await validSignature(raw, sig, env.WA_APP_SECRET)) && !(env.IG_APP_SECRET && await validSignature(raw, sig, env.IG_APP_SECRET))) {
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
      for (const msg of [...incomingMessages(payload), ...incomingInstagram(payload)]) {
        const ctx = { ...baseCtx(env), phone: msg.from };
        try {
          if (await alreadySeen(env, msg.id)) continue;
          await handleMessage(env, msg);
        } catch (e) {
          try { await sendText(env, msg.from, FALLBACK_REPLY); } catch {}
          await reportProblem(ctx, 'תקלה בטיפול בהודעה', e.stack || e.message, { guest: msg.from });
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
