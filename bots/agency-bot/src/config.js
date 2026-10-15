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

// אותן הודעות בשפות אחרות, ללקוח שכותב באנגלית, רוסית או ערבית. השם של בעל העסק: client.business.ownerNames
function i18n(b, lang) {
  const o = b.ownerNames?.[lang] || b.ownerName;
  const sn = b.shortNames?.[lang] || b.shortName;
  const f = b.ownerGender === 'female';
  const T = {
    en: {
      waitingForOwner: () => `I passed this on to ${o} too. ${f ? 'She' : 'He'}'ll get back to you shortly.`,
      eta: (min) => `${o} is on ${f ? 'her' : 'his'} way 🚗 Estimated arrival: about ${min} minutes.`,
      followup: () => `Hi, just checking if you still need help? ${o} is available, you can write here.`,
      review: (link) => `Thank you for choosing ${sn} 🙏 If you were happy, a short Google review would help us a lot:\n${link}`,
      referral: () => 'Glad we could help! If a friend or family member ever needs us, feel free to pass on this number 🙂',
      yearly: () => `Hi, it's been a year since ${o} worked for you. Want us to check that everything is still in good shape?`,
      reminderDayBefore: (when, address) => `Reminder: ${o} is coming to you ${when}${address ? ` at ${address}` : ''}. If anything changed, just write here.`,
      reminderTwoHours: (time) => `${o} will be with you today at ${time}. See you soon 🙂`,
      optedOut: () => "You've been removed and won't get any more reminders or updates. If you ever need us, just write here.",
      customerNudge: () => `Hi, do you still need help? We can pick up where we left off, and I'll pass everything on to ${o}.`,
      customerReassure: () => `${o} is still in the middle of a job. Your request is with ${f ? 'her' : 'him'} and ${f ? 'she' : 'he'}'ll get back to you shortly.`,
    },
    ru: {
      waitingForOwner: () => `Я передал это и ${o}. ${f ? 'Она' : 'Он'} скоро с вами свяжется.`,
      eta: (min) => `${o} уже ${f ? 'едет' : 'едет'} к вам 🚗 Примерное время прибытия: около ${min} минут.`,
      followup: () => `Здравствуйте, вам ещё нужна помощь? ${o} на связи, можно написать здесь.`,
      review: (link) => `Спасибо, что выбрали ${sn} 🙏 Если вы довольны, короткий отзыв в Google нам очень поможет:\n${link}`,
      referral: () => 'Рады были помочь! Если друзьям или родным понадобится помощь, можно передать им этот номер 🙂',
      yearly: () => `Здравствуйте, прошёл год с нашей работы у вас. Хотите, проверим, что всё в порядке?`,
      reminderDayBefore: (when, address) => `Напоминание: ${o} ${f ? 'приедет' : 'приедет'} к вам ${when}${address ? ` по адресу ${address}` : ''}. Если что-то изменилось, напишите здесь.`,
      reminderTwoHours: (time) => `${o} будет у вас сегодня в ${time}. До встречи 🙂`,
      optedOut: () => 'Вы отписаны и больше не будете получать напоминания. Если понадобится помощь, просто напишите здесь.',
      customerNudge: () => `Здравствуйте, вам ещё нужна помощь? Можно продолжить с того места, где остановились, и я всё передам ${o}.`,
      customerReassure: () => `${o} ещё на заказе. Ваша заявка у ${f ? 'неё' : 'него'}, ${f ? 'она' : 'он'} скоро с вами свяжется.`,
    },
    ar: {
      waitingForOwner: () => `نقلت هذا أيضاً إلى ${o}. ${f ? 'ستعود' : 'سيعود'} إليك قريباً.`,
      eta: (min) => `${o} في الطريق إليك 🚗 الوصول المتوقع: حوالي ${min} دقيقة.`,
      followup: () => `مرحباً، هل ما زلت بحاجة إلى مساعدة؟ ${o} ${f ? 'متاحة' : 'متاح'}، يمكنك الكتابة هنا.`,
      review: (link) => `شكراً لاختيارك ${sn} 🙏 إذا كنت راضياً، تقييم قصير في جوجل يساعدنا كثيراً:\n${link}`,
      referral: () => 'سعدنا بمساعدتك! إذا احتاج أحد الأصدقاء أو العائلة إلينا، يمكنك إعطاؤه هذا الرقم 🙂',
      yearly: () => 'مرحباً، مرّت سنة منذ عملنا عندك. هل تريد أن نتأكد أن كل شيء بحالة جيدة؟',
      reminderDayBefore: (when, address) => `تذكير: ${o} ${f ? 'قادمة' : 'قادم'} إليك ${when}${address ? ` إلى العنوان ${address}` : ''}. إذا تغيّر شيء، اكتب هنا.`,
      reminderTwoHours: (time) => `${o} ${f ? 'ستكون' : 'سيكون'} عندك اليوم الساعة ${time}. إلى اللقاء 🙂`,
      optedOut: () => 'تمت إزالتك ولن تصلك تذكيرات أو تحديثات بعد الآن. إذا احتجت إلينا، اكتب هنا فقط.',
      customerNudge: () => `مرحباً، هل ما زلت بحاجة إلى مساعدة؟ يمكننا المتابعة من حيث توقفنا، وسأنقل كل شيء إلى ${o}.`,
      customerReassure: () => `${o} ما ${f ? 'زالت' : 'زال'} في عمل آخر. طلبك ${f ? 'عندها' : 'عنده'} و${f ? 'ستعود' : 'سيعود'} إليك قريباً.`,
    },
  };
  return T[lang];
}

// הודעה קבועה בשפה של הלקוח (אם אין תרגום, או שהלקוח שינה את ההודעה בעברית ב-client.js: עברית)
export function msg(lang, key, ...args) {
  const t = lang !== 'he' && !CUSTOM_MESSAGES.has(key) ? i18n(BUSINESS, lang)?.[key] : null;
  if (t) return t(...args);
  const he = MESSAGES[key];
  return typeof he === 'function' ? he(...args) : he;
}
const CUSTOM_MESSAGES = new Set();

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
  hours: { days: [0, 1, 2, 3, 4, 5, 6], from: '07:00', to: '22:00' }, holidays: [], afterHoursMessage: 'נחזור אליך {next}', priceGuidance: null,
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
  CUSTOM_MESSAGES.clear();
  for (const k of Object.keys(client.messages || {})) CUSTOM_MESSAGES.add(k);
  Object.assign(TIMING, DEFAULT_TIMING, client.timing || {});
  Object.assign(FEATURES, DEFAULT_FEATURES, client.features || {});
  const defs = defaultTemplates(BUSINESS).map((d) => (client.templates?.[d.name] ? { ...d, body: client.templates[d.name] } : d));
  TEMPLATE_DEFS.splice(0, TEMPLATE_DEFS.length, ...defs);
}

applyClient(activeClient);

