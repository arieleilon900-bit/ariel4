# העלאת הבוט של חנן לאוויר (מדריך לשותף)

זמן: כ-45 דקות בפעם הראשונה. כל פקודה מעתיקים כמו שהיא לטרמינל.
**כלל:** מפתחות וסיסמאות לא שולחים בצ׳אט. מכניסים אותם רק עם `wrangler secret put`.

## מה צריך לפני שמתחילים
- [ ] Node.js ו-Git מותקנים, ו-`wrangler login` בוצע.
- [ ] מפתח API של Anthropic.
- [ ] קובץ ה-JSON של ה-Service Account של גוגל, ו-ID של הגיליון.
- [ ] מאריאל: `Phone number ID` מ-Meta, וגישה לאפליקציה ב-developers.facebook.com.

## שלב 1: להוריד את הקוד
```
git clone https://github.com/arieleilon900-bit/ariel4.git
cd ariel4
git checkout claude/bold-knuth-scehxs
cd bots/hanan-locksmith
npm install
```
(אם כבר עשית clone: `cd ariel4 && git fetch && git checkout claude/bold-knuth-scehxs && git pull`, ואז `cd bots/hanan-locksmith && npm install`.)

## שלב 2: מסד הנתונים
```
npx wrangler d1 create hanan-bot
```
הפקודה מדפיסה `database_id`. פותחים את `wrangler.toml` ומחליפים את `REPLACE_WITH_DATABASE_ID` במספר הזה. ואז:
```
npx wrangler d1 execute hanan-bot --remote --file=schema.sql
```

## שלב 3: ההגדרות ב-`wrangler.toml`
בחלק `[vars]`:
| שדה | מה לשים |
|---|---|
| `WA_PHONE_NUMBER_ID` | ה-Phone number ID שאריאל שלח |
| `OWNER_PHONE` | המספר שאליו יגיעו הסיכומים, בפורמט `9725XXXXXXXX`. **לבדיקות: המספר של אריאל.** אחר כך: המספר שחנן כתב בטופס |
| `SHEET_ID` | ה-ID של הגיליון |
| `REVIEW_LINK` | הקישור לביקורות בגוגל של חנן (אפשר להשאיר ריק בינתיים) |

## שלב 4: הסודות
מריצים כל שורה בנפרד. כל פקודה מבקשת להדביק ערך:
```
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WA_VERIFY_TOKEN
```
ב-`WA_VERIFY_TOKEN` ממציאים מחרוזת, למשל `hanan-bot-2026-xyz`, ורושמים אותה בצד. היא תשמש בשלב 6.

את מפתח גוגל מכניסים מהקובץ (בלי להעתיק ידנית):
```
npx wrangler secret put GOOGLE_SA_JSON < /path/to/the-key-file.json
```

שני הסודות של Meta (שלב 5 מסביר איפה משיגים אותם):
```
npx wrangler secret put WA_TOKEN
npx wrangler secret put WA_APP_SECRET
```

## שלב 5: הטוקן והסוד מ-Meta (עם אריאל, כי זה בחשבון שלו)
1. **טוקן קבוע:** https://business.facebook.com ← Settings ← Users ← **System users** ← Add ← שם `hanan-bot`, תפקיד **Admin**.
   - Assign assets: מוסיפים את **האפליקציה** ואת **ה-WhatsApp Account** עם Full control.
   - Generate token ← בוחרים את האפליקציה ← תוקף **Never** ← מסמנים `whatsapp_business_messaging` ו-`whatsapp_business_management` ← Generate.
   - את הטוקן מכניסים ל-`WA_TOKEN` (שלב 4).
2. **App Secret:** https://developers.facebook.com/apps ← האפליקציה ← App settings ← **Basic** ← App secret ← Show. מכניסים ל-`WA_APP_SECRET`.

## שלב 6: העלאה לאוויר
```
npm run deploy
```
בסוף מופיעה כתובת, למשל `https://hanan-locksmith-bot.XXXX.workers.dev`. בודקים שהיא עובדת: פותחים `https://...workers.dev/health` בדפדפן, וצריך להופיע `ok`.

