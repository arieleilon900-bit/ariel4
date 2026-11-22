// What David can text the bot, the scheduled messages (morning list, weekly
// summary, follow-ups to guests who went quiet), and our internal report.

import {
  getBooking, setBookingStatus, setBookingTotal, bookingsOnDay, pendingBookings,
  getReferral, closeReferralRow, referralsBetween, getStats, bump,
  followUpCandidates, saveConv, usageBetween, errorsBetween, cleanup,
  addBlock, removeBlock, blocksFor, addContacts, removeContact, contactCount, expiredPendingWithEvents,
} from './store.js';
import { flushQueuedMissedCalls } from './missedcall.js';
import { refreshInstagramToken } from './instagram.js';
import { syncBookingEvent, removeBookingEvent, syncBlockEvent, removeBlockEvent, calendarConfig, checkCalendars } from './gcal.js';
import { stayMessages, lastMinuteNudge, broadcastOffer, freeNights, compressDays } from './journey.js';
import { sendText, sendNotify } from './whatsapp.js';
import { israelToday, weekStart, parseDate, nightsBetween, normalizePhone, moduleOn } from './logic.js';
import { reportProblem } from './monitor.js';
import { bookingStatsBetween, markSent, pendingBookings as pendingNow, getAddonRequest, setAddonStatus } from './store.js';
import { checkWaitlist } from './waitlist.js';
import { setPause } from './handoff.js';
import { payToConfirm, addDays } from './logic.js';

const HELP = `פקודות:
אושר B123 : אישור הזמנה (הלקוח מקבל אישור ופרטי הגעה)
אושר B123 2500 : אישור עם מחיר סופי (הנחת 3 לילות, דקה 90, חג)
בוטל B123 : דחיית בקשה (הלקוח מקבל הודעה)
נסגר R123 500 : ליד שהעברת נסגר, עם העמלה בש"ח
לא נסגר R123 : ליד שלא נסגר
היום : מי נכנס ויוצא היום
פנוי : לילות פנויים בשבועיים הקרובים
חסום 2 2027-03-01 2027-03-04 משפחה : חוסם תאריכים בדירה 2 (תאריך יציאה לא נחסם)
חסימות : רשימת החסימות
שחרר 5 : מבטל חסימה מספר 5
יומן : בודק שהחיבור ליומן גוגל עובד
מבצע: הטקסט : שולח מבצע לכל מי שברשימת התפוצה
סיכום : הסיכום השבועי עכשיו
סיכום חודשי : הסיכום של החודש שעבר
שולם B123 : התקבלה מקדמה, ההזמנה מאושרת (כשיש קישור תשלום)
הפעל 0541234567 : מחזיר לבוט לענות ללקוח שענית לו בעצמך
אושר T123 / בוטל T123 : תוספת שאורח ביקש (רק כשמודול התוספות פעיל)
השתק 0541234567 : הבוט לא עונה ללקוח הזה כמה שעות
(כשאתה עונה ללקוח בעצמך, הבוט מפסיק לענות לו לבד)

שיחות שלא נענו (רק מי שלא שמור אצלך מקבל וואטסאפ):
שלח לי איש קשר (אחד או כמה) : נשמר, לא יקבל הודעה
שמור 0541234567 יוסי : שומר מספר
לא שמור 0541234567 : מוחק מהשמורים
שמורים : כמה מספרים שמורים`;

const nis = (n) => '₪' + Math.round(Number(n || 0)).toLocaleString('en-US');

