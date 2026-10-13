// פונקציות עזר טהורות (בלי רשת), כדי שאפשר לבדוק אותן בקלות.

export const TZ = 'Asia/Jerusalem';

// 054-123-4567 / +972 54 1234567 / 972541234567 ← 972541234567
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00972')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 9) return '';
  return '972' + d;
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
