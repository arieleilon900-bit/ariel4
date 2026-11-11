// npm run check: lists everything still missing before David's bot can go live.
// Exit code 1 while something blocks going live.
import { BUSINESS as B, APARTMENTS, PARTNERS, AGENCY, TEMPLATES, DRAFT, FEATURES } from '../src/config.js';

const block = [], warn = [];
const phone = (p) => /^9725\d{8}$/.test(p || '');

if (DRAFT) block.push('config.js עדיין DRAFT = true. להחליף ל-false רק אחרי שכל הנתונים אמיתיים.');
if (!phone(B.ownerPhone)) block.push('ownerPhone: המספר של דוד להתראות (9725XXXXXXXX).');
if (!phone(AGENCY.techPhone)) block.push('AGENCY.techPhone: המספר של השותף שמקבל התראות על תקלות.');
if (B.bookingFlow === 'pay_to_confirm' && !B.paymentLink) block.push('bookingFlow הוא pay_to_confirm אבל אין paymentLink.');
if (!B.reviewLinks?.google && !B.reviewLinks?.airbnb && !B.reviewLinks?.booking) warn.push('אין קישור לביקורת, אז בקשת ביקורת לא תישלח.');
if (B.cleanerPhone && !phone(B.cleanerPhone)) warn.push('cleanerPhone לא בפורמט 9725XXXXXXXX.');
if (B.area === 'לא ידוע עדיין') warn.push('BUSINESS.area לא מולא.');

APARTMENTS.forEach((a, i) => {
  const n = `דירה ${i + 1} (${a.name})`;
  if (/דוגמה/.test(a.name)) block.push(`${n}: השם והנתונים הם דוגמה.`);
  if (!a.capacity?.maxGuests || !a.capacity?.maxAdults) block.push(`${n}: חסרה קיבולת.`);
  if (!a.prices?.weeknight) block.push(`${n}: חסר מחיר.`);
  if (!a.privateInfo?.address) block.push(`${n}: חסרה כתובת (נשלחת רק אחרי אישור).`);
  if (!a.privateInfo?.door) warn.push(`${n}: חסר קוד או הוראות כניסה לתזכורת של יום לפני.`);
  if (!a.privateInfo?.wifi) warn.push(`${n}: חסר Wi-Fi.`);
  if (!a.icalUrls?.length) warn.push(`${n}: אין קישור יומן (Airbnb/Booking). בלי זה הבוט לא יודע על הזמנות שנסגרו שם.`);
  if (!a.photoUrls?.length && !a.photos) warn.push(`${n}: אין תמונות.`);
  for (const f of a.features || []) if (!FEATURES[f]) block.push(`${n}: מאפיין לא מוכר "${f}".`);
  for (const s of a.seasons || []) if (!(s.from <= s.to)) block.push(`${n}: עונה "${s.label}" עם תאריכים הפוכים.`);
});
const ids = APARTMENTS.map(a => a.id);
if (new Set(ids).size !== ids.length) block.push('יש שתי דירות עם אותו id.');

if (!PARTNERS.length) warn.push('אין שותפים לתיווך. לידים יגיעו לדוד בלי הצעה למי להעביר.');
PARTNERS.forEach(p => { if (!phone(p.phone)) warn.push(`שותף ${p.name}: טלפון לא בפורמט 9725XXXXXXXX.`); });
if (B.referral.mode === 'direct' && !PARTNERS.length) block.push('referral.mode הוא direct אבל אין שותפים.');

for (const [k, t] of Object.entries(TEMPLATES)) if (!t.name) warn.push(`אין תבנית WhatsApp מאושרת ל-${k}. אחרי 24 שעות בלי הודעה מהאורח זה לא יישלח.`);

const env = ['ANTHROPIC_API_KEY', 'WA_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_APP_SECRET', 'WA_VERIFY_TOKEN', 'HEALTH_TOKEN', 'WA_NOTIFY_TEMPLATE'];
console.log(block.length ? `\n❌ חוסם עלייה לאוויר (${block.length}):\n` + block.map(x => '  • ' + x).join('\n') : '\n✅ אין חוסמים.');
console.log(warn.length ? `\n⚠️  כדאי להשלים (${warn.length}):\n` + warn.map(x => '  • ' + x).join('\n') : '');
console.log(`\nסודות שצריכים להיות מוגדרים ב-Cloudflare (npx wrangler secret list):\n  ${env.join(', ')}\n`);
process.exit(block.length ? 1 : 0);
