// Tools the model can call, and what they do. Prices, capacity and availability are
// always computed here in code, never by the model.

import { findApartments, matchPartners, REASON_HE, quote, israelToday, normalizePhone, moduleOn, payToConfirm, nightsBetween, isService } from './logic.js';
import { busyFor } from './ical.js';
import { FEATURES } from './config.js';
import { newId, activeBookingsFor, insertBookingIfFree, insertReferral, bump, blocksFor, subscribe, addWaitlist, upcomingBookingFor, addAddonRequest } from './store.js';
import { reportProblem } from './monitor.js';
import { sendNotify, sendImage } from './whatsapp.js';
import { instagramUsername } from './instagram.js';
import { syncBookingEvent } from './gcal.js';
import { SERVICE_TOOLS, submitLead, sendExamples } from './service.js';

const featureCodes = Object.keys(FEATURES);
const date = { type: 'string', description: 'YYYY-MM-DD' };
const int = (d) => ({ type: 'integer', description: d });
const phoneField = { type: 'string', description: 'רק באינסטגרם: מספר הנייד שהלקוח נתן. בוואטסאפ: ריק' };

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
        adults: int('מבוגרים, מגיל 18'),
        children: int('ילדים מגיל 2 עד 17'),
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
        phone: phoneField,
      },
      required: ['apartment_id', 'full_name', 'checkin', 'checkout', 'adults', 'children', 'infants', 'arrival_time', 'notes', 'phone'],
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
        phone: phoneField,
      },
      required: ['customer_consented', 'full_name', 'checkin', 'checkout', 'adults', 'children', 'children_ages', 'budget', 'area', 'needs', 'requests', 'reason', 'phone'],
    },
  },
  {
    name: 'send_photos',
    description: 'שולח ללקוח תמונות של דירה (בוואטסאפ או באינסטגרם, איפה שהוא כותב). קוראים כשהלקוח מבקש תמונות, או כשמציעים לו דירה בפעם הראשונה.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { apartment_id: { type: 'string' } },
      required: ['apartment_id'],
    },
  },
  {
    name: 'subscribe_offers',
    description: 'מוסיף את הלקוח לרשימת המבצעים בוואטסאפ. קוראים רק אחרי שהלקוח אמר במפורש שהוא רוצה לקבל מבצעים (חוק הספאם).',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        customer_consented: { type: 'boolean' },
        language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'other'] },
        phone: phoneField,
      },
      required: ['customer_consented', 'language', 'phone'],
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
  {
    name: 'join_waitlist',
    description: 'רושם את הלקוח לרשימת המתנה: אם התאריכים שביקש יתפנו (ביטול, חסימה שהוסרה), הוא יקבל הודעה בוואטסאפ. קוראים רק אחרי שהתאריכים תפוסים והלקוח אמר במפורש שהוא רוצה שנעדכן אותו.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        customer_consented: { type: 'boolean', description: 'true רק אם הלקוח אמר במפורש שאפשר לעדכן אותו' },
        full_name: { type: 'string' },
        apartment_id: { type: 'string', description: 'id של דירה מסוימת שהלקוח רוצה, או any לכל דירה שמתאימה' },
        checkin: date, checkout: date,
        adults: { type: 'integer' }, children: { type: 'integer' }, infants: { type: 'integer' },
        phone: phoneField,
      },
      required: ['customer_consented', 'full_name', 'apartment_id', 'checkin', 'checkout', 'adults', 'children', 'infants', 'phone'],
    },
  },
  {
    name: 'request_addon',
    description: 'אורח עם הזמנה מאושרת מבקש תוספת (למשל יציאה מאוחרת). מעביר לבעל הדירות לאישור.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { addon_id: { type: 'string', description: 'id של התוספת מהרשימה' } },
      required: ['addon_id'],
    },
  },
];

// The tools this client's bot gets (modules switched off take their tools with them).
export function toolsFor(business) {
  if (isService(business)) {
    return [...SERVICE_TOOLS, ...TOOLS.filter(t => t.name === 'notify_owner' || (t.name === 'subscribe_offers' && moduleOn(business, 'offers')))];
  }
  return TOOLS.filter(t => !(t.name === 'refer_lead' && !moduleOn(business, 'referrals'))
    && !(t.name === 'subscribe_offers' && !moduleOn(business, 'offers'))
    && !(t.name === 'join_waitlist' && !moduleOn(business, 'waitlist'))
    && !(t.name === 'request_addon' && !(moduleOn(business, 'addons') && business.addons?.length)));
}

