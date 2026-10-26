// משימות מתוזמנות: כל 15 דקות (תזכורות, מעקבים, ביקורות, קבלות), וכל יום ראשון (דוח שבועי).
import { BUSINESS, FEATURES, MESSAGES, TEMPLATES, TIMING, msg as tmsg } from './config.js';
import { ilParts, ilTime, nowIso, whenLabel, displayPhone, wazeLink } from './util.js';
import { customerLang, flushDueSummaries, logEvent, sendToCustomer, sendToOwner } from './handler.js';
import { dealTypes, fetchNewDocuments } from './yesh.js';
import { deliverQuote, deliverReceipt } from './receipts.js';
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

// הודעות מתוזמנות ללקוחות רק בין 07:00 ל-21:00, ולא בשבת
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
  await step('weekly', weeklyAt);
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
    // תזכורות לפי שעות לפני העבודה (חנן: שעתיים לפני ושעה לפני). תזכורת שהזמן שלה כבר עבר כשנקבעה העבודה: מדלגים
    const hrs = TIMING.customerReminderHours;
    if (hrs?.length) {
      let k = j.reminders_sent;
      if (k >= hrs.length || hoursLeft > hrs[k] + 0.25) continue;
      while (k + 1 < hrs.length && hoursLeft <= hrs[k + 1] + 0.25) k++;
      const hh = +ilParts(now).hh;
      if (restNow(now) || hh < 7 || hh >= 21) continue;
      const time = ilTime(at);
      const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'reminderTwoHours', time), { name: TEMPLATES.reminderTwoHours, params: [time] }, now);
      if (r.ok) { await env.DB.prepare('UPDATE jobs SET reminders_sent = ? WHERE id = ?').bind(k + 1, j.id).run(); await logEvent(env, 'reminder', j.phone, now); }
      continue;
    }
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

// רץ כל דקה (וגם ברבע שעה): כל עבודה "תופסת" את הבקשה שלה לפני השליחה, כדי שלא תישלח פעמיים
export async function sendDueReviews(env, now = new Date()) {
  if (!canMessageNow(now)) return;
  await reviews(env, now);
}

