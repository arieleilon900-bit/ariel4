/**
 * עונה ראשון: מערכת לידים ותורים למכוני לייזר וקוסמטיקה
 * Google Sheets + Apps Script + Green-API (וואטסאפ)
 *
 * מה המערכת עושה:
 *  1. ליד חדש ← וואטסאפ ללקוחה תוך דקה + התראה לבעלת המכון + שורה בגיליון
 *  2. לידה שלא קבעה תור ← 3 הודעות מעקב (אחרי יום, 3 ימים ושבוע)
 *  3. תור שנקבע ← תזכורת יום לפני ושעתיים לפני (פחות הברזות)
 *  4. לקוחה שלא הגיעה ← הודעה לקביעת תור חדש
 *  5. אחרי טיפול ← תזכורת לטיפול הבא בסדרה, כשמגיע הזמן
 *  6. אחרי הטיפול השלישי ← בקשת ביקורת בגוגל
 *
 * בעלת המכון רק משנה סטטוס ומועד תור בגיליון. השאר אוטומטי.
 * התקנה: ראו SETUP.md.
 */

var LEADS_SHEET = 'לקוחות';
var SETTINGS_SHEET = 'הגדרות';
var TZ = 'Asia/Jerusalem';

var HEADERS = ['תאריך', 'שם', 'טלפון', 'עיר', 'טיפול', 'הערות', 'מקור', 'סטטוס',
  'מועד תור', 'טיפולים', 'מעקב הבא', 'שלב מעקב', 'תזכורות לתור', 'הודעת היעדרות', 'ביקורת נשלחה'];

var STATUSES = ['חדשה', 'נקבע תור', 'הגיעה', 'לא הגיעה', 'בסדרה', 'סיימה', 'לא רלוונטי'];

var LEAD_FOLLOWUP_GAPS = [1, 2, 4];   // יום אחרי הפנייה, עוד יומיים, עוד 4 ימים
var NEXT_TREATMENT_NUDGE_GAP = 10;    // אם לא קבעה אחרי התזכורת הראשונה, עוד אחת אחרי 10 ימים
var REVIEW_AFTER_TREATMENTS = 3;
var SEND_FROM_HOUR = 9;               // הודעות מתוזמנות נשלחות רק בין 9:00 ל-20:00
var SEND_UNTIL_HOUR = 20;

