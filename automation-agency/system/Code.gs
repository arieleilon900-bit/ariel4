/**
 * תפוס: מערכת "אף ליד לא נופל"
 * Google Sheets + Apps Script + Green-API (וואטסאפ)
 *
 * מה המערכת עושה:
 *  1. ליד חדש (מהטופס המובנה, מהאתר או מ-Tally) ← וואטסאפ ללקוח + התראה לבעל העסק + שורה בגיליון
 *  2. כל בוקר: הודעות מעקב על הצעות מחיר (אחרי 2, 5 ו-10 ימים)
 *  3. כל בוקר: בקשת ביקורת בגוגל לעבודות שסומנו "בוצע"
 *
 * התקנה: ראו SETUP.md. בקצרה: מדביקים את הקובץ, מריצים setup(), ממלאים את לשונית "הגדרות".
 */

var LEADS_SHEET = 'לידים';
var SETTINGS_SHEET = 'הגדרות';

var HEADERS = ['תאריך', 'שם', 'טלפון', 'עיר', 'סוג עבודה', 'הערות', 'מקור',
  'סטטוס', 'סכום הצעה', 'מעקב הבא', 'שלב מעקב', 'ביקורת נשלחה'];

var STATUSES = ['חדש', 'נשלחה הצעה', 'נסגר', 'בוצע', 'לא רלוונטי'];

// ימים עד ההודעה הבאה: אחרי סימון "נשלחה הצעה" מחכים 2, אחרי הודעה 1 עוד 3, אחרי הודעה 2 עוד 5
var FOLLOWUP_GAPS = [2, 3, 5];
var MAX_FOLLOWUPS = 3;

var DEFAULT_SETTINGS = [
  ['שם העסק', 'שיפוצי יוסי', 'מופיע בהודעות ובטופס'],
  ['שם בעל העסק', 'יוסי', 'בשם מי יוצאות ההודעות'],
  ['טלפון בעל העסק', '0500000000', 'לאן נשלחות ההתראות על לידים'],
  ['שעת חזרה', '18:00', 'עד מתי בעל העסק מבטיח לחזור'],
  ['קישור לביקורת בגוגל', 'https://g.page/r/XXXX/review', 'מפרופיל העסק בגוגל ← "לקבלת ביקורות"'],
  ['סוגי עבודה', 'שיפוץ מטבח,שיפוץ אמבטיה,שיפוץ כללי,אחר', 'מופרדים בפסיק, מופיעים בטופס'],
  ['GREEN_API_URL', 'https://XXXX.api.greenapi.com', 'apiUrl מהקונסולה של Green-API'],
  ['GREEN_ID_INSTANCE', '', 'idInstance'],
  ['GREEN_API_TOKEN', '', 'apiTokenInstance'],
  ['הודעה ללקוח חדש',
    'היי {שם}, כאן {בעלים} מ{עסק} 👋\nקיבלתי את הפנייה שלך לגבי {עבודה}. אני באמצע עבודה כרגע ואחזור אליך היום עד {שעה}.\nבינתיים, אם יש לך תמונות של המקום אפשר לשלוח לי לפה, זה יעזור לי לתת הצעה מדויקת.',
    'משתנים: {שם} {בעלים} {עסק} {עבודה} {שעה}'],
  ['התראה לבעל העסק',
    '🔔 ליד חדש ({מקור})\nשם: {שם מלא}\nטלפון: {טלפון}\nעיר: {עיר}\nעבודה: {עבודה}\nהערות: {הערות}\n\nכבר שלחתי לו הודעה שתחזור עד {שעה}.\nלוואטסאפ איתו: https://wa.me/{טלפון}',
    'משתנים: {שם מלא} {טלפון} {עיר} {עבודה} {הערות} {מקור} {שעה}'],
  ['מעקב 1',
    'היי {שם}, רציתי לוודא שההצעה שלי הגיעה ושאין שאלות. אם משהו לא ברור אשמח להסביר 🙂\n{בעלים}, {עסק}',
    'נשלח יומיים אחרי "נשלחה הצעה"'],
  ['מעקב 2',
    'היי {שם}, חוזר אליך לגבי ההצעה. אם המחיר או הלו״ז לא מתאימים, תגיד לי. בדרך כלל אפשר למצוא פתרון.\n{בעלים}, {עסק}',
    'נשלח 3 ימים אחרי מעקב 1'],
  ['מעקב 3',
    'היי {שם}, אני סוגר את הלו״ז לחודש הקרוב ורציתי לבדוק אם לשמור לך מקום. אם החלטת ללכת על משהו אחר, הכול טוב, רק תעדכן אותי 🙏\n{בעלים}, {עסק}',
    'נשלח 5 ימים אחרי מעקב 2'],
  ['בקשת ביקורת',
    'היי {שם}, תודה שבחרת ב{עסק}! 🙏\nאם יצאת מרוצה, ביקורת קצרה בגוגל עוזרת לנו מאוד: {ביקורת}',
    'נשלח בבוקר שאחרי סימון "בוצע"']
];

