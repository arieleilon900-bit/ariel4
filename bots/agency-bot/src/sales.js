// בוט המכירות של עונה ראשון: שיחה עם בעל מקצוע לפי ההנחיה של אליה (sales-bot-prompt-v3.md).
// דמו חי, חישוב, הצעה, קישור למקדמה וקליטה. התראות לאליה ולאריאל במייל (HOT_LEAD / PAID / HANDOFF),
// מעקב רק בתוך 24 שעות מההודעה האחרונה של הפונה, ושמירת המודעה שממנה הגיע (referral).
import Anthropic from '@anthropic-ai/sdk';
import { SALES, TEMPLATES } from './config.js';
import { displayPhone, hoursBetween, ilDateTimeLabel, ilParts, nowIso } from './util.js';
import { customerHours } from './hours.js';
import { safeEq, sendOwnerEmail, sign } from './email.js';
import * as wa from './whatsapp.js';

const AI_TIMEOUT_MS = 18000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STAGES = ['opening', 'demo', 'calc', 'offer', 'objection', 'payment', 'onboarding', 'done', 'other'];
const EVENTS = ['none', 'hot_lead', 'paid', 'handoff', 'opt_out', 'followup_ok'];
const LEAD_FIELDS = ['name', 'trade', 'city', 'business_name', 'weekly_unanswered', 'job_value'];

export const SALES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['replies', 'stage', 'price_given', 'event', 'handoff_reason', 'lead', 'onboarding_notes'],
  properties: {
    replies: { type: 'array', items: { type: 'string' } },
    stage: { type: 'string', enum: STAGES },
    price_given: { type: 'boolean' },
    event: { type: 'string', enum: EVENTS },
    handoff_reason: { type: 'string' },
    lead: {
      type: 'object', additionalProperties: false, required: LEAD_FIELDS,
      properties: Object.fromEntries(LEAD_FIELDS.map((k) => [k, { type: 'string' }])),
    },
    onboarding_notes: { type: 'string' },
  },
};

// הערכים מ-wrangler.toml גוברים על ברירות המחדל שב-client.js
export function salesValues(env) {
  return {
    SETUP_PRICE: env.SALES_SETUP_PRICE || SALES.setupPrice || '',
    DEPOSIT: env.SALES_DEPOSIT || SALES.deposit || '',
    PAYMENT_LINK: env.PAYMENT_LINK && !/^REPLACE/.test(env.PAYMENT_LINK) ? env.PAYMENT_LINK : '',
  };
}

const OUTPUT_RULES = `## איך מחזירים תשובה (טכני, לא לפונה)
מחזירים JSON בלבד:
- replies: ההודעות לשלוח עכשיו, 1 עד 3, כל אחת עד 25 מילים (חוץ מדוגמת המייל, שורת הטבלה ודוגמת הסיכום). כל ציטוט בהנחיה הוא הודעה נפרדת.
- stage: איפה השיחה עכשיו: opening, demo (הוא בתוך הדמו), calc (שאלות החישוב), offer, objection, payment (נשלח קישור), onboarding (שאלות הקליטה), done (הקליטה הסתיימה), other.
- price_given: true אם בהודעות האלה, או קודם בשיחה, אמרת לו את המחיר.
- event: hot_lead כשהוא סיים את החישוב (שלב 3) או שאל על מחיר. paid כשהוא כתב ששילם. handoff לפי "העברה לבני אדם". opt_out כשהוא כתב "לא מעוניין", "תסיר" או "לא". followup_ok כשהוא הסכים שתכתבי לו עוד יומיים. אחרת none.
- handoff_reason: למה מעבירים לבני אדם, במשפט אחד. אחרת ריק.
- lead: מה שידוע עליו עד עכשיו (שם, מקצוע, עיר, שם העסק, הודעות בשבוע שנשארות בלי תשובה, שווי עבודה). לא ידוע: ריק. לא ממציאים.
- onboarding_notes: כל תשובות הקליטה שהוא נתן עד עכשיו, שורה לכל שאלה. לפני הקליטה: ריק.
- אם אין קישור תשלום בהנחיה (כתוב "קישור למקדמה: אין"), לא שולחים קישור: אומרים שאליה או אריאל שולחים לו את הקישור כאן, ו-event=handoff.`;

