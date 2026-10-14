// שורה בטבלת הלקוחות: אותו חישוב לגוגל שיטס ולדף הניסיון.
import { displayPhone, ilParts } from './util.js';

export const SHEET_HEADERS = ['תאריך פנייה', 'סטטוס', 'שם', 'טלפון', 'תקלה', 'כתובת', 'דחוף', 'הערות', 'מה קרה', 'מזהה'];

const stamp = (d) => { const p = ilParts(d); return `${p.d}/${p.m}/${p.y} ${p.hh}:${p.mm}`; };

// הפנייה האחרונה של הלקוח והשם שלו, מהמסד
export async function leadContext(env, phone) {
  const conv = await env.DB.prepare('SELECT * FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
  const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(phone).first();
  return { conv, cust, key: conv ? `c${conv.id}` : `p${phone}` };
}

// old = השורה הקיימת (או []). שדה ריק לא מוחק את מה שכבר כתוב, ו"מה קרה" מצטבר.
export function buildLeadRow({ old = [], fields, conv, cust, phone, key, now }) {
  return [
    old[0] || stamp(conv?.started_at ? new Date(conv.started_at) : now),
    fields.status || old[1] || '',
    fields.name || cust?.name || old[2] || '',
    displayPhone(phone),
    fields.issue || conv?.issue || old[4] || '',
    fields.address || conv?.address || old[5] || '',
    (fields.urgent || conv?.urgent) ? 'כן' : (old[6] || ''),
    fields.note || old[7] || '',
    [old[8], `${stamp(now)} ${fields.status}`].filter(Boolean).join(' | '),
    key,
  ];
}
