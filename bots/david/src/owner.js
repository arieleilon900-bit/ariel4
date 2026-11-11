// What David can text the bot, and the scheduled messages (morning list,
// weekly summary, follow-ups to guests who asked and went quiet).

import { getRecord, putRecord, listRecords, getStats, bump, saveConv } from './store.js';
import { sendText, sendNotify } from './whatsapp.js';
import { israelToday, addDays, weekStart, parseDate } from './logic.js';

const HELP = `פקודות:
אושר B123 : אישור הזמנה (הלקוח מקבל אישור ופרטי הגעה)
בוטל B123 : דחיית בקשה (הלקוח מקבל הודעה)
נסגר R123 500 : ליד שהעברת נסגר, עם העמלה בש"ח
לא נסגר R123 : ליד שלא נסגר
היום : מי נכנס ויוצא היום
סיכום : הסיכום השבועי עכשיו`;

const nis = (n) => '₪' + Number(n || 0).toLocaleString('en-US');

export async function handleOwner(ctx, text) {
  const t = text.trim();
  let m;
  if ((m = t.match(/^אושר\s+(B\w+)/i))) return confirmBooking(ctx, m[1]);
  if ((m = t.match(/^בוטל\s+(B\w+)/i))) return cancelBooking(ctx, m[1]);
  if ((m = t.match(/^לא נסגר\s+(R\w+)/i))) return closeReferral(ctx, m[1], false);
  if ((m = t.match(/^נסגר\s+(R\w+)\s*₪?\s*([\d,]+)?/i))) return closeReferral(ctx, m[1], true, m[2]);
  if (/^היום/.test(t)) return sendText(ctx.env, ctx.phone, await dailyText(ctx));
  if (/^סיכום/.test(t)) return sendText(ctx.env, ctx.phone, await weeklyText(ctx));
  return sendText(ctx.env, ctx.phone, HELP);
}