export function salesSystemPrompt(env) {
  const v = salesValues(env);
  const text = String(SALES.prompt || '')
    .replaceAll('{SETUP_PRICE}', v.SETUP_PRICE)
    .replaceAll('{DEPOSIT}', v.DEPOSIT)
    .replaceAll('{PAYMENT_LINK}', v.PAYMENT_LINK || '(קישור למקדמה: אין)');
  return `${text}\n\n${OUTPUT_RULES}`;
}

function liveContext(now, lead) {
  const p = ilParts(now);
  const known = lead ? LEAD_FIELDS.filter((k) => lead[k]).map((k) => `${k}: ${lead[k]}`).join(', ') : '';
  let ref = '';
  try { const r = lead?.referral ? JSON.parse(lead.referral) : null; if (r?.headline) ref = `הגיע ממודעה: "${r.headline}"`; } catch { /* בלי מודעה */ }
  return [
    `עכשיו בישראל: ${ilDateTimeLabel(now)}${p.dow === 6 ? ' (שבת)' : p.dow === 5 && +p.hh >= 13 ? ' (שישי אחרי הצהריים)' : ''}.`,
    known ? `מה שכבר ידוע עליו: ${known}.` : '',
    ref,
  ].filter(Boolean).join('\n');
}

export function fallbackSales(reason) {
  return {
    replies: ['שנייה, משהו נתקע אצלי. אני מעבירה לאליה ולאריאל, והם ממשיכים איתך כאן.'],
    stage: 'other', price_given: false, event: 'handoff', handoff_reason: `תקלה ב-AI (${reason})`,
    lead: Object.fromEntries(LEAD_FIELDS.map((k) => [k, ''])), onboarding_notes: '', failed: true,
  };
}

export async function runSalesTurn(env, { history, image = null, now = new Date(), lead = null }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const messages = [];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${m.text}`;
    else messages.push({ role, content: m.text });
  }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(פנייה חדשה)' });
  if (image) {
    const lastMsg = messages[messages.length - 1];
    lastMsg.content = [
      { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
      { type: 'text', text: String(lastMsg.content) },
    ];
  }
  try {
    const response = await client.beta.messages.create({
      model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: salesSystemPrompt(env), cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: liveContext(now, lead) },
      ],
      messages,
      output_config: { effort: env.CLAUDE_EFFORT || 'low', format: { type: 'json_schema', schema: SALES_SCHEMA } },
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return fallbackSales(response.stop_reason);
    const out = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    out.replies = (out.replies || []).map((r) => String(r).trim()).filter(Boolean).slice(0, 3);
    if (!out.replies.length) return fallbackSales('empty');
    return out;
  } catch (err) {
    console.error('sales turn failed', err);
    return fallbackSales(err instanceof Anthropic.APIError ? `error ${err.status ?? ''}`.trim() : 'error');
  }
}

async function getLead(env, phone, now, referral) {
  await env.DB.prepare('INSERT OR IGNORE INTO sales_leads (phone, created_at, updated_at) VALUES (?, ?, ?)').bind(phone, nowIso(now), nowIso(now)).run();
  // המודעה הראשונה שממנה הגיע נשארת (בשביל הדוח: איזו מודעה הביאה אותו)
  if (referral) {
    const r = { source_id: referral.source_id || '', source_type: referral.source_type || '', source_url: referral.source_url || '', headline: referral.headline || '', ctwa_clid: referral.ctwa_clid || '' };
    await env.DB.prepare('UPDATE sales_leads SET referral = COALESCE(referral, ?) WHERE phone = ?').bind(JSON.stringify(r), phone).run();
  }
  return env.DB.prepare('SELECT * FROM sales_leads WHERE phone = ?').bind(phone).first();
}

// שליחת ההתראה לאליה ולאריאל (כל כתובת ב-SALES_ALERT_EMAILS מקבלת מייל משלה)
async function alertHumans(env, text, now) {
  const to = String(env.SALES_ALERT_EMAILS || env.OWNER_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const addr of to) await sendOwnerEmail({ ...env, OWNER_EMAIL: addr }, text, { now });
}

async function actionLinks(env, phone) {
  if (!env.WORKER_URL) return '';
  const k = await sign(env, `sales:${phone}`);
  const link = (s, label) => `${label}: ${env.WORKER_URL}/sales/mark?p=${phone}&s=${s}&k=${k}`;
  return ['', link('called', 'התקשרתי'), link('scheduled', 'נקבע חיבור'), link('irrelevant', 'לא רלוונטי')].join('\n');
}

async function transcript(env, convId, max = 6000) {
  const rows = (await env.DB.prepare('SELECT role, text FROM messages WHERE conv_id = ? ORDER BY id').bind(convId).all()).results;
  const t = rows.map((r) => `${r.role === 'assistant' ? 'הבוט' : 'הוא'}: ${r.text}`).join('\n');
  return t.length > max ? `…${t.slice(-max)}` : t;
}

function leadLines(lead, phone) {
  let ref = '';
  try { const r = lead.referral ? JSON.parse(lead.referral) : null; if (r) ref = `מודעה: ${r.headline || r.source_id || r.source_url || 'כן'}`; } catch { /* */ }
  return [
    `שם: ${lead.name || '(לא נמסר)'} · מקצוע: ${lead.trade || '(לא נמסר)'} · עיר: ${lead.city || '(לא נמסרה)'}`,
    lead.business_name ? `שם העסק: ${lead.business_name}` : '',
    `הודעות בשבוע בלי תשובה: ${lead.weekly_unanswered || '?'} · שווי עבודה: ${lead.job_value || '?'}`,
    `טלפון: ${displayPhone(phone)} · וואטסאפ: https://wa.me/${phone}`,
    ref,
  ].filter(Boolean).join('\n');
}

