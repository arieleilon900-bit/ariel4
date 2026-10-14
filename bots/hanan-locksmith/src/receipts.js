// שליחת קבלה ללקוח ורישום העבודה כגמורה (מה שמפעיל אחר כך בקשת ביקורת, המלצה ותזכורת שנתית).
// משמש גם את החיבור האוטומטי ליש חשבונית וגם את השליחה הידנית של חנן (מעביר PDF לבוט).
import { MESSAGES, TEMPLATES } from './config.js';
import { inServiceWindow, nowIso } from './util.js';
import { logEvent } from './handler.js';
import { upsertLead } from './sheets.js';
import * as wa from './whatsapp.js';

// doc = קישור ל-PDF או מזהה מדיה; docId = מזהה המסמך ביש חשבונית (אם יש), כדי לא לשלוח פעמיים
export async function deliverReceipt(env, phone, doc, { docId = null, filename = 'קבלה.pdf', now = new Date() } = {}) {
  const c = await env.DB.prepare('SELECT last_inbound_at FROM customers WHERE phone = ?').bind(phone).first();
  const r = inServiceWindow(c?.last_inbound_at, now)
    ? await wa.sendDocument(env, phone, doc, filename, MESSAGES.invoice)
    : await wa.sendTemplate(env, phone, TEMPLATES.invoice, [], doc, filename);

  let job = await env.DB.prepare("SELECT * FROM jobs WHERE phone = ? AND status IN ('open','done') AND invoice_sent_at IS NULL ORDER BY id DESC LIMIT 1").bind(phone).first();
  if (!job) {
    const res = await env.DB.prepare("INSERT INTO jobs (phone, status, done_at, created_at) VALUES (?, 'done', ?, ?)").bind(phone, nowIso(now), nowIso(now)).run();
    job = { id: res.meta?.last_row_id, status: 'done' };
    await env.DB.prepare('UPDATE customers SET jobs_count = jobs_count + 1 WHERE phone = ?').bind(phone).run();
  } else if (job.status === 'open') {
    await env.DB.prepare('UPDATE customers SET jobs_count = jobs_count + 1 WHERE phone = ?').bind(phone).run();
  }
  await env.DB.prepare("UPDATE jobs SET invoice_doc_id = ?, invoice_sent_at = ?, status = 'done', done_at = COALESCE(done_at, ?) WHERE id = ?")
    .bind(docId, nowIso(now), nowIso(now), job.id).run();
  await env.DB.prepare("UPDATE conversations SET state = 'closed', followup_sent = 1 WHERE phone = ? AND state IN ('bot','handoff')").bind(phone).run();
  if (r.ok) await logEvent(env, 'invoice', phone, now);
  await upsertLead(env, phone, { status: r.ok ? 'קבלה נשלחה, עבודה הסתיימה' : 'קבלה לא נשלחה (תקלה)', issue: job.issue, address: job.address, note: docId ? `מסמך ${docId}` : '' }, now);
  return r;
}
