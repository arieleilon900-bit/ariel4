// משימות מתוזמנות: כל 15 דקות (תזכורות, מעקבים, ביקורות, קבלות), וכל יום ראשון (דוח שבועי).
import { BUSINESS, MESSAGES, TEMPLATES, TIMING } from './config.js';
import { ilParts, ilTime, nowIso, whenLabel, displayPhone, wazeLink } from './util.js';
import { logEvent, sendToCustomer, sendToOwner } from './handler.js';
import { fetchNewDocuments } from './yesh.js';
import { deliverReceipt } from './receipts.js';
import { customerHours, restNow } from './hours.js';
import { runNudges } from './nudges.js';

// לקוח שכתב "הסר" לא מקבל הודעות יזומות
async function optedOut(env, phone) {
  return !!(await env.DB.prepare('SELECT opted_out FROM customers WHERE phone = ?').bind(phone).first())?.opted_out;
}

// הודעות מתוזמנות ללקוחות רק בין 08:00 ל-21:00, ולא בשבת
const canMessageNow = customerHours;

export async function runEvery15(env, now = new Date()) {
  await appointmentReminders(env, now);
  await ownerAgenda(env, now);
  await ownerJobReminders(env, now);
  await runNudges(env, now);
  await invoices(env, now);
  if (!canMessageNow(now)) return;
  await followups(env, now);
  await reviews(env, now);
  await referrals(env, now);
  await yearly(env, now);
}

async function appointmentReminders(env, now) {
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'open' AND scheduled_at IS NOT NULL AND reminders_sent < 2").all()).results;
  for (const j of jobs) {
    if (await optedOut(env, j.phone)) continue;
    const at = new Date(j.scheduled_at);
    const hoursLeft = (at.getTime() - now.getTime()) / 3600000;
    if (hoursLeft <= 0) continue;
    if (j.reminders_sent === 0 && hoursLeft <= TIMING.reminderDayBeforeHours && hoursLeft > 3 && canMessageNow(now)) {
      const when = whenLabel(at, now);
      const r = await sendToCustomer(env, j.phone, MESSAGES.reminderDayBefore(when, j.address), { name: TEMPLATES.reminderDayBefore, params: [when, j.address || '-'] }, now);
      if (r.ok) { await env.DB.prepare('UPDATE jobs SET reminders_sent = 1 WHERE id = ?').bind(j.id).run(); await logEvent(env, 'reminder', j.phone, now); }
    } else if (hoursLeft <= TIMING.reminderTwoHoursBefore + 0.25) {
      const time = ilTime(at);
      const r = await sendToCustomer(env, j.phone, MESSAGES.reminderTwoHours(time), { name: TEMPLATES.reminderTwoHours, params: [time] }, now);
      if (r.ok) { await env.DB.prepare('UPDATE jobs SET reminders_sent = 2 WHERE id = ?').bind(j.id).run(); await logEvent(env, 'reminder', j.phone, now); }
    }
  }
}

// שורה על עבודה, בשביל ההודעות לחנן
async function jobLine(env, j, now) {
  const c = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(j.phone).first();
  const at = new Date(j.scheduled_at);
  return [
    `${whenLabel(at, now)}: ${c?.name || 'לקוח'} ${displayPhone(j.phone)}`,
    j.issue ? `תקלה: ${j.issue}` : '',
    j.address ? `כתובת: ${j.address}` : '',
    j.address ? `ניווט: ${wazeLink({ address: j.address })}` : '',
  ].filter(Boolean).join('\n');
}

