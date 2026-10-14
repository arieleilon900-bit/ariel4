// ההגדרות של הבוט. כל מה שמיוחד ללקוח נמצא ב-clients/<שם>/client.js, וכאן רק ברירות המחדל.
// איזה לקוח פעיל: src/client.js (בהעלאה לשרת, ה-GitHub Actions כותב אותו לכל לקוח).
import activeClient from './client.js';

export const BUSINESS = {};
// מה פעיל בבוט (לכל לקוח אפשר לשנות ב-client.js). receipts = שליחת קבלות ללקוח מיש חשבונית, או PDF שבעל העסק מעביר
export const FEATURES = {
  receipts: false,
};
const DEFAULT_FEATURES = { ...FEATURES };

// תזמונים
export const TIMING = {
  followupAfterHours: 24,      // מעקב אחרי לקוח שקיבל סיכום ולא נפתחה לו עבודה
  reviewAfterHours: 3,         // בקשת ביקורת אחרי סיום עבודה
  referralAfterDays: 7,        // בקשת המלצה אחרי הביקורת
  yearlyAfterDays: 365,        // תזכורת שנתית
  reminderDayBeforeHours: 24,
  reminderTwoHoursBefore: 2,
  // תזכורות לחנן
  ownerAgendaHour: 7,          // בשעה הזו כל בוקר: רשימת העבודות של היום (0 = כבוי)
  ownerReminderMinutes: 60,    // כמה דקות לפני כל עבודה חנן מקבל תזכורת (0 = כבוי)
  // מי שלא עונה
  customerNudgeMinutes: 30,    // לקוח שהפסיק לענות באמצע: תזכורת אחת אחרי 30 דקות
  customerGiveUpHours: 3,      // ואם עדיין לא ענה 3 שעות אחרי התזכורת: מעבירים לחנן את מה שיש
  ownerNudgeMinutes: 30,       // חנן לא טיפל בפנייה: תזכורת אחרי 30 דקות (דחוף: 10)
  ownerNudgeAgainMinutes: 60,  // ותזכורת שנייה ואחרונה אחרי עוד שעה (דחוף: 20)
  doneCheckHours: 3,           // עבודה מתואמת שעברו 3 שעות מהזמן שלה ולא סומנה: שואלים את חנן מה קרה
};

// הודעות קבועות (טקסט חופשי, נשלח רק בתוך חלון 24 שעות מההודעה האחרונה של הלקוח).
// נבנות מהשם של העסק; לקוח יכול לשנות כל אחת ב-client.js (messages)
export const MESSAGES = {};
function defaultMessages(b) {
  const o = b.ownerName;
  const f = b.ownerGender === 'female';
  const heWill = f ? 'היא תחזור' : 'הוא יחזור';
  return {
    handoffAck: `קיבלתי את כל הפרטים והעברתי ל${o}. ${heWill} אליך בהקדם 🙏`,
    waitingForOwner: `העברתי גם את זה ל${o}. ${heWill} אליך בהקדם.`,
    eta: (min) => `${o} בדרך אליך 🚗 זמן הגעה משוער: כ-${min} דקות.`,
    followup: `היי, רציתי לבדוק אם עדיין צריך עזרה? ${o} ${f ? 'זמינה' : 'זמין'}, אפשר לכתוב כאן.`,
    review: (link) => `תודה שבחרת ב${b.shortName} 🙏 אם יצאת מרוצה, ביקורת קצרה בגוגל תעזור לנו מאוד:\n${link}`,
    referral: `שמחנו לעזור! אם מישהו מהחברים או מהמשפחה צריך ${b.trade}, אפשר להעביר להם את המספר הזה 🙂`,
    yearly: `היי, עברה שנה מאז ש${o} ${f ? 'עבדה' : 'עבד'} אצלך. רוצה שנבדוק שהכל תקין?`,
    reminderDayBefore: (when, address) => `תזכורת: ${o} ${f ? 'מגיעה' : 'מגיע'} אליך ${when}${address ? ` לכתובת ${address}` : ''}. אם משהו השתנה, אפשר לכתוב כאן.`,
    reminderTwoHours: (time) => `${o} ${f ? 'מגיעה' : 'מגיע'} אליך היום ב-${time}. נתראה 🙂`,
    invoice: 'מצורפת הקבלה על העבודה. תודה!',
    optedOut: `הוסרת. לא נשלח לך יותר תזכורות או עדכונים. אם תצטרך ${b.trade}, פשוט כתוב כאן.`,
    customerNudge: `היי, עדיין צריך עזרה? אפשר להמשיך מאיפה שעצרנו, ואני מעביר הכל ל${o}.`,
    customerReassure: `${o} עדיין באמצע עבודה. הפנייה שלך ${f ? 'אצלה' : 'אצלו'}, ו${heWill} אליך בהקדם.`,
  };
}

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

