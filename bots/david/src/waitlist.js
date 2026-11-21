// A guest asked for dates that were taken and agreed to hear if they free up.
// Every hour (and right after David cancels a booking) we check: a cancellation, a released
// block, an expired request or a change in Airbnb all free dates the same way.

import { waitingEntries, setWaitlistStatus, expireWaitlist, getConv, saveConv, bump } from './store.js';
import { findApartments, israelToday } from './logic.js';
import { busyMap } from './tools.js';
import { sendTemplate } from './whatsapp.js';
import { reportProblem } from './monitor.js';

const first = (name) => String(name || '').split(' ')[0];
const nis = (n) => '₪' + Number(n).toLocaleString('en-US');

export async function checkWaitlist(ctx, now = Date.now()) {
  const today = israelToday(now);
  await expireWaitlist(ctx.env, today);
  const rows = await waitingEntries(ctx.env, today);
  if (!rows.length) return 0;
  const busy = await busyMap(ctx);
  let sent = 0;
  for (const w of rows) {
    const apts = w.aptId ? ctx.apartments.filter(a => a.id === w.aptId) : ctx.apartments;
    if (!apts.length) { await setWaitlistStatus(ctx.env, w.id, 'expired'); continue; }
    const r = findApartments(apts, busy, { checkin: w.checkin, checkout: w.checkout, ...w.party, needs: [], today });
    if (r.error) { await setWaitlistStatus(ctx.env, w.id, 'expired'); continue; }
    const hit = r.results.find(x => x.fits);
    if (!hit) continue;
    // Two guests waiting for the same dates: only the first hears this round.
    (busy[hit.id] ||= []).push({ start: w.checkin, end: w.checkout });
    await setWaitlistStatus(ctx.env, w.id, 'notified');
    const price = hit.quote?.total != null && !hit.quote.ownerQuote ? `, ${nis(hit.quote.total)} בסך הכל` : '';
    const details = `${hit.name} התפנתה ל-${w.checkin} עד ${w.checkout}${price}`;
    const text = `היי ${first(w.name) || ''} 🙂 מה שביקשת התפנה: ${details}. רוצה שאשמור לך? כתוב לי כאן.`.replace('היי  ', 'היי ');
    try {
      await sendTemplate(ctx.env, w.phone, ctx.templates?.waitlist, [first(w.name) || 'היי', details], text);
      const conv = await getConv(ctx.env, w.phone);
      conv.messages.push({ role: 'assistant', text });
      await saveConv(ctx.env, conv);
      await bump(ctx.env, 'waitlistNotified');
      sent++;
    } catch (e) {
      await setWaitlistStatus(ctx.env, w.id, 'failed');
      await reportProblem(ctx, 'הודעה מרשימת המתנה לא נשלחה', `${w.id} (${w.name}): ${e.message}. אם אין תבנית מאושרת ב-Meta, הודעה רגילה נחסמת אחרי 24 שעות.`, { guest: w.phone });
    }
  }
  return sent;
}
