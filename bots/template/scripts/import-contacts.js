// npm run contacts -- <contacts.vcf | contacts.csv> [out.sql]
//
// Turns a contacts export into SQL for the bot's `contacts` table, so the people
// already saved in the owner's phone never get the missed-call WhatsApp message.
//   iPhone: Contacts on iCloud.com → select all → Export vCard  (.vcf)
//   Android / Google: contacts.google.com → Export → Google CSV or vCard
// Then:  npx wrangler d1 execute david-bot --remote --file=<out.sql>
//
// The export is personal data: keep it and the .sql out of the repo, and delete both after.

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizePhone } from '../src/logic.js';

// vCard: FN (or N) + every TEL line. Handles folded lines and item1.TEL style.
export function parseVcf(text) {
  const out = [];
  const lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) cur = { name: '', phones: [] };
    else if (/^END:VCARD/i.test(line)) { if (cur) out.push(cur); cur = null; }
    else if (cur) {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      const k = key.replace(/^item\d+\./i, '').split(';')[0].toUpperCase();
      if (k === 'FN') cur.name = value;
      else if (k === 'N' && !cur.name) cur.name = value.split(';').filter(Boolean).reverse().join(' ');
      else if (k === 'TEL') cur.phones.push(value.replace(/^tel:/i, ''));
    }
  }
  return out;
}

function csvRows(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// Google CSV ("Phone 1 - Value"), Outlook CSV ("Mobile Phone"), or any CSV whose
// header has "phone"/"טלפון"/"נייד" columns and a name column.
export function parseCsv(text) {
  const [head, ...rows] = csvRows(text.replace(/^﻿/, ''));
  if (!head) return [];
  const h = head.map(x => x.trim().toLowerCase());
  const phoneCols = h.map((x, i) => (/phone|mobile|טלפון|נייד/.test(x) && !/type|label|סוג/.test(x) ? i : -1)).filter(i => i >= 0);
  const nameCol = h.findIndex(x => /^(name|full name|display name|שם|שם מלא)$/.test(x));
  const first = h.findIndex(x => /first name|given name|שם פרטי/.test(x));
  const last = h.findIndex(x => /last name|family name|שם משפחה/.test(x));
  return rows.map(r => ({
    name: (nameCol >= 0 ? r[nameCol] : [r[first], r[last]].filter(Boolean).join(' ')) || '',
    // Google packs several numbers in one cell: "054-111 ::: 03-222"
    phones: phoneCols.flatMap(i => String(r[i] || '').split(/:::|;|\|/)).map(s => s.trim()).filter(Boolean),
  }));
}

export function contactsToRows(contacts) {
  const seen = new Map();
  for (const c of contacts) for (const p of c.phones) {
    const phone = normalizePhone(p);
    if (phone && !seen.has(phone)) seen.set(phone, c.name || '');
  }
  return [...seen].map(([phone, name]) => ({ phone, name }));
}

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function toSql(rows, now = Date.now()) {
  return rows.map(r => `INSERT INTO contacts (phone, name, source, created_at) VALUES (${sq(r.phone)}, ${sq(r.name.slice(0, 100))}, 'import', ${now}) ON CONFLICT(phone) DO NOTHING;`).join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, out = 'contacts-import.sql'] = process.argv.slice(2);
  if (!file) { console.error('שימוש: npm run contacts -- contacts.vcf [out.sql]'); process.exit(1); }
  const text = readFileSync(file, 'utf8');
  const contacts = /BEGIN:VCARD/i.test(text) ? parseVcf(text) : parseCsv(text);
  const rows = contactsToRows(contacts);
  if (!rows.length) { console.error('לא נמצאו מספרי טלפון בקובץ.'); process.exit(1); }
  writeFileSync(out, toSql(rows));
  console.log(`נמצאו ${contacts.length} אנשי קשר, ${rows.length} מספרים.\nעכשיו להריץ:\n  npx wrangler d1 execute david-bot --remote --file=${out}\nואחר כך למחוק את ${file} ואת ${out} (מידע אישי).`);
}
