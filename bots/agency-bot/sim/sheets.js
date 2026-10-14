// דף הניסיון: במקום גוגל שיטס, הטבלה מוצגת בדף. אותו חישוב שורה כמו בגוגל: שורה אחת לכל פנייה, והסטטוס מתעדכן.
import { buildLeadRow, leadContext, stamp } from '../src/leadrow.js';

const rows = new Map();
export async function upsertLead(env, phone, fields, now = new Date()) {
  const c = await env.DB.prepare('SELECT id FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
  if (c) await env.DB.prepare("UPDATE conversations SET lead_status = ?, lead_log = COALESCE(lead_log || ' | ', '') || ?, lead_note = COALESCE(NULLIF(?, ''), lead_note) WHERE id = ?").bind(fields.status || null, `${stamp(now)} ${fields.status || ''}`.trim(), fields.note || '', c.id).run();
  const { conv, cust, key } = await leadContext(env, phone);
  const row = buildLeadRow({ old: rows.get(key) || [], fields, conv, cust, phone, key, now });
  rows.set(key, row);
  env.onSheetRow?.(row, key);
  return true;
}
export async function getAccessToken() { return 'sim'; }
export async function ensureHeader() { return 'exists'; }
