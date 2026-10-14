// דף הניסיון: מריץ את הקוד האמיתי של הבוט בדפדפן.
// במקום Cloudflare D1: מסד נתונים SQLite בדפדפן (sql.js). במקום וואטסאפ: ההודעות מוצגות על המסך.
import { processWebhook } from '../src/index.js';
import { runEvery15, weeklyReport } from '../src/cron.js';
import { ilDateTimeLabel, ilParts, displayPhone, parseIlDateTime } from '../src/util.js';
import init1 from '../migrations/0001_init.sql';
import init2 from '../migrations/0002_settings.sql';
import init3 from '../migrations/0003_knowledge.sql';
import init4 from '../migrations/0004_ultramsg.sql';
import init5 from '../migrations/0005_leads.sql';

export { processWebhook, runEvery15, weeklyReport, ilDateTimeLabel, ilParts, displayPhone, parseIlDateTime };

const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function makeD1(SQL) {
  const db = new SQL.Database();
  db.exec(init1);
  db.exec(init2);
  db.exec(init3);
  db.exec(init4);
  db.exec(init5);
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = norm(a); return stmt; },
        async run() {
          db.run(sql, args);
          const changes = db.getRowsModified();
          const last = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
          return { meta: { changes, last_row_id: Number(last) } };
        },
        async first() {
          const s = db.prepare(sql); s.bind(args);
          const r = s.step() ? s.getAsObject() : null; s.free();
          return r;
        },
        async all() {
          const s = db.prepare(sql); s.bind(args);
          const rows = []; while (s.step()) rows.push(s.getAsObject()); s.free();
          return { results: rows };
        },
      };
      return stmt;
    },
  };
}

// fetch מדומה: כל מה שהבוט שולח לוואטסאפ מגיע ל-onSend
export function installFetch({ onSend, media }) {
  let seq = 0;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('https://graph.facebook.com')) {
      if (url.endsWith('/messages')) {
        const body = JSON.parse(init.body);
        if (body.status === 'read') return Response.json({ success: true });
        const id = `wamid.sim${++seq}`;
        onSend(body, id);
        return Response.json({ messages: [{ id }] });
      }
      if (url.endsWith('/media')) {
        const file = init.body.get('file');
        const id = `media.up${++seq}`;
        media.set(id, { blob: file, mime: file.type });
        return Response.json({ id });
      }
      const id = url.split('/').pop();
      const m = media.get(id);
      if (!m) return new Response('not found', { status: 404 });
      return Response.json({ url: `sim-media://${id}`, mime_type: m.mime });
    }
    if (url.startsWith('sim-media://')) {
      const m = media.get(url.slice('sim-media://'.length));
      return new Response(m.blob, { status: 200 });
    }
    return realFetch(url, init);
  };
}

// ===== סוגי העסקים בדף הניסיון =====
import { applyClient, BUSINESS } from '../src/config.js';
import locksmith from '../clients/demo-locksmith/client.js';
import ac from '../clients/demo-ac/client.js';
import plumber from '../clients/demo-plumber/client.js';
import electrician from '../clients/demo-electrician/client.js';
import beauty from '../clients/demo-beauty/client.js';

export { applyClient, BUSINESS };
export const PRESETS = [
  { slug: 'locksmith', label: 'מנעולן', client: locksmith, location: 'הרצל 5, חולון',
    samples: ['היי, ננעלתי מחוץ לבית', 'יש ילד נעול באוטו!', 'כמה עולה להחליף צילינדר?', 'Hi, I am locked out'],
    learn: 'למד החלפת צילינדר עולה 250-450 ש"ח כולל הגעה', ask: 'כמה עולה צילינדר?' },
  { slug: 'ac', label: 'טכנאי מזגנים', client: ac, location: 'הנשיא 12, רחובות',
    samples: ['המזגן מטפטף מים בסלון', 'המזגן לא מקרר ויש לי תינוקת בבית', 'כמה עולה ניקוי מזגן?', 'מופיע קוד E1 על המזגן'],
    learn: 'למד ניקוי מזגן עילי עולה 250 ש"ח', ask: 'כמה עולה ניקוי?' },
  { slug: 'plumber', label: 'אינסטלטור', client: plumber, location: 'מוריה 40, חיפה',
    samples: ['יש סתימה בכיור במטבח', 'צינור התפוצץ והכל מוצף!', 'אין מים חמים מאתמול', 'כמה עולה לפתוח סתימה?'],
    learn: 'למד פתיחת סתימה מתחילה מ-350 ש"ח', ask: 'כמה עולה סתימה?' },
  { slug: 'electrician', label: 'חשמלאי', client: electrician, location: 'רגר 100, באר שבע',
    samples: ['קפץ החשמל ולא עולה', 'יש ריח שרוף מהשקע!', 'רוצה להתקין גוף תאורה בסלון', 'כמה עולה ביקור?'],
    learn: 'למד ביקור חשמלאי עולה 250 ש"ח כולל חצי שעה עבודה', ask: 'כמה עולה ביקור?' },
  { slug: 'beauty', label: 'קליניקה', client: beauty, location: '',
    samples: ['היי, רציתי לשאול על טיפול פנים', 'כמה עולה הסרת שיער בלייזר?', 'יש לי אדמומיות ונפיחות אחרי הטיפול אתמול', 'אפשר תור לשבוע הבא?'],
    learn: 'למד טיפול פנים בסיסי עולה 320 ש"ח ולוקח שעה', ask: 'כמה עולה טיפול פנים?' },
];
