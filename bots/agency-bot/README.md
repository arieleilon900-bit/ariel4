# הבוט של עונה ראשון: מנוע אחד לכל הלקוחות

בוט וואטסאפ שעונה ללקוחות של עסק, אוסף פרטים, מעביר לבעל העסק סיכום, ומטפל בתזכורות, מעקבים וביקורות.
הקוד ב-`src/` משותף לכל הלקוחות. כל לקוח הוא תיקייה אחת ב-`clients/`. כל לקוח מקבל שרת ומסד נתונים משלו, בלי ערבוב.

(הבוט של חנן נמצא בנפרד ב-`bots/hanan-locksmith` ולא קשור לתיקייה הזו.)

## מה יש פה
| מה | איפה |
|---|---|
| הקוד המשותף | `src/` |
| לקוח: ההגדרות (שם, מקצוע, מה לשאול, מה דחוף, סגנון, תשובות) | `clients/<שם>/client.js` |
| לקוח: השרת (מזהים של Cloudflare ו-Meta) | `clients/<שם>/wrangler.toml` |
| תבנית ללקוח חדש | `clients/_template/` |
| חמישה עסקים לדוגמה (לדף הניסיון) | `clients/demo-*` |
| דף הניסיון | `sim/` ← `node sim/build.mjs` |
| בדיקות | `npm test` |
| העלאה לשרת | `.github/workflows/agency-bot.yml` (לבד, בכל push) |

## לקוח חדש, צעד אחרי צעד (בערך שעה, בלי לכתוב קוד)
1. **מתחילים מהלקוח:** הוא ממלא את שני הטפסים (על העסק, ו"איך אתה עונה"). אם אפשר, הוא גם שולח שיחות מיוצאות.
2. **תיקייה:** `node scripts/new-client.mjs <שם-באנגלית>` (למשל `cohen-ac`).
3. **הגדרות:** ממלאים את `clients/<שם>/client.js` לפי הטפסים. אפשר לבקש מ-Claude: "תמלא את client.js של cohen-ac לפי הטופס הזה".
4. **Cloudflare:** Storage & Databases ← D1 ← Create, בשם `<שם>-bot`. את ה-Database ID שמים ב-`clients/<שם>/wrangler.toml`.
5. **Meta, בשם הלקוח:**
   - חשבון עסקי, אפליקציה ומספר בדיקה. אותם שלבים כמו אצל חנן (`automation-agency/clients/hanan-locksmith/how-to-build.md`, שלב 4).
   - את Phone number ID, WABA_ID, META_APP_ID ו-OWNER_PHONE שמים ב-`wrangler.toml` של הלקוח.
6. **GitHub Secrets עם קידומת של הלקוח** (שם באותיות גדולות, מקף הופך לקו תחתון):
   - `COHEN_AC_WA_TOKEN`, `COHEN_AC_WA_VERIFY_TOKEN`, `COHEN_AC_WA_APP_SECRET`
   - לא חובה: `COHEN_AC_GOOGLE_SA_JSON`.
   - `COHEN_AC_ANTHROPIC_API_KEY`: לא חובה. אם אין, משתמשים במפתח המשותף `ANTHROPIC_API_KEY`.
   - `CLOUDFLARE_API_TOKEN` ו-`CLOUDFLARE_ACCOUNT_ID`: משותפים לכל הלקוחות.
7. **push:** הבוט עולה לבד ל-`https://<שם>-bot.<החשבון>.workers.dev`
8. **הגדרה אוטומטית:** פותחים `https://<שם>-bot.<החשבון>.workers.dev/admin/setup?key=<ה-VERIFY_TOKEN>`. הדף מחבר את Meta לשרת ויוצר את התבניות.
9. **בדיקה ומעבר:** בודקים על מספר הבדיקה, ועוברים למספר האמיתי (360dialog או ישירות).

## מה אפשר לשנות לכל לקוח (`client.js`)
- **`business`:**
  - שם, בעל העסק (זכר/נקבה), מקצוע, שירותים, אזורים, שעות ושבת.
  - `intake.steps`: מה הבוט שואל ובאיזה סדר.
  - `urgentExamples`: מה דחוף.
  - `issueLabel`: איך קוראים לבקשה בסיכום (תקלה / טיפול / בקשה).
  - `needsAddress`: אם צריך כתובת. בקליניקה, למשל, הלקוח מגיע לעסק.
  - `voice`, `faq`, `examples`: הסגנון והתשובות של בעל העסק.
- **`messages`:** כל הודעה קבועה. ברירת המחדל נבנית מהשם של העסק.
- **`templates`:** הטקסט של כל תבנית ב-Meta לפי שם.
- **`features`:** למשל `receipts` (קבלות מיש חשבונית), כבוי כברירת מחדל.
- **`timing`:** אחרי כמה זמן מזכירים, מתי שולחים ביקורת וכו'.

הבדיקות (`npm test`) עוברות על כל הלקוחות בתיקייה. הן בודקות שכל אחד נטען, שההוראות ל-AI שלו נבנות נכון, ושהתבניות שלו עומדות בכללים של Meta.
