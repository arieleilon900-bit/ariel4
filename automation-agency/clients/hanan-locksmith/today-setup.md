# היום: מאפס עד בוט שעונה בוואטסאפ אמיתי

המטרה: בסוף השעה וחצי הבוט עונה בוואטסאפ על מספר בדיקה של Meta, ונשאר רק לחבר אותו למספר של חנן.

## להכין לפני שמתחילים
1. כרטיס אשראי.
2. פייסבוק מחובר במחשב.
3. טלפון שני (של השותף). הטלפון שלך יהיה "חנן" שמקבל התראות, והטלפון השני יהיה "הלקוח".
4. הצ'אט עם Claude פתוח בצד.
5. בלשונית נפרדת, הדף של הסודות: https://github.com/arieleilon900-bit/ariel4/settings/secrets/actions
   להוסיף סוד: **New repository secret** ← Name ← Secret ← **Add secret**.

**הכלל:** סיסמה, טוקן או מפתח מדביקים מיד ב-GitHub Secrets ולא שולחים בצ'אט. מזהים (ID) שולחים ל-Claude.

---

## שלב 1: Cloudflare, השרת (15 דקות)
1. נרשמים: https://dash.cloudflare.com/sign-up ומאשרים את המייל.
2. בתפריט משמאל **Workers & Pages**. כשהוא מבקש subdomain, כותבים `onerishon`.
3. **Plans** ← **Workers Paid** ← משלמים 5 דולר.
4. בצד ימין של Workers & Pages יש **Account ID**. מעתיקים ← GitHub Secrets: `CLOUDFLARE_ACCOUNT_ID`.
5. **Storage & Databases** ← **D1 SQL Database** ← **Create** ← שם `hanan-bot` ← Create. מעתיקים את ה-**Database ID**.
6. האייקון שלך למעלה ← **My Profile** ← **API Tokens** ← **Create Token** ← ליד **Edit Cloudflare Workers** לוחצים **Use template**.
   - **+ Add more** ← `Account` ← `D1` ← `Edit`.
   - **Account Resources** ← החשבון שלך.
   - **Continue to summary** ← **Create Token** ← מעתיקים ← GitHub Secrets: `CLOUDFLARE_API_TOKEN`.

**שולחים ל-Claude:** Database ID.

## שלב 2: Anthropic, המוח (8 דקות)
1. נרשמים: https://console.anthropic.com
2. **Billing** ← טוענים 10 דולר.
3. **Limits** ← תקרה חודשית 30 דולר.
4. **API Keys** ← **Create Key** ← שם `hanan-bot` ← מעתיקים ← GitHub Secrets: `ANTHROPIC_API_KEY`.

## שלב 3: Meta, וואטסאפ (35 דקות)
**א. חשבון עסקי**
1. https://business.facebook.com ← **Create a business portfolio**.
2. שם: `חנן המנעולן - פתרונות נעילה מתקדמים` (על השם של חנן, כי את העסק שלו מאמתים). השם שלך והמייל שלך.

**ב. אפליקציה**
1. https://developers.facebook.com/apps ← **Create App**.
2. שם `Onerishon Bot` ← Use case: **Connect with customers through WhatsApp** ← בוחרים את החשבון מסעיף א' ← **Create app**.

**ג. מספר בדיקה**
1. באפליקציה: **WhatsApp** ← **API Setup**.
2. מעתיקים לפתק: **Phone number ID** ו-**WhatsApp Business Account ID**.
3. **To** ← **Manage phone number list** ← מוסיפים את הטלפון שלך ואת הטלפון השני, ומאשרים בקוד שמגיע בוואטסאפ.
4. **App settings** ← **Basic** ← מעתיקים לפתק את **App ID**.

**ד. App Secret**
- באותו מסך: **App secret** ← **Show** ← מעתיקים ← GitHub Secrets: `WA_APP_SECRET`.

**ה. טוקן קבוע**
1. https://business.facebook.com/settings ← **Users** ← **System users** ← **Add** ← שם `bot`, תפקיד **Admin**.
2. **Assign assets**: **Apps** ← האפליקציה ← **Full control**. **WhatsApp accounts** ← החשבון ← **Full control**.
3. **Generate token** ← האפליקציה ← Expiration **Never** ← מסמנים `whatsapp_business_messaging` ו-`whatsapp_business_management` ← **Generate** ← מעתיקים ← GitHub Secrets: `WA_TOKEN`.

