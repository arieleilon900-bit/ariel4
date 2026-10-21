// דוח בדיקה יומי (מופעל כל בוקר מ-GitHub Actions): מה קרה ב-24 השעות האחרונות, ומה לא תקין
import { TIMING } from './config.js';
import { ilParts, nowIso } from './util.js';

export async function dailyReport(env, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const n = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).first())?.n || 0;
  const ev = (type) => n('SELECT COUNT(*) AS n FROM events WHERE type = ? AND created_at >= ?', type, since);

  const inbound = await n("SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ?", since);
  const replies = await n("SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant' AND created_at >= ?", since);
  const customers = await n("SELECT COUNT(DISTINCT c.phone) AS n FROM messages m JOIN conversations c ON c.id = m.conv_id WHERE m.role = 'user' AND m.created_at >= ?", since);
  const emailsOk = await ev('owner_email');
  const emailsFailed = await ev('owner_email_failed');
  const emailsWaiting = await n('SELECT COUNT(*) AS n FROM owner_outbox WHERE sent = 0 AND failed = 1 AND created_at >= ?', since);
  const stuckSummaries = await n('SELECT COUNT(*) AS n FROM conversations WHERE summary_due_at IS NOT NULL AND summary_due_at < ?', new Date(now.getTime() - 15 * 60000).toISOString());
  const unanswered = await n("SELECT COUNT(*) AS n FROM conversations c WHERE c.state = 'bot' AND EXISTS (SELECT 1 FROM messages m WHERE m.conv_id = c.id AND m.role = 'user' AND m.created_at >= ?) AND NOT EXISTS (SELECT 1 FROM messages a WHERE a.conv_id = c.id AND a.role = 'assistant')", since);
  const aiErrors = await ev('ai_error');
  const sendFailed = await ev('send_failed');
  const yeshErrors = await ev('yesh_error');

  // הדוח השבועי: ביום ובשעה שנקבעו, ופעם בשבוע
  const at = TIMING.weeklyReportAt;
  const lastWeekly = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'weekly_sent'").first())?.value || '';
  const p = ilParts(now);
  let weekly = `הדוח השבועי האחרון: ${lastWeekly || 'עוד לא נשלח'}`;
  let weeklyLate = false;
  if (at && lastWeekly) {
    const [y, m, d] = lastWeekly.split('-').map(Number);
    const ageDays = (now.getTime() - Date.UTC(y, m - 1, d, 12)) / 86400000;
    weeklyLate = ageDays > 7.6;
  }
  if (at && p.dow === at.dow && +p.hh > at.hour) {
    const today = `${p.y}-${p.m}-${p.d}`;
    if (lastWeekly !== today) weeklyLate = true;
  }

  const problems = [];
  if (emailsFailed || emailsWaiting) problems.push(`מיילים לחנן שלא יצאו: ${emailsFailed} (ממתינים לניסיון חוזר: ${emailsWaiting}). לבדוק את סיסמת הג'ימייל`);
  if (stuckSummaries) problems.push(`סיכומים שהיו צריכים לצאת לחנן ותקועים: ${stuckSummaries}`);
  if (unanswered) problems.push(`לקוחות שכתבו ולא קיבלו שום תשובה מהבוט: ${unanswered}`);
  if (aiErrors) problems.push(`תקלות AI (הלקוח קיבל תשובה כללית והועבר לחנן): ${aiErrors}. לבדוק את הקרדיט ב-Anthropic`);
  if (sendFailed) {
    const rows = (await env.DB.prepare("SELECT detail, phone, COUNT(*) AS n FROM events WHERE type = 'send_failed' AND created_at >= ? GROUP BY detail, phone ORDER BY n DESC LIMIT 6").bind(since).all()).results;
    const why = rows.map((r) => `${r.n} ל-...${String(r.phone || '').slice(-4)}: ${explainFailure(r.detail)}`).join('; ');
    problems.push(`הודעות וואטסאפ שלא נמסרו: ${sendFailed} (${why})`);
  }
  if (yeshErrors) problems.push(`תקלות בחיבור ליש חשבונית: ${yeshErrors}`);
  if (weeklyLate) problems.push('הדוח השבועי לחנן לא יצא בזמן');

  return [
    `דוח יומי, ${nowIso(now)}`,
    problems.length ? `PROBLEMS: ${problems.length}` : 'ALL OK',
    ...problems.map((x) => `✗ ${x}`),
    '',
    `ב-24 השעות האחרונות:`,
    `לקוחות שכתבו: ${customers}, הודעות מלקוחות: ${inbound}, תשובות של הבוט: ${replies}`,
    `מיילים שיצאו לחנן: ${emailsOk}`,
    `פניות חדשות: ${await ev('lead')}, תזכורות לחנן: ${await ev('owner_nudge')}, תזכורות ללקוחות: ${await ev('customer_nudge')}`,
    `מסמכים מיש חשבונית שנשלחו: ${await ev('invoice')}, בקשות ביקורת: ${await ev('review')}, ספאם שסונן: ${await ev('spam')}`,
    weekly,
  ].join('\n');
}

// הסברים בעברית לשגיאות הנפוצות של Meta
const FAILURES = {
  131047: 'הלקוח לא כתב לעסק ב-24 השעות האחרונות, וצריך תבנית מאושרת של Meta',
  132001: 'התבנית לא קיימת או עוד לא אושרה ב-Meta',
  132000: 'מספר המשתנים בתבנית לא תואם',
  131026: 'המספר לא בוואטסאפ, או שהלקוח חסם',
  131049: 'Meta עצרה הודעה שיווקית ללקוח הזה (הגבלה של Meta)',
  131042: 'בעיית תשלום בחשבון ה-WhatsApp ב-Meta',
  130472: 'הלקוח בניסוי של Meta שמגביל הודעות שיווקיות',
  131051: 'סוג הודעה שלא נתמך',
};
function explainFailure(detail) {
  const code = Number(String(detail || '').split(' ')[0]);
  return FAILURES[code] ? `${FAILURES[code]} (${code})` : (detail || 'סיבה לא ידועה');
}
