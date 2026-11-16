// בדיקות מהירות: ההוראות נבנות, המחירון מחשב נכון, והסכמה תקינה
import { promptFor, quote, schemaFor, israelToday, BOTS } from './lib/bots.js';
const today = israelToday(new Date('2026-11-16T10:00:00Z'));
let ok = 0, bad = 0; const t = (c, m) => { if (c) ok++; else { bad++; console.log('FAIL', m); } };
for (const b of BOTS) { const p = promptFor(b, today, { memory: null, sent: [] }); t(p.length > 500, 'prompt ' + b); const s = schemaFor(b); t(s.required.includes('reply'), 'schema ' + b); }
t(promptFor('david', today, {}).includes('חמישי עד מוצ"ש'), 'motzash rule');
t(promptFor('dirot', today, {}).includes('רון') && !promptFor('dirot', today, {}).includes('דוד'), 'dirot has no David');
const q = quote('david', today, { apartment: '1', checkin: '2026-11-20', nights: 2 });
t(q.available === false && q.booked_nights.length === 2, 'apt1 booked this weekend');
const q2 = quote('david', today, { apartment: '2', checkin: '2026-11-19', nights: 2 });
t(q2.available && q2.total === 850 + 1100, 'thu+fri price ' + q2.total);
t(q2.lowest_allowed_10pct === Math.ceil(1950 * 0.9), '10% floor');
const q3 = quote('david', today, { apartment: '1', checkin: '2026-11-24', nights: 1, extras: ['בלונים', 'יין'] });
t(q3.total === 950 + 250 + 150 && q3.lowest_allowed_10pct === Math.ceil(950 * 0.9) + 400, 'extras not discounted');
console.log(`ok ${ok}, failed ${bad}`); process.exit(bad ? 1 : 0);