async function reviews(env, now) {
  const mins = TIMING.reviewAfterMinutes ?? (TIMING.reviewAfterHours ?? 3) * 60;
  const cutoff = new Date(now.getTime() - mins * 60000).toISOString();
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
    const claimed = await env.DB.prepare('UPDATE jobs SET review_sent_at = ? WHERE id = ? AND review_sent_at IS NULL').bind(nowIso(now), j.id).run();
    if (!claimed.meta?.changes) continue;
    const r = await sendToCustomer(env, j.phone, tmsg(await customerLang(env, j.phone), 'review', env.REVIEW_LINK), { name: TEMPLATES.review, params: [env.REVIEW_LINK] }, now);
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
  if (!TIMING.yearlyAfterDays) return;
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

// סוגי המסמכים ביש חשבונית שנשלחים ללקוח
const DOC_LABELS = { 6: 'קבלה', 8: 'חשבונית מס', 9: 'חשבונית מס קבלה' };
const docLabel = (env, type) => DOC_LABELS[type] || (dealTypes(env).includes(type) ? 'חשבונית עסקה' : undefined);

// מסמכים מיש חשבונית (קבלה, חשבונית מס, חשבונית מס קבלה): כל מסמך חדש נשלח ללקוח.
// המסמך הראשון של עבודה סוגר אותה (ומפעיל בקשת ביקורת). קבלה שמגיעה אחר כך על אותה עבודה
// (חשבונית מס היום, קבלה כשהלקוח משלם, גם אחרי חודש) רק נשלחת ללקוח, בלי עוד ביקורת ובלי לספור עבודה נוספת
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
  // לקוחות שקיבלו מסמך לאחרונה (24 שעות), לפי שם: יש חשבונית מחזירים לפעמים את אותה עבודה גם כמסמך נוסף בלי טלפון,
  // ואז לא מטרידים את חנן ב"לא נשלח" על משהו שכבר הגיע ללקוח
  const sentKey = 'yesh_sent_names';
  const dayAgo = now.getTime() - 24 * 3600000;
  let sentNames = {};
  try { sentNames = JSON.parse((await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(sentKey).first())?.value || '{}'); } catch { sentNames = {}; }
  for (const k of Object.keys(sentNames)) if (sentNames[k] < dayAgo) delete sentNames[k];
  const nameKey = (n) => String(n || '').replace(/\s+/g, ' ').trim();

  // קודם המסמכים שאפשר לשלוח, ואחר כך מה שחסר בו טלפון
  const fresh = [];
  for (const d of docs) {
    if (!(await env.DB.prepare('SELECT 1 FROM jobs WHERE invoice_doc_id = ?').bind(d.id).first())) fresh.push(d);
    // מסמך שכבר נשלח בעבר: גם הוא נחשב "הלקוח כבר קיבל"
    else if (nameKey(d.customerName)) sentNames[nameKey(d.customerName)] = sentNames[nameKey(d.customerName)] || now.getTime();
  }
  // מסמכים בלי טלפון שכבר הודענו עליהם: יש חשבונית מחזירים את מסמכי היום שוב ושוב, אז מודיעים על כל מסמך רק פעם אחת
  const notifiedKey = 'yesh_notified_docs';
  let notified = {};
  try { notified = JSON.parse((await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(notifiedKey).first())?.value || '{}'); } catch { notified = {}; }
  const monthAgo = now.getTime() - 30 * 86400000;
  for (const k of Object.keys(notified)) if (notified[k] < monthAgo) delete notified[k];
  // הצעות מחיר: נשלחות ללקוח פעם אחת (בלי לסגור עבודה ובלי ביקורת)
  const quotesKey = 'yesh_quotes_sent';
  let quotesSent = {};
  try { quotesSent = JSON.parse((await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(quotesKey).first())?.value || '{}'); } catch { quotesSent = {}; }
  for (const k of Object.keys(quotesSent)) if (quotesSent[k] < monthAgo) delete quotesSent[k];
  for (const d of fresh.filter((x) => x.quote && x.phone && x.pdfUrl && !quotesSent[x.id])) {
    const r = await deliverQuote(env, d.phone, d.pdfUrl, { now });
    if (r?.ok) {
      quotesSent[d.id] = now.getTime();
      await sendToOwner(env, `✓ הצעת המחיר נשלחה בהצלחה ל${d.customerName ? `${d.customerName} ` : ''}(${displayPhone(d.phone)}) בוואטסאפ.`, now);
    } else if (!notified[d.id]) {
      notified[d.id] = now.getTime();
      await sendToOwner(env, `לא הצלחתי לשלוח את הצעת המחיר ל-${displayPhone(d.phone)} בוואטסאפ. כדאי לשלוח לו בעצמך.`, now);
    }
  }
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(quotesKey, JSON.stringify(quotesSent)).run();
  for (const d of fresh.filter((x) => !x.quote && x.phone && x.pdfUrl)) {
    // חנן כבר שלח את הקבלה הזו ידנית (העביר PDF לבוט) בשעות האחרונות: רק מסמנים, לא שולחים שוב
    const manual = await env.DB.prepare('SELECT id FROM jobs WHERE phone = ? AND invoice_doc_id IS NULL AND invoice_sent_at >= ? ORDER BY id DESC LIMIT 1')
      .bind(d.phone, new Date(now.getTime() - 12 * 3600000).toISOString()).first();
    if (manual) { await env.DB.prepare('UPDATE jobs SET invoice_doc_id = ? WHERE id = ?').bind(d.id, manual.id).run(); continue; }
    const label = docLabel(env, d.type) || 'מסמך';
    const r = await deliverReceipt(env, d.phone, d.pdfUrl, { docId: d.id, label: docLabel(env, d.type), filename: `${label}.pdf`, now });
    if (r?.ok) {
      if (nameKey(d.customerName)) sentNames[nameKey(d.customerName)] = now.getTime();
      await sendToOwner(env, `✓ ה${label} נשלחה בהצלחה ל${d.customerName ? `${d.customerName} ` : ''}(${displayPhone(d.phone)}) בוואטסאפ.`, now);
    } else {
      await sendToOwner(env, `לא הצלחתי לשלוח את ה${label} ל-${displayPhone(d.phone)} בוואטסאפ. כדאי לשלוח לו בעצמך.`, now);
    }
  }
  for (const d of fresh.filter((x) => !x.phone || !x.pdfUrl)) {
    if (notified[d.id]) continue;
    notified[d.id] = now.getTime();
    if (!d.customerName || sentNames[nameKey(d.customerName)]) continue;
    // אין טלפון נייד במסמך: חנן שולח בעצמו
    await sendToOwner(env, `המסמך ל-${d.customerName} לא נשלח בוואטסאפ, כי אין בו טלפון נייד. ${ownerByEmail(env) ? 'בפעם הבאה כדאי לרשום בפרטי הלקוח בחשבונית את הנייד שלו, ואז הוא יישלח לו לבד.' : 'אפשר להעביר לי את ה-PDF עם הטלפון שלו.'}`, now);
  }
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(sentKey, JSON.stringify(sentNames)).run();
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(notifiedKey, JSON.stringify(notified)).run();
}

// דוח שבועי ביום ובשעה שבעל העסק בחר (TIMING.weeklyReportAt). פעם אחת בשבוע
async function weeklyAt(env, now) {
  const at = TIMING.weeklyReportAt;
  if (!at) return;
  const p = ilParts(now);
  if (p.dow !== at.dow || +p.hh !== at.hour) return;
  const day = `${p.y}-${p.m}-${p.d}`;
  const last = (await env.DB.prepare("SELECT value FROM settings WHERE key = 'weekly_sent'").first())?.value;
  if (last === day) return;
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('weekly_sent', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(day).run();
  await weeklyReport(env, now);
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
