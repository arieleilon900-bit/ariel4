// חיבור ל"יש חשבונית": שליפת מסמכים (קבלות) חדשים כדי לשלוח אותם ללקוח בוואטסאפ.
// התיעוד: https://user.yeshinvoice.co.il/api/doc (Documents ← View = getInvoices)
// הסודות: YESH_USERKEY ו-YESH_SECRET (מהגדרות ה-API בחשבון של חנן ביש חשבונית).
import { ilParts, normalizePhone, nowIso } from './util.js';

const API = 'https://api.yeshinvoice.co.il/api/v1';
// 6 = קבלה, 8 = חשבונית מס, 9 = חשבונית מס/קבלה
const DEFAULT_DOC_TYPES = [6, 8, 9];

export const yeshConfigured = (env) => !!(env.YESH_USERKEY && env.YESH_SECRET);

// "yyyy-MM-dd HH:mm" בשעון ישראל, כמו שיש חשבונית מצפים
function ilStamp(date) {
  const p = ilParts(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${p.hh}:${p.mm}`;
}

export async function yeshCall(env, method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: JSON.stringify({ secret: env.YESH_SECRET, userkey: env.YESH_USERKEY }),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.Success === false) throw new Error(`yesh ${method} ${res.status} ${data.ErrorMessage || ''}`.trim());
  return data;
}

// מסמכים שנוצרו מאז הבדיקה הקודמת. בפעם הראשונה: רק מסמנים את הנקודה, כדי לא לשלוח ללקוחות קבלות ישנות
export async function fetchNewDocuments(env, now = new Date()) {
  if (!yeshConfigured(env)) return [];
  const last = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'yesh_last_poll'").first())?.value;
  const save = () => env.DB.prepare("INSERT INTO settings (key, value) VALUES ('yesh_last_poll', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(nowIso(now)).run();
  if (!last) { await save(); return []; }

  // חפיפה של 10 דקות, למקרה שמסמך נוצר בדיוק בזמן הבדיקה (מסמך שכבר נשלח לא יישלח שוב)
  const from = new Date(new Date(last).getTime() - 10 * 60000);
  const docTypes = env.YESH_DOC_TYPES ? String(env.YESH_DOC_TYPES).split(',').map(Number) : DEFAULT_DOC_TYPES;
  const docs = [];
  for (let page = 1; page <= 3; page++) {
    const data = await yeshCall(env, 'getInvoices', {
      CustomerID: -1, PageSize: 50, PageNumber: page, docTypes, Search: '', from: ilStamp(from), to: ilStamp(now),
    });
    for (const d of data.ReturnValue || []) {
      docs.push({
        id: `${d.DocumentType}-${d.DocumentNumber}`,
        phone: normalizePhone(d.CustomerPhone),
        pdfUrl: d.pdfUrl && /^https?:\/\/\S+$/.test(d.pdfUrl) ? d.pdfUrl : '',
        customerName: d.CustomerName || '',
        total: d.TotalPrice,
      });
    }
    if (!data.totalpage || page >= data.totalpage) break;
  }
  await save();
  return docs;
}
