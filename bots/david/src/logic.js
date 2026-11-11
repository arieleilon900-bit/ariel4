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

// Friday and Saturday nights are weekend nights in Israel.
export function isWeekendNight(day, weekendNights = [5, 6]) {
  return weekendNights.includes(new Date(parseDate(day)).getUTCDay());
}

// Price for one night: a season/holiday range overrides the regular price.
export function nightPrice(apt, day) {
  const weekend = isWeekendNight(day, apt.weekendNights);
  const season = (apt.seasons || []).find(s => inRange(day, s.from, s.to));
  const src = season || apt.prices;
  return weekend ? (src.weekend ?? src.weeknight) : src.weeknight;
}

export function quote(apt, checkin, checkout) {
  const nights = nightsBetween(checkin, checkout);
  const perNight = nights.map(d => ({ date: d, price: nightPrice(apt, d) }));
  const nightsTotal = perNight.reduce((s, n) => s + n.price, 0);
  const cleaning = apt.prices.cleaningFee || 0;
  return { nights: nights.length, perNight, nightsTotal, cleaning, total: nightsTotal + cleaning };
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
  const season = (apt.seasons || []).find(s => nights.some(d => inRange(d, s.from, s.to)) && s.minNights);
  if (season) return season.minNights;
  if (apt.minNightsWeekend && nights.some(d => isWeekendNight(d, apt.weekendNights))) return apt.minNightsWeekend;
  return apt.minNights || 1;
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
    const q = quote(apt, req.checkin, req.checkout);
    if (req.budget && q.total > req.budget * 1.15) reasons.push('over_budget');
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
