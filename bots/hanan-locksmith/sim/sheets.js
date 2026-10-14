// דף הניסיון: במקום גוגל שיטס, הטבלה מוצגת בדף. אותו חישוב שורה כמו בגוגל: שורה אחת לכל פנייה, והסטטוס מתעדכן.
import { buildLeadRow, leadContext } from '../src/leadrow.js';

const rows = new Map();
export async function upsertLead(env, phone, fields, now = new Date()) {
  const { conv, cust, key } = await leadContext(env, phone);
  const row = buildLeadRow({ old: rows.get(key) || [], fields, conv, cust, phone, key, now });
  rows.set(key, row);
  env.onSheetRow?.(row, key);
  return true;
}
export async function getAccessToken() { return 'sim'; }
export async function ensureHeader() { return 'exists'; }
