// Tools the model can call, and what they do. Prices, capacity and availability are
// always computed here in code, never by the model.

import { findApartments, matchPartners, REASON_HE, quote } from './logic.js';
import { busyFor } from './ical.js';
import { FEATURES } from './config.js';
import { newId, putRecord, listRecords, activeBookings, bump } from './store.js';
import { sendNotify } from './whatsapp.js';

const featureCodes = Object.keys(FEATURES);
const date = { type: 'string', description: 'YYYY-MM-DD' };
const int = (d) => ({ type: 'integer', description: d });

export const TOOLS = [
  {
    name: 'find_apartments',
    description: 'בודק אילו מהדירות מתאימות לתאריכים ולהרכב, ומחזיר מחיר מדויק. חובה לקרוא לו לפני שמציעים דירה או מחיר. מחזיר suggestReferral: true כשאף דירה לא מתאימה ויש להציע העברה לשותף.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        checkin: date, checkout: date,
        adults: int('מבוגרים, וגם ילדים מגיל 13'),
        children: int('ילדים מגיל 2 עד 12'),
        infants: int('תינוקות עד גיל 2'),
        needs: { type: 'array', items: { type: 'string', enum: featureCodes }, description: 'דרישות שהלקוח ציין במפורש' },
        budget: { type: ['integer', 'null'], description: 'תקציב כולל לשהייה בש"ח אם הלקוח ציין, אחרת null' },
      },
      required: ['checkin', 'checkout', 'adults', 'children', 'infants', 'needs', 'budget'],
    },
  },
  {
    name: 'create_booking_request',
    description: 'רושם בקשת הזמנה ומעביר לבעל הדירות. קוראים רק אחרי שהלקוח אישר את הסיכום (דירה, תאריכים, אורחים, מחיר).',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        apartment_id: { type: 'string' },
        full_name: { type: 'string' },
        checkin: date, checkout: date,
        adults: { type: 'integer' }, children: { type: 'integer' }, infants: { type: 'integer' },
        arrival_time: { type: 'string', description: 'שעת הגעה משוערת, או "לא ידוע"' },
        notes: { type: 'string', description: 'בקשות מיוחדות, גילאי ילדים, סיבת הנסיעה. ריק אם אין' },
      },
      required: ['apartment_id', 'full_name', 'checkin', 'checkout', 'adults', 'children', 'infants', 'arrival_time', 'notes'],
    },
  },
  {
    name: 'refer_lead',
    description: 'מעביר לקוח שלא מתאים לאף דירה לבעל דירה שותף (עליו מקבלים עמלה). קוראים רק אחרי שהלקוח אישר במפורש להעביר את הפרטים שלו.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        customer_consented: { type: 'boolean', description: 'true רק אם הלקוח אמר במפורש שאפשר להעביר את הפרטים' },
        full_name: { type: 'string' },
        checkin: { type: 'string', description: 'YYYY-MM-DD או "גמיש"' },
        checkout: { type: 'string', description: 'YYYY-MM-DD או "גמיש"' },
        adults: { type: 'integer' }, children: { type: 'integer' },
        children_ages: { type: 'string', description: 'למשל "3, 7, 11", או ריק' },
        budget: { type: 'string', description: 'תקציב כמו שהלקוח אמר (ללילה או לשהייה), או ריק' },
        area: { type: 'string', description: 'אזור מועדף, או ריק' },
        needs: { type: 'array', items: { type: 'string', enum: featureCodes } },
        requests: { type: 'string', description: 'עוד בקשות במילים של הלקוח, או ריק' },
        reason: { type: 'string', enum: ['capacity', 'dates_taken', 'missing_features', 'over_budget', 'other'], description: 'למה לא מתאים לדירות שלנו' },
      },
      required: ['customer_consented', 'full_name', 'checkin', 'checkout', 'adults', 'children', 'children_ages', 'budget', 'area', 'needs', 'requests', 'reason'],
    },
  },
  {
    name: 'notify_owner',
    description: 'שולח הודעה לבעל הדירות: שאלה שאין לה תשובה, לקוח שמבקש לדבר איתו, תקלה, בקשה חריגה.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        urgent: { type: 'boolean' },
        summary: { type: 'string', description: 'מה קרה ומה הלקוח צריך, בשורה-שתיים' },
      },
      required: ['urgent', 'summary'],
    },
  },
];

const nis = (n) => '₪' + Number(n).toLocaleString('en-US');
const partyText = (p) => `${p.adults} מבוגרים${p.children ? `, ${p.children} ילדים` : ''}${p.infants ? `, ${p.infants} תינוקות` : ''}`;

async function busyMap(ctx) {
  const bookings = await listRecords(ctx.env, 'booking');
  const map = {};
  for (const apt of ctx.apartments) map[apt.id] = await busyFor(apt, ctx.env, activeBookings(bookings, apt.id));
  return map;
}

export async function runTool(name, input, ctx) {
  try {
    switch (name) {
      case 'find_apartments': return await findTool(input, ctx);
      case 'create_booking_request': return await bookingTool(input, ctx);
      case 'refer_lead': return await referTool(input, ctx);
      case 'notify_owner': return await notifyTool(input, ctx);
      default: return { error: 'unknown tool ' + name };
    }
  } catch (e) {
    console.error('tool failed', name, e);
    return { error: 'תקלה זמנית. תגיד ללקוח שבודקים ונחזור אליו, וקרא ל-notify_owner.' };
  }
}