/* ---------- תפריט ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('תפוס')
    .addItem('1. התקנה ראשונית', 'setup')
    .addItem('2. שליחת הודעת בדיקה לבעל העסק', 'testWhatsApp')
    .addItem('3. ליד לדוגמה (בדיקה מלאה)', 'testLead')
    .addItem('4. הרצת מעקב יומי עכשיו', 'dailyFollowups')
    .addToUi();
}

/* ---------- התקנה ---------- */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var leads = ss.getSheetByName(LEADS_SHEET) || ss.insertSheet(LEADS_SHEET, 0);
  if (leads.getLastRow() === 0) {
    leads.appendRow(HEADERS);
  }
  leads.setFrozenRows(1);
  leads.setRightToLeft(true);
  leads.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8efe9');
  var statusCol = HEADERS.indexOf('סטטוס') + 1;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
  leads.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
  leads.getRange(2, HEADERS.indexOf('מעקב הבא') + 1, 1000, 1).setNumberFormat('dd/mm/yyyy');

  var settings = ss.getSheetByName(SETTINGS_SHEET) || ss.insertSheet(SETTINGS_SHEET);
  settings.setRightToLeft(true);
  if (settings.getLastRow() === 0) {
    settings.appendRow(['הגדרה', 'ערך', 'הסבר']);
    settings.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    settings.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8efe9');
    settings.setColumnWidth(1, 180);
    settings.setColumnWidth(2, 420);
    settings.getRange(2, 2, DEFAULT_SETTINGS.length, 1).setWrap(true);
  }

  // טריגר יומי למעקב (מוחקים קודם כפילויות)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyFollowups') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyFollowups').timeBased().everyDays(1).atHour(10)
    .inTimezone('Asia/Jerusalem').create();

  safeAlert_('ההתקנה הושלמה.\n\nעכשיו מלאו את לשונית "הגדרות" (שם העסק, טלפון, פרטי Green-API), ואז בתפריט "תפוס" ← "שליחת הודעת בדיקה".');
}

/* ---------- קליטת לידים ---------- */

// הטופס המובנה (קישור ה-Web App)
function doGet() {
  var s = getSettings_();
  var t = HtmlService.createTemplateFromFile('Form');
  t.business = s['שם העסק'] || '';
  t.jobTypes = String(s['סוגי עבודה'] || 'אחר').split(',').map(function (x) { return x.trim(); }).filter(String);
  return t.evaluate()
    .setTitle(t.business ? 'השארת פרטים | ' + t.business : 'השארת פרטים')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// נקרא מהטופס המובנה
function submitLead(form) {
  return handleLead_({
    name: form.name, phone: form.phone, city: form.city,
    job: form.job, notes: form.notes, source: 'טופס'
  });
}

// לידים מבחוץ: טופס באתר (POST רגיל), JSON, או Webhook של Tally
function doPost(e) {
  var lead;
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : '';
    var json = null;
    try { json = body ? JSON.parse(body) : null; } catch (err) { json = null; }

    if (json && json.data && json.data.fields) {
      lead = fromTally_(json.data.fields);
    } else if (json) {
      lead = { name: json.name, phone: json.phone, city: json.city, job: json.job, notes: json.notes, source: json.source || 'אתר' };
    } else {
      var p = (e && e.parameter) || {};
      lead = { name: p.name, phone: p.phone, city: p.city, job: p.job, notes: p.notes, source: p.source || 'אתר' };
    }
    var result = handleLead_(lead);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
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
    else if (/עבודה|שירות|job|service/i.test(label)) lead.job = value;
    else if (/הערות|פרטים|notes/i.test(label)) lead.notes = value;
  });
  return lead;
}