var DEFAULT_SETTINGS = [
  ['שם העסק', 'סטודיו לייזר מיכל', 'מופיע בהודעות ובטופס'],
  ['שם בעלת העסק', 'מיכל', 'בשם מי יוצאות ההודעות'],
  ['טלפון בעלת העסק', '0500000000', 'לאן נשלחות ההתראות על לידים'],
  ['כתובת המכון', 'רחוב הדוגמה 1, תל אביב', 'מופיעה בתזכורות לתור'],
  ['זמן חזרה', 'תוך שעה', 'מה מבטיחים לליד חדש'],
  ['ימים בין טיפולים', '42', 'אחרי כמה ימים לשלוח תזכורת לטיפול הבא'],
  ['קישור לביקורת בגוגל', 'https://g.page/r/XXXX/review', 'מפרופיל העסק בגוגל ← "לקבלת ביקורות"'],
  ['סוגי טיפול', 'הסרת שיער בלייזר - פנים,הסרת שיער בלייזר - גוף,הסרת שיער בלייזר - גברים,טיפול פנים,אחר', 'מופרדים בפסיק, מופיעים בטופס'],
  ['GREEN_API_URL', 'https://XXXX.api.greenapi.com', 'apiUrl מהקונסולה של Green-API'],
  ['GREEN_ID_INSTANCE', '', 'idInstance'],
  ['GREEN_API_TOKEN', '', 'apiTokenInstance'],
  ['הודעה לליד חדש',
    'היי {שם}, כאן {בעלת העסק} מ{עסק} 💛\nקיבלתי את הפנייה שלך לגבי {טיפול}. אני באמצע טיפול כרגע ואחזור אלייך {זמן חזרה}.\nכדי שאוכל להציע לך תור: מה נוח לך יותר, בוקר או אחר הצהריים?',
    'משתנים: {שם} {בעלת העסק} {עסק} {טיפול} {זמן חזרה}'],
  ['התראה לבעלת העסק',
    '🔔 ליד חדש ({מקור})\nשם: {שם מלא}\nטלפון: {טלפון}\nעיר: {עיר}\nטיפול: {טיפול}\nהערות: {הערות}\n\nכבר שלחתי לה הודעה שתחזרי {זמן חזרה}.\nלוואטסאפ איתה: https://wa.me/{טלפון}',
    'משתנים: {שם מלא} {טלפון} {עיר} {טיפול} {הערות} {מקור} {זמן חזרה}'],
  ['מעקב ליד 1',
    'היי {שם}, רציתי לבדוק אם עדיין רלוונטי לך לקבוע {טיפול}? יש לי השבוע כמה תורים פנויים 🙂',
    'יום אחרי הפנייה, אם לא נקבע תור'],
  ['מעקב ליד 2',
    'היי {שם}, אם יש לך שאלות על הטיפול (כמה זה כואב, כמה טיפולים צריך, מחיר) אשמח לענות כאן בהודעה 💛',
    '3 ימים אחרי הפנייה'],
  ['מעקב ליד 3',
    'היי {שם}, הודעה אחרונה ממני 🙂 אם תרצי לקבוע בהמשך, פשוט תכתבי לי כאן.',
    'שבוע אחרי הפנייה'],
  ['תזכורת לפני תור',
    'היי {שם}, תזכורת לתור שלך {מתי} בשעה {שעה} ב{עסק}, {כתובת}.\nאם משהו השתנה, תעדכני אותי כאן 🙏',
    'כ-24 שעות לפני התור. {מתי} = היום / מחר / תאריך'],
  ['תזכורת שעתיים לפני',
    'היי {שם}, מחכה לך היום ב-{שעה} 💛\n{כתובת}',
    'כשעתיים לפני התור'],
  ['לא הגיעה',
    'היי {שם}, פספסנו אותך היום. הכול בסדר? אשמח לקבוע לך תור חדש, מה מתאים לך?',
    'נשלח כשמסמנים "לא הגיעה"'],
  ['טיפול הבא 1',
    'היי {שם}, עברו כבר כמה שבועות מהטיפול האחרון. זה הזמן הכי טוב לטיפול הבא, כדי לשמור על התוצאות 💛 לקבוע לך תור השבוע?',
    'כשמגיע הזמן לטיפול הבא בסדרה'],
  ['טיפול הבא 2',
    'היי {שם}, רק מזכירה שכדאי לא לדלג על הטיפול הבא בסדרה. יש לי תורים פנויים בימים הקרובים, מתאים לך?',
    '10 ימים אחרי התזכורת הראשונה, אם לא נקבע תור'],
  ['בקשת ביקורת',
    'היי {שם}, תודה שאת איתנו 💛 אם את מרוצה עד עכשיו, ביקורת קצרה בגוגל תעזור לנו מאוד: {ביקורת}',
    'אחרי הטיפול השלישי']
];

/* ---------- תפריט ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('עונה ראשון')
    .addItem('1. התקנה ראשונית', 'setup')
    .addItem('2. שליחת הודעת בדיקה לבעלת העסק', 'testWhatsApp')
    .addItem('3. ליד לדוגמה (בדיקה מלאה)', 'testLead')
    .addItem('4. הרצת תזכורות ומעקבים עכשיו', 'runScheduler')
    .addToUi();
}

/* ---------- התקנה ---------- */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ss.setSpreadsheetTimeZone(TZ); ss.setSpreadsheetLocale('iw_IL'); } catch (e) { }

  var sheet = ss.getSheetByName(LEADS_SHEET) || ss.insertSheet(LEADS_SHEET, 0);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.setRightToLeft(true);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3e8ef');
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
  sheet.getRange(2, HEADERS.indexOf('סטטוס') + 1, 1000, 1).setDataValidation(rule);
  sheet.getRange(2, HEADERS.indexOf('מועד תור') + 1, 1000, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange(2, HEADERS.indexOf('מעקב הבא') + 1, 1000, 1).setNumberFormat('dd/mm/yyyy');

  var settings = ss.getSheetByName(SETTINGS_SHEET) || ss.insertSheet(SETTINGS_SHEET);
  settings.setRightToLeft(true);
  if (settings.getLastRow() === 0) {
    settings.appendRow(['הגדרה', 'ערך', 'הסבר']);
    settings.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    settings.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f3e8ef');
    settings.setColumnWidth(1, 180);
    settings.setColumnWidth(2, 440);
    settings.getRange(2, 2, DEFAULT_SETTINGS.length, 1).setWrap(true);
  }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runScheduler') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runScheduler').timeBased().everyHours(1).create();

  safeAlert_('ההתקנה הושלמה.\n\nעכשיו מלאו את לשונית "הגדרות" (שם המכון, טלפון, כתובת, פרטי Green-API), ואז בתפריט "עונה ראשון" ← "שליחת הודעת בדיקה".');
}