// כל בוקר: העבודות של היום (חוץ משבת, ורק אם יש עבודות)
async function ownerAgenda(env, now) {
  const p = ilParts(now);
  if (!TIMING.ownerAgendaHour || restNow(now) || +p.hh !== TIMING.ownerAgendaHour) return;
  const sent = await env.DB.prepare("SELECT 1 FROM events WHERE type = 'agenda' AND created_at >= ?").bind(new Date(now.getTime() - 20 * 3600000).toISOString()).first();
  if (sent) return;
  const end = new Date(now.getTime() + 18 * 3600000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'open' AND scheduled_at IS NOT NULL AND scheduled_at >= ? AND scheduled_at <= ? ORDER BY scheduled_at").bind(nowIso(now), end).all()).results
    .filter((j) => ilParts(new Date(j.scheduled_at)).d === p.d);
  await logEvent(env, 'agenda', null, now);
  if (!jobs.length) return;
  const lines = [];
  for (const j of jobs) lines.push(await jobLine(env, j, now));
  await sendToOwner(env, `בוקר טוב! העבודות שלך היום (${jobs.length}):\n\n${lines.join('\n\n')}`, now);
}

// תזכורת לחנן לפני כל עבודה מתואמת
async function ownerJobReminders(env, now) {
  if (!TIMING.ownerReminderMinutes || (BUSINESS.shabbat?.enabled && restNow(now))) return;
  const until = new Date(now.getTime() + (TIMING.ownerReminderMinutes + 15) * 60000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'open' AND owner_reminded = 0 AND scheduled_at IS NOT NULL AND scheduled_at > ? AND scheduled_at <= ?").bind(nowIso(now), until).all()).results;
  for (const j of jobs) {
    await env.DB.prepare('UPDATE jobs SET owner_reminded = 1 WHERE id = ?').bind(j.id).run();
    await sendToOwner(env, `תזכורת: עבודה ${await jobLine(env, j, now)}`, now, j.phone);
  }
}

async function followups(env, now) {
  const convs = (await env.DB.prepare(
    "SELECT * FROM conversations WHERE state = 'handoff' AND followup_sent = 0 AND followup_at IS NOT NULL AND followup_at <= ?",
  ).bind(nowIso(now)).all()).results;
  for (const c of convs) {
    const job = await env.DB.prepare('SELECT 1 FROM jobs WHERE phone = ? AND created_at >= ?').bind(c.phone, c.started_at).first();
    await env.DB.prepare('UPDATE conversations SET followup_sent = 1 WHERE id = ?').bind(c.id).run();
    if (job || await optedOut(env, c.phone)) continue; // כבר נפתחה עבודה, אין צורך במעקב
    const r = await sendToCustomer(env, c.phone, MESSAGES.followup, { name: TEMPLATES.followup }, now);
    if (r.ok) await logEvent(env, 'followup', c.phone, now);
  }
}

async function reviews(env, now) {
  if (!env.REVIEW_LINK) return;
  const cutoff = new Date(now.getTime() - TIMING.reviewAfterHours * 3600000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'done' AND review_sent_at IS NULL AND done_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    // לא מבקשים ביקורת פעמיים מאותו לקוח בחצי שנה
    const asked = await env.DB.prepare('SELECT 1 FROM jobs WHERE phone = ? AND id != ? AND review_sent_at >= ?').bind(j.phone, j.id, new Date(now.getTime() - 180 * 86400000).toISOString()).first();
    if (asked || await optedOut(env, j.phone)) {
      await env.DB.prepare('UPDATE jobs SET review_sent_at = ?, referral_sent_at = ? WHERE id = ?').bind(nowIso(now), nowIso(now), j.id).run();
      continue;
    }
    const r = await sendToCustomer(env, j.phone, MESSAGES.review(env.REVIEW_LINK), { name: TEMPLATES.review, params: [env.REVIEW_LINK] }, now);
    await env.DB.prepare('UPDATE jobs SET review_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
    if (r.ok) await logEvent(env, 'review', j.phone, now);
  }
}

async function referrals(env, now) {
  const cutoff = new Date(now.getTime() - TIMING.referralAfterDays * 86400000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'done' AND review_sent_at IS NOT NULL AND referral_sent_at IS NULL AND review_sent_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    if (await optedOut(env, j.phone)) { await env.DB.prepare('UPDATE jobs SET referral_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run(); continue; }
    const r = await sendToCustomer(env, j.phone, MESSAGES.referral, { name: TEMPLATES.referral }, now);
    await env.DB.prepare('UPDATE jobs SET referral_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
    if (r.ok) await logEvent(env, 'referral', j.phone, now);
  }
}

async function yearly(env, now) {
  const cutoff = new Date(now.getTime() - TIMING.yearlyAfterDays * 86400000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'done' AND yearly_sent_at IS NULL AND done_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    // היה אצלו שוב בשנה האחרונה, או ביקש הסרה: לא שולחים
    const newer = await env.DB.prepare("SELECT 1 FROM jobs WHERE phone = ? AND id > ? AND status = 'done'").bind(j.phone, j.id).first();
    if (newer || await optedOut(env, j.phone)) { await env.DB.prepare('UPDATE jobs SET yearly_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run(); continue; }
    const r = await sendToCustomer(env, j.phone, MESSAGES.yearly, { name: TEMPLATES.yearly }, now);
    await env.DB.prepare('UPDATE jobs SET yearly_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
    if (r.ok) await logEvent(env, 'yearly', j.phone, now);
  }
}

// קבלות מיש חשבונית: כל מסמך חדש נשלח ללקוח, והעבודה מסומנת כגמורה (מה שמפעיל בקשת ביקורת)
async function invoices(env, now) {
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const docs = await fetchNewDocuments(env, since);
  for (const d of docs) {
    const seen = await env.DB.prepare('SELECT 1 FROM jobs WHERE invoice_doc_id = ?').bind(String(d.id)).first();
    if (seen || !d.phone || !d.pdfUrl) continue;
    await deliverReceipt(env, d.phone, d.pdfUrl, { docId: String(d.id), now });
  }
}

export async function weeklyReport(env, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();
  const rows = (await env.DB.prepare('SELECT type, COUNT(*) AS n FROM events WHERE created_at >= ? GROUP BY type').bind(since).all()).results;
  const n = Object.fromEntries(rows.map((r) => [r.type, r.n]));
  const c = (k) => n[k] || 0;
  const done = await env.DB.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'done' AND done_at >= ?").bind(since).first();
  const text = [
    '📊 הסיכום השבועי',
    '',
    `פניות חדשות: ${c('lead')}`,
    `הועברו אליך: ${c('handoff') + c('urgent')} (מתוכן דחופות: ${c('urgent')})`,
    `עבודות שהסתיימו: ${done?.n || 0}`,
    `קבלות שנשלחו: ${c('invoice')}`,
    '',
    'מה הבוט עשה בשבילך:',
    `הודעות "בדרך": ${c('eta')}`,
    `תזכורות לעבודות מתואמות: ${c('reminder')}`,
    `מעקבים ללקוחות שלא סגרו: ${c('followup')}`,
    `בקשות ביקורת: ${c('review')}`,
    `בקשות המלצה: ${c('referral')}`,
    `תזכורות שנתיות: ${c('yearly')}`,
    `הודעות קוליות שתומללו: ${c('voice')}`,
    `תזכורות ללקוחות שהפסיקו לענות: ${c('customer_nudge')}`,
    `פניות חלקיות שהועברו אליך: ${c('partial')}`,
    `ספאם שסונן: ${c('spam')}`,
    c('opt_out') ? `ביקשו הסרה: ${c('opt_out')}` : null,
    c('ai_error') ? `\nתקלות בבוט (הלקוחות הועברו אליך): ${c('ai_error')}` : null,
  ].filter((l) => l !== null).join('\n');
  return sendToOwner(env, text, now);
}

export { displayPhone };
