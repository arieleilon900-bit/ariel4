# איך בונים את הבוט של חנן מאפס עד באוויר

## קודם כל: מה כבר קיים
הבוט **כבר כתוב**. כל הקוד נמצא ב-GitHub בתיקייה `bots/hanan-locksmith`, ועובר 6 בדיקות אוטומטיות של כל המסלולים: פנייה, תמונה, הקלטה, דחוף, ספאם, פקודות של חנן, תזכורות, ביקורת, קבלות, אנשי קשר מוכרים, דוח שבועי.

מה שחסר זה לא קוד. חסרים **חשבונות** (שרת, AI, וואטסאפ, גוגל) ו**חיבור** ביניהם. את זה רק אתה יכול לעשות, כי זה דורש הרשמה עם השם והכרטיס שלך. אין צורך בטרמינל ולא בשותף: הכל בלחיצות באתרים.

## למה לא N8N
| | N8N | מה שבנינו (Cloudflare) |
|---|---|---|
| עלות שרת | בערך 20 דולר בחודש, או שרת שאתה מתחזק | 0 (התוכנית החינמית מספיקה) |
| שיחה עם זיכרון, תמונות, הקלטות, תזכורות | אפשרי, אבל עשרות "קופסאות" שנשברות | כבר כתוב ובדוק |
| העתקה ללקוח הבא | לבנות שוב או לשכפל ידנית | משנים קובץ הגדרות אחד |

## איך זה עובד (התמונה הגדולה)
```
לקוח שולח וואטסאפ ← Meta ← השרת שלנו ב-Cloudflare ← Claude (ה-AI) מחליט מה לענות
                                   ↓
              מסד נתונים (Cloudflare D1) + גיליון גוגל + הודעה לחנן
```
כל פעם שמשנים קוד ב-GitHub, הבוט עולה מחדש לשרת לבד (GitHub Actions).

## מה צריך לפתוח (עלויות)
| חשבון | בשביל מה | עלות |
|---|---|---|
| GitHub | הקוד (כבר יש לך) | 0 |
| Cloudflare | השרת ומסד הנתונים | 0 |
| Anthropic | ה-AI שמנהל את השיחה | לפי שימוש, טוענים 10 דולר מראש ושמים תקרה |
| Meta (פייסבוק שלך) | וואטסאפ API | שיחות שהלקוח פותח: חינם. תבניות (תזכורות, ביקורות): אגורות להודעה |
| Google Cloud | כתיבה לגיליון | 0 |
| ספק Coexistence | רק בשלב האחרון, מעבר למספר האמיתי | בערך 170 ₪ לחודש (ראה שלב 9) |

**הכלל:** מפתחות וסיסמאות אף פעם לא שולחים בצ'אט. מכניסים אותם רק ב-GitHub Secrets (שלב 2). מספרים מזהים (Account ID, Database ID, Phone number ID, Sheet ID) זה בסדר לשלוח לי.

---

## שלב 1: Cloudflare, השרת (15 דקות)
1. נרשמים: https://dash.cloudflare.com/sign-up
2. בתפריט משמאל: **Workers & Pages**. אם הוא מבקש לבחור subdomain, בוחרים שם קצר (למשל `onerishon`). הכתובת של הבוט תהיה `hanan-locksmith-bot.onerishon.workers.dev`.
3. **Account ID:** באותו מסך, בצד ימין, יש `Account ID`. מעתיקים.
4. **מסד נתונים:** בתפריט **Storage & Databases** ← **D1 SQL Database** ← **Create** ← שם: `hanan-bot` ← Create. מעתיקים את ה-**Database ID**.
5. **טוקן להעלאה:** למעלה מימין, האייקון של הפרופיל ← **My Profile** ← **API Tokens** ← **Create Token** ← ליד **Edit Cloudflare Workers** לוחצים **Use template**.
   - ב-Permissions לוחצים **+ Add more** ומוסיפים: `Account` ← `D1` ← `Edit`.
   - Account Resources: בוחרים את החשבון שלך.
   - **Continue to summary** ← **Create Token** ← מעתיקים את הטוקן. הוא מוצג פעם אחת בלבד.

**שולח לי בצ'אט:** את ה-Database ID (רק אותו).

## שלב 2: GitHub Secrets, המקום של הסודות (5 דקות)
1. נכנסים ל-https://github.com/arieleilon900-bit/ariel4/settings/secrets/actions
2. **New repository secret**, פעמיים:
   - שם `CLOUDFLARE_API_TOKEN`, ערך: הטוקן משלב 1.5
   - שם `CLOUDFLARE_ACCOUNT_ID`, ערך: ה-Account ID משלב 1.3