/* ---------- קליטת לידים ---------- */

function doGet() {
  var s = getSettings_();
  var t = HtmlService.createTemplateFromFile('Form');
  t.business = s['שם העסק'] || '';
  t.jobTypes = String(s['סוגי טיפול'] || 'אחר').split(',').map(function (x) { return x.trim(); }).filter(String);
  return t.evaluate()
    .setTitle(t.business ? 'קביעת תור | ' + t.business : 'קביעת תור')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function submitLead(form) {
  return handleLead_({
    name: form.name, phone: form.phone, city: form.city,
    job: form.job, notes: form.notes, source: 'טופס'
  });
}

// לידים מבחוץ: טופס באתר, JSON, Webhook של Tally, או Make מטופס פייסבוק
function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : '';
    var json = null;
    try { json = body ? JSON.parse(body) : null; } catch (err) { json = null; }
    var lead;
    if (json && json.data && json.data.fields) {
      lead = fromTally_(json.data.fields);
    } else if (json) {
      lead = { name: json.name, phone: json.phone, city: json.city, job: json.job || json.treatment, notes: json.notes, source: json.source || 'אתר' };
    } else {
      var p = (e && e.parameter) || {};
      lead = { name: p.name, phone: p.phone, city: p.city, job: p.job || p.treatment, notes: p.notes, source: p.source || 'אתר' };
    }
    return json_(handleLead_(lead));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function fromTally_(fields) {
  var lead = { source: 'Tally' };
  fields.forEach(function (f) {
    var label = String(f.label || '');
    var value = f.value;
    if (Array.isArray(value) && f.options) {
      value = value.map(function (id) {
        var o = f.options.filter(function (x) { return x.id === id; })[0];
        return o ? o.text : id;
      }).join(', ');
    }
    value = value == null ? '' : String(value);
    if (/טלפון|נייד|phone/i.test(label)) lead.phone = value;
    else if (/שם|name/i.test(label)) lead.name = value;
    else if (/עיר|ישוב|יישוב|city/i.test(label)) lead.city = value;
    else if (/טיפול|אזור|שירות|treatment|service/i.test(label)) lead.job = value;
    else if (/הערות|פרטים|notes/i.test(label)) lead.notes = value;
  });
  return lead;
}

function handleLead_(lead) {
  var phone = normalizePhone(lead.phone);
  if (!phone) return { ok: false, error: 'מספר טלפון לא תקין' };

  var s = getSettings_();
  var fullName = String(lead.name || '').trim();
  var vars = baseVars_(s, fullName);
  vars['שם מלא'] = fullName || '(לא נמסר)';
  vars['טלפון'] = phone;
  vars['עיר'] = lead.city || '';
  vars['טיפול'] = lead.job || 'הטיפול';
  vars['הערות'] = lead.notes || '';
  vars['מקור'] = lead.source || 'אתר';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
    var row = {
      'תאריך': new Date(), 'שם': fullName, 'טלפון': phone, 'עיר': lead.city || '',
      'טיפול': lead.job || '', 'הערות': lead.notes || '', 'מקור': vars['מקור'],
      'סטטוס': 'חדשה', 'טיפולים': 0, 'שלב מעקב': 0,
      'מעקב הבא': addDays_(today_(), LEAD_FOLLOWUP_GAPS[0])
    };
    sheet.appendRow(HEADERS.map(function (h) { return row[h] === undefined ? '' : row[h]; }));
  } finally {
    lock.releaseLock();
  }

  var sentLead = sendWhatsApp(phone, fillTemplate(s['הודעה לליד חדש'], vars));
  var owner = normalizePhone(s['טלפון בעלת העסק']);
  var sentOwner = owner ? sendWhatsApp(owner, fillTemplate(s['התראה לבעלת העסק'], vars)) : false;
  return { ok: true, sentToLead: sentLead, sentToOwner: sentOwner };
}

