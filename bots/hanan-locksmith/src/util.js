// פונקציות עזר טהורות (בלי רשת), כדי שאפשר לבדוק אותן בקלות.

export const TZ = 'Asia/Jerusalem';

// 054-123-4567 / +972 54 1234567 / 972541234567 ← 972541234567
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00972')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  // רק מספרים ישראליים אמיתיים: נייד 05X / 07X (9 ספרות), נייח 02/03/04/08/09 (8 ספרות)
  const ok = (d.length === 9 && /^[57]/.test(d)) || (d.length === 8 && /^[23489]/.test(d));
  return ok ? '972' + d : '';
}

// 972541234567 ← 054-1234567 (לתצוגה)
export function displayPhone(intl) {
  const d = String(intl ?? '');
  if (!d.startsWith('972')) return d;
  const local = '0' + d.slice(3);
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3)}` : local;
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}

export function addHours(date, h) {
  return new Date(new Date(date).getTime() + h * 3600000);
}

export function hoursBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

// חלקי תאריך ושעה בשעון ישראל
export function ilParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(new Date(date)).map((p) => [p.type, p.value]),
  );
  const dayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return { y: +parts.year, m: +parts.month, d: +parts.day, hh: parts.hour === '24' ? '00' : parts.hour, mm: parts.minute, dow: dayIdx };
}

export function ilTime(date) {
  const p = ilParts(date);
  return `${p.hh}:${p.mm}`;
}

export function ilDateTimeLabel(date) {
  const p = ilParts(date);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `יום ${days[p.dow]} ${p.d}/${p.m} בשעה ${p.hh}:${p.mm}`;
}

// "היום" / "מחר" / "ביום חמישי 17/10" בשעון ישראל
export function whenLabel(target, now = new Date()) {
  const t = ilParts(target), n = ilParts(now);
  const dayNum = (p) => Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  const diff = dayNum(t) - dayNum(n);
  const time = `${t.hh}:${t.mm}`;
  if (diff === 0) return `היום ב-${time}`;
  if (diff === 1) return `מחר ב-${time}`;
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `ביום ${days[t.dow]} ${t.d}/${t.m} ב-${time}`;
}

// ממיר "17/10 14:30" או "17/10/2026 14:30" לתאריך UTC, לפי שעון ישראל
export function parseIlDateTime(dateStr, timeStr, now = new Date()) {
  const dm = String(dateStr).match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  const tm = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const n = ilParts(now);
  let y = dm[3] ? +dm[3] : n.y;
  if (y < 100) y += 2000;
  const mo = +dm[2], d = +dm[1], hh = +tm[1], mi = +tm[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
  // 31/2 וכדומה: תאריך שלא קיים
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // בלי שנה, ותאריך שכבר עבר (למשל 2/1 שנכתב בדצמבר): השנה הבאה
  if (!dm[3] && Date.UTC(y, mo - 1, d) < Date.UTC(n.y, n.m - 1, n.d)) y += 1;
  // מחשבים את הפרש השעון של ישראל באותו רגע (חורף/קיץ)
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mi));
  const p = ilParts(guess);
  const offsetMin = (Date.UTC(p.y, p.m - 1, p.d, +p.hh, +p.mm) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - offsetMin * 60000);
}

// האם עכשיו בשעות העבודה (hours=null פירושו 24/7)
export function isOpen(hours, now = new Date()) {
  if (!hours) return true;
  const p = ilParts(now);
  if (!hours.days.includes(p.dow)) return false;
  const cur = `${p.hh}:${p.mm}`;
  return cur >= hours.from && cur < hours.to;
}

// קישור ניווט בוויז
export function wazeLink({ lat, lng, address }) {
  if (lat != null && lng != null) return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  if (address) return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
  return '';
}

// האם עדיין בחלון 24 השעות מההודעה האחרונה של הלקוח (אז מותר טקסט חופשי)
export function inServiceWindow(lastInboundAt, now = new Date()) {
  if (!lastInboundAt) return false;
  return hoursBetween(lastInboundAt, now) < 23.5;
}

// שעת השקיעה (UTC) ביום מסוים, לפי נוסחת NOAA המקוצרת. דיוק של דקה-שתיים.
// ברירת מחדל: מרכז הארץ (תל אביב)
export function sunsetUtc(y, m, d, lat = 32.08, lon = 34.78) {
  const rad = Math.PI / 180;
  const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const lngHour = lon / 15;
  const t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634) % 360;
  if (L < 0) L += 360;
  let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  const H = Math.acos(cosH) / rad / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = (((T - lngHour) % 24) + 24) % 24;
  return new Date(Date.UTC(y, m - 1, d) + UT * 3600000);
}

// שבת: מ-30 דקות לפני השקיעה ביום שישי ועד 45 דקות אחרי השקיעה בשבת
export function isShabbat(now = new Date(), beforeMin = 30, afterMin = 45) {
  const p = ilParts(now);
  if (p.dow === 5) return now.getTime() >= sunsetUtc(p.y, p.m, p.d).getTime() - beforeMin * 60000;
  if (p.dow === 6) return now.getTime() < sunsetUtc(p.y, p.m, p.d).getTime() + afterMin * 60000;
  return false;
}