**ו. מילת סוד**
- GitHub Secrets: `WA_VERIFY_TOKEN` עם מילה שאתה ממציא (למשל `onerishon-hanan-77`). רושמים אותה בצד.

**שולחים ל-Claude:** Phone number ID, WhatsApp Business Account ID, App ID. רק אחרי שכל הסודות בפנים.

## שלב 4: הבוט עולה ובדיקה (15 דקות)
1. Claude אומר "עלה". בודקים שיש ירוק ב-https://github.com/arieleilon900-bit/ariel4/actions
2. פותחים בדפדפן `https://hanan-locksmith-bot.onerishon.workers.dev/health` ← צריך להיות `ok`.
3. פותחים `https://hanan-locksmith-bot.onerishon.workers.dev/admin/setup?key=המילה-שלך` ← רשימה של ✓. אם יש ✗, מעתיקים ל-Claude.
4. מהטלפון שלך שולחים למספר הבדיקה `עזרה` ← חוזרת רשימת הפקודות.
5. מהטלפון השני: `היי ננעלתי מחוץ לבית`, עונים לבוט, שולחים תמונה וכתובת.
6. אצלך מגיע סיכום. עונים עליו (החלקה ימינה) `בדרך 20` ← הטלפון השני מקבל "בדרך".
7. עוד בדיקות: הקלטה קולית מהטלפון השני, ו-"יש ילד נעול באוטו" (צריך להגיע אליך מיד).

**כאן הבוט חי על וואטסאפ אמיתי.**

## שלב 5: גיליון גוגל (15 דקות)
1. https://console.cloud.google.com ← **Select a project** ← **New project** ← `hanan-bot` ← Create.
2. בחיפוש: `Google Sheets API` ← **Enable**.
3. בחיפוש: `Service Accounts` ← **Create service account** ← `hanan-bot` ← **Done**.
4. לוחצים עליו ← **Keys** ← **Add key** ← **Create new key** ← **JSON** ← יורד קובץ.
5. פותחים אותו ב-Notepad, מעתיקים הכל ← GitHub Secrets: `GOOGLE_SA_JSON`. אחר כך מוחקים את הקובץ מהמחשב.
6. בקובץ יש `client_email`. מעתיקים את המייל.
7. https://sheets.new ← **Share** ← מדביקים את המייל ← **Editor**.
8. בכתובת של הגיליון, מה שבין `/d/` ל-`/edit` זה ה-Sheet ID.

**שולחים ל-Claude:** Sheet ID.

## שלב 6: מכינים את החיבור לחנן (10 דקות)
1. **אימות עסק:** https://business.facebook.com/settings ← **Security Center** ← **Start verification**. צריך תעודת עוסק של חנן: לבקש ממנו היום תמונה, ולהעלות ברגע שמגיעה. לוקח כמה ימים, לכן מתחילים עכשיו.
2. **360dialog** (הספק שמחבר את המספר של חנן כשהוא ממשיך עם האפליקציה שלו):
   - נרשמים: https://hub.360dialog.com
   - כותבים לתמיכה שלהם בצ'אט: "Do you support WhatsApp Business App coexistence for an Israeli number (+972)?"
   - לא מוסיפים מספר עדיין.

---

## מה נשאר אחרי היום: רק חנן
1. **מחנן:**
   - תמונה של תעודת העוסק (לאימות).
   - מספר להתראות (לא המספר של העסק).
   - קישור לביקורות בגוגל.
   - הטופס, אם עוד לא מילא.
2. **Claude:** מכניס את התשובות שלו לבוט.
3. **שיחה של 15 דקות עם חנן**, אחרי שהאימות אושר:
   - ב-360dialog: **Add channel** ← "Yes, Business App" ← חנן סורק QR מהאפליקציה שלו ומאשר שיתוף היסטוריה.
   - מעתיקים את ה-API Key ← GitHub Secrets: `D360_API_KEY`.
   - Claude מעביר את הבוט למספר של חנן. פותחים שוב את `/admin/setup`.
   - כותבים מהטלפון השני למספר של חנן ובודקים.
4. שולחים לחנן את המדריך שלו (`hanan-guide.md`).

סיימנו.
