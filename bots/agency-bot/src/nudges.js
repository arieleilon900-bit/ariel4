// מי שלא עונה: לקוח שהפסיק לענות באמצע, חנן שלא טיפל בפנייה, ועבודה שעבר זמנה ולא סומנה.
import { BUSINESS, FEATURES, MESSAGES, TIMING, msg as tmsg } from './config.js';
import { upsertLead } from './sheets.js';
import { addHours, displayPhone, inServiceWindow, nowIso } from './util.js';
import { customerHours, ownerHours, restNow } from './hours.js';
import { customerLang, forwardPhotosToOwner, logEvent, ownerSummary, sendToOwner } from './handler.js';
import * as wa from './whatsapp.js';

const minutesSince = (iso, now) => (now.getTime() - new Date(iso).getTime()) / 60000;

export async function runNudges(env, now = new Date()) {
  await customerNudges(env, now);
  await ownerNudges(env, now);
  await doneChecks(env, now);
}

// 1. לקוח שהפסיק לענות באמצע השיחה עם הבוט, או שיחה שנתקעה (הבוט לא הספיק לענות)
async function customerNudges(env, now) {
  const convs = (await env.DB.prepare("SELECT * FROM conversations WHERE state = 'bot' AND customer_nudges < 2 AND updated_at >= ?")
    .bind(new Date(now.getTime() - 7 * 86400000).toISOString()).all()).results;
  for (const conv of convs) {
    // חנן כבר מטפל, או שהמספר חסום / מוכר / ביקש הסרה: לא נוגעים
    if (conv.owner_replied_at) continue;
    const cust = await env.DB.prepare('SELECT blocked, known, opted_out FROM customers WHERE phone = ?').bind(conv.phone).first();
    if (cust?.blocked || cust?.known) continue;
    const last = await env.DB.prepare("SELECT role, created_at FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 1").bind(conv.id).first();
    if (!last) continue;
    const age = minutesSince(last.created_at, now);

    // הלקוח כתב אחרון ולא קיבל תשובה כבר 5 דקות: הבוט נתקע (למשל תקלה ב-AI). מעבירים לחנן מיד
    if (last.role === 'user') {
      if (age >= 5) await partialHandoff(env, conv, now, 'הבוט לא הצליח לענות ללקוח. כדאי לחזור אליו ישירות');
      continue;
    }

    const canNudge = conv.customer_nudges === 0 && !cust?.opted_out && customerHours(now) && inServiceWindow(
      (await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(conv.phone).first())?.last_inbound_at, now);
    if (canNudge && age >= TIMING.customerNudgeMinutes) {
      const nudgeText = tmsg(await customerLang(env, conv.phone), 'customerNudge');
      const r = await wa.sendText(env, conv.phone, nudgeText);
      await env.DB.prepare('UPDATE conversations SET customer_nudges = 1 WHERE id = ?').bind(conv.id).run();
      if (r.ok) {
        await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, nudgeText, nowIso(now)).run();
        await logEvent(env, 'customer_nudge', conv.phone, now);
      }
      continue;
    }
    // גם אחרי התזכורת לא ענה, או שלא היה אפשר להזכיר לו (לילה, שבת, עברו 24 שעות): חנן מקבל את מה שיש
    const giveUp = conv.customer_nudges === 1 ? age >= TIMING.customerGiveUpHours * 60 : age >= (TIMING.customerGiveUpHours + 3) * 60;
    if (giveUp && ownerHours(now)) await partialHandoff(env, conv, now);
  }
}

async function partialHandoff(env, conv, now, title = 'לקוח התחיל לכתוב ולא סיים. שווה להתקשר אליו') {
  const moved = await env.DB.prepare("UPDATE conversations SET customer_nudges = 2, state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ? AND state = 'bot'")
    .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
  if (!moved.meta?.changes) return;
  const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(conv.phone).first();
  const lastUser = await env.DB.prepare("SELECT text FROM messages WHERE conv_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").bind(conv.id).first();
  const summary = ownerSummary(conv, { customer_name: cust?.name || '', urgent: !!conv.urgent, summary_for_owner: lastUser?.text ? `ההודעה האחרונה שלו: ${lastUser.text}` : '' }, conv.phone, now)
    .replace(/^(🔔 פנייה חדשה|🚨 פנייה דחופה!)/, `⚠️ ${title}`);
  await sendToOwner(env, summary, now, conv.phone);
  await forwardPhotosToOwner(env, JSON.parse(conv.photos || '[]'), now, conv.phone);
  await logEvent(env, 'partial', conv.phone, now);
  await upsertLead(env, conv.phone, { status: `פנייה חלקית, הועבר ל${BUSINESS.ownerName}`, note: 'הלקוח הפסיק לענות באמצע' }, now);
}

