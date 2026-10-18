// מי שלא עונה: לקוח שהפסיק לענות באמצע, חנן שלא טיפל בפנייה, ועבודה שעבר זמנה ולא סומנה.
import { BUSINESS, FEATURES, MESSAGES, TIMING, msg as tmsg } from './config.js';
import { upsertLead } from './sheets.js';
import { addHours, displayPhone, inServiceWindow, nowIso } from './util.js';
import { customerHours, ownerHours, restNow } from './hours.js';
import { customerLang, forwardPhotosToOwner, isPaused, logEvent, notifyOwner, ownerSummary, sendToOwner } from './handler.js';
import { ownerByEmail } from './email.js';
import * as wa from './whatsapp.js';

const minutesSince = (iso, now) => (now.getTime() - new Date(iso).getTime()) / 60000;

export async function runNudges(env, now = new Date()) {
  // הבוט בהפסקה ("עצור בוט"): חנן מטפל בהכל בעצמו, אז אין תזכורות ללקוחות ולא אליו
  if (await isPaused(env)) return;
  await customerNudges(env, now);
  await unfinishedUpdates(env, now);
  await ownerNudges(env, now);
  await doneChecks(env, now);
}

// 1. לקוח שהפסיק לענות באמצע השיחה עם הבוט, או שיחה שנתקעה (הבוט לא הספיק לענות)
async function customerNudges(env, now) {
  const convs = (await env.DB.prepare("SELECT * FROM conversations WHERE state = 'bot' AND customer_nudges < 9 AND updated_at >= ?")
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

    // customer_nudges: כמה תזכורות הלקוח כבר קיבל. 9 = סיימנו איתו (הועבר לחנן / נסגר)
    const canNudge = conv.customer_nudges < (TIMING.customerNudges ?? 1) && !cust?.opted_out && customerHours(now) && inServiceWindow(
      (await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(conv.phone).first())?.last_inbound_at, now);
    if (canNudge && age >= TIMING.customerNudgeMinutes) {
      const nudgeText = tmsg(await customerLang(env, conv.phone), 'customerNudge');
      const r = await wa.sendText(env, conv.phone, nudgeText);
      await env.DB.prepare('UPDATE conversations SET customer_nudges = customer_nudges + 1 WHERE id = ?').bind(conv.id).run();
      if (r.ok) {
        await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, nudgeText, nowIso(now)).run();
        await logEvent(env, 'customer_nudge', conv.phone, now);
      }
      continue;
    }
    // גם אחרי התזכורת לא ענה, או שלא היה אפשר להזכיר לו (לילה, שבת, עברו 24 שעות): חנן מקבל את מה שיש
    const giveUp = conv.customer_nudges >= 1 ? age >= TIMING.customerGiveUpHours * 60 : age >= (TIMING.customerGiveUpHours + 3) * 60;
    if (giveUp && ownerHours(now)) await partialHandoff(env, conv, now);
  }
}

async function partialHandoff(env, conv, now, title = 'לקוח התחיל לכתוב ולא סיים. שווה להתקשר אליו') {
  const moved = await env.DB.prepare("UPDATE conversations SET customer_nudges = 9, state = 'handoff', handed_off_at = ?, followup_at = ? WHERE id = ? AND state = 'bot'")
    .bind(nowIso(now), nowIso(addHours(now, TIMING.followupAfterHours)), conv.id).run();
  if (!moved.meta?.changes) return;
  const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(conv.phone).first();
  const lastUser = await env.DB.prepare("SELECT text FROM messages WHERE conv_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1").bind(conv.id).first();
  const summary = ownerSummary(conv, { customer_name: cust?.name || '', urgent: !!conv.urgent, summary_for_owner: lastUser?.text ? `ההודעה האחרונה שלו: ${lastUser.text}` : '' }, conv.phone, now)
    .replace(/^(🔔 פנייה חדשה|🚨 פנייה דחופה!)/, `⚠️ ${title}`);
  await notifyOwner(env, summary, JSON.parse(conv.photos || '[]'), now, conv.phone);
  await logEvent(env, 'partial', conv.phone, now);
  await upsertLead(env, conv.phone, { status: 'פנייה חלקית, הועבר לחנן', note: 'הלקוח הפסיק לענות באמצע' }, now);
}

