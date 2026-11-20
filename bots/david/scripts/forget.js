// npm run forget -- <phone | ig:IGSID>
// A guest asked to delete their data (privacy policy: ae/privacy, "למחוק את המידע שלכם").
// Prints the SQL to run against the live database. Bookings are kept for the business's
// records but anonymized (name and phone removed).
import { normalizePhone } from '../src/logic.js';

const raw = process.argv[2];
if (!raw) { console.error('שימוש: npm run forget -- 0541234567   (או ig:123456 לאינסטגרם)'); process.exit(1); }
const id = raw.startsWith('ig:') ? raw : normalizePhone(raw);
if (!id) { console.error('לא הבנתי את המספר.'); process.exit(1); }
const q = (s) => `'${s.replace(/'/g, "''")}'`;
export const forgetSql = (id) => [
  `DELETE FROM conversations WHERE phone = ${q(id)};`,
  `DELETE FROM subscribers WHERE phone = ${q(id)};`,
  `DELETE FROM missed_calls WHERE phone = ${q(id)};`,
  `DELETE FROM contacts WHERE phone = ${q(id)};`,
  `UPDATE usage SET phone = NULL WHERE phone = ${q(id)};`,
  `UPDATE referrals SET phone = 'deleted', data = '{}' WHERE phone = ${q(id)};`,
  `UPDATE bookings SET name = 'נמחק לבקשת הלקוח', phone = 'deleted', notes = '', chat = NULL WHERE phone = ${q(id)} OR chat = ${q(id)};`,
].join(' ');
console.log(`npx wrangler d1 execute david-bot --remote --command "${forgetSql(id)}"`);
console.log('\nאחרי ההרצה: לשלוח לאדם אישור שהמידע נמחק. אם ההזמנה שלו ביומן גוגל, למחוק משם גם את האירוע.');
