// David's business, as the bot knows it. Everything here comes from the
// questionnaire (bot-form/david/). Until David's answers arrive, the values are
// examples, and DRAFT keeps the bot from going live with them.
//
// Question numbers in the comments point to the questionnaire section.

export const DRAFT = true; // switch to false only after every value below is David's real answer

export const BUSINESS = {
  botName: 'דוד',                 // §1 in whose name the bot answers
  voice: 'male',                   // §1 'male' | 'female'
  style: 'חם, קצר, בגובה העיניים. פונה בשם הפרטי.', // §1
  area: 'נתניה',                   // §2
  shabbat: 'הבוט עונה כרגיל, ומה שצריך את דוד ממתין למוצאי שבת', // §2
  timezone: 'Asia/Jerusalem',
  ownerPhone: '',                  // §7 David's number for alerts, digits only with country code, e.g. 9725XXXXXXXX
  cleanerPhone: '',                // §7 optional: gets the daily check-in/check-out list
  bookingFlow: 'owner_confirms',   // §4 'owner_confirms': David approves each booking | 'pay_to_confirm': paid deposit confirms
  depositPercent: 30,              // §4
  paymentLink: '',                 // §4 link the bot sends for the deposit (Bit / PayBox / credit page)
  cancellation: 'ביטול עד 14 יום לפני ההגעה: החזר מלא. פחות מזה: המקדמה לא מוחזרת.', // §4
  reviewLinks: { google: '', airbnb: '', booking: '' }, // §8
  urgent: 'תקלה בדירה בזמן שהייה (מים, חשמל, נעילה בחוץ), אורח כועס, קבוצה מעל 10 אנשים, בקשה לאירוע', // §6
  never: 'לא נותנים הנחה בלי אישור של דוד. לא שולחים קוד כניסה או כתובת מדויקת לפני שההזמנה אושרה.', // §6
  // §8 messages around the stay (Israel time). Set any hour to null to turn it off.
  stay: {
    reminderHour: 18,      // day before arrival: directions, door code, Wi-Fi
    welcomeHour: 15,       // arrival day: welcome + recommendations
    checkoutHour: 8,       // departure day: checkout time and what to do
    reviewHour: 14,        // departure day: ask for a review
    comebackDays: 120,     // days after departure: invite back (only to guests on the offers list)
    comebackOffer: '10% הנחה בהזמנה הבאה',
  },
  // §8 days before a free night that David gets a "send an offer?" nudge (Sun and Wed 10:00)
  lastMinuteDays: 7,
  // Guests who don't fit any apartment. David asked for leads only: collect the details
  // and send them to his private number, nothing else (no partner list, no commission tracking).
  referral: {
    mode: 'owner',                 // 'owner': lead goes to David | 'direct': straight to a partner, copy to David
    tellCustomer: 'quiet',         // 'quiet': "we'll find something and get back to you" | 'partners': say these are partner apartments
    trackCommission: false,        // true: lead message asks David to mark "נסגר R123 500", and the summary shows commissions
  },
};

// Us, not David: who gets technical alerts and the internal cost report.
export const AGENCY = {
  clientName: 'דוד',
  techPhone: '',          // the partner who handles problems, digits with country code (9725XXXXXXXX)
  reportPhones: [],       // who gets the weekly internal report (cost, errors). techPhone is added automatically
  dailyBudgetUsd: 2,      // alert if model spend in one day passes this (normal: ~0.2-0.4 on Haiku)
  usdToIls: 3.7,          // for showing costs in shekels
};