const nis = (n) => '₪' + Number(n).toLocaleString('en-US');
const partyText = (p) => `${p.adults} מבוגרים${p.children ? `, ${p.children} ילדים` : ''}${p.infants ? `, ${p.infants} תינוקות` : ''}`;

// The guest's WhatsApp number. On WhatsApp it's who wrote; on Instagram the model
// must have asked for it (phone field). Returns { phone } or { error }.
function guestPhone(input, ctx) {
  if (ctx.channel !== 'instagram') return { phone: ctx.phone };
  const phone = normalizePhone(input.phone);
  if (!phone) return { error: 'באינסטגרם אין לנו את הטלפון של הלקוח. בקש ממנו מספר נייד (בשביל האישור והתזכורות בוואטסאפ) ואז קרא שוב עם phone.' };
  return { phone };
}

// How the owner reaches this guest, for alerts.
async function contact(ctx, phone) {
  if (ctx.channel !== 'instagram') return `+${ctx.phone}\nhttps://wa.me/${ctx.phone}`;
  const user = await instagramUsername(ctx.env, ctx.phone);
  const ig = `אינסטגרם${user ? ` @${user}` : ''}`;
  return phone ? `+${phone} (פנה מ${ig})\nhttps://wa.me/${phone}` : `${ig}, בלי טלפון: עונים לו בהודעות של אינסטגרם`;
}

export async function busyMap(ctx) {
  const map = {};
  const onError = (kind, detail) => reportProblem(ctx, kind, detail);
  for (const apt of ctx.apartments) {
    const own = [...await activeBookingsFor(ctx.env, apt.id), ...(await blocksFor(ctx.env, apt.id)).map(b => ({ checkin: b.start, checkout: b.end }))];
    map[apt.id] = await busyFor(apt, ctx.env, own, onError, ctx);
  }
  return map;
}

export async function runTool(name, input, ctx) {
  try {
    switch (name) {
      case 'submit_lead': return await submitLead(input, ctx);
      case 'send_examples': return await sendExamples(ctx);
      case 'find_apartments': return await findTool(input, ctx);
      case 'create_booking_request': return await bookingTool(input, ctx);
      case 'refer_lead': if (!moduleOn(ctx.business, 'referrals')) return { error: 'הכלי לא פעיל' }; return await referTool(input, ctx);
      case 'notify_owner': return await notifyTool(input, ctx);
      case 'send_photos': return await photosTool(input, ctx);
      case 'subscribe_offers': if (!moduleOn(ctx.business, 'offers')) return { error: 'הכלי לא פעיל' }; return await subscribeTool(input, ctx);
      case 'join_waitlist': if (!moduleOn(ctx.business, 'waitlist')) return { error: 'הכלי לא פעיל' }; return await waitlistTool(input, ctx);
      case 'request_addon': if (!moduleOn(ctx.business, 'addons')) return { error: 'הכלי לא פעיל' }; return await addonTool(input, ctx);
      default: return { error: 'unknown tool ' + name };
    }
  } catch (e) {
    await reportProblem(ctx, 'כלי נכשל: ' + name, e.stack || e.message, { guest: ctx.phone });
    return { error: 'תקלה זמנית. תגיד ללקוח שבודקים ונחזור אליו, וקרא ל-notify_owner.' };
  }
}

