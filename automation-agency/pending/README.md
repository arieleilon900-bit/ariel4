# שינויים שמחכים ל"תעלה"

הקבצים כאן הם שינויים בבוט ש**עוד לא באוויר**. הם נשמרים כקובץ (patch) ולא בתוך תיקיית הבוט, כדי ששום דחיפה לא תעלה אותם בטעות.

## google-calendar.patch: חיבור ליומן גוגל (29/10/2026). **עלה לבוט הכללי ב-20/11** (אריאל: "תעלה"). השלבים למטה (3-6) הם ההגדרה ללקוח חדש.
- **מה זה עושה:** כשבעל העסק כותב "תור מחר 14:30" (או לוחץ "קבע תור" במייל), התור נכנס גם ליומן הגוגל שלו: שם הלקוח, מה הפנייה, טלפון וקישור לוואטסאפ, וכתובת. "ביטול" מוחק אותו מהיומן. אם היומן נופל, התור נשמר והתזכורות עובדות, ובעל העסק מקבל "לא הצלחתי להכניס ליומן".
- **איפה:** הבוט הכללי בלבד (`bots/agency-bot`). הבוט של חנן לא השתנה.
- **נבדק:** 50 בדיקות עוברות (כולל בדיקה חדשה ליומן).
- **מה עוד לא עושה:** הבוט לא קובע תור לבד ולא בודק מתי בעל העסק פנוי. זה השלב הבא, אם נרצה.

### איך מעלים (רק אחרי "תעלה" של אריאל)
1. `git apply automation-agency/pending/google-calendar.patch`
2. `cd bots/agency-bot && npm test`
3. אצל הלקוח (`clients/<הלקוח>/wrangler.toml`): `CALENDAR_ID = "<ה-Gmail של בעל העסק>"`, ואפשר `CALENDAR_EVENT_MINUTES` (ברירת מחדל 60).
4. צריך את הסוד `GOOGLE_SA_JSON` (Service Account של גוגל, אותו אחד של הגיליון), עם Google Calendar API מופעל בפרויקט.
5. בעל העסק: ביומן גוגל ← הגדרות היומן ← שיתוף עם אנשים ← מוסיף את המייל של ה-Service Account עם "ביצוע שינויים באירועים".
6. הבדיקה (`/admin/setup?check=1`) מראה "יומן: יש גישה".

## david-bot.patch: הבוט של דוד בוואטסאפ האמיתי (16/11, **לא באוויר**)
מה יש בו:
- `bots/agency-bot/src/vacation.js`: מוח לדירות נופש. משתמש באותן הוראות ובאותו מחירון כמו הדמו (`automation-agency/demos/ai/lib`).
- `clients/david-vacation/`: ההגדרות של דוד והתמונות של 3 הדירות.
- חיבור ל-config, handler, cron, index ו-whatsapp (תמונה לפי קישור).
- 2 בדיקות חדשות. `npm test`: 51/51.
- כפתורי תשובה מהירה בוואטסאפ (עד 3, כמו בדמו). ה-AI בוחר אותם לפי השאלה, ולחיצה מגיעה כמו הודעה.

מצב בדיקה: `TEST_PHONES` = המספר הפרטי של דוד + אריאל. לקוחות אמיתיים לא מקבלים כלום מהבוט. הסיכום של כל פנייה נשלח ל-`SUMMARY_PHONE` בוואטסאפ.
אין לבוט גישה ליומן: הוא נותן מחיר מדויק מהמחירון, אבל לא אומר פנוי או תפוס. כשהלקוח רוצה לסגור, דוד מקבל סיכום ומאשר בעצמו.

**להפעלה (רק אחרי "תעלה" של אריאל):**
1. `git apply automation-agency/pending/david-bot.patch`
2. Cloudflare: יוצרים D1 בשם `david-vacation-bot`, ושמים את ה-ID ב-`clients/david-vacation/wrangler.toml`.
3. Dualhook: מחברים את המספר העסקי של דוד (בשיחה איתו). את `WA_PHONE_NUMBER_ID` שמים ב-wrangler.toml, ואת הסודות ב-GitHub: `DAVID_VACATION_DUALHOOK_API_KEY`, `DAVID_VACATION_DUALHOOK_WEBHOOK_KEY`, `DAVID_VACATION_WA_VERIFY_TOKEN`.
4. `TEST_PHONES` ו-`SUMMARY_PHONE`: המספר הפרטי של דוד, בפורמט 9725XXXXXXXX.
5. כתובת ה-webhook ב-Dualhook: `https://david-vacation-bot.eliyabuis12.workers.dev/webhook?key=<DUALHOOK_WEBHOOK_KEY>`.
6. push. העלאה של `agency-bot.yml`, ואחריה בודקים: דוד כותב מהפרטי למספר העסקי.
