// בדיקות: המחירון של דוד חייב להיות מדויק לגמרי (אסור לטעות), וההוראות נבנות נכון
import { promptFor, quote, schemaFor, israelToday, BOTS, freeDates } from './lib/bots.js';
const today = israelToday(new Date('2026-11-16T10:00:00Z')); // יום שני
let ok = 0, bad = 0; const t = (c, m) => { if (c) ok++; else { bad++; console.log('FAIL', m); } };
const Q = (apt, checkin, nights, kids) => quote('david', today, { apartment: String(apt), checkin, nights, kids });
// המחירון, שורה אחרי שורה
const cases = [
  // [דירה, כניסה, לילות, ילדים, מחיר צפוי]
  [1, '2026-11-23', 1, 0, 800], [1, '2026-11-23', 2, 0, 1200], [2, '2026-11-23', 1, 0, 900], [2, '2026-11-23', 2, 0, 1400], [3, '2026-11-23', 1, 0, 1200], [3, '2026-11-23', 2, 0, 2000],
  [1, '2026-11-26', 1, 0, 1000], [2, '2026-11-26', 1, 0, 1200], [3, '2026-11-26', 1, 0, 1400],
  [1, '2026-12-04', 1, 0, 1500], [2, '2026-11-27', 1, 0, 1500], [3, '2026-12-04', 1, 0, 1700],
  [1, '2026-12-04', 2, 0, 1700], [2, '2026-11-27', 2, 0, 1700], [3, '2026-12-04', 2, 0, 2000],
  [1, '2026-12-03', 2, 0, 2200], [2, '2026-12-03', 2, 0, 2200], [3, '2026-12-03', 2, 0, 2600],
  [3, '2026-11-23', 2, 2, 2000 + 100 * 2 * 2], [3, '2026-12-04', 1, 1, 1700 + 100],
];
for (const [a, d, n, k, exp] of cases) { const q = Q(a, d, n, k); t(q.price_available && q.total === exp, `apt${a} ${d} ${n}n kids${k}: got ${q.total} expected ${exp}`); }
t(Q(1, '2027-03-01', 1).price_available === false, 'no price from 1/3');
t(Q(1, '2027-02-28', 1).price_available === true, 'price until 28/2');
t(Q(1, '2026-11-23', 3).notes.some((x) => x.includes('3 לילות')), '3+ nights flags extra discount');
t(Q(1, '2026-11-16', 1).notes.some((x) => x.includes('דקה 90')), 'last minute flagged');
t(Q(1, '2026-12-03', 3).notes.some((x) => x.includes('חמישי עד ראשון')), 'thu-sun flagged');
const q = Q(1, '2026-11-20', 1); t(q.available === false, 'apt1 booked this weekend (demo calendar)');
t(Q(2, '2026-11-23', 2).lowest_allowed_10pct === Math.ceil(1400 * 0.9), '10% floor on real price');
for (const b of BOTS) { const p = promptFor(b, today, { memory: null, sent: [] }); t(p.length > 500, 'prompt ' + b); t(schemaFor(b).required.includes('reply'), 'schema ' + b); }
const pd = promptFor('david', today, {});
t(pd.includes('חמישי עד מוצ"ש 2,200') && pd.includes('תקף עד 1/3'), 'price list in prompt');
t(!/בלונים 250/.test(pd), 'no invented extras prices for David');
t(promptFor('dirot', today, {}).includes('רון') && !promptFor('dirot', today, {}).includes('דוד'), 'generic has no David');
const fd = freeDates('david', today, { nights: 2 }); t(fd.length === 3 && fd[0].free.length > 0, 'free dates');
console.log(`ok ${ok}, failed ${bad}`); process.exit(bad ? 1 : 0);
