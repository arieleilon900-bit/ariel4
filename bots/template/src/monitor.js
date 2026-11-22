// Problems go to the partner who handles support (AGENCY.techPhone), not to David.
// Each kind of problem alerts at most once per 15 minutes; the rest are counted
// and show up in the weekly internal report.

import { logError, recentlyAlerted, markAlerted } from './store.js';
import { sendNotify } from './whatsapp.js';

const WINDOW = 15 * 60e3;

export async function reportProblem(ctx, kind, detail, extra = {}) {
  const env = ctx.env;
  console.error('[problem]', kind, detail);
  try {
    await logError(env, kind, detail);
    const to = ctx.agency?.techPhone;
    if (!to || (await recentlyAlerted(env, kind, WINDOW))) return;
    const lines = [
      `⚠️ *תקלה בבוט של ${ctx.agency.clientName || 'הלקוח'}*`,
      `סוג: ${kind}`,
      extra.guest ? `לקוח: +${extra.guest}` : null,
      `פרטים: ${String(detail).slice(0, 500)}`,
      extra.guest ? 'הלקוח קיבל תשובה כללית ("נחזור אליך"), צריך לבדוק ולחזור אליו.' : null,
      `שעה: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
    ].filter(Boolean);
    await sendNotify(env, to, lines.join('\n'));
    await markAlerted(env, kind);
  } catch (e) {
    // The alert itself failed (e.g. WhatsApp token expired). /health still shows it.
    console.error('alert failed', e);
  }
}