/* ---------- מתזמן: רץ כל שעה ---------- */

function runScheduler(now) {
  now = now instanceof Date ? now : new Date();
  var s = getSettings_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var col = indexHeaders_(data[0]);
  var today = startOfDay_(now);
  var hour = Number(Utilities.formatDate(now, TZ, 'H'));
  var daytime = hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
  var interval = Number(s['ימים בין טיפולים']) || 42;

  function set(rowNum, name, value) { sheet.getRange(rowNum, col[name] + 1).setValue(value); }

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var rowNum = i + 1;
    var status = String(r[col['סטטוס']]).trim();
    var phone = normalizePhone(r[col['טלפון']]);
    if (!phone) continue;
    var vars = baseVars_(s, r[col['שם']]);
    vars['טיפול'] = r[col['טיפול']] || 'הטיפול';
    var stage = Number(r[col['שלב מעקב']]) || 0;
    var next = r[col['מעקב הבא']];
    var due = next instanceof Date && startOfDay_(next) <= today;

    if (status === 'חדשה') {
      // לידה שעוד לא קבעה תור
      if (daytime && due && stage < 3) {
        if (sendWhatsApp(phone, fillTemplate(s['מעקב ליד ' + (stage + 1)], vars))) {
          set(rowNum, 'שלב מעקב', stage + 1);
          set(rowNum, 'מעקב הבא', stage + 1 < 3 ? addDays_(today, LEAD_FOLLOWUP_GAPS[stage + 1]) : 'הסתיים');
        }
      }

    } else if (status === 'נקבע תור') {
      var appt = parseDateTime_(r[col['מועד תור']]);
      if (!appt) continue;
      var hoursLeft = (appt.getTime() - now.getTime()) / 3600000;
      if (hoursLeft <= 0) continue;
      var key = Utilities.formatDate(appt, TZ, 'yyyy-MM-dd HH:mm');
      var parts = String(r[col['תזכורות לתור']] || '').split('|');
      var sent = parts[0] === key ? Number(parts[1]) || 0 : 0;
      vars['שעה'] = Utilities.formatDate(appt, TZ, 'HH:mm');
      vars['מתי'] = whenLabel_(appt, now);

      if (sent === 0 && hoursLeft <= 26 && hoursLeft > 3 && daytime) {
        if (sendWhatsApp(phone, fillTemplate(s['תזכורת לפני תור'], vars))) set(rowNum, 'תזכורות לתור', key + '|1');
      } else if (sent < 2 && hoursLeft <= 2.5) {
        if (sendWhatsApp(phone, fillTemplate(s['תזכורת שעתיים לפני'], vars))) set(rowNum, 'תזכורות לתור', key + '|2');
      }

    } else if (status === 'הגיעה') {
      // בעלת המכון סימנה שהטיפול בוצע: סופרים ומתזמנים את הטיפול הבא
      var count = (Number(r[col['טיפולים']]) || 0) + 1;
      set(rowNum, 'טיפולים', count);
      set(rowNum, 'סטטוס', 'בסדרה');
      set(rowNum, 'שלב מעקב', 0);
      set(rowNum, 'מעקב הבא', addDays_(today, interval));
      set(rowNum, 'מועד תור', '');
      set(rowNum, 'תזכורות לתור', '');
      // בקשת הביקורת (אחרי הטיפול השלישי) נשלחת בריצה הבאה, בשעות היום

    } else if (status === 'בסדרה') {
      var treatments = Number(r[col['טיפולים']]) || 0;
      if (treatments >= REVIEW_AFTER_TREATMENTS && !r[col['ביקורת נשלחה']] && daytime) {
        if (sendWhatsApp(phone, fillTemplate(s['בקשת ביקורת'], vars))) set(rowNum, 'ביקורת נשלחה', new Date());
      }
      if (daytime && due && stage < 2) {
        if (sendWhatsApp(phone, fillTemplate(s['טיפול הבא ' + (stage + 1)], vars))) {
          set(rowNum, 'שלב מעקב', stage + 1);
          set(rowNum, 'מעקב הבא', stage === 0 ? addDays_(today, NEXT_TREATMENT_NUDGE_GAP) : 'הסתיים');
        }
      }

    } else if (status === 'לא הגיעה') {
      if (!r[col['הודעת היעדרות']] && daytime) {
        if (sendWhatsApp(phone, fillTemplate(s['לא הגיעה'], vars))) set(rowNum, 'הודעת היעדרות', new Date());
      }
    }
  }
}

