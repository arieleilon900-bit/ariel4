// 4 שיחות מדומות של בוט המכירות עם ה-AI האמיתי (סעיף 7 ב-README של אליה). שום דבר לא נשלח בוואטסאפ.
// רץ ב-GitHub Actions (Deploy agency bots ← sales_sim), כי שם יש את המפתח של Anthropic.
// הודעה קולית: כאן היא מגיעה כמו שהבוט מקבל אותה אחרי התמלול ("[הודעה קולית] ..."). את התמלול עצמו בודקים בהקלטה אמיתית למספר.
import { applyClient } from '../src/config.js';
import { runSalesTurn } from '../src/sales.js';
import client from '../clients/oneh-rishon-sales/client.js';

applyClient(client);
const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  SALES_SETUP_PRICE: '3,500', SALES_DEPOSIT: '500', PAYMENT_LINK: process.env.PAYMENT_LINK || 'https://pay.example/deposit',
};
const VOICE = '[הודעה קולית] יש לי סתימה בכיור, אני בהרצל בנתניה';
const SCENARIOS = [
  { title: 'אינסטלטור, כל המסלול עד תשלום', turns: ['היי, אני אינסטלטור ורוצה לראות איך זה עובד', VOICE, 'במטבח, מאתמול', 'כן', 'נראה טוב', 'בערך 5', '500', 'כן תשלח', 'שילמתי', 'יוסי אינסטלציה'], voiceTurn: 1 },
  { title: 'חשמלאי: "יקר" ואחר כך "אני צריך לחשוב"', turns: ['היי, אני חשמלאי', 'כמה זה עולה?', 'יקר', 'לעומת מה שזה מחזיר', '3', '800', 'אני צריך לחשוב', 'המחיר'] },
  { title: '"את בוט?"', turns: ['היי ראיתי מודעה', 'את בוט?', 'מנעולן'], botTurn: 1 },
  { title: 'הודעה קולית ראשונה', turns: [VOICE], voiceTurn: 0 },
];
const BOTISH = /אשמח לעזור|כיצד אוכל|פנייתך התקבלה|להלן|בהחלט|שאלה מצוינת/;
const words = (s) => s.trim().split(/\s+/).length;
const now = new Date();
let problems = 0;
const warn = (m) => { problems++; console.log(`   ⚠ ${m}`); };

for (const sc of SCENARIOS) {
  console.log(`\n===== ${sc.title} =====`);
  const history = [];
  for (let i = 0; i < sc.turns.length; i++) {
    history.push({ role: 'user', text: sc.turns[i] });
    console.log(`\nהוא: ${sc.turns[i]}`);
    const r = await runSalesTurn(env, { history, now });
    if (r.failed) warn(`ה-AI לא ענה (${r.handoff_reason})`);
    for (const t of r.replies) {
      console.log(`בוט: ${t}`);
      history.push({ role: 'assistant', text: t });
      if (BOTISH.test(t)) warn('שפת בוט');
      if (words(t) > 30 && !/[·📍🔴🟢]/.test(t)) warn(`הודעה ארוכה (${words(t)} מילים)`);
    }
    console.log(`   [שלב: ${r.stage}${r.event !== 'none' ? `, אירוע: ${r.event}` : ''}${r.price_given ? ', נתן מחיר' : ''}]`);
    const all = r.replies.join(' ');
    if (i === sc.voiceTurn && !/סתימה|כיור|הרצל|נתניה/.test(all)) warn('לא חזר על פרט מההודעה הקולית');
    if (i === sc.botTurn && !/AI|דיגיטלית/.test(all)) warn('לא ענה בכנות שהיא בוט');
    if (/\{(SETUP_PRICE|DEPOSIT|PAYMENT_LINK)\}/.test(all)) warn('נשאר משתנה לא מוחלף');
  }
}
console.log(`\n${problems ? `⚠ ${problems} דברים לבדוק` : '✓ כל השיחות עברו את הבדיקות האוטומטיות'}`);
