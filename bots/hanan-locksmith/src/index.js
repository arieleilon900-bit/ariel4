// נקודת הכניסה של השרת (Cloudflare Worker).
// GET /webhook  ← אימות של Meta בזמן החיבור
// POST /webhook ← הודעות נכנסות מוואטסאפ
// cron          ← תזכורות, מעקבים ודוח שבועי
import { handleInbound, handleOwnerEcho, importKnownContacts } from './handler.js';
import { runEvery15, weeklyReport } from './cron.js';
import { verifySignature } from './whatsapp.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ok');
    }

    if (url.pathname === '/webhook' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token && token === env.WA_VERIFY_TOKEN) return new Response(challenge || '');
      return new Response('forbidden', { status: 403 });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      const raw = await request.text();
      const ok = await verifySignature(env.WA_APP_SECRET, raw, request.headers.get('x-hub-signature-256'));
      if (!ok) return new Response('bad signature', { status: 401 });
      let body;
      try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
      // עונים ל-Meta מיד, ומטפלים ברקע
      ctx.waitUntil(processWebhook(env, body).catch((err) => console.error('webhook processing failed', err)));
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const now = new Date(event.scheduledTime || Date.now());
    if (event.cron === '0 6 * * 0') ctx.waitUntil(weeklyReport(env, now));
    else ctx.waitUntil(runEvery15(env, now));
  },
};

export async function processWebhook(env, body, now = new Date()) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const msg of v.messages || []) {
        await handleInbound(env, msg, names[msg.from], now);
      }
      // Coexistence: הודעות שחנן שולח מאפליקציית WhatsApp Business
      for (const echo of v.message_echoes || []) {
        await handleOwnerEcho(env, echo, now);
      }
      // Coexistence: סנכרון אנשי קשר והיסטוריה מהאפליקציה בזמן החיבור
      if (['history', 'smb_app_state_sync'].includes(change.field)) {
        const n = await importKnownContacts(env, v, now);
        console.log(`imported ${n} known contacts from ${change.field}`);
      }
    }
  }
}