async function confirmBooking(ctx, id) {
  const b = await getRecord(ctx.env, 'booking', id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  b.status = 'confirmed'; b.confirmedAt = Date.now();
  await putRecord(ctx.env, 'booking', b);
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
  const b = await getRecord(ctx.env, 'booking', id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  b.status = 'cancelled';
  await putRecord(ctx.env, 'booking', b);
  await sendNotify(ctx.env, b.phone, `${b.name}, מצטערים, התאריכים האלה כבר לא פנויים ב${b.aptName}. אפשר לבדוק לך תאריכים אחרים או דירה אחרת?`);
  return sendText(ctx.env, ctx.phone, `בוטל ${b.id}, הלקוח קיבל הודעה.`);
}

async function closeReferral(ctx, id, closed, amount) {
  const r = await getRecord(ctx.env, 'referral', id);
  if (!r) return sendText(ctx.env, ctx.phone, `לא מצאתי ליד ${id}`);
  r.status = closed ? 'closed' : 'lost';
  r.commission = closed ? Number(String(amount || '0').replace(/,/g, '')) : 0;
  r.closedAt = Date.now();
  await putRecord(ctx.env, 'referral', r);
  if (closed) {
    await bump(ctx.env, 'referralsClosed', 1, r.createdAt);
    await bump(ctx.env, 'commission', r.commission, r.createdAt);
  }
  return sendText(ctx.env, ctx.phone, closed ? `רשמתי: ${r.id} נסגר, עמלה ${nis(r.commission)} 💰` : `רשמתי: ${r.id} לא נסגר.`);
}

export async function dailyText(ctx, day = israelToday()) {
  const all = await listRecords(ctx.env, 'booking');
  const bookings = all.filter(b => b.status === 'confirmed');
  const ins = bookings.filter(b => b.checkin === day);
  const outs = bookings.filter(b => b.checkout === day);
  const pending = all.filter(b => b.status === 'pending' && Date.now() - b.createdAt < 48 * 3600e3);
  const line = (b) => `• ${b.aptName}: ${b.name} (+${b.phone})${b.arrival && b.checkin === day ? `, הגעה ${b.arrival}` : ''}`;
  return `☀️ בוקר טוב! ${day}\n\n*נכנסים היום:*\n${ins.map(line).join('\n') || 'אין'}\n\n*יוצאים היום:*\n${outs.map(line).join('\n') || 'אין'}` +
    (pending.length ? `\n\n*ממתינים לאישור שלך:*\n${pending.map(b => `• ${b.id} ${b.aptName} ${b.checkin}, ${b.name}`).join('\n')}` : '');
}

export async function weeklyText(ctx, week = weekStart(Date.now() - 86400e3)) {
  const s = await getStats(ctx.env, week);
  const refs = (await listRecords(ctx.env, 'referral')).filter(r => weekStart(r.createdAt) === week);
  const open = refs.filter(r => r.status === 'sent');
  return `📊 *סיכום שבועי* (מ-${week})\n\n` +
    `פניות חדשות: ${s.inquiries || 0}\n` +
    `בקשות הזמנה: ${s.bookingRequests || 0}\n` +
    `הזמנות שאושרו: ${s.bookingsConfirmed || 0}\n` +
    `הכנסה מהזמנות שאושרו: ${nis(s.revenue)}\n\n` +
    `🔁 *תיווך*\nלידים שהועברו: ${refs.length}\nנסגרו: ${refs.filter(r => r.status === 'closed').length}\n` +
    `עמלות: ${nis(refs.reduce((x, r) => x + (r.commission || 0), 0))}` +
    (open.length ? `\nעוד לא סימנת: ${open.map(r => r.id).join(', ')}` : '') +
    (s.urgent ? `\n\n🚨 פניות דחופות: ${s.urgent}` : '');
}

// Hourly cron. Israel time decides what goes out.
export async function scheduled(ctx, now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  const dow = new Date(parseDate(israelToday(now))).getUTCDay();
  const B = ctx.business;

  if (hour === 7) {
    const text = await dailyText(ctx);
    await sendNotify(ctx.env, B.ownerPhone, text);
    if (B.cleanerPhone) await sendNotify(ctx.env, B.cleanerPhone, text.split('\n\n*ממתינים')[0]);
  }
  if (hour === 9 && dow === 0) await sendNotify(ctx.env, B.ownerPhone, await weeklyText(ctx));
  await followUps(ctx, now);
}

// A guest who got a price and went quiet hears from us after 3 hours and again
// after 22 hours, still inside WhatsApp's 24-hour window.
async function followUps(ctx, now) {
  const convs = await listRecords(ctx.env, 'conv');
  for (const c of convs) {
    if (!c.quotedAt || c.bookedAt || c.referredAt || c.optedOut) continue;
    if (!c.lastUserAt) continue;
    const quiet = now - c.lastUserAt;
    const n = c.followups || 0;
    const lastUser = [...c.messages].reverse().find(m => m.role === 'user')?.text || '';
    const hebrew = /[֐-׿]/.test(lastUser);
    let text = null;
    if (n === 0 && quiet > 3 * 3600e3 && quiet < 20 * 3600e3) {
      text = hebrew ? 'היי 🙂 רק רציתי לבדוק אם יש עוד שאלות על הדירה. התאריכים עדיין פנויים, אשמח לשמור לך אותם.'
        : 'Hi 🙂 just checking if you have any other questions. The dates are still available and I\'d be happy to hold them for you.';
    } else if (n === 1 && quiet > 22 * 3600e3 && quiet < 23.5 * 3600e3) {
      text = hebrew ? 'עדכון קטן: יש עוד פניות על התאריכים האלה. אם מתאים לך, תכתוב לי ואסגור לך עכשיו.'
        : 'Quick update: there is more interest in these dates. If it works for you, just reply and I\'ll book it now.';
    }
    if (!text) continue;
    try {
      await sendText(ctx.env, c.phone, text);
      c.followups = n + 1;
      c.messages.push({ role: 'assistant', text });
      await saveConv(ctx.env, c);
    } catch (e) { console.error('follow-up failed', c.phone, e.message); }
  }
}
