// יומן גוגל: כל תור שבעל העסק קובע ("תור ...") נכנס גם ליומן שלו, וביטול מוחק אותו.
// משתמש באותו Service Account של הגיליון (GOOGLE_SA_JSON). בעל העסק משתף את היומן שלו עם המייל של ה-Service Account
// ("ביצוע שינויים באירועים"), ו-CALENDAR_ID = המייל של היומן (בדרך כלל ה-Gmail שלו). אם CALENDAR_ID ריק, לא עושה כלום.

import { getAccessToken } from './sheets.js';
import { displayPhone } from './util.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TZ = 'Asia/Jerusalem';

export const calendarConfigured = (env) => !!(env.CALENDAR_ID && env.GOOGLE_SA_JSON);

const eventsUrl = (env, id = '') => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.CALENDAR_ID)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;

// אורך התור ביומן בדקות (CALENDAR_EVENT_MINUTES, ברירת מחדל 60)
const eventMinutes = (env) => Math.max(5, Number(env.CALENDAR_EVENT_MINUTES) || 60);

export function buildEvent(env, { phone, name, issue, address, at }) {
  const end = new Date(at.getTime() + eventMinutes(env) * 60000);
  const who = name || displayPhone(phone);
  return {
    summary: issue ? `${who} · ${issue}` : who,
    location: address || undefined,
    description: [`טלפון: ${displayPhone(phone)}`, `וואטסאפ: https://wa.me/${phone}`, issue ? `פנייה: ${issue}` : null, 'נקבע דרך הבוט'].filter(Boolean).join('\n'),
    start: { dateTime: at.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
  };
}

// מכניס תור ליומן ומחזיר את המזהה שלו (או null אם היומן לא מחובר). שגיאה נזרקת, והקורא מחליט מה לעשות
export async function addAppointment(env, details) {
  if (!calendarConfigured(env)) return null;
  const token = await getAccessToken(env, SCOPE);
  const res = await fetch(eventsUrl(env), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildEvent(env, details)),
  });
  if (!res.ok) throw new Error(`calendar insert ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

// מוחק תור מהיומן. אירוע שכבר נמחק ביד (404 / 410) נחשב הצלחה
export async function removeAppointment(env, eventId) {
  if (!calendarConfigured(env) || !eventId) return false;
  const token = await getAccessToken(env, SCOPE);
  const res = await fetch(eventsUrl(env, eventId), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`calendar delete ${res.status} ${await res.text()}`);
  return true;
}

// בדיקה (setup): יש גישה ליומן? קורא אירוע אחד בלבד
export async function checkCalendar(env) {
  const token = await getAccessToken(env, SCOPE);
  const res = await fetch(`${eventsUrl(env)}?maxResults=1`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`calendar ${res.status} ${(await res.text()).slice(0, 200)}`);
  return true;
}