ברגע שאני מכניס את ה-Database ID לקוד, הבוט עולה לשרת לבד. בודקים: פותחים בדפדפן `https://hanan-locksmith-bot.<השם שלך>.workers.dev/health`, וצריך להופיע `ok`.
(את ההעלאות רואים כאן: https://github.com/arieleilon900-bit/ariel4/actions, וירוק אומר שעבר.)

## שלב 3: Anthropic, ה-AI (10 דקות)
1. נרשמים: https://console.anthropic.com
2. **Billing** ← טוענים 10 דולר.
3. **Limits** ← שמים תקרה חודשית (למשל 30 דולר), כדי שלא תהיה הפתעה.
4. **API Keys** ← **Create Key** ← שם `hanan-bot` ← מעתיקים.
5. ב-GitHub Secrets (כמו בשלב 2): `ANTHROPIC_API_KEY` = המפתח.

אחרי שבוע באוויר בודקים ב-**Usage** כמה זה עלה באמת, ומעדכנים את התמחור ללקוחות הבאים.

## שלב 4: Meta, וואטסאפ (45-60 דקות, הכי ארוך)
**א. חשבון עסקי**
1. נכנסים עם הפייסבוק שלך: https://business.facebook.com ← **Create a business portfolio**.
2. שם: `חנן המנעולן - פתרונות נעילה מתקדמים`, השם שלך, והמייל שלך.

**ב. אפליקציה**
1. https://developers.facebook.com/apps ← **Create App**.
2. שם: `Onerishon Hanan Bot`. Use case: **Connect with customers through WhatsApp**.
3. Business portfolio: בוחרים את החשבון מסעיף א'. ← **Create app**.

**ג. מספר בדיקה**
1. באפליקציה: **WhatsApp** ← **API Setup**. Meta נותנים מספר בדיקה בחינם.
2. מעתיקים את **Phone number ID** ואת **WhatsApp Business Account ID**.
3. ב-**To** ← **Manage phone number list** ← מוסיפים את הטלפון שלך ושל השותף, ומאשרים בקוד שמגיע בוואטסאפ. (מספר בדיקה יכול לכתוב רק למספרים ברשימה.)

**ד. טוקן קבוע** (טוקן רגיל פג אחרי 24 שעות)
1. https://business.facebook.com/settings ← **Users** ← **System users** ← **Add** ← שם `hanan-bot`, תפקיד **Admin**.
2. **Assign assets** ← **Apps** ← האפליקציה ← Full control. ואז **WhatsApp accounts** ← החשבון ← Full control.
3. **Generate token** ← האפליקציה ← Expiration: **Never** ← מסמנים `whatsapp_business_messaging` ו-`whatsapp_business_management` ← **Generate** ← מעתיקים.

**ה. App Secret**
- https://developers.facebook.com/apps ← האפליקציה ← **App settings** ← **Basic** ← **App secret** ← **Show** ← מעתיקים.

**ו. GitHub Secrets** (שלושה):
- `WA_TOKEN` = הטוקן הקבוע מסעיף ד'
- `WA_APP_SECRET` = מסעיף ה'
- `WA_VERIFY_TOKEN` = ממציאים מילה, למשל `hanan-onerishon-2026`, ורושמים אותה בצד

**שולח לי בצ'אט:** Phone number ID ו-WhatsApp Business Account ID. אני מכניס לקוד והבוט עולה מחדש.

**ז. חיבור Meta לשרת (Webhook)**
1. באפליקציה: **WhatsApp** ← **Configuration** ← **Edit**.
2. Callback URL: `https://hanan-locksmith-bot.<השם שלך>.workers.dev/webhook`
3. Verify token: המילה שהמצאת בסעיף ו'. ← **Verify and save**.
4. **Webhook fields** ← **Manage** ← **Subscribe** ליד `messages`.

**ח. אימות עסק** (מתחילים עכשיו, כי לוקח כמה ימים)
- https://business.facebook.com/settings ← **Security Center** ← **Start verification**. מעלים את תעודת העוסק המורשה של חנן. בלי זה אי אפשר לעבור למספר האמיתי.

## שלב 5: גיליון גוגל (15 דקות)
1. https://console.cloud.google.com ← למעלה **Select a project** ← **New project** ← שם `hanan-bot` ← Create.
2. בחיפוש למעלה: `Google Sheets API` ← **Enable**.
3. בחיפוש: `Service Accounts` ← **Create service account** ← שם `hanan-bot` ← **Done**.
4. לוחצים עליו ← **Keys** ← **Add key** ← **Create new key** ← **JSON** ← יורד קובץ.
5. פותחים את הקובץ ב-Notepad, מעתיקים **הכל**, ושמים ב-GitHub Secrets בשם `GOOGLE_SA_JSON`.
6. בקובץ יש שורה `client_email`. מעתיקים את המייל הזה.
7. פותחים גיליון חדש: https://sheets.new. בשורה 1: `תאריך | סוג | שם | טלפון | תקלה | כתובת | דחוף | הערות`.
8. **Share** ← מדביקים את המייל משלב 6 ← **Editor**. משתפים גם את חנן (צפייה).
9. בכתובת של הגיליון, מה שבין `/d/` ל-`/edit` זה ה-Sheet ID.

**שולח לי בצ'אט:** Sheet ID.

## שלב 6: תבניות הודעה (20 דקות + המתנה לאישור)
וואטסאפ מרשה הודעה חופשית רק עד 24 שעות מההודעה האחרונה של הלקוח. אחרי זה (תזכורת, ביקורת, תזכורת שנתית) חייבים תבנית שאושרה מראש.
- https://business.facebook.com/wa/manage/message-templates ← **Create template**. שפה: **Hebrew**.
- את 9 התבניות מעתיקים מהטבלה ב-`bots/hanan-locksmith/SETUP.md` (שלב 9 שם). השמות חייבים להיות בדיוק כמו בטבלה.
- האישור לוקח בדרך כלל מכמה דקות עד כמה שעות.

## שלב 7: התשובות של חנן
חנן ממלא את הטופס: https://arieleilon900-bit.github.io/ariel4/bot-form/

**שולח לי:** את התשובות, ובמיוחד שעות, אזורים, מדיניות מחירים, ו**לאיזה מספר שולחים לו התראות**. זה חייב להיות מספר אחר מהמספר של העסק. אני מעדכן את הבוט, וגם את הקישור לביקורות בגוגל.

## שלב 8: בדיקה (30 דקות)
מהטלפון שלך כותבים למספר הבדיקה, ובודקים:
- [ ] "היי ננעלתי מחוץ לבית" ← הבוט שואל, שולחים תמונה וכתובת ← מגיע סיכום למספר ההתראות + שורה בגיליון
- [ ] הקלטה קולית ← הבוט מבין
- [ ] "יש ילד נעול באוטו" ← העברה מיידית
- [ ] ממספר ההתראות: `עזרה`, `בדרך 05XXXXXXXX 20`, `תור 05XXXXXXXX 15/10 14:00 הרצל 5`, `סיום 05XXXXXXXX`
- [ ] ממספר ההתראות: שולחים PDF לבוט עם טלפון בכיתוב ← הלקוח מקבל קבלה
- [ ] שולחים `דוח` ← מגיע סיכום

משהו לא עובד? שולחים לי צילום מסך של ההרצה ב-https://github.com/arieleilon900-bit/ariel4/actions, או מה קרה, ואני מתקן.

## שלב 9: מעבר למספר האמיתי של חנן (050-3429998)
כדי שחנן ימשיך לעבוד באפליקציית WhatsApp Business **וגם** הבוט יעבוד על אותו מספר, Meta דורשים חיבור דרך "Tech Provider" או ספק מורשה (BSP). זה נקרא Coexistence. לפי Meta, החיבור עובר דרך מסך הרשמה של הספק: חנן מקליד את המספר, מקבל קוד באפליקציה, מאשר, ובוחר אם לשתף היסטוריה ([התיעוד של Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)).
- **צריך אצל חנן:** אפליקציית WhatsApp Business בגרסה 2.24.17 ומעלה, ושימוש פעיל באפליקציה (יש לו).
- **אפשרות א' (מומלץ, מהיר):** ספק כמו 360dialog שתומך בזה ([התיעוד שלהם](https://docs.360dialog.com/partner/waba-management/phone-number-and-hosting/using-whatsapp-app-and-cloud-api-simultaneously)). עולה מנוי חודשי. אני מתאים את הקוד לספק שנבחר, בערך שעה עבודה.
- **אפשרות ב' (חינם, איטי):** "עונה ראשון" נרשמת בעצמה כ-Tech Provider אצל Meta. זה דורש אימות עסק של עונה ראשון (עוסק רשום) וכמה שבועות. שווה לעשות בשביל הלקוחות הבאים.
- **לפני שבוחרים:** לוודא מול הספק שישראל נתמכת.

עד שזה מסודר, הבוט עובד על מספר הבדיקה, ואפשר להראות לחנן שהכל עובד.

---

## מי עושה מה, לפי סדר
| # | מה | מי | זמן |
|---|---|---|---|
| 1 | Cloudflare + GitHub Secrets (שלבים 1-2) | אריאל | 20 דק' |
| 2 | Anthropic (שלב 3) | אריאל | 10 דק' |
| 3 | Meta + אימות עסק (שלב 4) | אריאל | שעה |
| 4 | גוגל (שלב 5) | השותף | 15 דק' |
| 5 | תבניות (שלב 6) | השותף | 20 דק' |
| 6 | טופס (שלב 7) | חנן | 10 דק' |
| 7 | הכנסת ה-IDs לקוד, התאמה לתשובות של חנן | Claude | מיד כשמגיע |
| 8 | בדיקה (שלב 8) | אריאל + השותף | 30 דק' |
| 9 | בחירת ספק Coexistence והתאמת הקוד | אריאל בוחר, Claude מתאים | יום-יומיים |
