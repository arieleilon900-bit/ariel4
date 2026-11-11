// WhatsApp Cloud API: webhook verification, signature check, sending.
// Env: WA_TOKEN, WA_PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN,
//      WA_NOTIFY_TEMPLATE (optional, approved template with one {{1}} body param).

const GRAPH = 'https://graph.facebook.com/v21.0';

export function verifyWebhook(url, env) {
  const p = url.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === env.WA_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Meta signs every webhook body with the app secret (X-Hub-Signature-256).
export async function validSignature(raw, header, secret) {
  if (!secret) return false;
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Pull the incoming messages out of a webhook payload.
export function incomingMessages(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile?.name || '']));
      for (const m of v.messages || []) {
        out.push({
          id: m.id, from: m.from, name: names[m.from] || '', type: m.type,
          mediaId: m.audio?.id || m.image?.id || null,
          mime: m.audio?.mime_type || m.image?.mime_type || null,
          caption: m.image?.caption || '',
          text: m.type === 'text' ? m.text?.body || ''
            : m.type === 'button' ? m.button?.text || ''
            : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '')
            : m.type === 'location' ? `[מיקום: ${m.location?.latitude},${m.location?.longitude}]`
            : '',
        });
      }
    }
  }
  return out;
}

async function post(env, body) {
  const res = await fetch(`${GRAPH}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `WhatsApp ${res.status}`);
    err.code = json?.error?.code;
    throw err;
  }
  return json;
}

export async function sendText(env, to, text) {
  if (env.OUTBOX) { env.OUTBOX.push({ to, text }); return { test: true }; } // tests
  if (env.DRY_RUN === '1') { console.log(`[DRY_RUN → ${to}]\n${text}`); return { dry: true }; }
  // WhatsApp caps a text message at 4096 characters.
  const chunks = [];
  for (let s = String(text); s.length; s = s.slice(4000)) chunks.push(s.slice(0, 4000));
  let last;
  for (const c of chunks) last = await post(env, { to, type: 'text', text: { body: c, preview_url: true } });
  return last;
}

// Messages to David, the cleaner or a partner. Outside the 24-hour window WhatsApp
// only allows approved templates (error 131047), so fall back to the template.
export async function sendNotify(env, to, text) {
  if (!to) { console.warn('notify skipped: no number', text.slice(0, 80)); return null; }
  try {
    return await sendText(env, to, text);
  } catch (e) {
    if (e.code !== 131047 || !env.WA_NOTIFY_TEMPLATE) throw e;
    return post(env, {
      to, type: 'template',
      template: {
        name: env.WA_NOTIFY_TEMPLATE,
        language: { code: env.WA_TEMPLATE_LANG || 'he' },
        // Template params can't hold newlines, so flatten the message.
        components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\s*\n+\s*/g, ' | ').slice(0, 1000) }] }],
      },
    });
  }
}

// Incoming voice notes and photos: WhatsApp gives a media id; we fetch the
// short-lived URL, then the bytes (both need the token).
export async function downloadMedia(env, mediaId) {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { authorization: `Bearer ${env.WA_TOKEN}` } });
  if (!meta.ok) throw new Error(`media meta ${meta.status}`);
  const { url, mime_type } = await meta.json();
  const file = await fetch(url, { headers: { authorization: `Bearer ${env.WA_TOKEN}` } });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: mime_type };
}

export async function sendImage(env, to, link, caption = '') {
  if (env.OUTBOX) { env.OUTBOX.push({ to, image: link, text: caption }); return { test: true }; }
  if (env.DRY_RUN === '1') { console.log(`[DRY_RUN image → ${to}] ${link} ${caption}`); return { dry: true }; }
  return post(env, { to, type: 'image', image: { link, caption: caption.slice(0, 1000) } });
}

// Messages we start outside the 24-hour window must be approved templates.
// tpl: { name, lang } from config; params fill {{1}}, {{2}}... in the body.
// Without a template we try plain text, which only works inside the window.
export async function sendTemplate(env, to, tpl, params, fallbackText) {
  if (!tpl?.name) return sendText(env, to, fallbackText);
  if (env.OUTBOX) { env.OUTBOX.push({ to, template: tpl.name, params, text: fallbackText }); return { test: true }; }
  if (env.DRY_RUN === '1') { console.log(`[DRY_RUN template ${tpl.name} → ${to}]`, params); return { dry: true }; }
  return post(env, {
    to, type: 'template',
    template: {
      name: tpl.name,
      language: { code: tpl.lang || env.WA_TEMPLATE_LANG || 'he' },
      components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p).replace(/\s*\n+\s*/g, ' | ').slice(0, 1000) })) }],
    },
  });
}
