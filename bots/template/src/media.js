// Voice notes → text (Cloudflare Workers AI, Whisper; same Cloudflare account, no
// extra vendor). Photos → an image block Claude can look at.

import { downloadMedia } from './whatsapp.js';
import { downloadUrl } from './instagram.js';

// ref: a WhatsApp media id (string), or { url } for an Instagram attachment.
function fetchMedia(env, ref) {
  if (ref && typeof ref === 'object' && ref.url) return (env.downloadUrl || downloadUrl)(ref.url);
  return (env.downloadMedia || downloadMedia)(env, ref);
}

const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribe(env, ref) {
  if (!env.AI) throw new Error('אין חיבור ל-Workers AI (binding AI) לתמלול');
  const { bytes } = await fetchMedia(env, ref);
  const model = env.WHISPER_MODEL || '@cf/openai/whisper-large-v3-turbo';
  const out = await env.AI.run(model, { audio: toBase64(bytes) });
  const text = (out?.text || '').trim();
  if (!text) throw new Error('התמלול חזר ריק');
  return text;
}

export async function imageBlock(env, ref) {
  const { bytes, mime } = await fetchMedia(env, ref);
  const type = (mime || '').split(';')[0];
  if (!IMAGE_TYPES.includes(type)) throw new Error('סוג תמונה לא נתמך: ' + mime);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('התמונה גדולה מדי');
  return { type: 'image', source: { type: 'base64', media_type: type, data: toBase64(bytes) } };
}