export async function handleOwner(ctx, text, msg = {}) {
  if (msg.contacts?.length) return saveContactCards(ctx, msg.contacts);
  const t = String(text || '').trim();
  let m;
  if ((m = t.match(/^לא שמור\s+([+\d][\d\s\-+]{6,})/))) {
    const phone = normalizePhone(m[1]);
    return sendText(ctx.env, ctx.phone, phone && (await removeContact(ctx.env, phone)) ? `מחקתי את +${phone} מהשמורים. אם יתקשר ולא תענה, יקבל וואטסאפ.` : 'המספר הזה לא היה שמור.');
  }
  if ((m = t.match(/^שמור\s+([+\d][\d\s\-+]{6,}?)(?:\s+(\D.*))?$/))) {
    const phone = normalizePhone(m[1]);
    if (!phone) return sendText(ctx.env, ctx.phone, 'לא הבנתי את המספר. לדוגמה: שמור 0541234567 יוסי');
    await addContacts(ctx.env, [{ phone, name: (m[2] || '').trim() }], 'command');
    return sendText(ctx.env, ctx.phone, `שמרתי את +${phone}. אם יתקשר ולא תענה, לא נשלח לו הודעה.`);
  }
  if (/^שמורים/.test(t)) {
    const n = await contactCount(ctx.env);
    return sendText(ctx.env, ctx.phone, `יש ${n} מספרים שמורים. הם לא מקבלים וואטסאפ על שיחה שלא נענתה.\nכדי להוסיף: שלח לי אנשי קשר מהטלפון (אפשר כמה ביחד), או כתוב: שמור 0541234567 שם`);
  }
  if ((m = t.match(/^(הפעל|השתק)\s+([+\d][\d\s\-+]{6,})/))) {
    const phone = normalizePhone(m[2]);
    if (!phone) return sendText(ctx.env, ctx.phone, 'לא הבנתי את המספר. לדוגמה: הפעל 0541234567');
    await setPause(ctx.env, ctx.business, phone, m[1] === 'השתק');
    return sendText(ctx.env, ctx.phone, m[1] === 'השתק' ? `הבוט לא יענה ל-+${phone} כמה שעות. להחזרה: הפעל ${m[2].trim()}` : `הבוט חזר לענות ל-+${phone}.`);
  }
  if ((m = t.match(/^(אושר|בוטל)\s+(T\w+)/i))) return decideAddon(ctx, m[1], m[2].toUpperCase());
  if ((m = t.match(/^שולם\s+(B\w+)/i))) return confirmBooking(ctx, m[1].toUpperCase());
  if ((m = t.match(/^אושר\s+(B\w+)\s*₪?\s*([\d,]+)?/i))) return confirmBooking(ctx, m[1].toUpperCase(), m[2]);
  if ((m = t.match(/^בוטל\s+(B\w+)/i))) return cancelBooking(ctx, m[1].toUpperCase());
  if ((m = t.match(/^לא נסגר\s+(R\w+)/i))) return closeReferral(ctx, m[1].toUpperCase(), false);
  if ((m = t.match(/^נסגר\s+(R\w+)\s*₪?\s*([\d,]+)?/i))) return closeReferral(ctx, m[1].toUpperCase(), true, m[2]);
  if ((m = t.match(/^חסום\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s*(.*)$/))) return block(ctx, m[1], m[2], m[3], m[4]);
  if ((m = t.match(/^שחרר\s+(\d+)/))) {
    const removed = await removeBlock(ctx.env, m[1]);
    if (removed) await calendarJob(ctx, `שחרור ${m[1]}`, () => removeBlockEvent(ctx, removed.aptId, removed.gcalEventId));
    return sendText(ctx.env, ctx.phone, removed ? `החסימה ${m[1]} בוטלה.` : `לא מצאתי חסימה ${m[1]}.`);
  }
  if (/^חסימות/.test(t)) return listBlocks(ctx);
  if (/^יומן/.test(t)) return sendText(ctx.env, ctx.phone, await calendarStatus(ctx));
  if (/^פנוי/.test(t)) return sendText(ctx.env, ctx.phone, await freeText(ctx));
  if ((m = t.match(/^מבצע\s*:\s*([\s\S]+)/))) {
    if (!moduleOn(ctx.business, 'offers')) return sendText(ctx.env, ctx.phone, 'רשימת המבצעים לא פעילה אצלך.');
    const r = await broadcastOffer(ctx, m[1].trim());
    return sendText(ctx.env, ctx.phone, `המבצע נשלח ל-${r.sent} אנשים${r.failed ? `, ${r.failed} נכשלו` : ''}.`);
  }
  if (/^היום/.test(t)) return sendText(ctx.env, ctx.phone, await dailyText(ctx));
  if (/^סיכום חודשי/.test(t)) return sendText(ctx.env, ctx.phone, await monthlyText(ctx));
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
  await calendarJob(ctx, `חסימה ${id}`, () => syncBlockEvent(ctx, apt, { id, start, end, note }));
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
  return list.map(x => `*${x.apt.name}*: ${compressDays(x.free)}`).join('\n');
}

