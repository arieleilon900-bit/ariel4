// What David can text the bot, the scheduled messages (morning list, weekly
// summary, follow-ups to guests who went quiet), and our internal report.

import {
  getBooking, setBookingStatus, bookingsOnDay, pendingBookings,
  getReferral, closeReferralRow, referralsBetween, getStats, bump,
  followUpCandidates, saveConv, usageBetween, errorsBetween, cleanup,
  addBlock, removeBlock, blocksFor,
} from './store.js';
import { stayMessages, lastMinuteNudge, broadcastOffer, freeNights } from './journey.js';
import { sendText, sendNotify } from './whatsapp.js';
import { israelToday, weekStart, parseDate, nightsBetween } from './logic.js';
import { reportProblem } from './monitor.js';

const HELP = `פקודות:
אושר B123 : אישור הזמנה (הלקוח מקבל אישור ופרטי הגעה)
בוטל B123 : דחיית בקשה (הלקוח מקבל הודעה)
נסגר R123 500 : ליד שהעברת נסגר, עם העמלה בש"ח
לא נסגר R123 : ליד שלא נסגר
היום : מי נכנס ויוצא היום
פנוי : לילות פנויים בשבועיים הקרובים
חסום 2 2027-03-01 2027-03-04 משפחה : חוסם תאריכים בדירה 2 (תאריך יציאה לא נחסם)
חסימות : רשימת החסימות
שחרר 5 : מבטל חסימה מספר 5
מבצע: הטקסט : שולח מבצע לכל מי שברשימת התפוצה
סיכום : הסיכום השבועי עכשיו`;

const nis = (n) => '₪' + Math.round(Number(n || 0)).toLocaleString('en-US');

export async function handleOwner(ctx, text) {
  const t = text.trim();
  let m;
  if ((m = t.match(/^אושר\s+(B\w+)/i))) return confirmBooking(ctx, m[1].toUpperCase());
  if ((m = t.match(/^בוטל\s+(B\w+)/i))) return cancelBooking(ctx, m[1].toUpperCase());
  if ((m = t.match(/^לא נסגר\s+(R\w+)/i))) return closeReferral(ctx, m[1].toUpperCase(), false);
  if ((m = t.match(/^נסגר\s+(R\w+)\s*₪?\s*([\d,]+)?/i))) return closeReferral(ctx, m[1].toUpperCase(), true, m[2]);
  if ((m = t.match(/^חסום\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/))) return block(ctx, m[1], m[2], m[3], m[4]);
  if ((m = t.match(/^שחרר\s+(\d+)/))) return sendText(ctx.env, ctx.phone, (await removeBlock(ctx.env, m[1])) ? `החסימה ${m[1]} בוטלה.` : `לא מצאתי חסימה ${m[1]}.`);
  if (/^חסימות/.test(t)) return listBlocks(ctx);
  if (/^פנוי/.test(t)) return sendText(ctx.env, ctx.phone, await freeText(ctx));
  if ((m = t.match(/^מבצע\s*:\s*([\s\S]+)/))) {
    const r = await broadcastOffer(ctx, m[1].trim());
    return sendText(ctx.env, ctx.phone, `המבצע נשלח ל-${r.sent} אנשים${r.failed ? `, ${r.failed} נכשלו` : ''}.`);
  }
  if (/^היום/.test(t)) return sendText(ctx.env, ctx.phone, await dailyText(ctx));
  if (/^סיכום/.test(t)) return sendText(ctx.env, ctx.phone, await weeklyText(ctx));
  return sendText(ctx.env, ctx.phone, HELP);
}

// "2", "דירה2", "apt2" or the apartment's name all work.
function findApt(ctx, key) {
  const k = String(key).replace(/^דירה/, '').trim();
  return ctx.apartments.find(a => a.id === key || a.id === 'apt' + k || a.name.startsWith(key)) || ctx.apartments[Number(k) - 1];
}

async function block(ctx, key, start, end, note) {
  const apt = findApt(ctx, key);
  if (!apt) return sendText(ctx.env, ctx.phone, `לא מצאתי דירה "${key}". דירות: ${ctx.apartments.map((a, i) => `${i + 1} (${a.name})`).join(', ')}`);
  if (!nightsBetween(start, end).length) return sendText(ctx.env, ctx.phone, 'תאריך היציאה צריך להיות אחרי תאריך הכניסה.');
  const id = await addBlock(ctx.env, apt.id, start, end, note);
  return sendText(ctx.env, ctx.phone, `חסמתי את ${apt.name} מ-${start} עד ${end} (חסימה ${id}). לביטול: שחרר ${id}`);
}

async function listBlocks(ctx) {
  const lines = [];
  for (const apt of ctx.apartments) for (const b of await blocksFor(ctx.env, apt.id)) lines.push(`${b.id}. ${apt.name}: ${b.start} עד ${b.end}${b.note ? ` (${b.note})` : ''}`);
  return sendText(ctx.env, ctx.phone, lines.length ? lines.join('\n') : 'אין חסימות.');
}

