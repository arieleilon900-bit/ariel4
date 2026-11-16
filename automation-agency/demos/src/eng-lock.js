/* ================= המנעולן: אבי (עסק לדוגמה) ================= */
const OWNER = 'אבי';
const LABELS = { name: 'שם', problem: 'מה קרה', urgent: 'דחיפות', city: 'איפה', when: 'מתי', details: 'פרטים', questions: 'שאל על' };
const LFAQ = [
  { k: 'מחיר', re: /כמה (זה )?עול|מחיר|כמה זה|כמה יוצא|עלות|כמה לוקח(ים)? כסף/, a: () => `המחיר תלוי בסוג הדלת והמנעול, ו${OWNER} נותן אותו בטלפון לפני שהוא יוצא, בלי הפתעות 👍` },
  { k: 'זמן הגעה', re: /תוך כמה זמן|מתי (אתה )?(מגיע|תגיע)|כמה זמן (לוקח|עד)|מהר/, a: () => S.urgent === 'חירום' ? `בחירום ${OWNER} מגיע תוך חצי שעה עד 40 דקות 🚗` : `${OWNER} יחזור אליך לתאם שעה שנוחה לך.` },
  { k: 'אזור', re: /איזה אזור|באיזה ערים|עובד ב|מגיע ל|גם ל/, a: () => 'אנחנו עובדים בכל אזור השרון: נתניה, כפר יונה, אבן יהודה, תל מונד והסביבה.' },
  { k: 'נזק', re: /נזק|תשבור|לשבור|בלי לשבור|יהרוס/, a: () => 'ברוב המקרים פותחים בלי שום נזק לדלת 👌' },
  { k: 'חשבונית', re: /חשבונית|קבלה|אשראי|ביט|תשלום/, a: () => 'אפשר לשלם באשראי, ביט או מזומן, ומקבלים חשבונית מסודרת.' },
  { k: 'שבת', re: /שבת|חג/, a: () => 'בשבת ובחג רק מקרי חירום.' },
];
function newState() { return { stage: 'start', problem: '', urgent: '', city: '', when: '', name: '', details: '', danger: false, asked: {}, agreed: false, route: 'owner', questions: [] }; }
let S = newState();
function parse(text) {
  const t = ' ' + text + ' ', f = {};
  if (/ילד|תינוק|ילדה|כלב|חתול|בעל חיים|אדם/.test(t) && /נעול|ננעל|תקוע|סגור|בפנים|ברכב|באוטו/.test(t)) { S.danger = true; S.urgent = 'חירום'; f.problem = 1; S.problem = S.problem || 'מישהו נעול בפנים'; }
  if (/גז|עשן|שריפה|אש/.test(t)) { S.danger = true; S.urgent = 'חירום'; }
  const P = [[/ננעלתי|נשארתי בחוץ|נעלתי את עצמי|המפתח בפנים|לא יכול להיכנס|לא יכולה להיכנס|נטרקה|נסגרה הדלת/, 'ננעל בחוץ, צריך פריצה'], [/רכב|אוטו|מכונית/, 'פתיחת רכב'], [/צילינדר|להחליף מנעול|החלפת מנעול|מנעול חדש|החלפת צילינדר/, 'החלפת צילינדר / מנעול'], [/כספת/, 'פתיחת כספת'], [/איבדתי|נגנב|גנבו|אבד/, 'מפתחות אבדו או נגנבו'], [/שכפול|לשכפל|מפתח נוסף/, 'שכפול מפתחות'], [/נשבר|תקוע|לא נפתח|לא ננעל|המפתח לא מסתובב/, 'מנעול תקוע או שבור'], [/פריצה|פרצו|אחרי פריצה/, 'אחרי פריצה, צריך לתקן ולהחליף']];
  for (const [re, v] of P) if (re.test(t)) { S.problem = S.problem && S.problem !== v && !f.problem ? S.problem + ', ' + v : v; f.problem = 1; break; }
  if (/לא דחוף|בזמן שנוח|השבוע|בימים הקרובים|מחר|אין לחץ|לא בוער/.test(t) && !S.danger) { S.urgent = 'לא דחוף'; f.urgent = 1; if (/מחר/.test(t)) S.when = 'מחר'; else if (/השבוע|בימים הקרובים/.test(t)) S.when = 'השבוע'; }
  else if (/דחוף|עכשיו|מיד|חירום|בהקדם|תקוע בחוץ|ננעלתי/.test(t) || S.problem === 'ננעל בחוץ, צריך פריצה') { S.urgent = 'חירום'; f.urgent = 1; }
  const CITIES = ['נתניה', 'כפר יונה', 'אבן יהודה', 'תל מונד', 'קדימה', 'צורן', 'פרדסיה', 'הרצליה', 'רעננה', 'כפר סבא', 'חדרה', 'פולג', 'עין שריד', 'בית יצחק'];
  const c = CITIES.find((x) => t.includes(x)); if (c) { S.city = c; f.city = 1; const st = t.match(/(רחוב|ברחוב|ב)?\s*([א-ת"']{2,}\s?[א-ת"']*)\s+(\d{1,3})/); if (st && !CITIES.includes(st[2].trim())) S.city = `${st[2].trim()} ${st[3]}, ${c}`; }
  else if (S.stage === 'askCity' && t.trim().length > 2 && !/\?/.test(t)) { S.city = text.trim().slice(0, 40); f.city = 1; }
  const n = grabName(text, S.stage === 'askName'); if (n) { S.name = n; f.name = 1; }
  f.q = LFAQ.filter((x) => x.re.test(t)).map((x) => x.k);
  return f;
}
function leadNow() { return { name: S.name, problem: S.problem, urgent: S.urgent ? (S.danger ? 'חירום! סכנה' : S.urgent) : '', city: S.city, when: S.when, details: S.details, questions: S.questions.join(', ') }; }
function engineReply(text) {
  const first = S.stage === 'start'; if (first) S.stage = 'collect';
  const st = smallTalk(text, first); if (st && !/נעול|ננעל|מנעול|מפתח|דלת/.test(text)) { S.smalltalk = 1; return { reply: st }; }
  const f = parse(text), pre = [];
  if (first && !st) pre.push('שלום 😊');
  f.q.forEach((k) => { const it = LFAQ.find((x) => x.k === k); pre.push(it.a()); if (!S.questions.includes(k)) S.questions.push(k); });
  const say = (main, ready) => ({ reply: [pre.join(' '), main].filter(Boolean).join(pre.join(' ').length < 40 ? ' ' : '\n\n'), ready: !!ready });
  if (S.danger && !S.dangerSaid) {
    S.dangerSaid = 1; S.urgent = 'חירום';
    return say(`אם יש ילד או מישהו בסכנה, תתקשר מיד ל-100 (משטרה) או ל-101 (מד"א) 🙏 במקביל אני מעדכן את ${OWNER} עכשיו.\n\nאיפה אתה נמצא? כתובת מדויקת`);
  }
  if (S.agreed) { if (isThanks(text)) return say('בשמחה! 🙏'); if (f.q.length) return say(''); return say(`הכל אצל ${OWNER} 👍 אם משהו משתנה, תכתוב לי כאן.`); }
  if (!S.problem) { S.asked.problem = (S.asked.problem || 0) + 1; return say(S.asked.problem > 1 ? 'ספר לי במילה מה קרה: ננעלת בחוץ? צריך להחליף מנעול? רכב?' : pick(['מה קרה? ננעלת בחוץ, או שצריך להחליף מנעול?', 'במה אפשר לעזור? 🔑'])); }
  if (!S.city) { S.stage = 'askCity'; if (!S.asked.city) { S.asked.city = 1; return say(`${S.urgent === 'חירום' ? 'אני על זה 🙏 ' : 'אין בעיה 👍 '}איפה אתה נמצא? עיר ורחוב`); } return say('באיזה עיר ורחוב?'); }
  if (!S.urgent) { S.stage = 'askUrgent'; if (!S.asked.urgent) { S.asked.urgent = 1; return say('זה דחוף, עכשיו, או שאפשר לתאם לימים הקרובים?'); } S.urgent = isYes(text) || /עכשיו|דחוף/.test(text) ? 'חירום' : 'לא דחוף'; }
  if (!S.name) { S.stage = 'askName'; if (!S.asked.name) { S.asked.name = 1; return say('ואיך קוראים לך?'); } return say('על איזה שם לרשום? 😊'); }
  S.agreed = true; S.stage = 'done';
  if (S.urgent === 'חירום') return say(`תודה ${S.name}! העברתי ל${OWNER} עכשיו, הוא מתקשר אליך בדקות הקרובות ובדרך כלל מגיע תוך חצי שעה עד 40 דקות 🚗`, true);
  return say(`תודה ${S.name}! רשמתי הכל, ו${OWNER} חוזר אליך היום לתאם שעה שנוחה לך 👍`, true);
}
function suggestions() {
  if (!turns.length) return ['היי מה נשמע?', 'ננעלתי מחוץ לבית', 'רוצה להחליף צילינדר', 'יש ילד נעול באוטו!', 'כמה עולה פריצה?'];
  if (S.agreed) return ['תודה!', 'כמה זה יעלה?'];
  if (!S.problem) return ['ננעלתי בחוץ', 'צריך להחליף מנעול', 'פתיחת רכב'];
  if (!S.city) return ['הרצל 12, נתניה', 'כפר יונה'];
  if (!S.urgent) return ['כן, עכשיו', 'לא דחוף, השבוע'];
  if (!S.name) return ['משה', 'יעל'];
  return [];
}