function handleLead_(lead) {
  var phone = normalizePhone(lead.phone);
  if (!phone) return { ok: false, error: 'מספר טלפון לא תקין' };

  var s = getSettings_();
  var fullName = String(lead.name || '').trim();
  var vars = {
    'שם': firstName(fullName) || 'שלום',
    'שם מלא': fullName || '(לא נמסר)',
    'טלפון': phone,
    'עיר': lead.city || '',
    'עבודה': lead.job || 'העבודה',
    'הערות': lead.notes || '',
    'מקור': lead.source || 'אתר',
    'עסק': s['שם העסק'] || '',
    'בעלים': s['שם בעל העסק'] || '',
    'שעה': s['שעת חזרה'] || '18:00'
  };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
    var row = {};
    row['תאריך'] = new Date();
    row['שם'] = fullName;
    row['טלפון'] = phone;
    row['עיר'] = lead.city || '';
    row['סוג עבודה'] = lead.job || '';
    row['הערות'] = lead.notes || '';
    row['מקור'] = vars['מקור'];
    row['סטטוס'] = 'חדש';
    row['שלב מעקב'] = 0;
    sheet.appendRow(HEADERS.map(function (h) { return row[h] === undefined ? '' : row[h]; }));
  } finally {
    lock.releaseLock();
  }

  var sentLead = sendWhatsApp(phone, fillTemplate(s['הודעה ללקוח חדש'], vars));
  var owner = normalizePhone(s['טלפון בעל העסק']);
  var sentOwner = owner ? sendWhatsApp(owner, fillTemplate(s['התראה לבעל העסק'], vars)) : false;
  return { ok: true, sentToLead: sentLead, sentToOwner: sentOwner };
}

/* ---------- מעקב יומי ---------- */

function dailyFollowups() {
  var s = getSettings_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEADS_SHEET);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var col = indexHeaders_(data[0]);
  var today = startOfDay_(new Date());
  var templates = [s['מעקב 1'], s['מעקב 2'], s['מעקב 3']];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var rowNum = i + 1;
    var status = String(r[col['סטטוס']]).trim();
    var phone = normalizePhone(r[col['טלפון']]);
    if (!phone) continue;
    var vars = {
      'שם': firstName(r[col['שם']]) || 'שלום',
      'עסק': s['שם העסק'] || '',
      'בעלים': s['שם בעל העסק'] || '',
      'ביקורת': s['קישור לביקורת בגוגל'] || ''
    };

    if (status === 'נשלחה הצעה') {
      var next = r[col['מעקב הבא']];
      var stage = Number(r[col['שלב מעקב']]) || 0;
      if (!next) {
        // הצעה שסומנה עכשיו: מתחילים לספור
        sheet.getRange(rowNum, col['מעקב הבא'] + 1).setValue(addDays_(today, FOLLOWUP_GAPS[0]));
        sheet.getRange(rowNum, col['שלב מעקב'] + 1).setValue(0);
      } else if (stage < MAX_FOLLOWUPS && startOfDay_(new Date(next)) <= today) {
        if (sendWhatsApp(phone, fillTemplate(templates[stage], vars))) {
          var newStage = stage + 1;
          sheet.getRange(rowNum, col['שלב מעקב'] + 1).setValue(newStage);
          sheet.getRange(rowNum, col['מעקב הבא'] + 1)
            .setValue(newStage < MAX_FOLLOWUPS ? addDays_(today, FOLLOWUP_GAPS[newStage]) : 'הסתיים');
        }
      }
    } else if (status === 'בוצע' && !r[col['ביקורת נשלחה']]) {
      if (sendWhatsApp(phone, fillTemplate(s['בקשת ביקורת'], vars))) {
        sheet.getRange(rowNum, col['ביקורת נשלחה'] + 1).setValue(new Date());
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
  var url = base + '/waInstance' + id + '/sendMessage/' + token;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chatId: phoneIntl + '@c.us', message: text }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    console.error('שליחה נכשלה (' + code + '): ' + res.getContentText());
    return false;
  }
  return true;
}

/* ---------- בדיקות מהתפריט ---------- */

function testWhatsApp() {
  var s = getSettings_();
  var owner = normalizePhone(s['טלפון בעל העסק']);
  var ok = owner && sendWhatsApp(owner, '✅ בדיקה: מערכת הלידים של ' + (s['שם העסק'] || '') + ' מחוברת לוואטסאפ.');
  safeAlert_(ok ? 'נשלחה הודעת בדיקה ל-' + owner + '.' : 'השליחה נכשלה. בדקו את טלפון בעל העסק ואת פרטי Green-API בלשונית "הגדרות", ושהמכשיר מחובר בקונסולה.');
}

function testLead() {
  var s = getSettings_();
  var res = handleLead_({
    name: 'ליד לדוגמה', phone: s['טלפון בעל העסק'], city: 'חדרה',
    job: 'שיפוץ מטבח', notes: 'זה ליד בדיקה', source: 'בדיקה'
  });
  safeAlert_(res.ok ? 'נוספה שורה ללשונית "לידים". הודעה ללקוח: ' + (res.sentToLead ? 'נשלחה' : 'לא נשלחה') + '. התראה לבעל העסק: ' + (res.sentToOwner ? 'נשלחה' : 'לא נשלחה') + '.' : 'שגיאה: ' + res.error);
}

/* ---------- עזרים ---------- */

// 054-123-4567 / +972 54 1234567 / 541234567 ← 972541234567
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

function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}
