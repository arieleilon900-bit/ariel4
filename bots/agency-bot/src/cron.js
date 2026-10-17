// משימות מתוזמנות: כל 15 דקות (תזכורות, מעקבים, ביקורות, קבלות), וכל יום ראשון (דוח שבועי).
import { BUSINESS, FEATURES, MESSAGES, TEMPLATES, TIMING, msg as tmsg } from './config.js';
import { ilParts, ilTime, nowIso, whenLabel, displayPhone, wazeLink } from './util.js';
import { customerLang, flushDueSummaries, logEvent, sendToCustomer, sendToOwner } from './handler.js';
import { fetchNewDocuments } from './yesh.js';
import { deliverReceipt } from './receipts.js';
import { customerHours, restNow } from './hours.js';
import { runNudges } from './nudges.js';
import { upsertLead } from './sheets.js';
import { tableLink } from './table.js';
import { setWindowAlwaysOpen } from './util.js';
import { isUltra } from './whatsapp.js';
import { ownerByEmail, retryOwnerEmails } from './email.js';

// לקוח שכתב "הסר" לא מקבל הודעות יזומות
async function optedOut(env, phone) {
  return !!(await env.DB.prepare('SELECT opted_out FROM customers WHERE phone = ?').bind(phone).first())?.opted_out;
}

// הודעות מתוזמנות ללקוחות רק בין 08:00 ל-21:00, ולא בשבת
const canMessageNow = customerHours;

export async function runEvery15(env, now = new Date()) {
  setWindowAlwaysOpen(isUltra(env));
  // כל שלב בנפרד: תקלה באחד (למשל רשת) לא עוצרת את השאר
  const step = async (name, fn) => { try { await fn(env, now); } catch (err) { console.error(`cron ${name} failed`, err); } };
  await step('summaries', flushDueSummaries);
  await step('appointments', appointmentReminders);
  await step('agenda', ownerAgenda);
  await step('owner job reminders', ownerJobReminders);
  await step('nudges', runNudges);
  await step('invoices', invoices);
  await step('owner retry', retryOwnerOutbox);
  await step('cleanup', cleanup);
  if (!canMessageNow(now)) return;
  await step('followups', followups);
  await step('reviews', reviews);
  await step('referrals', referrals);
  await step('yearly', yearly);
}

// הודעה לחנן שלא נשלחה (UltraMsg לא מחובר, תקלה ברשת): מנסים שוב כל 15 דקות, עד 12 שעות
async function retryOwnerOutbox(env, now) {
  if (ownerByEmail(env)) return retryOwnerEmails(env, now);
  if (!isUltra(env)) return; // ב-Meta ההודעות מחכות לחנן עד שהוא כותב לבוט
  const pending = (await env.DB.prepare("SELECT * FROM owner_outbox WHERE sent = 0 AND failed = 1 AND created_at >= ? ORDER BY id LIMIT 5").bind(new Date(now.getTime() - 12 * 3600000).toISOString()).all()).results;
  for (const it of pending) {
    const r = await sendToOwner(env, it.text, now, it.about, env.OWNER_PHONE, { retry: true });
    if (r.ok) await env.DB.prepare('UPDATE owner_outbox SET sent = 1 WHERE id = ?').bind(it.id).run();
    else break;
  }
}

// ניקיון: רישומי שליחה ישנים של UltraMsg
async function cleanup(env, now) {
  await env.DB.prepare('DELETE FROM ultra_sent WHERE created_at < ?').bind(new Date(now.getTime() - 3 * 86400000).toISOString()).run();
}

