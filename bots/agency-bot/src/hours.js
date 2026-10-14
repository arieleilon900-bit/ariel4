// מתי מותר לשלוח הודעות יזומות (לא תשובות): ללקוחות ולחנן.
import { BUSINESS } from './config.js';
import { ilParts, isShabbat } from './util.js';

// יום מנוחה: שבת לפי השקיעה אם חנן שומר שבת, אחרת כל יום שבת
export function restNow(now = new Date()) {
  return BUSINESS.shabbat?.enabled ? isShabbat(now) : ilParts(now).dow === 6;
}

// הודעות יזומות ללקוחות: 08:00-21:00
export function customerHours(now = new Date()) {
  const hh = +ilParts(now).hh;
  return !restNow(now) && hh >= 8 && hh < 21;
}

// תזכורות לחנן: 07:00-22:00
export function ownerHours(now = new Date()) {
  const hh = +ilParts(now).hh;
  return !restNow(now) && hh >= 7 && hh < 22;
}
