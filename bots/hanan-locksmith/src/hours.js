// מתי מותר לשלוח הודעות יזומות (לא תשובות): ללקוחות ולחנן.
import { BUSINESS } from './config.js';
import { ilParts, isHoliday, isShabbat } from './util.js';

// יום מנוחה: שבת (לפי השקיעה אם חנן שומר שבת, אחרת כל יום שבת), וחגים
export function restNow(now = new Date()) {
  if (isHoliday(BUSINESS.holidays, now)) return true;
  return BUSINESS.shabbat?.enabled ? isShabbat(now) : ilParts(now).dow === 6;
}

// הודעות יזומות ללקוחות: 07:00-21:00 (אריאל)
export function customerHours(now = new Date()) {
  const hh = +ilParts(now).hh;
  return !restNow(now) && hh >= 7 && hh < 21;
}

// תזכורות לחנן: 07:00-22:00, רק בימים שהוא עובד (לא בשישי, שבת וחגים). דחוף מגיע אליו תמיד
export function ownerHours(now = new Date()) {
  const p = ilParts(now);
  const workday = !BUSINESS.hours || BUSINESS.hours.days.includes(p.dow);
  return workday && !restNow(now) && +p.hh >= 7 && +p.hh < 22;
}