async function appointmentReminders(env, now) {
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'open' AND scheduled_at IS NOT NULL AND reminders_sent < 2").all()).results;
  for (const j of jobs) {
    if (await optedOut(env, j.phone)) continue;
    const at = new Date(j.scheduled_at);
    const hoursLeft = (at.getTime() - now.getTime()) / 3600000;
    if (hoursLeft <= 0) continue;
    // עבודה שנקבעה לאותו יום (פחות מ-12 שעות מראש): אין צורך בתזכורת "יום לפני"
    if (j.reminders_sent === 0 && (new Date(j.scheduled_at).getTime() - new Date(j.created_at).getTime()) < 12 * 3600000) {
      await env.DB.prepare('UPDATE jobs SET reminders_sent = 1 WHERE id = ?').bind(j.id).run();
      j.reminders_sent = 1;
    }
    // "יום לפני" שנופל בשבת או בלילה (למשל עבודה ביום ראשון בבוקר): נשלח מוקדם יותר, בשעה האחרונה שמותר
    const dayBeforeWindow = canMessageNow(new Date(at.getTime() - TIMING.reminderDayBeforeHours * 3600000)) ? TIMING.reminderDayBeforeHours : 40;
    if (j.reminders_sent === 0 && hoursLeft <= dayBeforeWindow && hoursLeft > 3 && canMessageNow(now)) {
      const when = whenLabel(at, now);
      const lang = await customerLang(env, j.phone);
      const p = ilParts(at);
      const r = await sendToCustomer(env, j.phone, tmsg(lang, 'reminderDayBefore', lang === 'he' ? when : `${p.d}/${p.m} ${p.hh}:${p.mm}`, j.address), { name: TEMPLATES.reminderDayBefore, params: [when, j.address || '-'] }, now);
      if (r.ok) { await env.DB.prepare('UPDATE jobs SET reminders_sent = 1 WHERE id = ?').bind(j.id).run(); await logEvent(env, 'reminder', j.phone, now); }
    } else if (hoursLeft <= TIMING.reminderTwoHoursBefore + 0.25) {
      // לא בלילה ולא בשבת. תזכורת לעבודה של הבוקר מותרת כבר מ-07:00, אחרת היא לא הייתה יוצאת אף פעם
      const hh = +ilParts(now).hh;
      if (restNow(now) || hh < 7 || hh >= 21) continue;
      const time = ilTime(at);
      const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'reminderTwoHours', time), { name: TEMPLATES.reminderTwoHours, params: [time] }, now);
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
    // חנן כבר דיבר איתו (ענה מהאפליקציה, כתב "טופל" או פקודה אחרת): לא שולחים "עדיין צריך עזרה?"
    if (c.owner_replied_at) continue;
    const known = await env.DB.prepare('SELECT known FROM customers WHERE phone = ?').bind(c.phone).first();
    if (known?.known) continue;
    if (job || await optedOut(env, c.phone)) continue; // כבר נפתחה עבודה, אין צורך במעקב
    const r = await sendToCustomer(env, c.phone, tmsg(await customerLang(env, c.phone), 'followup'), { name: TEMPLATES.followup }, now);
    if (r.ok) { await logEvent(env, 'followup', c.phone, now); await upsertLead(env, c.phone, { status: 'נשלחה הודעת מעקב' }, now); }
  }
}

async function reviews(env, now) {
  const cutoff = new Date(now.getTime() - TIMING.reviewAfterHours * 3600000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'done' AND review_sent_at IS NULL AND done_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    // לא מבקשים ביקורת פעמיים מאותו לקוח בחצי שנה
    const asked = await env.DB.prepare('SELECT 1 FROM jobs WHERE phone = ? AND id != ? AND review_sent_at >= ?').bind(j.phone, j.id, new Date(now.getTime() - 180 * 86400000).toISOString()).first();
    if (asked || await optedOut(env, j.phone)) {
      await env.DB.prepare('UPDATE jobs SET review_sent_at = ?, referral_sent_at = ? WHERE id = ?').bind(nowIso(now), nowIso(now), j.id).run();
      continue;
    }
    // אין עדיין קישור לביקורות, או שהעבודה נגמרה מזמן (הקישור נוסף מאוחר): מדלגים על הביקורת, וההמלצה ממשיכה כרגיל
    if (!env.REVIEW_LINK || j.done_at < new Date(now.getTime() - 3 * 86400000).toISOString()) {
      await env.DB.prepare('UPDATE jobs SET review_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
      await logEvent(env, 'review_skipped', j.phone, now);
      continue;
    }
    const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'review', env.REVIEW_LINK), { name: TEMPLATES.review, params: [env.REVIEW_LINK] }, now);
    await env.DB.prepare('UPDATE jobs SET review_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
    if (r.ok) { await logEvent(env, 'review', j.phone, now); await upsertLead(env, j.phone, { status: 'עבודה הסתיימה, נשלחה בקשת ביקורת' }, now); }
  }
}

