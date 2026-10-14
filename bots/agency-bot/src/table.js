// טבלת הלקוחות של הבוט: דף שנפתח בטלפון, בלי הרשמה ובלי גוגל.
// הקישור מוגן במפתח שנגזר מהסוד של הבוט, וחנן מקבל אותו כשהוא כותב לבוט "טבלה".
import { BUSINESS } from './config.js';
import { displayPhone, ilParts, wazeLink } from './util.js';

export async function tableKey(env) {
  const secret = env.WA_VERIFY_TOKEN || env.ANTHROPIC_API_KEY || '';
  if (!secret) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('customer-table')));
  return [...sig.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function tableLink(env, origin = env.WORKER_URL) {
  const k = await tableKey(env);
  return origin && k ? `${origin}/table?k=${k}` : '';
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (iso) => { if (!iso) return ''; const p = ilParts(new Date(iso)); return `${p.d}/${p.m} ${p.hh}:${p.mm}`; };
// הכפתורים בטבלה: אותן פעולות כמו הפקודות בוואטסאפ
export const TABLE_ACTIONS = { done: 'סיום', cancel: 'ביטול', irrelevant: 'לא רלוונטי' };
const closed = (status) => /הסתיימה|בוטלה|לא רלוונטי|ויתר|ביקורת/.test(status || '');
const fallbackStatus = (state) => ({ bot: 'בשיחה עם הבוט', handoff: `הועבר ל${BUSINESS.ownerName}`, closed: 'נסגר' }[state] || state);

async function rows(env) {
  return (await env.DB.prepare(
    `SELECT c.*, cu.name AS cname FROM conversations c LEFT JOIN customers cu ON cu.phone = c.phone
     WHERE c.state != 'spam' AND (COALESCE(cu.known, 0) = 0 OR c.lead_status IS NOT NULL)
     ORDER BY c.id DESC LIMIT 500`,
  ).all()).results;
}

export async function renderTable(env, url) {
  const list = await rows(env);
  if (url.searchParams.get('format') === 'csv') {
    const head = ['תאריך פנייה', 'סטטוס', 'שם', 'טלפון', 'תקלה', 'כתובת', 'דחוף', 'הערות', 'מה קרה'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(q).join(',')].concat(list.map((r) => [day(r.started_at), r.lead_status || fallbackStatus(r.state), r.cname, displayPhone(r.phone), r.issue, r.address, r.urgent ? 'כן' : '', r.lead_note, r.lead_log].map(q).join(',')));
    return new Response(`﻿${lines.join('\r\n')}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="customers.csv"' } });
  }
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const week = list.filter((r) => r.started_at >= weekAgo);
  const done = list.filter((r) => /הסתיימה/.test(r.lead_status || '')).length;
  const trs = list.map((r) => {
    const status = r.lead_status || fallbackStatus(r.state);
    const nav = r.address ? `<a href="${esc(wazeLink({ address: r.address }))}">${esc(r.address)}</a>` : '';
    return `<tr data-q="${esc([r.cname, r.phone, displayPhone(r.phone), r.issue, r.address, status].join(' '))}">
<td>${esc(day(r.started_at))}</td><td><b>${esc(status)}</b>${r.urgent ? ' <span class="u">דחוף</span>' : ''}</td>
<td>${esc(r.cname || '')}</td><td><a href="https://wa.me/${esc(r.phone)}">${esc(displayPhone(r.phone))}</a></td>
<td>${esc(r.issue || '')}</td><td>${nav}</td><td class="s">${esc(r.lead_note || '')}</td><td class="s">${esc(r.lead_log || '')}</td>
<td class="act">${closed(status) ? '' : `<form method="post" action="/table/action" onsubmit="return confirm('לסמן שהעבודה הסתיימה? הלקוח יקבל בקשה לביקורת בגוגל.')"><input type="hidden" name="k" value="${esc(url.searchParams.get('k'))}"><input type="hidden" name="phone" value="${esc(r.phone)}"><input type="hidden" name="act" value="done"><button class="ok">✓ טופל</button></form>
<form method="post" action="/table/action" onsubmit="return confirm('לסגור את הפנייה בלי ביקורת?')"><input type="hidden" name="k" value="${esc(url.searchParams.get('k'))}"><input type="hidden" name="phone" value="${esc(r.phone)}"><input type="hidden" name="act" value="irrelevant"><button class="no">לא רלוונטי</button></form>`}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>לקוחות · ${esc(BUSINESS.shortName)}</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#16181d;--mute:#5d6470;--line:#e3e6eb;--acc:#0b6bcb;--u:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#111316;--card:#1a1d22;--ink:#eef0f3;--mute:#9aa3ae;--line:#2b3038;--acc:#5aa9ff;--u:#ff6b6b}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
header{padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
h1{font-size:19px;margin:0}.stats{display:flex;gap:8px;flex-wrap:wrap}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px 10px;color:var(--mute)}
.stat b{color:var(--ink)}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit}
.bar{padding:0 16px 12px;display:flex;gap:8px}.bar a{white-space:nowrap;align-self:center;color:var(--acc)}
.wrap{overflow-x:auto;padding:0 16px 24px}table{border-collapse:collapse;width:100%;min-width:900px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}th{background:var(--bg);color:var(--mute);font-weight:600;position:sticky;top:0}
td.s{color:var(--mute);font-size:13px;max-width:280px}td.act{white-space:nowrap}td.act form{display:inline}
button{font:inherit;border-radius:8px;padding:6px 10px;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);margin:2px}
button.ok{background:#1b7f3b;border-color:#1b7f3b;color:#fff;font-weight:600}button.no{color:var(--mute)}
.flash{margin:0 16px 12px;padding:10px 12px;border-radius:10px;background:#e7f6ec;color:#14532d;border:1px solid #b7e1c4}a{color:var(--acc);text-decoration:none}.u{color:var(--u);font-weight:700;font-size:12px}
.empty{padding:32px;text-align:center;color:var(--mute)}</style></head><body>
<header><h1>הלקוחות של ${esc(BUSINESS.shortName)}</h1><div class="stats"><span class="stat">השבוע: <b>${week.length}</b> פניות</span><span class="stat">דחופות: <b>${week.filter((r) => r.urgent).length}</b></span><span class="stat">עבודות שהסתיימו: <b>${done}</b></span><span class="stat">סה"כ: <b>${list.length}</b></span></div></header>
${url.searchParams.get('ok') ? `<div class="flash">✓ ${esc(url.searchParams.get('ok'))}</div>` : ''}<div class="bar"><input id="q" placeholder="חיפוש: שם, טלפון, תקלה, כתובת" autocomplete="off"><a href="?k=${esc(url.searchParams.get('k'))}&format=csv">הורדה לאקסל</a></div>
<div class="wrap">${list.length ? `<table><thead><tr><th>תאריך</th><th>סטטוס</th><th>שם</th><th>טלפון</th><th>תקלה</th><th>כתובת</th><th>הערות</th><th>מה קרה</th><th></th></tr></thead><tbody>${trs}</tbody></table>` : '<div class="empty">עוד אין פניות. ברגע שלקוח יכתוב, הוא יופיע כאן.</div>'}</div>
<script>const q=document.getElementById('q');q&&q.addEventListener('input',()=>{const v=q.value.trim();document.querySelectorAll('tbody tr').forEach(t=>{t.style.display=!v||t.dataset.q.includes(v)?'':'none'})})</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

// לחיצה על כפתור בטבלה: מבצעים את אותה פקודה כאילו בעל העסק כתב אותה בוואטסאפ (כולל אישור אליו בוואטסאפ)
export async function tableAction(env, request, url, runCommand) {
  const form = await request.formData();
  const k = String(form.get('k') || '');
  const back = (msg) => Response.redirect(`${url.origin}/table?k=${encodeURIComponent(k)}${msg ? `&ok=${encodeURIComponent(msg)}` : ''}`, 303);
  const phone = String(form.get('phone') || '').replace(/\D/g, '');
  const cmd = TABLE_ACTIONS[String(form.get('act') || '')];
  if (!cmd || !phone) return back('');
  const known = await env.DB.prepare('SELECT 1 FROM conversations WHERE phone = ? LIMIT 1').bind(phone).first();
  if (!known) return back('');
  const local = phone.startsWith('972') ? `0${phone.slice(3)}` : `+${phone}`;
  await runCommand(env, `${cmd} ${local}`, new Date(), null, env.OWNER_PHONE);
  return back(cmd === 'סיום' ? `סומן כגמור: ${displayPhone(phone)}. בעוד כמה שעות הלקוח יקבל בקשה לביקורת` : `נסגר: ${displayPhone(phone)}`);
}
