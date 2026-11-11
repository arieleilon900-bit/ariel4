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
  area: 'לא ידוע עדיין',           // §2
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
  referral: {
    mode: 'owner',                 // §5 'owner': lead goes to David | 'direct': straight to the partner, copy to David
    tellCustomer: 'partners',      // §5 'partners': say these are partner apartments | 'quiet': just say someone will call
  },
};

// §3, one block per apartment. Capacity: maxAdults/maxGuests count adults+children;
// infants (under 2) count only if infantsCount is true.
export const APARTMENTS = [
  {
    id: 'apt1',
    name: 'דירה 1 (דוגמה)',
    summary: 'דירת 2 חדרים לזוג, מרפסת, 5 דקות מהים',
    capacity: { maxAdults: 2, maxGuests: 2, infantsCount: false, maxInfants: 1 },
    prices: { weeknight: 450, weekend: 600, cleaningFee: 150 },
    seasons: [ // holiday / high-season ranges override regular prices (inclusive dates)
      { label: 'קיץ', from: '2027-07-01', to: '2027-08-31', weeknight: 550, weekend: 750, minNights: 2 },
    ],
    weekendNights: [5, 6],         // 5 = Friday night, 6 = Saturday night
    minNights: 1,
    minNightsWeekend: 2,
    checkIn: '15:00', checkOut: '11:00',
    features: ['parking', 'balcony', 'ac', 'wifi'],
    rules: 'בלי עישון, בלי חיות, בלי אירועים',
    amenities: 'מטבח מאובזר, מכונת קפה, מגבות ומצעים, מזגן',
    photos: '',                    // link to photos / video
    location: '',                  // general area for customers (exact address only after confirmation)
    privateInfo: { address: '', door: '', wifi: '', parking: '' }, // sent only after booking is confirmed
    icalUrls: [],                  // Airbnb / Booking / Google calendar export links
    promo: '',
    nearby: '',
  },
  {
    id: 'apt2',
    name: 'דירה 2 (דוגמה)',
    summary: 'דירת 3 חדרים למשפחה קטנה',
    capacity: { maxAdults: 2, maxGuests: 3, infantsCount: false, maxInfants: 1 },
    prices: { weeknight: 550, weekend: 700, cleaningFee: 180 },
    seasons: [],
    weekendNights: [5, 6],
    minNights: 2,
    minNightsWeekend: 2,
    checkIn: '15:00', checkOut: '11:00',
    features: ['parking', 'ac', 'wifi', 'crib'],
    rules: 'בלי עישון, בלי אירועים',
    amenities: 'מטבח מאובזר, מיטת תינוק, מכונת כביסה',
    photos: '', location: '',
    privateInfo: { address: '', door: '', wifi: '', parking: '' },
    icalUrls: [], promo: '', nearby: '',
  },
  {
    id: 'apt3',
    name: 'דירה 3 (דוגמה)',
    summary: 'הדירה הכי גדולה: זוג ושני ילדים',
    capacity: { maxAdults: 2, maxGuests: 4, infantsCount: false, maxInfants: 1 },
    prices: { weeknight: 700, weekend: 900, cleaningFee: 200 },
    seasons: [],
    weekendNights: [5, 6],
    minNights: 2,
    minNightsWeekend: 2,
    checkIn: '15:00', checkOut: '11:00',
    features: ['parking', 'ac', 'wifi', 'crib', 'yard'],
    rules: 'בלי עישון, בלי אירועים',
    amenities: 'חצר, מנגל, 2 חדרי שינה, מטבח מאובזר',
    photos: '', location: '',
    privateInfo: { address: '', door: '', wifi: '', parking: '' },
    icalUrls: [], promo: '', nearby: '',
  },
];

// §5 partner apartment owners David refers guests to and earns a commission from.
export const PARTNERS = [
  // { id: 'p1', name: 'יוסי', phone: '9725XXXXXXXX', area: '...', maxGuests: 8, priceFrom: 800, priceTo: 1400, features: ['pool'], commission: '10%' },
];

// Feature codes the bot can ask about. Keep in sync with features[] above.
export const FEATURES = {
  parking: 'חניה', balcony: 'מרפסת', ac: 'מזגן', wifi: 'Wi-Fi', crib: 'מיטת תינוק',
  yard: 'חצר', pool: 'בריכה', jacuzzi: "ג'קוזי", pets: 'מותר עם חיות', accessible: 'נגיש לנכים',
  elevator: 'מעלית', sea_view: 'נוף לים',
};
