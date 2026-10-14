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
import init6 from '../migrations/0006_outbox_retry.sql';

export { processWebhook, runEvery15, weeklyReport, ilDateTimeLabel, ilParts, displayPhone, parseIlDateTime };

const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function makeD1(SQL) {
  const db = new SQL.Database();
  db.exec(init1);
  db.exec(init2);
  db.exec(init3);
  db.exec(init4);
  db.exec(init5);
  db.exec(init6);
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