async function findTool(input, ctx) {
  const r = findApartments(ctx.apartments, await busyMap(ctx), input);
  if (r.error) return r;
  ctx.conv.quotedAt = ctx.conv.quotedAt || Date.now();
  ctx.conv.lastSearch = input;
  return {
    nights: r.nights,
    suggestReferral: r.suggestReferral,
    mainReason: r.mainReason ? REASON_HE[r.mainReason] : null,
    apartments: r.results.map(x => ({
      id: x.id, name: x.name, fits: x.fits,
      why_not: x.reasons.map(k => k === 'min_nights' ? `מינימום ${x.minNights} לילות` : REASON_HE[k]),
      total: x.quote.total, nights_total: x.quote.nightsTotal, cleaning: x.quote.cleaning,
    })),
  };
}

async function bookingTool(input, ctx) {
  const apt = ctx.apartments.find(a => a.id === input.apartment_id);
  if (!apt) return { error: 'אין דירה כזו. ids: ' + ctx.apartments.map(a => a.id).join(', ') };
  // Re-check in code: the model may have quoted before someone else booked.
  const check = findApartments([apt], await busyMap(ctx), { ...input, needs: [] });
  if (check.error) return check;
  const res = check.results[0];
  if (!res.fits) return { error: 'הדירה כבר לא מתאימה: ' + res.reasons.map(k => REASON_HE[k]).join(', ') + '. קרא שוב ל-find_apartments.' };

  const B = ctx.business;
  const q = quote(apt, input.checkin, input.checkout);
  const rec = {
    id: newId('B'), status: 'pending', createdAt: Date.now(),
    aptId: apt.id, aptName: apt.name, phone: ctx.phone, name: input.full_name,
    checkin: input.checkin, checkout: input.checkout,
    party: { adults: input.adults, children: input.children, infants: input.infants },
    total: q.total, arrival: input.arrival_time, notes: input.notes,
  };
  await putRecord(ctx.env, 'booking', rec);
  await bump(ctx.env, 'bookingRequests');
  ctx.conv.bookedAt = Date.now();

  const deposit = Math.round(q.total * (B.depositPercent || 0) / 100);
  await sendNotify(ctx.env, B.ownerPhone,
    `🏠 *בקשת הזמנה חדשה* ${rec.id}\n${apt.name}\n${rec.checkin} עד ${rec.checkout} (${q.nights} לילות)\n${rec.name}, ${partyText(rec.party)}\nטלפון: +${rec.phone}\nסה"כ: ${nis(q.total)}\nהגעה: ${rec.arrival}${rec.notes ? `\nהערות: ${rec.notes}` : ''}\n\nלאישור שלח: אושר ${rec.id}\nלדחייה: בוטל ${rec.id}`);

  return {
    booking_id: rec.id, total: q.total, deposit,
    payment_link: B.bookingFlow === 'pay_to_confirm' ? (B.paymentLink || null) : null,
    status: B.bookingFlow === 'pay_to_confirm' ? 'ממתין לתשלום מקדמה' : 'ממתין לאישור של ' + B.botName,
  };
}

async function referTool(input, ctx) {
  if (!input.customer_consented) return { error: 'צריך אישור מפורש של הלקוח להעביר את הפרטים. שאל אותו קודם.' };
  const B = ctx.business;
  const partners = matchPartners(ctx.partners, { adults: input.adults, children: input.children, needs: input.needs });
  const rec = {
    id: newId('R'), status: 'sent', createdAt: Date.now(), phone: ctx.phone, ...input,
    candidates: partners.map(p => p.id),
  };
  await putRecord(ctx.env, 'referral', rec);
  await bump(ctx.env, 'referrals');
  ctx.conv.referredAt = Date.now();

  const needs = input.needs.map(n => FEATURES[n] || n).join(', ');
  const details =
    `${input.full_name} | +${ctx.phone}\n${input.checkin} עד ${input.checkout}\n${input.adults} מבוגרים${input.children ? `, ${input.children} ילדים${input.children_ages ? ` (${input.children_ages})` : ''}` : ''}` +
    `${input.budget ? `\nתקציב: ${input.budget}` : ''}${input.area ? `\nאזור: ${input.area}` : ''}${needs ? `\nצריך: ${needs}` : ''}${input.requests ? `\nבקשות: ${input.requests}` : ''}`;
  const reason = REASON_HE[input.reason] || input.reason;
  const match = partners.length ? `\nמתאים ל: ${partners.map(p => `${p.name}${p.area ? ` (${p.area})` : ''}`).join(', ')}` : '\nאין שותף שמתאים לפי הרשימה';

  if (B.referral.mode === 'direct' && partners.length) {
    const target = ctx.partners.find(p => p.id === partners[0].id);
    await sendNotify(ctx.env, target.phone, `לקוח חדש מ${B.botName} (${rec.id}):\n${details}`);
    await sendNotify(ctx.env, B.ownerPhone, `🔁 *ליד הועבר* ${rec.id} ← ${target.name}\nסיבה: ${reason}\n${details}\n\nכשנסגר שלח: נסגר ${rec.id} <עמלה>`);
  } else {
    await sendNotify(ctx.env, B.ownerPhone, `🔁 *ליד להעברה* ${rec.id}\nסיבה: ${reason}\n${details}${match}\n\nכשנסגר שלח: נסגר ${rec.id} <עמלה>\nאם לא: לא נסגר ${rec.id}`);
  }
  return { referral_id: rec.id, sent: true };
}

async function notifyTool(input, ctx) {
  const B = ctx.business;
  await sendNotify(ctx.env, B.ownerPhone, `${input.urgent ? '🚨 *דחוף*' : '💬 *שאלה מלקוח*'}\n${input.summary}\nלקוח: ${ctx.name || ''} +${ctx.phone}\nhttps://wa.me/${ctx.phone}`);
  if (input.urgent) await bump(ctx.env, 'urgent');
  return { sent: true };
}