/* ---------- וואטסאפ ---------- */

function sendWhatsApp(phoneIntl, text) {
  var s = getSettings_();
  var base = String(s['GREEN_API_URL'] || '').replace(/\/+$/, '');
  var id = String(s['GREEN_ID_INSTANCE'] || '').trim();
  var token = String(s['GREEN_API_TOKEN'] || '').trim();
  if (!base || !id || !token || base.indexOf('XXXX') > -1) {
    console.warn('Green-API לא מוגדר. ההודעה לא נשלחה ל-' + phoneIntl);
    return false;
  }
  var res = UrlFetchApp.fetch(base + '/waInstance' + id + '/sendMessage/' + token, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chatId: phoneIntl + '@c.us', message: text }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    console.error('שליחה נכשלה (' + res.getResponseCode() + '): ' + res.getContentText());
    return false;
  }
  return true;
}

/* ---------- בדיקות מהתפריט ---------- */

function testWhatsApp() {
  var s = getSettings_();
  var owner = normalizePhone(s['טלפון בעלת העסק']);
  var ok = owner && sendWhatsApp(owner, '✅ בדיקה: המערכת של ' + (s['שם העסק'] || '') + ' מחוברת לוואטסאפ.');
  safeAlert_(ok ? 'נשלחה הודעת בדיקה ל-' + owner + '.' : 'השליחה נכשלה. בדקו את הטלפון ואת פרטי Green-API בלשונית "הגדרות", ושהמכשיר מחובר בקונסולה.');
}

function testLead() {
  var s = getSettings_();
  var res = handleLead_({
    name: 'ליד לדוגמה', phone: s['טלפון בעלת העסק'], city: 'תל אביב',
    job: 'הסרת שיער בלייזר - פנים', notes: 'זה ליד בדיקה', source: 'בדיקה'
  });
  safeAlert_(res.ok ? 'נוספה שורה ללשונית "לקוחות". הודעה ללידה: ' + (res.sentToLead ? 'נשלחה' : 'לא נשלחה') + '. התראה לבעלת העסק: ' + (res.sentToOwner ? 'נשלחה' : 'לא נשלחה') + '.' : 'שגיאה: ' + res.error);
}

/* ---------- עזרים ---------- */

function normalizePhone(raw) {
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('00972') === 0) d = d.slice(2);
  if (d.indexOf('972') === 0) d = d.slice(3);
  if (d.charAt(0) === '0') d = d.slice(1);
  if (d.length < 8 || d.length > 9) return '';
  return '972' + d;
}

function firstName(full) {
  return String(full == null ? '' : full).trim().split(/\s+/)[0] || '';
}

function fillTemplate(tpl, vars) {
  return String(tpl == null ? '' : tpl)
    .replace(/\\n/g, '\n')
    .replace(/\{([^{}]+)\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m;
    });
}

function baseVars_(s, fullName) {
  return {
    'שם': firstName(fullName) || 'היי',
    'עסק': s['שם העסק'] || '',
    'בעלת העסק': s['שם בעלת העסק'] || '',
    'כתובת': s['כתובת המכון'] || '',
    'זמן חזרה': s['זמן חזרה'] || 'תוך שעה',
    'ביקורת': s['קישור לביקורת בגוגל'] || ''
  };
}

// מקבל תאריך מהגיליון, או טקסט בפורמט 14/10/2026 16:30
function parseDateTime_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var m = String(v || '').match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  var y = Number(m[3]); if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
}

function whenLabel_(appt, now) {
  var diff = Math.round((startOfDay_(appt) - startOfDay_(now)) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  return 'ב-' + Utilities.formatDate(appt, TZ, 'dd/MM');
}

function getSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  var out = {};
  if (!sheet) return out;
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0]) out[String(r[0]).trim()] = r[1];
  });
  return out;
}

function indexHeaders_(row) {
  var col = {};
  row.forEach(function (h, i) { col[String(h).trim()] = i; });
  return col;
}

function today_() { return startOfDay_(new Date()); }
function startOfDay_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