// תשובה לבעל מקצוע שכתב למספר של עונה ראשון
export async function salesRespond(env, { conv, phone, content, msg, now = new Date() }) {
  let lead = await getLead(env, phone, now, msg?.referral);
  if (lead.opted_out) return;
  const history = (await env.DB.prepare("SELECT role, text FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY id").bind(conv.id).all()).results;
  const r = await runSalesTurn(env, { history, image: content.image || null, now, lead });

  // ההודעות, אחת אחרי השנייה: הראשונה מיד, השאר בהפרש של 1-3 שניות
  const gap = () => (env.SALES_GAP_MS != null ? +env.SALES_GAP_MS : 1000 + Math.floor(Math.random() * 2000));
  for (let i = 0; i < r.replies.length; i++) {
    if (i > 0) await sleep(gap());
    await wa.sendText(env, phone, r.replies[i]);
    await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, r.replies[i], nowIso(now)).run();
  }

  // מה ידוע עליו (לא מוחקים ערך קיים בערך ריק)
  const sets = []; const vals = [];
  for (const k of LEAD_FIELDS) if (r.lead?.[k]) { sets.push(`${k} = ?`); vals.push(String(r.lead[k]).slice(0, 200)); }
  if (r.onboarding_notes) { sets.push('onboarding = ?'); vals.push(String(r.onboarding_notes).slice(0, 4000)); }
  sets.push('stage = ?', 'updated_at = ?'); vals.push(r.stage, nowIso(now));
  if (r.stage === 'demo') sets.push(`demo_at = COALESCE(demo_at, '${nowIso(now)}')`);
  if (r.price_given) sets.push(`price_at = COALESCE(price_at, '${nowIso(now)}')`);
  await env.DB.prepare(`UPDATE sales_leads SET ${sets.join(', ')} WHERE phone = ?`).bind(...vals, phone).run();
  lead = await env.DB.prepare('SELECT * FROM sales_leads WHERE phone = ?').bind(phone).first();

  if (r.event === 'opt_out') {
    await env.DB.prepare('UPDATE sales_leads SET opted_out = 1 WHERE phone = ?').bind(phone).run();
    await env.DB.prepare('UPDATE customers SET opted_out = 1 WHERE phone = ?').bind(phone).run();
  }
  if (r.event === 'followup_ok') await env.DB.prepare('UPDATE sales_leads SET followup_ok_at = COALESCE(followup_ok_at, ?) WHERE phone = ?').bind(nowIso(now), phone).run();

  const links = await actionLinks(env, phone);
  if (r.event === 'hot_lead' && !lead.hot_sent_at) {
    await env.DB.prepare('UPDATE sales_leads SET hot_sent_at = ? WHERE phone = ?').bind(nowIso(now), phone).run();
    await alertHumans(env, `🔥 HOT_LEAD: ${lead.name || displayPhone(phone)} (${lead.trade || 'בעל מקצוע'})\n${leadLines(lead, phone)}${links}`, now);
  }
  if (r.event === 'paid' && !lead.paid_at) {
    await env.DB.prepare('UPDATE sales_leads SET paid_at = ? WHERE phone = ?').bind(nowIso(now), phone).run();
    await alertHumans(env, `💰 PAID: ${lead.name || displayPhone(phone)} כתב ששילם מקדמה. צריך לבדוק שהתשלום הגיע ולתאם יום חיבור\n${leadLines(lead, phone)}${links}\n\nהשיחה:\n${await transcript(env, conv.id)}`, now);
  }
  if (r.stage === 'done' && lead.paid_at && !lead.done_sent_at) {
    await env.DB.prepare('UPDATE sales_leads SET done_sent_at = ? WHERE phone = ?').bind(nowIso(now), phone).run();
    await alertHumans(env, `✅ הקליטה הסתיימה: ${lead.name || displayPhone(phone)}\n${leadLines(lead, phone)}\n\nתשובות הקליטה:\n${lead.onboarding || '(אין)'}\n\nהשיחה (כולל השיחות שהעביר):\n${await transcript(env, conv.id, 15000)}${links}`, now);
  }
  // העברה לבני אדם: לכל היותר מייל אחד בחצי שעה לאותו אדם
  const recentHandoff = lead.handoff_at && (now.getTime() - new Date(lead.handoff_at).getTime()) < 30 * 60000;
  if (r.event === 'handoff' && !recentHandoff) {
    await env.DB.prepare('UPDATE sales_leads SET handoff_at = ? WHERE phone = ?').bind(nowIso(now), phone).run();
    await alertHumans(env, `🙋 HANDOFF: ${lead.name || displayPhone(phone)} צריך בן אדם\nהסיבה: ${r.handoff_reason || '(לא נמסרה)'}\n${leadLines(lead, phone)}${links}\n\nהשיחה:\n${await transcript(env, conv.id)}`, now);
  }
  return r;
}