async function confirmBooking(ctx, id, price) {
  const b = await getBooking(ctx.env, id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  if (b.status === 'confirmed') return sendText(ctx.env, ctx.phone, `${id} כבר מאושרת.`);
  if (price) { b.total = Number(String(price).replace(/,/g, '')); await setBookingTotal(ctx.env, id, b.total); }
  if (b.total == null) return sendText(ctx.env, ctx.phone, `בהזמנה ${id} אין מחיר. תכתוב: אושר ${id} <מחיר>`);
  await setBookingStatus(ctx.env, id, 'confirmed');
  await calendarJob(ctx, `אישור ${id}`, () => syncBookingEvent(ctx, b, 'confirmed'));
  await bump(ctx.env, 'bookingsConfirmed');
  await bump(ctx.env, 'revenue', b.total);
  const apt = ctx.apartments.find(a => a.id === b.aptId) || {};
  const p = apt.privateInfo || {};
  const info = [p.address && `כתובת: ${p.address}`, p.parking && `חניה: ${p.parking}`].filter(Boolean).join('\n');
  // The guest wrote recently, so this is normally inside the 24-hour window.
  await toGuest(ctx, b,
    `${b.name}, ההזמנה שלך אושרה ✅\n${b.aptName}\n${b.checkin} עד ${b.checkout}\nכניסה מ-${apt.checkIn || ''}, ${new Date(b.checkout + 'T00:00:00Z').getUTCDay() === 6 ? 'יציאה במוצאי שבת' : `יציאה עד ${apt.checkOut || ''}`}\nסה"כ: ${nis(b.total)}${info ? `\n${info}` : ''}\nקוד כניסה ו-Wi-Fi יישלחו יום לפני ההגעה. מחכים לכם!`);
  return sendText(ctx.env, ctx.phone, `אושר ✅ ${b.id}, הלקוח קיבל אישור.`);
}

async function calendarStatus(ctx) {
  if (!calendarConfig(ctx.business)) return 'אין יומן גוגל מחובר.';
  const rows = await checkCalendars(ctx);
  return '📅 *יומן גוגל*\n' + rows.map(r => r.ok ? `✅ ${r.apt}: מחובר ל"${r.calendar}"` : `❌ ${r.apt}: ${r.error}`).join('\n');
}

// Calendar trouble never blocks a booking: it alerts the tech partner instead.
async function calendarJob(ctx, what, fn) {
  try { await fn(); }
  catch (e) { await reportProblem(ctx, 'עדכון יומן גוגל נכשל', `${what}: ${e.message}`); }
}

// David shares contact cards from his phone: those people won't get the missed-call message.
async function saveContactCards(ctx, cards) {
  const rows = [];
  for (const c of cards) for (const p of c.phones) { const phone = normalizePhone(p); if (phone) rows.push({ phone, name: c.name }); }
  if (!rows.length) return sendText(ctx.env, ctx.phone, 'לא מצאתי מספר טלפון באיש הקשר ששלחת.');
  await addContacts(ctx.env, rows, 'card');
  const names = [...new Set(cards.map(c => c.name).filter(Boolean))];
  return sendText(ctx.env, ctx.phone, `שמרתי ${rows.length === 1 ? 'מספר אחד' : `${rows.length} מספרים`}${names.length ? ` (${names.slice(0, 5).join(', ')}${names.length > 5 ? '...' : ''})` : ''}. אם יתקשרו ולא תענה, לא נשלח להם הודעה.`);
}

// A guest who booked from Instagram hears back there; if Instagram refuses
// (more than 24 hours since they wrote), the phone they gave gets it on WhatsApp.
async function toGuest(ctx, b, text) {
  if (b.chat) {
    try { return await sendText(ctx.env, b.chat, text); }
    catch (e) { console.warn('instagram reply failed, using WhatsApp', e.message); }
  }
  return sendNotify(ctx.env, b.phone, text);
}

async function cancelBooking(ctx, id) {
  const b = await getBooking(ctx.env, id);
  if (!b) return sendText(ctx.env, ctx.phone, `לא מצאתי הזמנה ${id}`);
  await setBookingStatus(ctx.env, id, 'cancelled');
  await calendarJob(ctx, `ביטול ${id}`, () => removeBookingEvent(ctx, b));
  await toGuest(ctx, b, `${b.name}, מצטערים, התאריכים האלה כבר לא פנויים ב${b.aptName}. אפשר לבדוק לך תאריכים אחרים או דירה אחרת?`);
  if (moduleOn(ctx.business, 'waitlist')) await checkWaitlist(ctx).catch(e => console.warn('waitlist', e.message));
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
    (s.missedCalls ? `\n\n📞 שיחות שלא נענו שקיבלו וואטסאפ: ${s.missedCalls}${s.missedCallReplies ? ` (${s.missedCallReplies} ענו)` : ''}` : '') +
    (s.waitlistNotified ? `\n\n🔔 עדכנו ${s.waitlistNotified} לקוחות שחיכו שיתפנה תאריך` : '') +
    (s.addonRevenue ? `\n🎁 תוספות שאושרו: ${nis(s.addonRevenue)}` : '') +
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
  if (moduleOn(B, 'stayMessages')) await job('הודעות לאורחים', () => stayMessages(ctx, hour, now));
  if (moduleOn(B, 'offers') && hour === 10 && (dow === 0 || dow === 3)) await job('לילות פנויים', () => lastMinuteNudge(ctx, now));
  if (hour === 9 && israelToday(now).endsWith('-01')) await job('סיכום חודשי', async () => sendNotify(ctx.env, B.ownerPhone, await monthlyText(ctx, now)));
  if (payToConfirm(B)) await job('תזכורת למקדמה', () => paymentReminders(ctx, now));
  if (hour === 23) await job('בדיקת תקציב', () => budgetCheck(ctx, now));
  if (hour === 3) await job('ניקוי', () => cleanup(ctx.env, now));
  // Instagram tokens expire after 60 days unless refreshed. A failure alerts the tech partner.
  if (hour === 4 && dow === 1 && ctx.env.IG_TOKEN) await job('חידוש טוקן אינסטגרם', () => refreshInstagramToken(ctx.env));
  if (moduleOn(B, 'followUps')) await job('הודעות מעקב', () => followUps(ctx, now));
  if (moduleOn(B, 'waitlist')) await job('רשימת המתנה', () => checkWaitlist(ctx, now));
  await job('שיחות שלא נענו מהלילה', () => flushQueuedMissedCalls(ctx, now));
  // A request nobody approved within 48h frees its dates: take it out of the calendar too.
  if (calendarConfig(B)) await job('ניקוי יומן', async () => {
    for (const b of await expiredPendingWithEvents(ctx.env, now)) await removeBookingEvent(ctx, b);
  });
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

// Last month for David, sent on the 1st at 09:00. Weekly counters are summed by the weeks that start in the month.
export async function monthlyText(ctx, now = Date.now()) {
  const today = israelToday(now);
  const first = today.slice(0, 8) + '01';
  const prev = addDays(first, -1).slice(0, 8) + '01';
  const from = parseDate(prev) - 3 * 3600e3, to = parseDate(first) - 3 * 3600e3;
  const weeks = new Set();
  for (let d = prev; d < first; d = addDays(d, 1)) weeks.add(weekStart(parseDate(d)));
  const s = {};
  for (const w of weeks) for (const [k, v] of Object.entries(await getStats(ctx.env, w))) s[k] = (s[k] || 0) + v;
  const b = await bookingStatsBetween(ctx.env, from, to);
  const refs = await referralsBetween(ctx.env, from, to);
  const month = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(parseDate(prev)));
  return `📅 *סיכום חודשי: ${month}*\n\n` +
    `פניות חדשות: ${s.inquiries || 0}\n` +
    `בקשות הזמנה: ${b.requests}\n` +
    `הזמנות שאושרו: ${b.confirmed}\n` +
    `הכנסה מהזמנות שאושרו: ${nis(b.revenue)}\n\n` +
    `🔁 לידים שהועברו אליך: ${refs.length}` +
    (s.missedCalls ? `\n📞 שיחות שלא נענו שקיבלו וואטסאפ: ${s.missedCalls}${s.missedCallReplies ? ` (${s.missedCallReplies} ענו)` : ''}` : '') +
    (s.waitlistNotified ? `\n🔔 עדכנו ${s.waitlistNotified} לקוחות שחיכו שיתפנה תאריך` : '') +
    (s.addonRevenue ? `\n🎁 תוספות שאושרו: ${nis(s.addonRevenue)}` : '') +
    (s.urgent ? `\n🚨 פניות דחופות: ${s.urgent}` : '');
}

// A guest who got the deposit link and didn't pay hears from us once, 5 to 20 hours later (inside the 24-hour window).
async function paymentReminders(ctx, now) {
  const B = ctx.business;
  for (const b of await pendingNow(ctx.env, now)) {
    const age = now - b.createdAt;
    if (age < 5 * 3600e3 || age > 20 * 3600e3 || b.total == null) continue;
    if (!(await markSent(ctx.env, b.id, 'payReminder'))) continue;
    const deposit = Math.round(b.total * (B.depositPercent || 0) / 100);
    try {
      await toGuest(ctx, b, `${b.name}, רק מזכיר שהתאריכים ב${b.aptName} (${b.checkin} עד ${b.checkout}) שמורים לך עד שתשלם מקדמה של ${nis(deposit)}: ${B.paymentLink}`);
    } catch (e) { console.warn('payment reminder failed', b.id, e.message); }
  }
}

// Module "addons": David approves or declines an add-on a guest asked for (אושר T123 / בוטל T123).
async function decideAddon(ctx, verb, id) {
  if (!moduleOn(ctx.business, 'addons')) return sendText(ctx.env, ctx.phone, 'התוספות לא פעילות אצלך.');
  const r = await getAddonRequest(ctx.env, id);
  if (!r) return sendText(ctx.env, ctx.phone, `לא מצאתי תוספת ${id}`);
  if (r.status !== 'pending') return sendText(ctx.env, ctx.phone, `${id} כבר טופלה.`);
  const ok = verb === 'אושר';
  await setAddonStatus(ctx.env, r.id, ok ? 'confirmed' : 'declined');
  if (ok) { await bump(ctx.env, 'addonsConfirmed'); await bump(ctx.env, 'addonRevenue', r.price || 0); }
  const text = ok ? `${r.name} אושר ✅${r.price ? ` (${nis(r.price)})` : ''}. נתראה!` : `מצטערים, לא נוכל להכין "${r.name}" הפעם. אפשר לעזור במשהו אחר?`;
  try { await sendText(ctx.env, r.chat || r.phone, text); }
  catch { return sendText(ctx.env, ctx.phone, `${ok ? 'אושר' : 'נדחה'} ${r.id}, אבל לא הצלחתי לשלוח לאורח. כתוב לו בעצמך: https://wa.me/${r.phone}`); }
  return sendText(ctx.env, ctx.phone, `${ok ? 'אושר ✅' : 'נדחה'} ${r.id}, האורח קיבל הודעה.`);
}
