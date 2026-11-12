import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightsBetween, quote, findApartments, matchPartners, weekStart } from '../src/logic.js';
import { parseIcal } from '../src/ical.js';
import { APARTMENTS } from '../src/config.js';

// March 2027: Sun 28.2, Mon 1, Tue 2, Wed 3, Thu 4, Fri 5, Sat 6, Sun 7.
const [A1, A2, A3] = APARTMENTS;
const free = {};
const couple = { adults: 2, children: 0, infants: 0 };
const q = (apt, ci, co, party = couple, today = null) => quote(apt, ci, co, party, today);

test('nights between dates', () => {
  assert.deepEqual(nightsBetween('2027-03-04', '2027-03-07'), ['2027-03-04', '2027-03-05', '2027-03-06']);
});

test('David price list: weekday, one night and two nights', () => {
  assert.equal(q(A1, '2027-03-01', '2027-03-02').total, 800);
  assert.equal(q(A1, '2027-03-01', '2027-03-03').total, 600 * 2);
  assert.equal(q(A2, '2027-03-01', '2027-03-02').total, 900);
  assert.equal(q(A2, '2027-03-01', '2027-03-03').total, 700 * 2);
  assert.equal(q(A3, '2027-03-01', '2027-03-02').total, 1200);
  assert.equal(q(A3, '2027-03-01', '2027-03-03').total, 1000 * 2);
});

test('David price list: weekend packages', () => {
  // Thursday alone
  assert.deepEqual([A1, A2, A3].map(a => q(a, '2027-03-04', '2027-03-05').total), [1000, 1200, 1400]);
  // Friday to Saturday evening
  const friSat = [A1, A2, A3].map(a => q(a, '2027-03-05', '2027-03-06'));
  assert.deepEqual(friSat.map(x => x.total), [1500, 1500, 1700]);
  assert.ok(friSat[0].checkoutLate, 'leaving Saturday = after Shabbat');
  // Friday to Sunday
  assert.deepEqual([A1, A2, A3].map(a => q(a, '2027-03-05', '2027-03-07').total), [1700, 1700, 2000]);
  // Thursday to Saturday evening
  assert.deepEqual([A1, A2, A3].map(a => q(a, '2027-03-04', '2027-03-06').total), [2200, 2200, 2600]);
});

test('children add 100 a night each, a baby is free', () => {
  assert.equal(q(A1, '2027-03-05', '2027-03-07', { adults: 2, children: 2, infants: 1 }).total, 1700 + 2 * 100 * 2);
  assert.equal(q(A2, '2027-03-01', '2027-03-02', { adults: 2, children: 1, infants: 0 }).total, 900 + 100);
});

test('3+ nights: regular price, extra discount comes from David', () => {
  const r = q(A1, '2027-03-01', '2027-03-04');
  assert.equal(r.total, 600 * 3);
  assert.equal(r.discountPending, true);
  assert.equal(q(A1, '2027-03-01', '2027-03-03').discountPending, false);
});

test('last minute (today/tomorrow), Saturday-night arrival and holidays: David quotes', () => {
  assert.equal(q(A1, '2027-03-02', '2027-03-03', couple, '2027-03-01').total, null);
  assert.match(q(A1, '2027-03-02', '2027-03-03', couple, '2027-03-01').ownerQuote, /דקה 90/);
  assert.equal(q(A1, '2027-03-03', '2027-03-04', couple, '2027-03-01').ownerQuote, null);
  assert.match(q(A1, '2027-03-06', '2027-03-07').ownerQuote, /מוצאי שבת/);
  const holiday = { ...A1, ownerQuoteDates: [{ label: 'פסח', from: '2027-04-21', to: '2027-04-28' }] };
  assert.match(q(holiday, '2027-04-22', '2027-04-23').ownerQuote, /פסח/);
});

test('couple + 2 kids + baby fits every apartment', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 2, infants: 1 });
  assert.equal(r.results.filter(x => x.fits).length, 3);
  assert.equal(r.suggestReferral, false);
});

test('anything above couple + 2 + baby is a referral', () => {
  for (const party of [
    { adults: 2, children: 3, infants: 0 },
    { adults: 3, children: 0, infants: 0 },
    { adults: 2, children: 2, infants: 2 },
    { adults: 4, children: 0, infants: 0 },
  ]) {
    const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-03', ...party });
    assert.equal(r.suggestReferral, true, JSON.stringify(party));
    assert.equal(r.mainReason, 'capacity');
  }
});

test('all apartments taken: referral for dates', () => {
  const busy = Object.fromEntries(APARTMENTS.map(a => [a.id, [{ start: '2027-03-02', end: '2027-03-05' }]]));
  const r = findApartments(APARTMENTS, busy, { checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 0, infants: 0 });
  assert.equal(r.suggestReferral, true);
  assert.equal(r.mainReason, 'dates_taken');
});

test('one apartment taken: the others are offered, no referral', () => {
  const r = findApartments(APARTMENTS, { apt1: [{ start: '2027-03-01', end: '2027-03-03' }] }, { checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 0, infants: 0 });
  assert.deepEqual(r.results.filter(x => x.fits).map(x => x.id), ['apt2', 'apt3']);
  assert.equal(r.suggestReferral, false);
});

test('checkout on the day the next guest arrives is fine', () => {
  const busy = { apt3: [{ start: '2027-03-04', end: '2027-03-06' }] };
  const r = findApartments(APARTMENTS, busy, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 0 });
  assert.ok(r.results.find(x => x.id === 'apt3').fits);
});

test('budget only blocks when there is a known price', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-02', adults: 2, children: 0, infants: 0, budget: 850 });
  assert.deepEqual(r.results.filter(x => x.fits).map(x => x.id), ['apt1', 'apt2']); // 900 is within 15%
  const last = findApartments(APARTMENTS, free, { checkin: '2027-03-02', checkout: '2027-03-03', adults: 2, children: 0, infants: 0, budget: 100, today: '2027-03-01' });
  assert.equal(last.results.filter(x => x.fits).length, 3, 'last-minute has no price yet, so no budget block');
});

test('a need the apartments do not have goes to referral', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 0, infants: 0, needs: ['pool'] });
  assert.equal(r.suggestReferral, true);
  assert.equal(r.mainReason, 'missing_features');
});

test('bad dates are rejected', () => {
  assert.ok(findApartments(APARTMENTS, free, { checkin: '2027-03-04', checkout: '2027-03-01', adults: 2 }).error);
});

test('partner matching by size and features', () => {
  const partners = [
    { id: 'a', name: 'A', maxGuests: 4 },
    { id: 'b', name: 'B', maxGuests: 8, features: ['pool'] },
  ];
  assert.deepEqual(matchPartners(partners, { adults: 2, children: 3 }).map(p => p.id), ['b']);
  assert.deepEqual(matchPartners(partners, { adults: 2, children: 0, needs: ['pool'] }).map(p => p.id), ['b']);
});

test('iCal export parsing', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270310\r\nDTEND;VALUE=DATE:20270313\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.deepEqual(parseIcal(ics), [{ start: '2027-03-10', end: '2027-03-13' }]);
});

test('week starts on Sunday', () => {
  assert.equal(weekStart(Date.parse('2027-03-04T12:00:00Z')), '2027-02-28');
});
