// דף הניסיון: במקום לקרוא ל-API של Anthropic עם מפתח, ה-AI רץ דרך החשבון של מי שפותח את הדף ב-Claude.
// ההוראות ומבנה התשובה הם בדיוק אלה של הבוט האמיתי (src/prompt.js).
import { SCHEMA, buildSystemPrompt, fallbackResult, normalize } from '../src/prompt.js';

export { buildSystemPrompt };
export const MODEL = 'sim';

function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function runTurn(env, { history, image = null, now = new Date(), returningCustomer = null, profileName = '', knowledge = [] }) {
  const sample = env.SAMPLE;
  if (!sample) return fallbackResult('אין חיבור ל-Claude בדף הזה');
  const transcript = history.map((m) => `${m.role === 'assistant' ? 'הבוט' : 'הלקוח'}: ${m.text}`).join('\n');
  const fields = Object.entries(SCHEMA.properties).map(([k, v]) => `- ${k} (${v.type}${v.enum ? ': ' + v.enum.join('/') : ''})${v.description ? ': ' + v.description : ''}`).join('\n');
  const input = `${buildSystemPrompt({ now, returningCustomer, profileName, knowledge })}

השיחה עד עכשיו (ההודעה האחרונה היא של הלקוח${image ? ', והוא צירף תמונה שמצורפת כאן' : ''}):
${transcript}

החזר אובייקט JSON אחד בלבד, עם כל השדות האלה:
${fields}`;
  try {
    env.onAiStart?.();
    const out = await sample.json(input, { cache: false, effort: 'low', images: image ? [b64ToBlob(image.base64, image.mime)] : undefined });
    return normalize(out || {});
  } catch (e) {
    console.error('sample failed', e);
    env.onAiError?.(e);
    return fallbackResult(e?.code || 'error');
  } finally {
    env.onAiEnd?.();
  }
}
