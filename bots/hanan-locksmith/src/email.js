// התראות לבעל העסק במייל (כשאין לו מספר וואטסאפ נפרד מהמספר של העסק).
// כל מה שהבוט היה שולח לו בוואטסאפ מגיע במייל, עם כפתורים במקום פקודות: בדרך, תור, סיימתי, לא רלוונטי.
// נשלח מהג'ימייל של העסק (GMAIL_USER + סיסמת אפליקציה GMAIL_APP_PASSWORD) אל OWNER_EMAIL. בחינם.
import { BUSINESS } from './config.js';
import { displayPhone, nowIso } from './util.js';
import * as wa from './whatsapp.js';

export const ownerByEmail = (env) => !!env.OWNER_EMAIL;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const local = (phone) => (String(phone).startsWith('972') ? `0${String(phone).slice(3)}` : `+${phone}`);

// חתימה לקישורים במייל (תמונה של לקוח, דף פעולות), כדי שרק מי שקיבל את המייל יוכל לפתוח אותם
export async function sign(env, msg) {
  const secret = env.WA_VERIFY_TOKEN || env.ANTHROPIC_API_KEY || '';
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
  return [...sig.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEq(a, b) {
  a = String(a); b = String(b);
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const linkify = (line) => esc(line).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0b6bcb">${u.length > 60 ? `${u.slice(0, 57)}…` : u}</a>`);

async function buildHtml(env, text, about, media) {
  const lines = String(text).split('\n');
  const [title, ...rest] = lines;
  const origin = env.WORKER_URL || '';
  let actions = '';
  if (about && origin) {
    const k = await sign(env, `act:${about}`);
    const btn = (href, label, bg) => `<a href="${href}" style="display:inline-block;margin:4px;padding:12px 18px;border-radius:10px;background:${bg};color:#fff;text-decoration:none;font-weight:700;font-size:16px">${label}</a>`;
    actions = `<div style="margin:18px 0 6px">
${btn(`https://wa.me/${about}`, 'וואטסאפ ללקוח', '#1b7f3b')}
${btn(`${origin}/act?p=${about}&k=${k}`, 'בדרך / תור / סיימתי', '#0b6bcb')}
</div>`;
  }
  let photos = '';
  if (media.length && origin) {
    const items = [];
    for (const id of media.slice(0, 10)) {
      const k = await sign(env, `media:${id}`);
      const href = `${origin}/media?id=${encodeURIComponent(id)}&k=${k}`;
      items.push(String(id).startsWith('video:')
        ? `<p><a href="${href}" style="color:#0b6bcb">▶ סרטון מהלקוח</a></p>`
        : `<p><a href="${href}"><img src="${href}" alt="תמונה מהלקוח" style="max-width:100%;border-radius:8px"></a></p>`);
    }
    photos = `<div style="margin-top:12px">${items.join('')}</div>`;
  }
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.55;color:#16181d;max-width:640px">
<p style="font-size:19px;font-weight:700;margin:0 0 10px">${linkify(title)}</p>
${rest.map((l) => (l.trim() ? `<div>${linkify(l)}</div>` : '<div style="height:10px"></div>')).join('\n')}
${actions}${photos}
<p style="color:#8a929c;font-size:12px;margin-top:22px">נשלח אוטומטית מהבוט של ${esc(BUSINESS.shortName)}</p></div>`;
}

// שליחת מייל לבעל העסק. נכשל? נשמר, וה-cron מנסה שוב
export async function sendOwnerEmail(env, text, { about = null, media = [], now = new Date(), retry = false } = {}) {
  // לחיצה על כפתור בדף הפעולות: התשובה מוצגת בדף, לא נשלחת במייל
  if (env.__capture) { env.__capture.push(text); return { ok: true }; }
  const subject = String(text).split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 90) || `הבוט של ${BUSINESS.shortName}`;
  let ok = false;
  try {
    const html = await buildHtml(env, text, about, media);
    const mail = { to: env.OWNER_EMAIL, subject, text: String(text), html };
    if (env.__mail) await env.__mail(mail); else await smtpSend(env, mail);
    ok = true;
  } catch (err) {
    console.error('owner email failed', err);
  }
  if (!ok && !retry) {
    await env.DB.prepare('INSERT INTO owner_outbox (text, about, media, created_at, failed) VALUES (?, ?, ?, ?, 1)')
      .bind(text, about, media.length ? JSON.stringify(media) : null, nowIso(now)).run();
  }
  return { ok };
}

// מייל בדיקה (אחרי שמכניסים את סיסמת הג'ימייל): מחזיר בדיוק מה קרה, בלי לשמור לניסיון חוזר
// מייל בדיקה לחנן וגם לשולח (שלנו), עם כפתור אמיתי לדף "בדרך / תור / סיימתי" של טלפון הבדיקה,
// כדי לבדוק מהטלפון שהכתובת של הבוט נפתחת (למשל עם סינון כמו נטפרי)
export async function sendTestEmail(env, now = new Date()) {
  const origin = env.WORKER_URL || '';
  const testPhone = String(env.TEST_PHONES || '').split(',').map((p) => p.trim()).find((p) => /^\d{11,13}$/.test(p));
  const href = origin && testPhone ? `${origin}/act?p=${testPhone}&k=${await sign(env, `act:${testPhone}`)}` : origin ? `${origin}/health` : '';
  const text = `אם המייל הזה הגיע, ההתראות במייל עובדות.${href ? '\nלבדיקה: לחץ על הכפתור. אם נפתח דף, הכפתורים במיילים יעבדו גם אצלך.' : ''}\nנשלח מ-${env.GMAIL_USER} אל ${env.OWNER_EMAIL}, ${now.toISOString()}`;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif">${esc(text).replace(/\n/g, '<br>')}${href ? `<p><a href="${href}" style="display:inline-block;margin:4px;padding:12px 18px;border-radius:10px;background:#0b6bcb;color:#fff;text-decoration:none;font-weight:700;font-size:16px">בדרך / תור / סיימתי (בדיקה)</a></p>` : ''}</div>`;
  const to = [...new Set([env.OWNER_EMAIL, env.GMAIL_USER].filter(Boolean).map((e) => e.toLowerCase()))];
  try {
    for (const addr of to) {
      const mail = { to: addr, subject: `✅ מייל בדיקה מהבוט של ${BUSINESS.shortName}`, text: href ? `${text}\n${href}` : text, html };
      if (env.__mail) await env.__mail(mail); else await smtpSend(env, mail);
    }
    return `OK: נשלח מייל בדיקה אל ${to.join(', ')}`;
  } catch (err) {
    return `FAIL: ${String(err?.message || err).slice(0, 300)}`;
  }
}

// מיילים שלא יצאו: עוד ניסיון כל 15 דקות, עד 12 שעות
export async function retryOwnerEmails(env, now = new Date()) {
  const pending = (await env.DB.prepare('SELECT * FROM owner_outbox WHERE sent = 0 AND failed = 1 AND created_at >= ? ORDER BY id LIMIT 5')
    .bind(new Date(now.getTime() - 12 * 3600000).toISOString()).all()).results;
  for (const it of pending) {
    const r = await sendOwnerEmail(env, it.text || `📷 תמונות מהלקוח ${displayPhone(it.about || '')}`, { about: it.about, media: it.media ? JSON.parse(it.media) : [], now, retry: true });
    if (!r.ok) break;
    await env.DB.prepare('UPDATE owner_outbox SET sent = 1 WHERE id = ?').bind(it.id).run();
  }
}

// ---------- שליחה דרך Gmail (SMTP מאובטח, פורט 465) ----------
const b64 = (s) => wa.toBase64(new TextEncoder().encode(s));
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const encHeader = (s) => `=?UTF-8?B?${b64(s)}?=`;

export function buildMime({ from, fromName, to, subject, text, html }) {
  const boundary = `b${crypto.randomUUID().replace(/-/g, '')}`;
  return [
    `From: ${encHeader(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1] || 'bot'}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(html)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function smtpSend(env, { to, subject, text, html }) {
  const user = String(env.GMAIL_USER || '').trim();
  const pass = String(env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass || !to) throw new Error('email not configured (GMAIL_USER / GMAIL_APP_PASSWORD / OWNER_EMAIL)');
  const connect = env.__connect || (await import('cloudflare:sockets')).connect;
  const socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';
  const reply = async () => {
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          buf = lines.slice(i + 1).join('\r\n');
          return { code: +lines[i].slice(0, 3), text: lines.slice(0, i + 1).join(' | ') };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('smtp connection closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  const step = async (line, codes) => {
    if (line != null) await writer.write(enc.encode(`${line}\r\n`));
    const r = await reply();
    if (!codes.includes(r.code)) throw new Error(`smtp ${line ? line.split(' ')[0] : 'greeting'}: ${r.text.slice(0, 200)}`);
    return r;
  };
  const run = async () => {
    await step(null, [220]);
    await step('EHLO bot', [250]);
    await step(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, [235]);
    await step(`MAIL FROM:<${user}>`, [250]);
    await step(`RCPT TO:<${to}>`, [250, 251]);
    await step('DATA', [354]);
    const body = buildMime({ from: user, fromName: `הבוט של ${BUSINESS.shortName}`, to, subject, text, html }).replace(/\r\n\./g, '\r\n..');
    await step(`${body}\r\n.`, [250]);
    await writer.write(enc.encode('QUIT\r\n')).catch(() => {});
  };
  try {
    await Promise.race([run(), new Promise((_, rej) => setTimeout(() => rej(new Error('smtp timeout')), 20000))]);
  } finally {
    socket.close().catch(() => {});
  }
}

// ---------- הדפים שהקישורים במייל פותחים ----------

// תמונה או סרטון של לקוח (הבוט מוריד מוואטסאפ ומציג)
export async function serveMedia(env, url) {
  const id = url.searchParams.get('id') || '';
  if (!id || !safeEq(url.searchParams.get('k') || '', await sign(env, `media:${id}`))) return new Response('forbidden', { status: 403 });
  try {
    const realId = id.startsWith('video:') ? id.slice(6) : id;
    const m = await wa.downloadMedia(env, realId);
    return new Response(m.bytes, { headers: { 'content-type': m.mime.split(';')[0], 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex' } });
  } catch (err) {
    console.error('media proxy failed', err);
    return new Response('התמונה כבר לא זמינה בוואטסאפ', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

// הפעולות: אותן פקודות כמו בוואטסאפ. GET מציג כפתורים, ורק לחיצה (POST) מבצעת.
// ככה סורקי קישורים של תיבות מייל לא יפעילו פקודה בטעות
const ACTIONS = {
  eta: (p, f) => `בדרך ${p} ${Math.min(240, Math.max(1, parseInt(f.get('min'), 10) || 20))}`,
  appt: (p, f) => {
    const d = String(f.get('date') || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const t = String(f.get('time') || '').match(/^(\d{1,2}):(\d{2})/);
    if (!d || !t) return '';
    const addr = String(f.get('address') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return `תור ${p} ${d[3]}/${d[2]}/${d[1]} ${t[1].padStart(2, '0')}:${t[2]}${addr ? ` ${addr}` : ''}`;
  },
  done: (p) => `סיום ${p}`,
  handled: (p) => `טופל ${p}`,
  irrelevant: (p) => `לא רלוונטי ${p}`,
  cancel: (p) => `ביטול ${p}`,
  bot: (p) => `בוט ${p}`,
  learn: (p, f) => { const t = String(f.get('fact') || '').replace(/\s+/g, ' ').trim().slice(0, 500); return t.length >= 3 ? `למד ${t}` : ''; },
  block: (p) => `חסום ${p}`,
  quiet: (p) => `שקט ${p}`,
};

function page(title, body) {
  return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#f4f6f8;--card:#fff;--ink:#16181d;--mute:#5d6470;--line:#dfe3e8;--blue:#0b6bcb;--green:#1b7f3b}
@media (prefers-color-scheme:dark){:root{--bg:#111316;--card:#1a1d22;--ink:#eef0f3;--mute:#9aa3ae;--line:#2b3038;--blue:#5aa9ff;--green:#3fb06a}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:520px;margin:0 auto;padding:18px 16px 40px;display:grid;gap:14px}h1{font-size:21px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:10px}
.card h2{font-size:16px;margin:0;color:var(--mute)}.row{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 16px;cursor:pointer;background:var(--blue);color:#fff;flex:1 1 auto}
button.g{background:var(--green)}button.n{background:transparent;color:var(--ink);border:1px solid var(--line);font-weight:600}
input{font:inherit;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);flex:1 1 140px;min-width:0}
.msg{background:#e7f6ec;color:#14532d;border:1px solid #b7e1c4;border-radius:12px;padding:12px;white-space:pre-wrap}
a{color:var(--blue)}</style></head><body><main>${body}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export async function actionPage(env, request, url, runCommand) {
  const phone = String(url.searchParams.get('p') || '').replace(/\D/g, '');
  const k = url.searchParams.get('k') || '';
  if (!phone || !safeEq(k, await sign(env, `act:${phone}`))) return new Response('forbidden', { status: 403 });
  const cust = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(phone).first();
  const conv = await env.DB.prepare('SELECT issue, address FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(phone).first();
  const who = `${cust?.name || 'הלקוח'} · ${displayPhone(phone)}`;

  let result = '';
  if (request.method === 'POST') {
    const form = await request.formData();
    const make = ACTIONS[String(form.get('act') || '')];
    const cmd = make ? make(local(phone), form) : '';
    if (!cmd) result = 'חסר מידע (תאריך ושעה, או מה ללמד). נסה שוב.';
    else {
      const capture = [];
      await runCommand({ ...env, __capture: capture }, cmd, new Date(), null, env.OWNER_PHONE);
      result = capture.join('\n\n') || '✓ בוצע';
    }
  }
  const f = (act, label, cls = '', extra = '') => `<form method="post"><input type="hidden" name="act" value="${act}">${extra}<button class="${cls}">${label}</button></form>`;
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  return page(who, `<h1>${esc(who)}</h1>
${conv?.issue || conv?.address ? `<div style="color:var(--mute)">${esc([conv.issue, conv.address].filter(Boolean).join(' · '))}</div>` : ''}
${result ? `<div class="msg">${esc(result)}</div>` : ''}
<div class="card"><h2>אני בדרך. הלקוח מקבל הודעה עם זמן ההגעה</h2><div class="row">
${[15, 30, 45, 60].map((m) => f('eta', `${m} דק'`, '', `<input type="hidden" name="min" value="${m}">`)).join('')}</div></div>
<div class="card"><h2>קבעתי תור. הלקוח מקבל תזכורת יום לפני ושעתיים לפני</h2>
<form method="post" class="row"><input type="hidden" name="act" value="appt"><input type="date" name="date" value="${today}" aria-label="תאריך"><input type="time" name="time" value="10:00" aria-label="שעה"><input name="address" value="${esc(conv?.address || '')}" placeholder="כתובת" aria-label="כתובת"><button>קבע תור</button></form></div>
<div class="card"><h2>סיימתי</h2><div class="row">
${f('done', '✓ סיימתי את העבודה', 'g')}</div><div style="color:var(--mute);font-size:14px">דקה אחרי זה הלקוח מקבל בקשה לביקורת בגוגל (בין 07:00 ל-21:00, לא בשבת).</div></div>
<div class="card"><h2>עוד</h2><div class="row">
${f('handled', 'חזרתי אליו בטלפון', 'n')}${f('irrelevant', 'לא רלוונטי', 'n')}${f('cancel', 'העבודה בוטלה', 'n')}${f('quiet', 'מכיר אותו: שהבוט לא יענה לו', 'n')}${f('bot', 'שהבוט יענה לו', 'n')}${f('block', 'ספאם, לחסום', 'n')}</div></div>
<div class="card"><h2>ללמד את הבוט (מעכשיו הוא עונה ככה לכל הלקוחות)</h2>
<form method="post" class="row"><input type="hidden" name="act" value="learn"><input name="fact" placeholder="למשל: פריצת רכב עולה 250-400 ₪" aria-label="מה ללמד"><button>למד</button></form></div>
<p><a href="https://wa.me/${phone}">וואטסאפ ללקוח</a></p>`);
}
