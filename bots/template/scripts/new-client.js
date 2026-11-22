// npm run new-client -- clients/<answers>.json
// Builds bots/<slug>/ from this template: copies the code, writes src/config.js from the
// questionnaire answers, renames the worker and the database, and writes CHECKLIST.md for
// the package the client bought. The new bot starts locked (DRAFT = true).
import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSINESS as T, APARTMENTS as TA, AGENCY as TAG, TEMPLATES, FEATURES } from '../src/config.js';
import { PACKAGES, MODULE_NAMES } from '../src/logic.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, '..');
const BOTS = resolve(TEMPLATE, '..');

const file = process.argv[2];
if (!file) { console.error('שימוש: npm run new-client -- clients/<answers>.json'); process.exit(1); }
const A = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));

const errors = [];
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(A.slug || '')) errors.push('slug: אותיות באנגלית קטנות, מספרים ומקפים, למשל shalom-movers');
if (!PACKAGES[A.package]) errors.push(`package: אחד מ-${Object.keys(PACKAGES).join(', ')}`);
if (!['service', 'rentals'].includes(A.niche)) errors.push('niche: service או rentals');
if (!A.business?.businessName) errors.push('business.businessName חסר');
if (A.niche === 'rentals' && !(A.apartments || []).length) errors.push('rentals: צריך לפחות דירה אחת ב-apartments');
if (A.niche === 'service' && !(A.business?.services || []).length) errors.push('service: צריך business.services');
const target = join(BOTS, A.slug || '_');
if (existsSync(target)) errors.push(`כבר קיימת תיקייה ${target}. לא דורסים.`);
if (errors.length) { console.error('❌ ' + errors.join('\n❌ ')); process.exit(1); }

// What the template knows about David's apartments must not leak into a new client.
const NEUTRAL = {
  area: '', style: 'חם, קצר, בגובה העיניים.', shabbat: 'הבוט עונה כרגיל, ומה שצריך את בעל העסק ממתין למוצאי שבת',
  ownerPhone: '', cleanerPhone: '', paymentLink: '', bookingFlow: 'owner_confirms',
  reviewLinks: { google: '', airbnb: '', booking: '', facebook: '' },
  urgent: A.niche === 'service' ? 'סכנה, הצפה, נעילה בחוץ עם ילד או בעל חיים, לקוח שצריך את השירות עוד היום' : 'תקלה בדירה בזמן שהייה (מים, חשמל, נעילה בחוץ), אורח כועס, קבוצה מעל 10 אנשים',
  never: 'לא נותנים הנחה בלי אישור של בעל העסק.',
  calendar: { googleCalendarId: '', perApartment: {} }, addons: [],
};
const business = {
  ...T, ...NEUTRAL, ...A.business,
  niche: A.niche, package: A.package,
  botName: A.business.botName || A.business.ownerName || A.business.businessName,
  modules: { ...(A.business.modules || {}) }, // empty = the package decides
};

const aptDefaults = { ...TA[0], id: '', name: '', summary: '', photos: '', photoUrls: [], prices: {}, features: [], rules: '', amenities: '',
  privateInfo: { address: '', door: '', wifi: '', parking: '' }, icalUrls: [], promo: '', nearby: '' };
const apartments = A.niche === 'rentals'
  ? A.apartments.map((a, i) => ({ ...aptDefaults, ...a, id: a.id || `apt${i + 1}`, privateInfo: { ...aptDefaults.privateInfo, ...(a.privateInfo || {}) } }))
  : [];

const today = new Date().toISOString().slice(0, 10);
const js = (v) => JSON.stringify(v, null, 2);
const config = `// ${business.businessName}: נוצר מהשאלון ב-${today} (scripts/new-client.js). אפשר לערוך חופשי.
// חבילה: ${A.package}. סוג עסק: ${A.niche}. מה דלוק בחבילה: ${PACKAGES[A.package].join(', ')}.
// כדי להדליק או לכבות משהו בנפרד: BUSINESS.modules, למשל { instagram: true }.

export const DRAFT = true; // false רק אחרי שכל הנתונים אמיתיים ו-npm run check עובר

export const BUSINESS = ${js(business)};

export const AGENCY = ${js({ ...TAG, clientName: business.businessName, techPhone: A.agency?.techPhone || TAG.techPhone })};

export const APARTMENTS = ${js(apartments)};

export const PARTNERS = [];

export const TEMPLATES = ${js(TEMPLATES)};

export const FEATURES = ${js(FEATURES)};
`;

mkdirSync(target);
cpSync(TEMPLATE, target, {
  recursive: true,
  filter: (src) => !/[\\/](node_modules|clients)([\\/]|$)/.test(src.slice(TEMPLATE.length)) && !/new-client\.js$/.test(src),
});
writeFileSync(join(target, 'src', 'config.js'), config);

const wrangler = readFileSync(join(target, 'wrangler.toml'), 'utf8')
  .replace('name = "david-booking-bot"', `name = "${A.slug}-bot"`)
  .replaceAll('david-bot', `${A.slug}-bot`);