async function freeText(ctx) {
  const list = await freeNights(ctx, 14);
  if (!list.length) return 'הכל תפוס בשבועיים הקרובים 🎉';
  return list.map(x => `*${x.apt.name}*: ${x.free.map(d => d.slice(8, 10) + '.' + d.slice(5, 7)).join(', ')}`).join('\n');
}

async function confirmBooking(ctx, id) {
  const b = await getBooking(ctx.env, id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  if (b.status === 'confirmed') return sendText(ctx.env, ctx.phone, `${id} כבר מאושרת.`);
  await setBookingStatus(ctx.env, id, 'confirmed');
  await bump(ctx.env, 'bookingsConfirmed');
  await bump(ctx.env, 'revenue', b.total);
  const apt = ctx.apartments.find(a => a.id === b.aptId) || {};
  const p = apt.privateInfo || {};
  const info = [p.address && `כתובת: ${p.address}`, p.parking && `חניה: ${p.parking}`].filter(Boolean).join('\n');
  // The guest wrote recently, so this is normally inside the 24-hour window.
  await sendNotify(ctx.env, b.phone,
    `${b.name}, ההזמנה שלך אושרה ✅\n${b.aptName}\n${b.checkin} עד ${b.checkout}\nכניסה מ-${apt.checkIn || ''}, יציאה עד ${apt.checkOut || ''}\nסה"כ: ${nis(b.total)}${info ? `\n${info}` : ''}\nקוד כניסה ו-Wi-Fi יישלחו יום לפני ההגעה. מחכים לכם!`);
  return sendText(ctx.env, ctx.phone, `אושר ✅ ${b.id}, הלקוח קיבל אישור.`);
}

async function cancelBooking(ctx, id) {
  const b = await getBooking(ctx.env, id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  await setBookingStatus(ctx.env, id, 'cancelled');
  await sendNotify(ctx.env, b.phone, `${b.name}, מצטערים, התאריכים האלה כבר לא פנויים ב${b.aptName}. אפשר לבדוק לך תאריכים אחרים או דירה אחרת?`);
  return sendText(ctx.env, ctx.phone, `בוטל ${b.id}, הלקוח קיבל הודעה.`);
}

async function closeReferral(ctx, id, closed, amount) {
  const r = await getReferral(ctx.env, id);
  if (!r) return sendText(ctx.env, ctx.phone, `לא מצאתי ליד ${id}`);
  const commission = closed ? Number(String(amount || '0').replace(/,/g, '')) : 0;
  await closeReferralRow(ctx.env, id, closed ? 'closed' : 'lost', commission);
  return sendText(ctx.env, ctx.phone, closed ? `רשמתי: ${id} נסגר, עמלה ${nis(commission)} 💰` : `רשמתי: ${id} לא נסגר.`);
}

export async function dailyText(ctx, day = israelToday()) {
  const today = await bookingsOnDay(ctx.env, day);
  const ins = today.filter(b => b.checkin === day);
  const outs = today.filter(b => b.checkout === day);
  const pending = await pendingBookings(ctx.env);
  const line = (b) => `• ${b.aptName}: ${b.name} (+${b.phone})${b.arrival && b.checkin === day ? `, הגעה ${b.arrival}` : ''}`;
  return `☀️ בוקר טוב! ${day}\n\n*נכנסים היום:*\n${ins.map(line).join('\n') || 'אין'}\n\n*יוצאים היום:*\n${outs.map(line).join('\n') || 'אין'}` +
    (pending.length ? `\n\n*ממתינים לאישור שלך:*\n${pending.map(b => `• ${b.id} ${b.aptName} ${b.checkin}, ${b.name}`).join('\n')}` : '');
}

function weekRange(week) {
  const from = parseDate(week) - 3 * 3600e3; // Israel is UTC+2/3: start a bit early
  return [from, from + 7 * 86400e3];
}

// For David. Referrals are counted by the week they were sent.
export async function weeklyText(ctx, week = weekStart(Date.now() - 86400e3)) {
  const s = await getStats(ctx.env, week);
  const refs = await referralsBetween(ctx.env, ...weekRange(week));
  const open = refs.filter(r => r.status === 'sent');
  return `📊 *סיכום שבועי* (מ-${week})\n\n` +
    `פניות חדשות: ${s.inquiries || 0}\n` +
    `בקשות הזמנה: ${s.bookingRequests || 0}\n` +
    `הזמנות שאושרו: ${s.bookingsConfirmed || 0}\n` +
    `הכנסה מהזמנות שאושרו: ${nis(s.revenue)}\n\n` +
    `🔁 *לידים להעברה:* ${refs.length}` +
    (ctx.business.referral?.trackCommission
      ? `\nנסגרו: ${refs.filter(r => r.status === 'closed').length}\nעמלות: ${nis(refs.reduce((x, r) => x + (r.commission || 0), 0))}` +
        (open.length ? `\nעוד לא סימנת: ${open.map(r => r.id).join(', ')}` : '')
      : '') +
    (s.urgent ? `\n\n🚨 פניות דחופות: ${s.urgent}` : '');
}

// For us only: what the bot cost and what broke.
export async function internalText(ctx, week = weekStart(Date.now() - 86400e3)) {
  const [from, to] = weekRange(week);
  const u = await usageBetween(ctx.env, from, to);
  const errs = await errorsBetween(ctx.env, from, to);
  const s = await getStats(ctx.env, week);
  const usd = u.micros / 1e6;
  const rate = ctx.agency.usdToIls || 3.7;
  const perGuest = u.guests ? usd / u.guests : 0;
  return `🛠 *דוח פנימי: הבוט של ${ctx.agency.clientName}* (מ-${week})\n\n` +
    `עלות Claude השבוע: $${usd.toFixed(2)} (בערך ${nis(usd * rate)})\n` +
    `צפי לחודש: בערך ${nis(usd * rate * 4.3)}\n` +
    `קריאות למודל: ${u.calls}, לקוחות: ${u.guests}, עלות ממוצעת ללקוח: ${(perGuest * 100).toFixed(2)} סנט\n` +
    `טוקנים: ${u.input.toLocaleString('en-US')} קלט, ${u.output.toLocaleString('en-US')} פלט, ${u.cache_read.toLocaleString('en-US')} מהזיכרון השמור\n` +
    `פניות: ${s.inquiries || 0}\n\n` +
    `*תקלות:* ${errs.length ? '\n' + errs.map(e => `• ${e.kind}: ${e.n}`).join('\n') : 'אין 👌'}`;
}

function reportRecipients(ctx) {
  return [...new Set([ctx.agency.techPhone, ...(ctx.agency.reportPhones || [])].filter(Boolean))];
}

// Hourly cron. Israel time decides what goes out. Each part is isolated so one
// failure doesn't stop the rest.
export async function scheduled(ctx, now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  const dow = new Date(parseDate(israelToday(now))).getUTCDay();
  const B = ctx.business;
  const job = async (name, fn) => { try { await fn(); } catch (e) { await reportProblem(ctx, 'משימה מתוזמנת נכשלה: ' + name, e.stack || e.message); } };

  if (hour === 7) {
    await job('הודעת בוקר', async () => {
      const text = await dailyText(ctx);
      await sendNotify(ctx.env, B.ownerPhone, text);
      if (B.cleanerPhone) await sendNotify(ctx.env, B.cleanerPhone, text.split('\n\n*ממתינים')[0]);
    });
  }
  if (hour === 9 && dow === 0) {
    await job('סיכום שבועי', async () => sendNotify(ctx.env, B.ownerPhone, await weeklyText(ctx)));
    await job('דוח פנימי', async () => {
      const text = await internalText(ctx);
      for (const to of reportRecipients(ctx)) await sendNotify(ctx.env, to, text);
    });
  }
  await job('הודעות לאורחים', () => stayMessages(ctx, hour, now));
  if (hour === 10 && (dow === 0 || dow === 3)) await job('לילות פנויים', () => lastMinuteNudge(ctx, now));
  if (hour === 23) await job('בדיקת תקציב', () => budgetCheck(ctx, now));
  if (hour === 3) await job('ניקוי', () => cleanup(ctx.env, now));
  await job('הודעות מעקב', () => followUps(ctx, now));
}

async function budgetCheck(ctx, now) {
  const day = israelToday(now);
  const from = parseDate(day) - 3 * 3600e3;
  const u = await usageBetween(ctx.env, from, from + 86400e3);
  const usd = u.micros / 1e6;
  if (usd > (ctx.agency.dailyBudgetUsd || 2)) {
    await reportProblem(ctx, 'חריגה מתקציב יומי', `היום הבוט עלה $${usd.toFixed(2)} (התקרה $${ctx.agency.dailyBudgetUsd}). ${u.calls} קריאות, ${u.guests} לקוחות. כדאי לבדוק אם יש לקוח שמציף את הבוט.`);
  }
}

// A guest who got a price and went quiet hears from us after 3 hours and again
// after 22 hours, still inside WhatsApp's 24-hour window.
const FOLLOWUPS = [
  { n: 0, min: 3, max: 20,
    he: 'היי 🙂 רק רציתי לבדוק אם יש עוד שאלות על הדירה. התאריכים עדיין פנויים, אשמח לשמור לך אותם.',
    en: "Hi 🙂 just checking if you have any other questions. The dates are still available and I'd be happy to hold them for you." },
  { n: 1, min: 22, max: 23.5,
    he: 'עדכון קטן: יש עוד פניות על התאריכים האלה. אם מתאים לך, תכתוב לי ואסגור לך עכשיו.',
    en: "Quick update: there is more interest in these dates. If it works for you, just reply and I'll book it now." },
];

async function followUps(ctx, now) {
  for (const f of FOLLOWUPS) {
    const convs = await followUpCandidates(ctx.env, now, f.min * 3600e3, f.max * 3600e3, f.n);
    for (const c of convs) {
      const lastUser = [...c.messages].reverse().find(m => m.role === 'user')?.text || '';
      const text = /[֐-׿]/.test(lastUser) ? f.he : f.en;
      await sendText(ctx.env, c.phone, text);
      c.followups = f.n + 1;
      c.messages.push({ role: 'assistant', text });
      await saveConv(ctx.env, c);
    }
  }
}