async function findTool(input, ctx) {
  const r = findApartments(ctx.apartments, await busyMap(ctx), { ...input, today: israelToday() });
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
      total: x.quote.total,
      breakdown: x.quote.parts.map(p => `${p.label} ₪${p.price}`).join(' + ') + (x.quote.childExtra ? ` + ילדים ₪${x.quote.childExtra}` : ''),
      discount_pending: x.quote.discountPending,
      owner_quote: x.quote.ownerQuote,
      checkout_after_shabbat: x.quote.checkoutLate,
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

  const gp = guestPhone(input, ctx);
  if (gp.error) return gp;
  const B = ctx.business;
  const q = quote(apt, input.checkin, input.checkout, input, israelToday());
  const rec = {
    id: newId('B'), status: 'pending', createdAt: Date.now(),
    aptId: apt.id, aptName: apt.name, phone: gp.phone, name: input.full_name,
    chat: ctx.channel === 'instagram' ? ctx.phone : null,
    checkin: input.checkin, checkout: input.checkout,
    party: { adults: input.adults, children: input.children, infants: input.infants },
    total: q.total, arrival: input.arrival_time, notes: input.notes,
  };
  if (!(await insertBookingIfFree(ctx.env, rec))) {
    return { error: 'מישהו אחר הזמין את התאריכים האלה ממש עכשיו. קרא שוב ל-find_apartments והצע חלופה.' };
  }
  await bump(ctx.env, 'bookingRequests');
  ctx.conv.bookedAt = Date.now();

  const deposit = q.total == null ? null : Math.round(q.total * (B.depositPercent || 0) / 100);
  const priceLine = q.ownerQuote ? `מחיר: צריך ממך (${q.ownerQuote})`
    : q.discountPending ? `מחיר לפי המחירון: ${nis(q.total)}. ${q.nights} לילות, מגיעה לו הנחה נוספת: תכתוב לו את המחיר הסופי`
    : `סה"כ: ${nis(q.total)}`;
  await sendNotify(ctx.env, B.ownerPhone,
    `🏠 *בקשת הזמנה חדשה* ${rec.id}\n${apt.name}\n${rec.checkin} עד ${rec.checkout} (${q.nights} לילות${q.checkoutLate ? ', יציאה במוצ"ש' : ''})\n${rec.name}, ${partyText(rec.party)}\nטלפון: +${rec.phone}${rec.chat ? ' (הזמין מאינסטגרם)' : ''}\n${priceLine}\nהגעה: ${rec.arrival}${rec.notes ? `\nהערות: ${rec.notes}` : ''}\n\n${payToConfirm(B) ? `הלקוח קיבל קישור למקדמה${deposit == null ? '' : ' (' + nis(deposit) + ')'}. כשהתשלום נכנס שלח: שולם ${rec.id}\nלאישור בלי תשלום: אושר ${rec.id}` : `לאישור שלח: אושר ${rec.id}`}\nלדחייה: בוטל ${rec.id}`);

  // Into the owner's calendar right away (as "waiting for approval").
  try { await syncBookingEvent(ctx, rec, 'pending'); }
  catch (e) { await reportProblem(ctx, 'הזמנה לא נכנסה ליומן גוגל', `${rec.id}: ${e.message}`); }

  return {
    booking_id: rec.id, total: q.total, deposit, discount_pending: q.discountPending, owner_quote: q.ownerQuote,
    payment_link: payToConfirm(B) ? B.paymentLink : null,
    status: payToConfirm(B) ? 'ממתין לתשלום מקדמה' : 'ממתין לאישור של ' + B.botName,
  };
}

async function referTool(input, ctx) {
  if (!input.customer_consented) return { error: 'צריך אישור מפורש של הלקוח להעביר את הפרטים. שאל אותו קודם.' };
  const gp = guestPhone(input, ctx);
  if (gp.error) return gp;
  const { phone: _given, ...fields } = input;
  const B = ctx.business;
  const partners = matchPartners(ctx.partners, { adults: input.adults, children: input.children, needs: input.needs });
  const rec = {
    id: newId('R'), status: 'sent', createdAt: Date.now(), ...fields, phone: gp.phone,
    candidates: partners.map(p => p.id),
  };
  await insertReferral(ctx.env, rec);
  await bump(ctx.env, 'referrals');
  ctx.conv.referredAt = Date.now();

  const needs = input.needs.map(n => FEATURES[n] || n).join(', ');
  const kids = input.children ? `, ${input.children} ילדים${input.children_ages ? ` (${input.children_ages})` : ''}` : '';
  const details = [
    `👤 ${input.full_name}`,
    `📞 +${gp.phone}${ctx.channel === 'instagram' ? ' (מאינסטגרם)' : ''}`,
    `📅 ${input.checkin} עד ${input.checkout}`,
    `👨‍👩‍👧 ${input.adults} מבוגרים${kids}`,
    input.budget && `💰 ${input.budget}`,
    input.area && `📍 ${input.area}`,
    needs && `✳️ צריך: ${needs}`,
    input.requests && `📝 ${input.requests}`,
  ].filter(Boolean).join('\n');
  const reason = REASON_HE[input.reason] || input.reason;
  const match = partners.length ? `\nמתאים ל: ${partners.map(p => `${p.name}${p.area ? ` (${p.area})` : ''}`).join(', ')}` : '';
  const track = B.referral.trackCommission ? `\n\nכשנסגר שלח: נסגר ${rec.id} <עמלה>\nאם לא: לא נסגר ${rec.id}` : '';
  const chat = `\n\nלכתוב ללקוח: https://wa.me/${gp.phone}`;

  if (B.referral.mode === 'direct' && partners.length) {
    const target = ctx.partners.find(p => p.id === partners[0].id);
    await sendNotify(ctx.env, target.phone, `לקוח חדש מ${B.botName} (${rec.id}):\n${details}`);
    await sendNotify(ctx.env, B.ownerPhone, `🔁 *ליד הועבר* ${rec.id} ← ${target.name}\nלמה לא אצלך: ${reason}\n\n${details}${track}`);
  } else {
    await sendNotify(ctx.env, B.ownerPhone, `🔁 *ליד חדש להעברה* ${rec.id}\nלמה לא אצלך: ${reason}\n\n${details}${match}${chat}${track}`);
  }
  return { referral_id: rec.id, sent: true };
}