// §3, one block per apartment. From David (12.11.2026): price list "קו המים - מחירון",
// all three at גד מכנס 6, נתניה. Every apartment takes a couple + 2 children
// (+ a baby, free). Anything bigger is a lead for David (referral).
// Capacity: adults are 18+, children 2-17; infants (under 2) don't count.
// Prices are for a couple; extraChildPerNight is added per child per night.
const COMMON = {
  capacity: { maxAdults: 2, maxGuests: 4, infantsCount: false, maxInfants: 1 },
  minNights: 1,
  discountFromNights: 3,           // "הנחה נוספת בהזמנת 3 לילות ומעלה": David sets the final price
  lastMinuteDays: 1,               // "המחירים אינם כוללים הזמנות דקה 90": arrival today/tomorrow → David quotes
  ownerQuoteDates: [],             // holidays David prices himself: { label: 'פסח', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
  minNightsRanges: [],             // e.g. { from, to, minNights: 2 }
  checkIn: '15:00',                // TODO David
  checkOut: '11:00',               // TODO David. Leaving on Saturday = after Shabbat (in the package)
  checkoutNotes: '',
  location: 'נתניה',               // what the bot may say before a booking
  privateInfo: { address: 'גד מכנס 6, נתניה', door: '', wifi: '', parking: '' }, // sent only after confirmation
  icalUrls: [],
  photos: '',
  photoUrls: [],                   // https links to the photos (we host them on GitHub Pages)
  promo: '',
  nearby: '',
};

export const APARTMENTS = [
  {
    ...COMMON,
    id: 'apt1',
    name: 'קו המים 1',
    summary: '',                   // TODO David: rooms, beds, view
    prices: { weekday1: 800, weekday2: 600, thu: 1000, friToSatEve: 1500, friToSun: 1700, thuToSatEve: 2200, extraChildPerNight: 100, cleaningFee: 0 },
    features: [],                  // TODO David: e.g. 'jacuzzi', 'sea_view', 'parking', 'ac', 'wifi'
    rules: '',                     // TODO David
    amenities: '',                 // TODO David
  },
  {
    ...COMMON,
    id: 'apt2',
    name: 'קו המים 2',
    summary: '',
    prices: { weekday1: 900, weekday2: 700, thu: 1200, friToSatEve: 1500, friToSun: 1700, thuToSatEve: 2200, extraChildPerNight: 100, cleaningFee: 0 },
    features: [],
    rules: '',
    amenities: '',
  },
  {
    ...COMMON,
    id: 'apt3',
    name: 'קו המים 3',
    summary: '',
    prices: { weekday1: 1200, weekday2: 1000, thu: 1400, friToSatEve: 1700, friToSun: 2000, thuToSatEve: 2600, extraChildPerNight: 100, cleaningFee: 0 },
    features: [],
    rules: '',
    amenities: '',
  },
];

// §5 partner apartment owners David refers guests to and earns a commission from.
export const PARTNERS = [
  // { id: 'p1', name: 'יוסי', phone: '9725XXXXXXXX', area: '...', maxGuests: 8, priceFrom: 800, priceTo: 1400, features: ['pool'], commission: '10%' },
];

// WhatsApp templates (approved in Meta) for messages that go out more than 24 hours
// after the guest last wrote. Each body has {{1}} = guest name, {{2}} = the details.
// Suggested texts are in README.md. Empty name = try a normal message (works only
// inside 24 hours; failures alert the tech partner).
export const TEMPLATES = {
  reminder: { name: '', lang: 'he' },   // יום לפני ההגעה
  welcome:  { name: '', lang: 'he' },   // יום ההגעה
  checkout: { name: '', lang: 'he' },   // בוקר העזיבה
  review:   { name: '', lang: 'he' },   // בקשת ביקורת
  comeback: { name: '', lang: 'he' },   // הזמנה לחזור
  offer:    { name: '', lang: 'he' },   // מבצע לרשימת התפוצה (Marketing)
};

// Feature codes the bot can ask about. Keep in sync with features[] above.
export const FEATURES = {
  parking: 'חניה', balcony: 'מרפסת', ac: 'מזגן', wifi: 'Wi-Fi', crib: 'מיטת תינוק',
  yard: 'חצר', pool: 'בריכה', jacuzzi: "ג'קוזי", pets: 'מותר עם חיות', accessible: 'נגיש לנכים',
  elevator: 'מעלית', sea_view: 'נוף לים',
};