writeFileSync(join(target, 'wrangler.toml'), wrangler);
const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
pkg.name = `${A.slug}-bot`;
delete pkg.scripts['new-client'];
writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(join(target, 'answers.json'), JSON.stringify(A, null, 2) + '\n');

// ---------- CHECKLIST.md ----------
const on = new Set(PACKAGES[A.package].filter(m => !(A.niche === 'service' && ['calendar', 'stayMessages', 'waitlist', 'addons', 'referrals'].includes(m))));
const box = (s) => `- [ ] ${s}`;
const lines = [
  `# ${business.businessName}: מה עושים עד שהכל באוויר`,
  '',
  `חבילה: **${A.package}**. סוג עסק: **${A.niche}**. נוצר ${today}.`,
  '',
  '## הבוט',
  box('`npm install && npm test` (כל הבדיקות עוברות)'),
  box('`npm run check`: להשלים כל מה שמסומן ❌'),
  box(`מספר להתראות: \`BUSINESS.ownerPhone\`${business.ownerPhone ? ' (מולא)' : ''}`),
  box('Cloudflare: `npx wrangler d1 create ' + `${A.slug}-bot` + '`, להדביק את ה-id ב-wrangler.toml, ואז `npx wrangler d1 migrations apply ' + `${A.slug}-bot` + ' --remote`'),
  box('סודות: ANTHROPIC_API_KEY, WA_TOKEN (טוקן קבוע של System User), WA_PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN, HEALTH_TOKEN'),
  box('וואטסאפ: Embedded Signup עם coexistence (הלקוח בוואטסאפ עסקי), webhook ל-`/webhook` עם `messages` ו-`smb_message_echoes`'),
  box('תבנית `owner_alert` מאושרת ב-Meta, והשם שלה ב-WA_NOTIFY_TEMPLATE'),
  ...(on.has('instagram') ? [box('אינסטגרם: חשבון מקצועי, IG_TOKEN, webhook עם `messages` ו-`message_echoes`, אפליקציה במצב Live. בדיקה מחשבון שאינו בודק')] : []),
  ...(on.has('missedCalls') ? [box('שיחות שלא נענו: אנדרואיד או אייפון? MISSED_CALL_TOKEN, תבנית `missed_call`, ייבוא אנשי קשר (`npm run contacts`)')] : []),
  ...(on.has('calendar') ? [box('יומן גוגל: חשבון שירות, GCAL_SA_JSON, שיתוף היומנים, ובדיקה עם `יומן`')] : []),
  ...(on.has('stayMessages') ? [box('תבניות הודעות שהייה: reminder, welcome, checkout, review, comeback')] : []),
  ...(on.has('reviews') ? [box('קישור לביקורת בגוגל: `BUSINESS.reviewLinks.google`, ותבנית `review`')] : []),
  ...(on.has('offers') ? [box('רשימת תפוצה: תבנית `offer` (Marketing). רק למי שהסכים')] : []),
  ...(on.has('waitlist') ? [box('רשימת המתנה: תבנית `waitlist`')] : []),
  ...(on.has('addons') ? [box('תוספות: למלא `BUSINESS.addons`, ותבנית `extend`')] : []),
  box('בדיקה מקצה לקצה עם `ALLOW_DRAFT=1` על שני טלפונים, ואז `DRAFT = false` ו-`npm run deploy`'),
  box('`/health` ב-UptimeRobot'),
];
if (A.package !== 'mazkira') {
  lines.push('', '## מעבר לבוט (חבילת פרו)',
    box('אתר: דומיין, לוגו, תמונות. המזכירה בתוך האתר. נגישות ומדיניות פרטיות'),
    box('פרופיל עסקי בגוגל: הקמה או קבלת גישה, תמונות, שעות'),
    box('8 פוסטים בחודש: לוח תוכן לחודש הראשון'),
    box('כרטיס ביקור דיגיטלי עם QR לוואטסאפ'));
}
if (A.package === 'premium') {
  lines.push('', '## מעבר לפרו (חבילת פרימיום)',
    box('מיתוג: לוגו, צבעים, תבניות לרשתות'),
    box('כרטיסי ביקור להדפסה ומדבקות QR'),
    box('מודעות: גישה לחשבון המודעות של הלקוח, תקציב חודשי, קמפיין וואטסאפ ישיר'),
    box('12 פוסטים ו-4 רילסים בחודש'),
    box('הודעה ללקוחות ישנים (רק למי שהסכים)'),
    box('פגישה חודשית ודוח'));
}
writeFileSync(join(target, 'CHECKLIST.md'), lines.join('\n') + '\n');

console.log(`✅ נוצר ${target}`);
console.log(`חבילה ${A.package}: ${MODULE_NAMES.filter(m => on.has(m)).join(', ')}`);
console.log(`הבא: cd bots/${A.slug} && npm install && npm test && npm run check`);
