// WhatsApp Cloud API (Meta): שליחה, קבלת מדיה, ובדיקת חתימה.

// שני ספקים אפשריים, אותו מבנה הודעות:
// meta (ברירת מחדל): ישירות מול Meta, עם WA_TOKEN ו-WA_PHONE_NUMBER_ID
// 360dialog: ספק מורשה (בשביל מספר שעובד גם באפליקציה וגם בבוט), עם D360_API_KEY
const D360 = 'https://waba-v2.360dialog.io';
export const is360 = (env) => env.WA_PROVIDER === '360dialog';
const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v24.0'}`;
const authHeaders = (env) => (is360(env) ? { 'D360-API-KEY': env.D360_API_KEY } : { Authorization: `Bearer ${env.WA_TOKEN}` });
// כתובת לשליחה: ב-Meta דרך מזהה המספר, ב-360dialog ישירות
const endpoint = (env, path) => (is360(env) ? `${D360}/${path}` : `${graph(env)}/${env.WA_PHONE_NUMBER_ID}/${path}`);

async function call(env, path, body) {
  const res = await fetch(endpoint(env, path), {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('WhatsApp API error', res.status, JSON.stringify(data));
    return { ok: false, status: res.status, data };
  }
  return { ok: true, data };
}

export function sendText(env, to, text) {
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'text',
    text: { body: String(text).slice(0, 4000), preview_url: true },
  });
}

// מסמך לפי קישור (https://...) או לפי מזהה מדיה שהועלה ל-Meta
const docRef = (doc, filename) => (/^https?:\/\//.test(doc) ? { link: doc, filename } : { id: doc, filename });

// תבנית מאושרת. params = מחרוזות למשתנים {{1}}, {{2}}...; doc = PDF בכותרת (לקבלות): קישור או מזהה מדיה
export function sendTemplate(env, to, name, params = [], doc = null, filename = 'receipt.pdf') {
  const components = [];
  if (doc) {
    components.push({ type: 'header', parameters: [{ type: 'document', document: docRef(doc, filename) }] });
  }
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) });
  }
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'template',
    template: { name, language: { code: env.TEMPLATE_LANG || 'he' }, components },
  });
}

export function sendDocument(env, to, doc, filename, caption) {
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'document',
    document: { ...docRef(doc, filename), caption },
  });
}

export function sendImageById(env, to, mediaId, caption) {
  return call(env, 'messages', {
    messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId, caption },
  });
}

export function markRead(env, messageId) {
  return call(env, 'messages', {
    messaging_product: 'whatsapp', status: 'read', message_id: messageId,
  });
}

// מורידים מדיה שלקוח שלח (תמונה / הקלטה)
export async function downloadMedia(env, mediaId) {
  const meta = await fetch(is360(env) ? `${D360}/${mediaId}` : `${graph(env)}/${mediaId}`, { headers: authHeaders(env) });
  if (!meta.ok) throw new Error(`media meta ${meta.status}`);
  const info = await meta.json();
  // ב-360dialog מורידים דרך השרת שלהם: מחליפים את הכתובת של Meta בכתובת שלהם
  const url = is360(env) ? String(info.url).replace(/\\/g, '').replace('https://lookaside.fbsbx.com', D360) : info.url;
  const file = await fetch(url, { headers: authHeaders(env) });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: info.mime_type || 'application/octet-stream' };
}

// מעלים מדיה מחדש כדי לשלוח אותה לחנן (מזהה מדיה של הודעה נכנסת לא תמיד אפשר לשלוח הלאה)
export async function uploadMedia(env, bytes, mime) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([bytes], { type: mime }), 'file');
  const res = await fetch(endpoint(env, 'media'), {
    method: 'POST', headers: authHeaders(env), body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`media upload ${res.status} ${JSON.stringify(data)}`);
  return data.id;
}

// בדיקת חתימת Meta (X-Hub-Signature-256) כדי שרק Meta יוכלו לשלוח לשרת
export async function verifySignature(appSecret, rawBody, header) {
  if (!appSecret) return true; // אם לא הוגדר סוד, לא בודקים (רק בשלב בדיקות)
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expected = header.slice(7);
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function toBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