// הודעות המעקב, מתוך ההנחיה (סעיף "מעקב"). רק בתוך 24 שעות מההודעה האחרונה שלו, לכל היותר שתיים
export const FOLLOWUPS = {
  demo: 'רוצה לראות מה היית מקבל במייל על הפנייה הזו?',
  price: 'שאלה אחת וזהו: מה עוצר אותך, המחיר או משהו אחר?',
};

export async function salesFollowups(env, now = new Date()) {
  if (!customerHours(now)) return;
  const rows = (await env.DB.prepare(`SELECT l.*, c.last_inbound_at, c.opted_out AS c_opt FROM sales_leads l JOIN customers c ON c.phone = l.phone
    WHERE l.opted_out = 0 AND l.paid_at IS NULL AND c.last_inbound_at IS NOT NULL`).all()).results;
  for (const l of rows) {
    if (l.c_opt) continue;
    const h = hoursBetween(l.last_inbound_at, now);
    const sentFree = (l.fu_demo_at ? 1 : 0) + (l.fu_price_at ? 1 : 0);
    // הבוט ענה אחרון (הוא זה שלא חזר)
    const conv = await env.DB.prepare('SELECT id FROM conversations WHERE phone = ? ORDER BY id DESC LIMIT 1').bind(l.phone).first();
    const last = conv && await env.DB.prepare("SELECT role FROM messages WHERE conv_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 1").bind(conv.id).first();
    const waiting = last?.role === 'assistant';
    const send = async (text, col) => {
      const res = await wa.sendText(env, l.phone, text);
      if (!res?.ok) return;
      await env.DB.prepare(`UPDATE sales_leads SET ${col} = ? WHERE phone = ?`).bind(nowIso(now), l.phone).run();
      if (conv) await env.DB.prepare("INSERT INTO messages (conv_id, role, text, created_at) VALUES (?, 'assistant', ?, ?)").bind(conv.id, text, nowIso(now)).run();
    };
    if (waiting && sentFree < 2 && h < 23.5) {
      if (l.stage === 'demo' && !l.fu_demo_at && h >= 2) { await send(FOLLOWUPS.demo, 'fu_demo_at'); continue; }
      if (l.price_at && !l.fu_price_at && h >= 20) { await send(FOLLOWUPS.price, 'fu_price_at'); continue; }
    }
    // אחרי 24 שעות: רק תבנית מאושרת, פעם אחת ביום 3, ורק למי שהסכים
    if (l.followup_ok_at && !l.fu_day3_at && h >= 48 && hoursBetween(l.followup_ok_at, now) >= 48) {
      const res = await wa.sendTemplate(env, l.phone, TEMPLATES.salesFollowup || 'sales_followup_v1', []);
      if (res?.ok) await env.DB.prepare('UPDATE sales_leads SET fu_day3_at = ? WHERE phone = ?').bind(nowIso(now), l.phone).run();
    }
  }
}

