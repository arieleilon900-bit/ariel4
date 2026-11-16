// המחירון האמיתי של דוד ("קו המים - מחירון"), תקף עד 1/3/2027. אסור לטעות כאן.
// הפונקציה הזו משמשת גם את השרת (AI) וגם את הדף (תוכנית ב'), כדי ששני המוחות ייתנו אותו מחיר בדיוק.
export const DAVID_PRICES = {
  1: { one: 800, two: 600, thu: 1000, fm: 1500, fs: 1700, tm: 2200, kid: 0 },
  2: { one: 900, two: 700, thu: 1200, fm: 1500, fs: 1700, tm: 2200, kid: 0 },
  3: { one: 1200, two: 1000, thu: 1400, fm: 1700, fs: 2000, tm: 2600, kid: 100 },
};
export const PRICES_VALID_UNTIL = '2027-03-01'; // לילה בתאריך הזה ואילך: אין מחיר, דוד נותן בעצמו
// nights: מערך של { dow: 0-6 (0=ראשון), iso: 'YYYY-MM-DD' } לפי הסדר. kids: ילדים (לא תינוק) מעבר לזוג
export function priceStay(p, nights, { kids = 0, todayIso = '' } = {}) {
  const flags = [], lines = [];
  if (!nights.length) return { total: 0, lines, flags: ['no_nights'] };
  if (nights.some((n) => n.iso >= PRICES_VALID_UNTIL)) return { total: null, lines, flags: ['after_valid'] };
  if (nights.length > 6) return { total: null, lines, flags: ['long_stay'] };
  const mid = nights.filter((n) => n.dow <= 3), has = (d) => nights.some((n) => n.dow === d);
  const thu = has(4), fri = has(5), sat = has(6);
  let total = 0;
  // בלוק סוף שבוע
  if (thu && fri && sat) { const v = p.tm + (p.fs - p.fm); lines.push({ label: 'חמישי עד ראשון', price: v }); total += v; flags.push('thu_to_sun'); }
  else if (thu && fri) { lines.push({ label: 'חמישי עד מוצ"ש', price: p.tm }); total += p.tm; }
  else if (fri && sat) { lines.push({ label: 'שישי עד ראשון', price: p.fs }); total += p.fs; }
  else if (fri) { lines.push({ label: 'שישי עד מוצ"ש', price: p.fm }); total += p.fm; }
  else if (thu) { lines.push({ label: 'חמישי', price: p.thu }); total += p.thu; }
  else if (sat) { flags.push('sat_only'); return { total: null, lines, flags }; }
  // אמצע שבוע
  if (mid.length) {
    const rate = nights.length >= 2 ? p.two : p.one;
    lines.push({ label: mid.length === 1 ? (nights.length >= 2 ? 'לילה באמצע שבוע (במחיר של הזמנת 2 לילות)' : 'לילה אחד באמצע שבוע') : `${mid.length} לילות באמצע שבוע × ${rate.toLocaleString('he-IL')} ₪`, price: rate * mid.length });
    total += rate * mid.length;
    if (thu || fri || sat) flags.push('mixed');
  }
  if (p.kid && kids > 0) { const v = p.kid * kids * nights.length; lines.push({ label: `תוספת ${kids === 1 ? 'ילד' : kids + ' ילדים'} (100 ₪ לילד ללילה)`, price: v }); total += v; }
  if (nights.length >= 3) flags.push('extra_discount_3plus');
  if (todayIso && nights[0].iso <= todayIso) flags.push('last_minute');
  return { total, lines, flags };
}
export const FLAG_TEXT = {
  thu_to_sun: 'חמישי עד ראשון לא מופיע במחירון: המחיר מחושב (חמישי עד מוצ"ש + ההפרש עד ראשון), דוד יאשר',
  mixed: 'שילוב של אמצע שבוע וסוף שבוע: דוד יאשר את המחיר הסופי',
  extra_discount_3plus: 'בהזמנה של 3 לילות ומעלה יש הנחה נוספת: דוד יחזור עם המחיר הסופי (לא ממציאים סכום)',
  last_minute: 'הזמנה של דקה 90 (היום/מחר): המחירון לא כולל אותה, דוד נותן מחיר',
  after_valid: 'המחירון תקף עד 1/3. לתאריכים אחרי זה אין מחיר: דוד יחזור עם מחיר',
  sat_only: 'ליל שבת לבד לא מופיע במחירון: דוד נותן מחיר',
  long_stay: 'שהות ארוכה: דוד נותן מחיר',
};