// 2. חנן קיבל פנייה ועוד לא טיפל בה
async function ownerNudges(env, now) {
  const convs = (await env.DB.prepare("SELECT * FROM conversations WHERE state = 'handoff' AND owner_replied_at IS NULL AND owner_nudges < 2 AND handed_off_at >= ?")
    .bind(new Date(now.getTime() - 24 * 3600000).toISOString()).all()).results;
  for (const conv of convs) {
    if (restNow(now) && BUSINESS.shabbat?.enabled) continue; // שומר שבת: לא מזכירים, גם לא דחוף
    if (!conv.urgent && !ownerHours(now)) continue;
    const job = await env.DB.prepare('SELECT 1 FROM jobs WHERE phone = ? AND created_at >= ?').bind(conv.phone, conv.handed_off_at).first();
    if (job) continue;
    const first = conv.owner_nudges === 0;
    const wait = first
      ? (conv.urgent ? 10 : TIMING.ownerNudgeMinutes)
      : (conv.urgent ? 20 : TIMING.ownerNudgeAgainMinutes);
    const since = first ? conv.handed_off_at : conv.owner_nudged_at;
    if (minutesSince(since, now) < wait) continue;

    const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(conv.phone).first();
    const who = `${cust?.name || 'הלקוח'} ${displayPhone(conv.phone)}${conv.issue ? ` (${conv.issue})` : ''}`;
    const text = [
      conv.urgent ? `🚨 פנייה דחופה שעוד לא טופלה: ${who}` : `⏰ עדיין לא חזרת ל-${who}`,
      first ? `כדאי לחזור אליו לפני שהוא פונה ל${BUSINESS.competitor}.` : 'זו התזכורת האחרונה על הפנייה הזו.',
      `לוואטסאפ איתו: https://wa.me/${conv.phone}`,
      `כשטיפלת (גם בטלפון) כתוב לי: טופל ${displayPhone(conv.phone)}`,
    ].join('\n');
    await sendToOwner(env, text, now, conv.phone);
    await env.DB.prepare('UPDATE conversations SET owner_nudges = owner_nudges + 1, owner_nudged_at = ? WHERE id = ?').bind(nowIso(now), conv.id).run();
    await logEvent(env, 'owner_nudge', conv.phone, now);

    // בתזכורת השנייה מרגיעים גם את הלקוח שמחכה
    if (!first && customerHours(now)) {
      const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(conv.phone).first();
      if (inServiceWindow(c?.last_inbound_at, now)) {
        const reassure = tmsg(await customerLang(env, conv.phone), 'customerReassure');
        const r = await wa.sendText(env, conv.phone, reassure);
        if (r.ok) await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, reassure, nowIso(now)).run();
      }
    }
  }
}

// 3. עבודה מתואמת שעבר זמנה ולא סומנה כגמורה (בלי זה לא יוצאות ביקורת, המלצה ותזכורת שנתית)
async function doneChecks(env, now) {
  if (!ownerHours(now)) return;
  const cutoff = new Date(now.getTime() - TIMING.doneCheckHours * 3600000).toISOString();
  const jobs = (await env.DB.prepare("SELECT * FROM jobs WHERE status = 'open' AND done_check_sent = 0 AND scheduled_at IS NOT NULL AND scheduled_at <= ?").bind(cutoff).all()).results;
  for (const j of jobs) {
    await env.DB.prepare('UPDATE jobs SET done_check_sent = 1 WHERE id = ?').bind(j.id).run();
    const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(j.phone).first();
    const ph = displayPhone(j.phone);
    await sendToOwner(env, [
      `מה קרה עם העבודה אצל ${cust?.name || 'הלקוח'} ${ph}?`,
      FEATURES.receipts ? `סיימת: שלח לי את הקבלה (PDF, ובכיתוב ${ph}) או כתוב: סיום ${ph}` : `סיימת: כתוב סיום ${ph} (ואז הלקוח מקבל בקשת ביקורת)`,
      `בוטל: כתוב: ביטול ${ph}`,
    ].join('\n'), now, j.phone);
  }
}
