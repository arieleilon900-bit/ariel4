// Messages around a confirmed stay, the last-minute nudge to David, and offers to
// the opt-in list. All run from the hourly cron; each message goes at most once.

import { confirmedWhere, markSent, subscribers, activeBookingsFor, blocksFor } from './store.js';
import { sendTemplate, sendNotify } from './whatsapp.js';
import { addDays, israelToday, nightsBetween, isFree } from './logic.js';
import { busyFor } from './ical.js';
import { reportProblem } from './monitor.js';

const first = (name) => String(name || '').split(' ')[0];

function privateLines(apt) {
  const p = apt.privateInfo || {};
  return [
    p.address && `כתובת: ${p.address}`,
    p.parking && `חניה: ${p.parking}`,
    p.door && `כניסה: ${p.door}`,
    p.wifi && `Wi-Fi: ${p.wifi}`,
  ].filter(Boolean).join('\n');
}

// What each stay message says. {{1}} is the name, {{2}} these details.
const MESSAGES = {
  reminder: (b, apt) => ({
    details: `מחכים לך מחר ב${apt.name}. כניסה מ-${apt.checkIn}.\n${privateLines(apt)}`,
    text: (n, d) => `היי ${n} 🙂 ${d}\nאם משהו לא ברור, פשוט תכתוב כאן.`,
  }),
  welcome: (b, apt) => ({
    details: `ברוכים הבאים ל${apt.name}!${apt.nearby ? ` המלצות באזור: ${apt.nearby}` : ''}`,
    text: (n, d) => `${n}, ${d}\nצריך משהו? כותבים כאן ועונים מיד.`,
  }),
  checkout: (b, apt) => ({
    details: `תזכורת: היציאה היום עד ${apt.checkOut}. ${apt.checkoutNotes || 'משאירים את המפתח במקום ומוציאים את הזבל. תודה!'}`,
    text: (n, d) => `בוקר טוב ${n} ☀️ ${d}`,
  }),
  review: (b, apt, B) => {
    const link = B.reviewLinks?.google || B.reviewLinks?.airbnb || B.reviewLinks?.booking || '';
    return link && {
      details: `תודה שהתארחתם ב${apt.name}! נשמח מאוד לביקורת קצרה: ${link}`,
      text: (n, d) => `${n}, ${d} 🙏`,
    };
  },
  comeback: (b, apt, B) => ({
    details: `התגעגענו! ${B.stay.comebackOffer ? `מחכה לך ${B.stay.comebackOffer} ב${apt.name}.` : ''} רוצה שנבדוק תאריכים?`,
    text: (n, d) => `היי ${n} 🙂 ${d}`,
  }),
};

async function sendStay(ctx, kind, b) {
  const apt = ctx.apartments.find(a => a.id === b.aptId);
  if (!apt) return;
  const msg = MESSAGES[kind](b, apt, ctx.business);
  if (!msg) return;
  if (!(await markSent(ctx.env, b.id, kind))) return; // already sent
  const name = first(b.name);
  try {
    await sendTemplate(ctx.env, b.phone, ctx.templates?.[kind], [name, msg.details], msg.text(name, msg.details));
  } catch (e) {
    await reportProblem(ctx, `הודעת ${kind} לא נשלחה`, `${b.id} (${b.name}): ${e.message}. אם אין תבנית מאושרת ב-Meta, הודעה רגילה נחסמת אחרי 24 שעות.`, { guest: b.phone });
  }
}

export async function stayMessages(ctx, hour, now = Date.now()) {
  const S = ctx.business.stay || {};
  const today = israelToday(now);
  if (hour === S.reminderHour) for (const b of await confirmedWhere(ctx.env, 'checkin', addDays(today, 1))) await sendStay(ctx, 'reminder', b);
  if (hour === S.welcomeHour) for (const b of await confirmedWhere(ctx.env, 'checkin', today)) await sendStay(ctx, 'welcome', b);
  if (hour === S.checkoutHour) for (const b of await confirmedWhere(ctx.env, 'checkout', today)) await sendStay(ctx, 'checkout', b);
  if (hour === S.reviewHour) for (const b of await confirmedWhere(ctx.env, 'checkout', today)) await sendStay(ctx, 'review', b);
  if (hour === 11 && S.comebackDays) {
    const subs = new Set((await subscribers(ctx.env)).map(s => s.phone));
    for (const b of await confirmedWhere(ctx.env, 'checkout', addDays(today, -S.comebackDays))) {
      if (subs.has(b.phone)) await sendStay(ctx, 'comeback', b);
    }
  }
}

// Free nights in the next N days, per apartment (for David's "send an offer?" nudge).
export async function freeNights(ctx, days, now = Date.now()) {
  const today = israelToday(now);
  const out = [];
  for (const apt of ctx.apartments) {
    const own = [...await activeBookingsFor(ctx.env, apt.id), ...(await blocksFor(ctx.env, apt.id)).map(x => ({ checkin: x.start, checkout: x.end }))];
    const busy = await busyFor(apt, ctx.env, own, (k, d) => reportProblem(ctx, k, d));
    const free = nightsBetween(today, addDays(today, days)).filter(d => isFree(busy, d, addDays(d, 1)));
    if (free.length) out.push({ apt, free });
  }
  return out;
}

function compressDays(days) {
  // 2027-03-01, 02, 03, 07 → "01.03-03.03, 07.03"
  const fmt = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const runs = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d; else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? fmt(a) : `${fmt(a)}-${fmt(b)}`)).join(', ');
}

export async function lastMinuteNudge(ctx, now = Date.now()) {
  const list = await freeNights(ctx, ctx.business.lastMinuteDays || 7, now);
  if (!list.length) return;
  const subs = (await subscribers(ctx.env)).length;
  await sendNotify(ctx.env, ctx.business.ownerPhone,
    `📅 *לילות פנויים בשבוע הקרוב*\n${list.map(x => `• ${x.apt.name}: ${compressDays(x.free)}`).join('\n')}\n\n` +
    `רוצה לשלוח מבצע ל-${subs} אנשים ברשימת התפוצה? כתוב למשל:\nמבצע: לילה שני בחצי מחיר בדירה 2, עד יום חמישי`);
}

export async function broadcastOffer(ctx, offerText) {
  const list = await subscribers(ctx.env);
  let sent = 0, failed = 0;
  for (const s of list) {
    try {
      await sendTemplate(ctx.env, s.phone, ctx.templates?.offer, [first(s.name) || 'היי', offerText],
        `היי ${first(s.name)} 🙂 ${offerText}\n(להסרה מהרשימה כתבו "הסר")`);
      sent++;
    } catch (e) {
      failed++;
      if (failed === 1) await reportProblem(ctx, 'מבצע לא נשלח', e.message);
    }
  }
  return { sent, failed };
}
