// רישום לטבלת גוגל (Google Sheets) עם Service Account. אם SHEET_ID ריק, לא עושה כלום.

let cachedToken = null; // { token, exp }

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`google token ${res.status} ${JSON.stringify(data)}`);
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

export const SHEET_HEADERS = ['תאריך', 'מה קרה', 'שם', 'טלפון', 'תקלה', 'כתובת', 'דחוף', 'הערות'];
let headerChecked = false;

// גיליון ריק: כותבים שורת כותרות לפני השורה הראשונה
export async function ensureHeader(env, token) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values`;
  const res = await fetch(`${base}/${encodeURIComponent('A1:H1')}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sheets read ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.values?.[0]?.length) {
    const w = await fetch(`${base}/${encodeURIComponent('A1:H1')}?valueInputOption=RAW`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [SHEET_HEADERS] }),
    });
    if (!w.ok) throw new Error(`sheets header ${w.status} ${await w.text()}`);
    return 'created';
  }
  return 'exists';
}

export { getAccessToken };

// שורה בגיליון. עמודות: תאריך | מה קרה | שם | טלפון | תקלה | כתובת | דחוף | הערות
export async function appendRow(env, values) {
  if (!env.SHEET_ID || !env.GOOGLE_SA_JSON) return false;
  try {
    const token = await getAccessToken(env);
    if (!headerChecked) { await ensureHeader(env, token).catch((e) => console.error('sheet header', e)); headerChecked = true; }
    const range = encodeURIComponent('A:H');
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [values] }) },
    );
    if (!res.ok) console.error('sheets append failed', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('sheets error', err);
    return false;
  }
}
