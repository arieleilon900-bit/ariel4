// לקוח חדש: node scripts/new-client.mjs <שם-באנגלית>   (למשל: node scripts/new-client.mjs cohen-ac)
// יוצר clients/<שם>/ עם קובץ הגדרות וקובץ שרת, ומדפיס מה לעשות אחר כך.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
if (!slug || !/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) {
  console.error('שם לא תקין. רק אותיות קטנות באנגלית, מספרים ומקפים. למשל: cohen-ac');
  process.exit(1);
}
const dir = resolve(root, 'clients', slug);
if (existsSync(dir)) { console.error(`clients/${slug} כבר קיים`); process.exit(1); }
cpSync(resolve(root, 'clients/_template'), dir, { recursive: true });
const prefix = slug.toUpperCase().replace(/-/g, '_');
const w = resolve(dir, 'wrangler.toml');
writeFileSync(w, readFileSync(w, 'utf8').replaceAll('__SLUG__', slug).replaceAll('__PREFIX__', prefix));
console.log(`נוצר clients/${slug}/

מה עכשיו:
1. למלא את clients/${slug}/client.js (שם, מקצוע, מה לשאול, מה דחוף). אפשר לבקש מ-Claude למלא מהטופס של הלקוח.
2. Cloudflare: D1 חדש בשם ${slug}-bot, ואת ה-Database ID לשים ב-clients/${slug}/wrangler.toml.
3. Meta: חשבון עסקי ואפליקציה ללקוח. Phone number ID, WABA_ID, META_APP_ID ו-OWNER_PHONE לשים באותו קובץ.
4. GitHub Secrets עם הקידומת ${prefix}_ : ${prefix}_WA_TOKEN, ${prefix}_WA_VERIFY_TOKEN, ${prefix}_WA_APP_SECRET (ואם יש: ${prefix}_GOOGLE_SA_JSON, ${prefix}_ANTHROPIC_API_KEY).
5. git push. הבוט עולה לבד לכתובת ${slug}-bot.<החשבון>.workers.dev
6. לפתוח https://${slug}-bot.<החשבון>.workers.dev/admin/setup?key=<${prefix}_WA_VERIFY_TOKEN> . הוא מחבר את Meta ויוצר את התבניות.
`);
