// פרטי העסק שהבוט משתמש בהם. ממלאים לפי התשובות של חנן בטופס השאלות.
// כל שינוי כאן נכנס לתוקף אחרי `npm run deploy`.

export const BUSINESS = {
  name: 'חנן המנעולן - פתרונות נעילה מתקדמים',
  shortName: 'חנן המנעולן',
  ownerName: 'חנן',
  // איך הבוט מציג את עצמו
  botIntro: 'כאן המוקד של חנן המנעולן',
  services: [
    'פריצת דלתות',
    'החלפת צילינדרים ומנעולים',
    'פריצת רכבים',
    'כספות',
    'דלתות פלדה',
  ],
  areas: 'ימולא לפי התשובות של חנן',
  // שעות עבודה. null = 24/7
  hours: null, // לדוגמה: { days: [0,1,2,3,4,5], from: '07:00', to: '22:00' }
  afterHoursMessage: 'חנן יחזור אליך בבוקר',
  // מחירים: null = הבוט לא נותן מחירים בכלל
  priceGuidance: null,
  urgentExamples: [
    'ילד או תינוק נעול ברכב או בבית',
    'גז או אוכל על האש בבית נעול',
    'אדם מבוגר או חולה נעול בפנים',
    'בעל חיים נעול ברכב בחום',
  ],
  neverSay: [
    'לא להבטיח זמן הגעה מדויק',
    'לא לתת מחיר סופי',
  ],
  languages: ['עברית', 'ערבית', 'רוסית', 'אנגלית'],
};

// תזמונים
export const TIMING = {
  followupAfterHours: 24,      // מעקב אחרי לקוח שקיבל סיכום ולא נפתחה לו עבודה
  reviewAfterHours: 3,         // בקשת ביקורת אחרי סיום עבודה
  referralAfterDays: 7,        // בקשת המלצה אחרי הביקורת
  yearlyAfterDays: 365,        // תזכורת שנתית
  reminderDayBeforeHours: 24,
  reminderTwoHoursBefore: 2,
};

// הודעות קבועות (טקסט חופשי, נשלח רק בתוך חלון 24 שעות מההודעה האחרונה של הלקוח)
export const MESSAGES = {
  handoffAck: 'קיבלתי את כל הפרטים והעברתי לחנן. הוא יחזור אליך בהקדם 🙏',
  waitingForOwner: 'העברתי גם את זה לחנן. הוא יחזור אליך בהקדם.',
  eta: (min) => `חנן בדרך אליך 🚗 זמן הגעה משוער: כ-${min} דקות.`,
  followup: 'היי, רציתי לבדוק אם עדיין צריך עזרה עם המנעול? חנן זמין, אפשר לכתוב כאן.',
  review: (link) => `תודה שבחרת ב${BUSINESS.shortName} 🙏 אם יצאת מרוצה, ביקורת קצרה בגוגל תעזור לנו מאוד:\n${link}`,
  referral: `שמחנו לעזור! אם מישהו מהחברים או מהמשפחה צריך מנעולן, אפשר להעביר להם את המספר הזה 🙂`,
  yearly: 'היי, עברה שנה מאז שחנן עבד אצלך. רוצה שנבדוק שהמנעול והדלת במצב טוב?',
  reminderDayBefore: (when, address) => `תזכורת: חנן מגיע אליך ${when}${address ? ` לכתובת ${address}` : ''}. אם משהו השתנה, אפשר לכתוב כאן.`,
  reminderTwoHours: (time) => `חנן מגיע אליך היום ב-${time}. נתראה 🙂`,
  invoice: 'מצורפת הקבלה על העבודה. תודה!',
};

// תבניות מאושרות ב-WhatsApp Manager, להודעות מחוץ לחלון 24 שעות.
// השמות כאן חייבים להיות זהים לשמות שיוצרים ב-Meta (רשימה ב-SETUP.md).
export const TEMPLATES = {
  followup: 'followup_v1',          // אין משתנים
  reminderDayBefore: 'appt_reminder_v1', // {{1}} = מתי, {{2}} = כתובת
  reminderTwoHours: 'appt_today_v1',     // {{1}} = שעה
  eta: 'on_the_way_v1',             // {{1}} = דקות
  review: 'review_request_v1',      // {{1}} = קישור
  yearly: 'yearly_checkup_v1',      // אין משתנים
  referral: 'referral_v1',          // אין משתנים
  invoice: 'invoice_v1',            // כותרת: מסמך PDF
  ownerAlert: 'owner_alert_v1',     // {{1}} = טקסט הסיכום (להודעות לחנן מחוץ לחלון)
};