// הכפתורים במייל: התקשרתי / נקבע חיבור / לא רלוונטי
export async function markLead(env, url) {
  const phone = url.searchParams.get('p') || '';
  const status = url.searchParams.get('s') || '';
  const k = url.searchParams.get('k') || '';
  const labels = { called: 'התקשרתי', scheduled: 'נקבע חיבור', irrelevant: 'לא רלוונטי' };
  if (!labels[status] || !/^\d{8,15}$/.test(phone) || !safeEq(k, await sign(env, `sales:${phone}`))) return new Response('קישור לא תקין', { status: 403 });
  await env.DB.prepare('UPDATE sales_leads SET status = ?, updated_at = ? WHERE phone = ?').bind(status, nowIso(), phone).run();
  // לא רלוונטי: גם המעקב נעצר
  if (status === 'irrelevant') await env.DB.prepare('UPDATE sales_leads SET opted_out = 1 WHERE phone = ?').bind(phone).run();
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;direction:rtl;padding:24px"><h2>✓ נרשם: ${labels[status]}</h2><p>${displayPhone(phone)}</p></body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// דוח שבועי לאליה ולאריאל: כמה פנו, מאיזו מודעה, כמה חמים, כמה שילמו
export async function salesWeeklyReport(env, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400000).toISOString();
  const rows = (await env.DB.prepare('SELECT * FROM sales_leads WHERE created_at >= ?').bind(since).all()).results;
  const byAd = {};
  for (const l of rows) {
    let ad = 'בלי מודעה';
    try { const r = l.referral ? JSON.parse(l.referral) : null; if (r) ad = r.headline || r.source_id || 'מודעה'; } catch { /* */ }
    const x = (byAd[ad] ||= { n: 0, hot: 0, paid: 0 });
    x.n++; if (l.hot_sent_at) x.hot++; if (l.paid_at) x.paid++;
  }
  const lines = Object.entries(byAd).sort((a, b) => b[1].n - a[1].n).map(([ad, x]) => `${ad}: ${x.n} פנו · ${x.hot} חמים · ${x.paid} שילמו`);
  const text = [`📊 בוט המכירות, 7 הימים האחרונים: ${rows.length} בעלי מקצוע כתבו`, '', ...(lines.length ? lines : ['אף אחד לא כתב השבוע.'])].join('\n');
  await alertHumans(env, text, now);
}