// 1ב. אחרי ההעברה הלקוח התחיל להוסיף פרטים (הבוט שאל שאלה), ונעלם באמצע: אחרי 30 דקות חנן מקבל את מה שנאסף
async function unfinishedUpdates(env, now) {
  const convs = (await env.DB.prepare("SELECT * FROM conversations WHERE state = 'handoff' AND owner_replied_at IS NULL AND summary_due_at IS NULL AND handed_off_at >= ?")
    .bind(new Date(now.getTime() - 72 * 3600000).toISOString()).all()).results;
  for (const conv of convs) {
    const lastUpd = (await env.DB.prepare("SELECT MAX(id) AS id FROM messages WHERE conv_id = ? AND role = 'owner_update'").bind(conv.id).first())?.id;
    if (!lastUpd) continue;
    const newer = (await env.DB.prepare("SELECT role, text, media_id, created_at FROM messages WHERE conv_id = ? AND role IN ('user','assistant') AND id > ? ORDER BY id").bind(conv.id, lastUpd).all()).results;
    const users = newer.filter((m) => m.role === 'user');
    const lastBot = newer.filter((m) => m.role === 'assistant').at(-1);
    // רק כשהבוט באמצע איסוף (שאל שאלה). "תודה" / "אוקיי" לא מגיעים לחנן
    if (!users.length || !lastBot || !/\?\s*$/.test(lastBot.text || '')) continue;
    if (minutesSince(newer.at(-1).created_at, now) < 30) continue;
    if (!conv.urgent && !ownerHours(now)) continue;
    const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(conv.phone).first();
    const text = [
      `🔄 ${cust?.name || 'הלקוח'} ${displayPhone(conv.phone)} התחיל/ה להוסיף פרטים לפנייה ולא סיים/ה:`,
      ...users.slice(-6).map((m) => `• ${m.text}`),
      `וואטסאפ ללקוח: https://wa.me/${conv.phone}`,
    ].join('\n');
    await notifyOwner(env, text, users.map((m) => m.media_id).filter(Boolean), now, conv.phone);
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'owner_update', '', ?)").bind(conv.id, nowIso(now)).run();
  }
}

// 2. חנן קיבל פנייה ועוד לא טיפל בה
async function ownerNudges(env, now) {
  const convs = (await env.DB.prepare("SELECT * FROM conversations WHERE state = 'handoff' AND owner_replied_at IS NULL AND owner_nudges < 2 AND summary_due_at IS NULL AND handed_off_at >= ?")
    .bind(new Date(now.getTime() - 72 * 3600000).toISOString()).all()).results; // 72 שעות: פנייה מליל שישי מקבלת תזכורת ביום ראשון
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
      first ? 'כדאי לחזור אליו לפני שהוא מתקשר למנעולן אחר.' : 'זו התזכורת האחרונה על הפנייה הזו.',
      `וואטסאפ ללקוח: https://wa.me/${conv.phone}`,
      ownerByEmail(env) ? 'כשטיפלת, לחץ למטה על "בדרך / תור / סיימתי".' : `כשטיפלת (גם בטלפון) כתוב לי: טופל ${displayPhone(conv.phone)}`,
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
    await sendToOwner(env, ownerByEmail(env) ? [
      `מה קרה עם העבודה אצל ${cust?.name || 'הלקוח'} ${ph}?`,
      'לחץ למטה על "בדרך / תור / סיימתי" וסמן: סיימתי, או העבודה בוטלה.',
    ].join('\n') : [
      `מה קרה עם העבודה אצל ${cust?.name || 'הלקוח'} ${ph}?`,
      FEATURES.receipts ? `סיימת: שלח לי את הקבלה (PDF, ובכיתוב ${ph}) או כתוב: סיום ${ph}` : `סיימת: כתוב סיום ${ph} (ואז הלקוח מקבל בקשת ביקורת)`,
      `בוטל: כתוב: ביטול ${ph}`,
    ].join('\n'), now, j.phone);
  }
}
