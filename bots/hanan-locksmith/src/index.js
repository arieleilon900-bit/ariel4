// נקודת הכניסה של השרת (Cloudflare Worker).
// GET /webhook  ← אימות של Meta בזמן החיבור
// POST /webhook ← הודעות נכנסות מוואטסאפ
// cron          ← תזכורות, מעקבים ודוח שבועי
import { handleFailedStatus, handleInbound, handleOwnerEcho, importKnownContacts } from './handler.js';
import { runEvery15, weeklyReport } from './cron.js';
import { verifySignature } from './whatsapp.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(healthText(env), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
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
      // בלי סוד: לא מקבלים כלום (חוץ מבדיקה מקומית עם ALLOW_UNSIGNED=1), כדי שאף אחד לא יתחזה ל-Meta
      const ok = env.WA_APP_SECRET
        ? await verifySignature(env.WA_APP_SECRET, raw, request.headers.get('x-hub-signature-256'))
        : env.ALLOW_UNSIGNED === '1';
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

// מה חסר בהגדרות (רק שמות, אף פעם לא ערכים)
export function healthText(env) {
  const need = {
    WA_TOKEN: env.WA_TOKEN, WA_VERIFY_TOKEN: env.WA_VERIFY_TOKEN, WA_APP_SECRET: env.WA_APP_SECRET,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, OWNER_PHONE: env.OWNER_PHONE,
    WA_PHONE_NUMBER_ID: env.WA_PHONE_NUMBER_ID && !String(env.WA_PHONE_NUMBER_ID).startsWith('REPLACE'),
  };
  const nice = { GOOGLE_SA_JSON: env.GOOGLE_SA_JSON, SHEET_ID: env.SHEET_ID, REVIEW_LINK: env.REVIEW_LINK, ADMIN_PHONE: env.ADMIN_PHONE };
  const missing = Object.keys(need).filter((k) => !need[k]);
  const optional = Object.keys(nice).filter((k) => !nice[k]);
  return [
    missing.length ? 'not ready' : 'ok',
    missing.length ? `missing: ${missing.join(', ')}` : '',
    optional.length ? `optional, not set: ${optional.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export async function processWebhook(env, body, now = new Date()) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      // כמה הודעות באותה משלוחה: במקביל, כדי שהבוט יענה עליהן ביחד ולא אחת אחת
      await Promise.all((v.messages || []).map((msg) => handleInbound(env, msg, names[msg.from], now)
        .catch((err) => console.error('message failed', msg.id, err))));
      // Coexistence: הודעות שחנן שולח מאפליקציית WhatsApp Business
      for (const echo of v.message_echoes || []) {
        await handleOwnerEcho(env, echo, now).catch((err) => console.error('echo failed', err));
      }
      // הודעות שלא נמסרו (מספר לא בוואטסאפ, תבנית שנעצרה וכו')
      for (const st of v.statuses || []) {
        if (st.status === 'failed') await handleFailedStatus(env, st, now).catch((err) => console.error('status failed', err));
      }
      // Coexistence: סנכרון אנשי קשר והיסטוריה מהאפליקציה בזמן החיבור
      if (['history', 'smb_app_state_sync'].includes(change.field)) {
        const n = await importKnownContacts(env, v, now);
        console.log(`imported ${n} known contacts from ${change.field}`);
      }
    }
  }
}
