// Pure booking logic: dates, prices, capacity and the "does this guest fit any of
// David's apartments, or does the lead go to a partner" decision.
// No I/O here, so it runs the same in the Worker and in `node --test`.

const DAY = 86400000;

export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t;
}

export function fmtDate(t) {
  return new Date(t).toISOString().slice(0, 10);
}

// Every night of the stay, as YYYY-MM-DD of the evening it starts.
export function nightsBetween(checkin, checkout) {
  const a = parseDate(checkin), b = parseDate(checkout);
  if (a === null || b === null || b <= a) return [];
  const out = [];
  for (let t = a; t < b; t += DAY) out.push(fmtDate(t));
  return out;
}

function inRange(day, from, to) {
  return day >= from && day <= to; // inclusive, string compare works for YYYY-MM-DD
}

export const dow = (day) => new Date(parseDate(day)).getUTCDay(); // 0 = Sunday

function inAnyRange(nights, ranges) {
  return (ranges || []).find(r => nights.some(d => inRange(d, r.from, r.to)));
}

// David's price list ("קו המים - מחירון"): a price for a couple; each child adds
// extraChildPerNight per night; infants are free.
//   Sun-Wed nights: weekday1 for a single night, weekday2 per night when the stay is 2+ nights
//   Thursday night alone:              thu
//   Friday, leaving Saturday evening:  friToSatEve   (checkout date = Saturday, out after Shabbat)
//   Friday + Saturday, leaving Sunday: friToSun
//   Thursday + Friday, leaving Sat eve: thuToSatEve
// 3+ nights get an extra discount David sets himself, so the bot gives the regular
// price and says the final one comes from David. Holidays and last-minute stays
// ("דקה 90") aren't on the list: David quotes those.
export function quote(apt, checkin, checkout, party = {}, today = null) {
  const P = apt.prices;
  const nights = nightsBetween(checkin, checkout);
  const n = nights.length;
  const d = nights.map(dow);
  const parts = [];
  let ownerQuote = null;
  for (let i = 0; i < n;) {
    if (d[i] === 4 && d[i + 1] === 5 && i + 2 === n) { parts.push({ label: 'חמישי עד מוצ"ש', price: P.thuToSatEve }); i += 2; }
    else if (d[i] === 4) { parts.push({ label: 'חמישי', price: P.thu }); i += 1; }
    else if (d[i] === 5 && d[i + 1] === 6) { parts.push({ label: 'שישי עד ראשון', price: P.friToSun }); i += 2; }
    else if (d[i] === 5) { parts.push({ label: 'שישי עד מוצ"ש', price: P.friToSatEve }); i += 1; }
    else if (d[i] === 6) { ownerQuote = ownerQuote || 'כניסה במוצאי שבת לא מופיעה במחירון'; parts.push({ label: 'מוצ"ש', price: 0 }); i += 1; }
    else { parts.push({ label: 'אמצע שבוע', price: n >= 2 ? P.weekday2 : P.weekday1 }); i += 1; }
  }
  const holiday = inAnyRange(nights, apt.ownerQuoteDates);
  if (holiday) ownerQuote = `${holiday.label || 'חג'}: המחיר לפי דוד`;
  if (today && n && (parseDate(checkin) - parseDate(today)) / DAY <= (apt.lastMinuteDays ?? 1)) {
    ownerQuote = 'הזמנת דקה 90 (הגעה היום או מחר): המחיר לפי דוד';
  }
  const base = parts.reduce((s, x) => s + x.price, 0);
  const childExtra = (party.children || 0) * (P.extraChildPerNight || 0) * n;
  const cleaning = P.cleaningFee || 0;
  return {
    nights: n, parts, base, childExtra, cleaning,
    total: ownerQuote ? null : base + childExtra + cleaning,
    discountPending: n >= (apt.discountFromNights ?? 3) && !ownerQuote,
    ownerQuote,
    checkoutLate: n > 0 && dow(checkout) === 6, // leaving on Saturday = after Shabbat
  };
}

// Infants (under 2) don't take a bed unless the apartment says they count.
export function guestCount(apt, { adults = 0, children = 0, infants = 0 }) {
  return adults + children + (apt.capacity.infantsCount ? infants : 0);
}

export function fitsCapacity(apt, party) {
  const c = apt.capacity;
  if (party.adults > c.maxAdults) return false;
  if (guestCount(apt, party) > c.maxGuests) return false;
  if (!c.infantsCount && party.infants > (c.maxInfants ?? 1)) return false;
  return true;
}

