// UltraMsg: ההודעות מגיעות במבנה אחר מזה של Meta. כאן הופכים אותן למבנה של Meta,
// כדי שכל שאר הבוט יעבוד בדיוק אותו דבר.
// message_received = לקוח (או חנן ממספר ההתראות) כתב למספר של העסק.
// message_create + fromMe = נשלח מהמספר של העסק: או שהבוט שלח, או שחנן כתב מהטלפון. הבוט רושם כל מה שהוא שולח,
// ומה שלא נמצא ברשימה נחשב כהודעה של חנן (ואז הבוט מפסיק לדבר עם הלקוח הזה).

const digits = (jid) => String(jid || '').split('@')[0].replace(/\D/g, '');
const isPrivate = (jid) => /@c\.us$/.test(String(jid || ''));

function toMetaMessage(d) {
  const msg = { from: digits(d.from), id: String(d.id), timestamp: String(d.time || '') };
  const q = d.quotedMsg && typeof d.quotedMsg === 'object' ? d.quotedMsg : null;
  if (q && (q.id || q.body)) msg.context = { id: String(q.id || ''), body: String(q.body || '') };
  const caption = d.body && !/^https?:\/\//.test(d.body) ? d.body : '';
  switch (d.type) {
    case 'chat': return { ...msg, type: 'text', text: { body: String(d.body || '') } };
    case 'image': return { ...msg, type: 'image', image: { id: d.media, caption } };
    case 'ptt': case 'audio': return { ...msg, type: 'audio', audio: { id: d.media } };
    case 'document': return { ...msg, type: 'document', document: { id: d.media, filename: d.filename || caption || 'file', mime_type: d.mimetype || '', caption } };
    case 'location': {
      const l = d.location || {};
      const [lat, lng] = String(d.body || '').split(',').map(Number);
      return { ...msg, type: 'location', location: { latitude: l.latitude ?? (Number.isFinite(lat) ? lat : undefined), longitude: l.longitude ?? (Number.isFinite(lng) ? lng : undefined), name: l.description || '' } };
    }
    case 'revoked': case 'e2e_notification': case 'notification_template': case 'gp2': case 'call_log':
      return { ...msg, type: 'system' };
    default: return { ...msg, type: d.type || 'unsupported' };
  }
}

// גוף ה-webhook של UltraMsg ← גוף במבנה של Meta (או null אם אין מה לעשות איתו)
export async function ultraToMeta(env, payload, now = new Date()) {
  const d = payload?.data || {};
  const ev = payload?.event_type;
  if (ev === 'message_received' && !d.fromMe) {
    if (!isPrivate(d.from)) return null; // קבוצות וסטטוסים: לא עונים
    return { entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: digits(d.from), profile: { name: d.pushname || '' } }], messages: [toMetaMessage(d)] } }] }] };
  }
  if (ev === 'message_create' && d.fromMe) {
    if (!isPrivate(d.to)) return null;
    const phone = digits(d.to);
    const body = String(d.body || '').trim();
    // להשוואה עם מה שהבוט שלח: בלי הבדלים של רווחים וירידות שורה
    const flat = body.replace(/\s+/g, ' ').trim();
    // הבוט שלח את זה? (נרשם בשליחה, ב-15 הדקות האחרונות)
    const since = new Date(now.getTime() - 15 * 60000).toISOString();
    const mine = d.type === 'chat'
      ? await env.DB.prepare('SELECT id FROM ultra_sent WHERE phone = ? AND body = ? AND created_at >= ? ORDER BY id LIMIT 1').bind(phone, flat, since).first()
      : await env.DB.prepare('SELECT id FROM ultra_sent WHERE phone = ? AND created_at >= ? ORDER BY id DESC LIMIT 1').bind(phone, since).first();
    if (mine) { await env.DB.prepare('DELETE FROM ultra_sent WHERE id = ?').bind(mine.id).run(); return null; }
    // ההודעות של הבוט לחנן (מספר ההתראות) לא נחשבות "חנן ענה"
    if (phone === env.OWNER_PHONE || phone === env.ADMIN_PHONE) return null;
    return { entry: [{ changes: [{ field: 'smb_message_echoes', value: { message_echoes: [{ from: digits(d.from), to: phone, id: String(d.id), type: d.type === 'chat' ? 'text' : d.type, text: { body } }] } }] }] };
  }
  return null;
}