// הטקסטים של התבניות, כמו שהן נוצרות ב-Meta (ההגדרה האוטומטית ב-/admin/setup יוצרת אותן מכאן).
// אסור שטקסט יתחיל או ייגמר במשתנה. examples = דוגמה לכל משתנה, ש-Meta דורשים.
export const TEMPLATE_DEFS = [];
function defaultTemplates(b) {
  const sn = b.shortName, o = b.ownerName;
  return [
    { name: 'owner_alert_v1', category: 'UTILITY', body: 'יש עדכון חדש מהבוט של העסק:\n{{1}}\nכדי לקבל הודעות מלאות ותמונות, לחץ על "קיבלתי".', examples: ['פנייה חדשה | שם: דני | טלפון: 054-1234567 | פנייה: בדיקה'], quickReplies: ['קיבלתי'] },
    { name: 'followup_v1', category: 'UTILITY', body: `היי, רציתי לבדוק אם עדיין צריך עזרה? ${o} זמין, אפשר לכתוב כאן.` },
    { name: 'appt_reminder_v1', category: 'UTILITY', body: `תזכורת: ${sn} מגיע אליך {{1}} לכתובת {{2}}. אם משהו השתנה, אפשר לכתוב כאן.`, examples: ['מחר ב-14:30', 'הרצל 5 חולון'] },
    { name: 'appt_today_v1', category: 'UTILITY', body: `${sn} מגיע אליך היום ב-{{1}}. נתראה!`, examples: ['14:30'] },
    { name: 'on_the_way_v1', category: 'UTILITY', body: `${sn} בדרך אליך. זמן הגעה משוער: כ-{{1}} דקות.`, examples: ['20'] },
    { name: 'invoice_v1', category: 'UTILITY', body: `מצורפת הקבלה על העבודה. תודה שבחרת ב${sn}!`, documentHeader: true },
    { name: 'review_request_v1', category: 'MARKETING', body: `תודה שבחרת ב${sn}! אם יצאת מרוצה, ביקורת קצרה בגוגל תעזור לנו מאוד: {{1}} תודה רבה!`, examples: ['https://g.page/r/example/review'] },
    { name: 'referral_v1', category: 'MARKETING', body: `שמחנו לעזור! אם מישהו מהחברים או מהמשפחה צריך ${b.trade}, אפשר להעביר להם את המספר הזה.` },
    { name: 'yearly_checkup_v1', category: 'MARKETING', body: `היי, עברה שנה מאז ש${sn} עבד אצלך. רוצה שנבדוק שהכל תקין?` },
  ];
}

// ===== הלקוח =====
// ברירות מחדל לעסק. כל לקוח משנה את מה שצריך ב-clients/<שם>/client.js
const DEFAULT_BUSINESS = {
  name: '', shortName: '', ownerName: '', ownerGender: 'male', trade: 'בעל מקצוע', issueLabel: 'תקלה', needsAddress: true, competitor: 'מישהו אחר',
  services: [], areas: 'כל הארץ', outOfAreaMessage: '', botGender: 'male',
  shabbat: { enabled: false, message: 'בעל העסק שומר שבת ויחזור אליך במוצאי שבת. אסוף את הפרטים כרגיל.' },
  // עד שבעל העסק עונה בטופס: כל יום 07:00-22:00. דחוף מגיע אליו מיד גם בלילה
  hours: { days: [0, 1, 2, 3, 4, 5, 6], from: '07:00', to: '22:00' }, afterHoursMessage: 'נחזור אליך בבוקר. אם זה דחוף, תכתוב לי ואני מעביר מיד', priceGuidance: null,
  intake: {
    steps: ['מה הבעיה או מה הלקוח צריך.', 'תמונה, אם זה עוזר להבין. בקש פעם אחת. אם הלקוח לא יכול לשלוח, ממשיכים בלי.', 'כתובת מדויקת: רחוב, מספר בית ועיר. אפשר גם לשלוח מיקום בוואטסאפ.'],
    extraRules: [],
    handoffWhen: 'כשיש תיאור של הבעיה וכתובת (ובקשת תמונה כבר נשלחה)',
  },
  urgentExamples: ['סכנה לחיים או לבריאות'],
  neverSay: ['לא להבטיח זמן הגעה מדויק', 'לא לתת מחיר סופי'],
  languages: ['עברית', 'ערבית', 'רוסית', 'אנגלית'],
  voiceHint: '',
  learnExample: 'למד ביקור בית עולה 250 ₪',
  voice: [], faq: [], examples: [],
};
const DEFAULT_TIMING = { ...TIMING };

// מחליף את הלקוח הפעיל (בשרת: פעם אחת בעלייה; בדף הניסיון: כשבוחרים סוג עסק)
export function applyClient(client = {}) {
  for (const k of Object.keys(BUSINESS)) delete BUSINESS[k];
  Object.assign(BUSINESS, structuredClone(DEFAULT_BUSINESS), client.business || {});
  BUSINESS.intake = { ...DEFAULT_BUSINESS.intake, ...(client.business?.intake || {}) };
  if (!BUSINESS.shortName) BUSINESS.shortName = BUSINESS.name;
  for (const k of Object.keys(MESSAGES)) delete MESSAGES[k];
  Object.assign(MESSAGES, defaultMessages(BUSINESS), client.messages || {});
  Object.assign(TIMING, DEFAULT_TIMING, client.timing || {});
  Object.assign(FEATURES, DEFAULT_FEATURES, client.features || {});
  const defs = defaultTemplates(BUSINESS).map((d) => (client.templates?.[d.name] ? { ...d, body: client.templates[d.name] } : d));
  TEMPLATE_DEFS.splice(0, TEMPLATE_DEFS.length, ...defs);
}

applyClient(activeClient);

