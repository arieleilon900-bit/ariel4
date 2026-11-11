import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightsBetween, quote, findApartments, matchPartners, weekStart } from '../src/logic.js';
import { parseIcal } from '../src/ical.js';
import { APARTMENTS } from '../src/config.js';

const free = {};

test('nights and weekend pricing', () => {
  // 2027-03-04 is a Thursday: Thu night (weekday) + Fri night + Sat night (weekend)
  assert.deepEqual(nightsBetween('2027-03-04', '2027-03-07'), ['2027-03-04', '2027-03-05', '2027-03-06']);
  const q = quote(APARTMENTS[2], '2027-03-04', '2027-03-07');
  assert.equal(q.nightsTotal, 700 + 900 + 900);
  assert.equal(q.total, 700 + 900 + 900 + 200);
});

test('season overrides regular price', () => {
  const q = quote(APARTMENTS[0], '2027-07-05', '2027-07-07'); // Mon, Tue nights in summer
  assert.equal(q.nightsTotal, 550 * 2);
});

test('couple + 2 kids fits only the big apartment', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 0 });
  assert.deepEqual(r.results.filter(x => x.fits).map(x => x.id), ['apt3']);
  assert.equal(r.suggestReferral, false);
});

test('couple + 3 kids: nothing fits, referral for capacity', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 3, infants: 0 });
  assert.equal(r.suggestReferral, true);
  assert.equal(r.mainReason, 'capacity');
});

test('infant does not take a bed', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 1 });
  assert.ok(r.results.find(x => x.id === 'apt3').fits);
});

test('big apartment taken: referral for dates', () => {
  const busy = { apt3: [{ start: '2027-03-02', end: '2027-03-05' }] };
  const r = findApartments(APARTMENTS, busy, { checkin: '2027-03-01', checkout: '2027-03-03', adults: 2, children: 2, infants: 0 });
  assert.equal(r.suggestReferral, true);
  assert.ok(r.results.find(x => x.id === 'apt3').reasons.includes('dates_taken'));
});

test('checkout on the day the next guest arrives is fine', () => {
  const busy = { apt3: [{ start: '2027-03-04', end: '2027-03-06' }] };
  const r = findApartments(APARTMENTS, busy, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 2, infants: 0 });
  assert.ok(r.results.find(x => x.id === 'apt3').fits);
});

test('only min nights blocks: no referral, offer longer stay', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-05', checkout: '2027-03-06', adults: 2, children: 2, infants: 0 });
  assert.equal(r.suggestReferral, false);
  assert.deepEqual(r.results.find(x => x.id === 'apt3').reasons, ['min_nights']);
});

test('pool request goes to referral', () => {
  const r = findApartments(APARTMENTS, free, { checkin: '2027-03-01', checkout: '2027-03-04', adults: 2, children: 0, infants: 0, needs: ['pool'] });
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