export function minNightsFor(apt, checkin, checkout) {
  const nights = nightsBetween(checkin, checkout);
  const r = inAnyRange(nights, apt.minNightsRanges);
  return (r && r.minNights) || apt.minNights || 1;
}

// busy: [{start:'YYYY-MM-DD', end:'YYYY-MM-DD'}], end exclusive (the checkout day).
export function isFree(busy, checkin, checkout) {
  return !(busy || []).some(b => checkin < b.end && checkout > b.start);
}

// Main decision. Returns per-apartment results and whether to offer referral.
// busyByApt: { [aptId]: busyRanges }
export function findApartments(apartments, busyByApt, req) {
  const party = { adults: req.adults || 0, children: req.children || 0, infants: req.infants || 0 };
  const needs = req.needs || [];
  const nights = nightsBetween(req.checkin, req.checkout);
  if (!nights.length) return { error: 'תאריכים לא תקינים: צריך checkin לפני checkout בפורמט YYYY-MM-DD' };
  if (party.adults < 1) return { error: 'צריך לפחות מבוגר אחד' };

  const results = apartments.map(apt => {
    const reasons = [];
    if (!fitsCapacity(apt, party)) reasons.push('capacity');
    const missing = needs.filter(n => !(apt.features || []).includes(n));
    if (missing.length) reasons.push('missing_features');
    if (!isFree(busyByApt[apt.id], req.checkin, req.checkout)) reasons.push('dates_taken');
    const min = minNightsFor(apt, req.checkin, req.checkout);
    if (nights.length < min) reasons.push('min_nights');
    const q = quote(apt, req.checkin, req.checkout, party, req.today);
    if (req.budget && q.total != null && q.total > req.budget * 1.15) reasons.push('over_budget');
    return {
      id: apt.id, name: apt.name, fits: reasons.length === 0, reasons,
      missingFeatures: missing, minNights: min, quote: q,
    };
  });

  const fitting = results.filter(r => r.fits);
  // Min nights alone is fixable by staying longer, so it doesn't send the lead away.
  const fixable = results.filter(r => r.reasons.length === 1 && r.reasons[0] === 'min_nights');
  const suggestReferral = fitting.length === 0 && fixable.length === 0;
  const mainReason = suggestReferral ? pickMainReason(results) : null;
  return { party, nights: nights.length, results, suggestReferral, mainReason };
}

const REASON_ORDER = ['capacity', 'missing_features', 'dates_taken', 'over_budget'];
function pickMainReason(results) {
  for (const r of REASON_ORDER) if (results.every(x => x.reasons.includes(r))) return r;
  // Mixed reasons (e.g. big apt taken, small apt too small): report what blocks the
  // apartment that came closest.
  const closest = [...results].sort((a, b) => a.reasons.length - b.reasons.length)[0];
  return closest ? closest.reasons[0] : 'other';
}

export const REASON_HE = {
  capacity: 'יותר מדי אורחים לדירות שלנו',
  missing_features: 'צריך משהו שאין בדירות שלנו',
  dates_taken: 'כל הדירות תפוסות בתאריכים האלה',
  over_budget: 'התקציב לא מתאים למחירים שלנו',
  min_nights: 'פחות לילות מהמינימום',
  other: 'לא מתאים מסיבה אחרת',
};

// Partners whose apartment could take this party. Area is free text, so it's
// returned for David (and the model) to judge rather than filtered here.
export function matchPartners(partners, req) {
  const guests = (req.adults || 0) + (req.children || 0);
  const needs = req.needs || [];
  return (partners || [])
    .filter(p => !p.maxGuests || guests <= p.maxGuests)
    .filter(p => needs.every(n => (p.features || []).includes(n)))
    .filter(p => !req.budgetPerNight || !p.priceFrom || p.priceFrom <= req.budgetPerNight * 1.15)
    .map(p => ({ id: p.id, name: p.name, area: p.area, maxGuests: p.maxGuests }));
}

// Week key for summaries: the Sunday that starts the week (Israeli week).
export function weekStart(t) {
  const d = new Date(t);
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * DAY;
  return fmtDate(sunday);
}

export function israelToday(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(now));
}

export function addDays(day, n) {
  return fmtDate(parseDate(day) + n * DAY);
}