## שלב 7: חיבור Meta לשרת (Webhook)
https://developers.facebook.com/apps ← האפליקציה ← **WhatsApp ← Configuration**:
1. Callback URL: `https://hanan-locksmith-bot.XXXX.workers.dev/webhook`
2. Verify token: המחרוזת שהמצאת ב-`WA_VERIFY_TOKEN`.
3. **Verify and save.**
4. ב-Webhook fields לוחצים **Subscribe** ליד `messages`.
   (בשלב המספר האמיתי נוסיף גם את `smb_message_echoes`.)

## שלב 8: בדיקה
1. במספר הבדיקה של Meta אפשר לכתוב רק ממספרים שהוספתם ב-API Setup ← To.
2. מאחד המספרים האלה כותבים למספר הבדיקה: "היי, ננעלתי מחוץ לבית".
3. הבוט עונה ושואל שאלות. שולחים תמונה, ואחר כך כתובת.
4. ל-`OWNER_PHONE` מגיע סיכום.
5. מהמספר של `OWNER_PHONE` כותבים לבוט `עזרה`, ומקבלים את רשימת הפקודות. נסו גם `בדרך 05XXXXXXXX 20`.

**לראות מה קורה בשרת בזמן אמת:**
```
npx wrangler tail
```

## שלב 9: תבניות להודעות מחוץ לחלון 24 שעות
וואטסאפ מרשה לשלוח טקסט חופשי רק עד 24 שעות מההודעה האחרונה של הלקוח. אחרי זה (תזכורות, מעקבים, ביקורות) חייבים **תבנית מאושרת**.
יוצרים ב-https://business.facebook.com ← WhatsApp Manager ← **Message templates** ← Create. שפה: **Hebrew**. השם חייב להיות בדיוק כמו בטבלה:

| שם | קטגוריה | טקסט |
|---|---|---|
| `owner_alert_v1` | Utility | `התראה מהבוט: {{1}}` |
| `followup_v1` | Utility | `היי, רציתי לבדוק אם עדיין צריך עזרה עם המנעול? חנן זמין, אפשר לכתוב כאן.` |
| `appt_reminder_v1` | Utility | `תזכורת: חנן המנעולן מגיע אליך {{1}} לכתובת {{2}}. אם משהו השתנה, אפשר לכתוב כאן.` |
| `appt_today_v1` | Utility | `חנן המנעולן מגיע אליך היום ב-{{1}}. נתראה!` |
| `on_the_way_v1` | Utility | `חנן המנעולן בדרך אליך. זמן הגעה משוער: כ-{{1}} דקות.` |
| `invoice_v1` | Utility | כותרת (Header): **Document**. גוף: `מצורפת הקבלה על העבודה. תודה שבחרת בחנן המנעולן!` |
| `review_request_v1` | Marketing | `תודה שבחרת בחנן המנעולן! אם יצאת מרוצה, ביקורת קצרה בגוגל תעזור לנו מאוד: {{1}}` |
| `referral_v1` | Marketing | `שמחנו לעזור! אם מישהו מהחברים או מהמשפחה צריך מנעולן, אפשר להעביר להם את המספר הזה.` |
| `yearly_checkup_v1` | Marketing | `היי, עברה שנה מאז שחנן המנעולן עבד אצלך. רוצה שנבדוק שהמנעול והדלת במצב טוב?` |

Meta לפעמים משנים את הקטגוריה בעצמם. זה בסדר. האישור לוקח בדרך כלל מכמה דקות עד כמה שעות.

## תקלות
| מה קורה | מה בודקים |
|---|---|
| Verify and save נכשל | השרת באוויר (`/health`)? ה-Verify token זהה למה שהוכנס ב-`WA_VERIFY_TOKEN`? |
| הבוט לא עונה | `npx wrangler tail` ושולחים הודעה. מחפשים `error` |
| `WhatsApp API error 401` | הטוקן לא נכון או פג. מוציאים טוקן קבוע (שלב 5) |
| `WhatsApp API error 131030` | המספר ששולחים אליו לא ברשימת המספרים המורשים של מספר הבדיקה |
| `Claude API error 401` | מפתח Anthropic לא נכון, או שאין קרדיט |
| הגיליון לא מתעדכן | הגיליון משותף עם המייל של ה-Service Account? `SHEET_ID` נכון? |

## עדכון אחרי שינוי בקוד
```
git pull
npm run deploy
```