async function referrals(env, now) {
  const cutoff = new Date(now.getTime() - TIMING.referralAfterDays * 86400000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'done' AND review_sent_at IS NOT NULL AND referral_sent_at IS NULL AND review_sent_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    if (await optedOut(env, j.phone)) { await env.DB.prepare('UPDATE jobs SET referral_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run(); continue; }
    const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'referral'), { name: TEMPLATES.referral }, now);
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
    const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'yearly'), { name: TEMPLATES.yearly }, now);
    await env.DB.prepare('UPDATE jobs SET yearly_sent_at = ? WHERE id = ?').bind(nowIso(now), j.id).run();
    if (r.ok) await logEvent(env, 'yearly', j.phone, now);
  }
}

// קבלות מיש חשבונית: כל מסמך חדש נשלח ללקוח, והעבודה מסומנת כגמורה (מה שמפעיל בקשת ביקורת)
async function invoices(env, now) {
  if (!FEATURES.receipts) return;
  let docs = [];
  try {
    docs = await fetchNewDocuments(env, now);
  } catch (err) {
    console.error('yesh poll failed', err);
    await logEvent(env, 'yesh_error', null, now);
    return;
  }
  for (const d of docs) {
    const seen = await env.DB.prepare('SELECT 1 FROM jobs WHERE invoice_doc_id = ?').bind(d.id).first();
    if (seen) continue;
    if (!d.phone || !d.pdfUrl) {
      // אין טלפון נייד במסמך: חנן שולח בעצמו
      if (d.customerName) await sendToOwner(env, `הקבלה ל-${d.customerName} לא נשלחה בוואטסאפ, כי אין בה טלפון. ${ownerByEmail(env) ? 'בפעם הבאה כדאי לרשום בחשבונית את הטלפון של הלקוח, ואז היא תישלח לו לבד.' : 'אפשר להעביר לי את ה-PDF עם הטלפון שלו.'}`, now);
      continue;
    }
    // חנן כבר שלח את הקבלה הזו ידנית (העביר PDF לבוט) בשעות האחרונות: רק מסמנים, לא שולחים שוב
    const manual = await env.DB.prepare('SELECT id FROM jobs WHERE phone = ? AND invoice_doc_id IS NULL AND invoice_sent_at >= ? ORDER BY id DESC LIMIT 1')
      .bind(d.phone, new Date(now.getTime() - 12 * 3600000).toISOString()).first();
    if (manual) { await env.DB.prepare('UPDATE jobs SET invoice_doc_id = ? WHERE id = ?').bind(d.id, manual.id).run(); continue; }
    await deliverReceipt(env, d.phone, d.pdfUrl, { docId: d.id, now });
  }
}

export async function weeklyReport(env, now = new Date()) {
  setWindowAlwaysOpen(isUltra(env));
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
    FEATURES.receipts ? `קבלות שנשלחו: ${c('invoice')}` : null,
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
    env.SHEET_ID ? `\nכל הלקוחות בטבלה: https://docs.google.com/spreadsheets/d/${env.SHEET_ID}` : (await tableLink(env)) ? `\nכל הלקוחות בטבלה: ${await tableLink(env)}` : null,
  ].filter((l) => l !== null).join('\n');
  return sendToOwner(env, text, now);
}

export { displayPhone };