async function notifyTool(input, ctx) {
  const B = ctx.business;
  await sendNotify(ctx.env, B.ownerPhone, `${input.urgent ? '🚨 *דחוף*' : '💬 *שאלה מלקוח*'}\n${input.summary}\nלקוח: ${ctx.name ? ctx.name + ' ' : ''}${await contact(ctx)}`);
  if (input.urgent) await bump(ctx.env, 'urgent');
  return { sent: true };
}

async function photosTool(input, ctx) {
  const apt = ctx.apartments.find(a => a.id === input.apartment_id);
  if (!apt) return { error: 'אין דירה כזו' };
  const urls = (apt.photoUrls || []).slice(0, 6);
  if (!urls.length) return apt.photos ? { sent: 0, link: apt.photos, note: 'שלח ללקוח את הקישור כמו שהוא, בשורה נפרדת. בוואטסאפ הוא נפתח עם כל התמונות של הדירה בקטלוג.' } : { error: 'אין תמונות לדירה הזו. אמור שנשלח בהמשך וקרא ל-notify_owner.' };
  for (let i = 0; i < urls.length; i++) await sendImage(ctx.env, ctx.phone, urls[i], i === 0 ? apt.name : '');
  return { sent: urls.length, note: 'התמונות כבר נשלחו. אל תשלח קישור, רק שאלה קצרה.' };
}

async function subscribeTool(input, ctx) {
  if (!input.customer_consented) return { error: 'צריך הסכמה מפורשת של הלקוח.' };
  const gp = guestPhone(input, ctx);
  if (gp.error) return gp;
  await subscribe(ctx.env, gp.phone, ctx.name, input.language);
  return { subscribed: true, note: 'אפשר להגיד ללקוח שבכל רגע אפשר לכתוב "הסר".' };
}

// Module "waitlist": the guest agreed to hear if the dates free up (see waitlist.js).
async function waitlistTool(input, ctx) {
  if (!input.customer_consented) return { error: 'צריך הסכמה מפורשת של הלקוח לעדכן אותו אם יתפנה.' };
  const gp = guestPhone(input, ctx);
  if (gp.error) return gp;
  if (!nightsBetween(input.checkin, input.checkout).length) return { error: 'תאריך היציאה צריך להיות אחרי תאריך ההגעה.' };
  const aptId = input.apartment_id === 'any' ? null : input.apartment_id;
  if (aptId && !ctx.apartments.some(a => a.id === aptId)) return { error: 'אין דירה כזו. ids: ' + ctx.apartments.map(a => a.id).join(', ') + ', או any' };
  const id = await addWaitlist(ctx.env, {
    id: newId('W'), phone: gp.phone, name: input.full_name, aptId,
    checkin: input.checkin, checkout: input.checkout, adults: input.adults, children: input.children, infants: input.infants,
  });
  return { waitlist_id: id, note: 'אמור ללקוח שנעדכן אותו בוואטסאפ ברגע שיתפנה. לא מבטיחים שיתפנה.' };
}

// Module "addons": a guest with a confirmed booking asks for something extra.
async function addonTool(input, ctx) {
  const B = ctx.business;
  const addon = (B.addons || []).find(a => a.id === input.addon_id);
  if (!addon) return { error: 'אין תוספת כזו. ids: ' + (B.addons || []).map(a => a.id).join(', ') };
  const b = await upcomingBookingFor(ctx.env, ctx.phone, israelToday());
  if (!b) return { error: 'אין לאורח הזה הזמנה מאושרת. תוספות רק לאורח עם הזמנה מאושרת. אם הוא מזמין עכשיו, קודם סוגרים הזמנה.' };
  const id = newId('T');
  await addAddonRequest(ctx.env, { id, bookingId: b.id, addonId: addon.id, name: addon.name, price: addon.price, phone: b.phone, chat: ctx.channel === 'instagram' ? ctx.phone : null });
  await sendNotify(ctx.env, B.ownerPhone,
    `🎁 *בקשת תוספת* ${id}\n${addon.name}${addon.price ? ` (${nis(addon.price)})` : ''}\n${b.name}, ${b.aptName}, ${b.checkin} עד ${b.checkout}\n\nלאישור שלח: אושר ${id}\nלדחייה: בוטל ${id}`);
  return { request_id: id, note: `אמור לאורח שהבקשה הועברה ל${B.botName} והוא יאשר בהקדם. לא מבטיחים לפני האישור.` };
}
