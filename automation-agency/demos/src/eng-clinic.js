/* ================= קליניקת לייזר: שירן (עסק לדוגמה) ================= */
const OWNER = 'שירן';
const LABELS = { name: 'שם', treatment: 'טיפול', area: 'אזור', firstTime: 'פעם ראשונה', slot: 'תור מבוקש', offer: 'הצעה', questions: 'שאלה על' };
const PRICES = { 'רגליים מלאות': 350, 'בית שחי': 120, 'מפשעה': 180, 'שפם': 90, 'פנים': 200, 'גב': 300, 'זרועות': 250, 'בטן': 150 };
const CFAQ = [
  { k: 'כאב', re: /כואב|כאב|נעים|צורב|שורף/, a: () => 'ממש לא נורא 😊 המכשיר שלנו עם קירור, ורוב הלקוחות מרגישות רק עקצוץ קל.' },
  { k: 'כמה טיפולים', re: /כמה טיפולים|כמה פעמים|כמה מפגשים|אחרי כמה/, a: () => 'בדרך כלל 6-8 טיפולים, אחד כל 4-6 שבועות. כבר אחרי 2-3 רואים הבדל גדול ✨' },
  { k: 'מחיר', re: /כמה (זה )?עול|מחיר|כמה זה|כמה יוצא|עלות/, a: () => S.area && PRICES[S.area] ? `טיפול ב${S.area} עולה ${PRICES[S.area]} ₪, ובסדרה של 6 יש 15% הנחה 😊` : 'המחיר תלוי באזור, למשל בית שחי 120 ₪ ורגליים מלאות 350 ₪. ובסדרה של 6 יש 15% הנחה 😊' },
  { k: 'הנחה', re: /הנחה|יקר|מבצע|זול|להוריד/, a: () => { S.offer = 'טיפול ראשון ב-50% + 15% על סדרה'; return 'בשבילך: טיפול ראשון בחצי מחיר, ואם ממשיכים לסדרה של 6, עוד 15% הנחה על כולה 🎁'; } },
  { k: 'עור כהה', re: /עור כהה|שיער בהיר|שיער לבן|שיער ג'ינג'י|שזוף/, a: () => 'המכשיר מתאים לרוב סוגי העור. בפגישת הייעוץ שירן בודקת ומתאימה את הטיפול בדיוק לך.' },
  { k: 'הכנה', re: /לגלח|גילוח|להכין|לפני הטיפול|שמש/, a: () => 'יום לפני מגלחים את האזור, ושבועיים לפני לא נחשפים לשמש ישירה ☀️' },
  { k: 'מיקום', re: /איפה|כתובת|מיקום|חניה/, a: () => 'אנחנו ברחוב הרצל 10, יש חניה ממש מול הקליניקה 🚗' },
  { k: 'גברים', re: /גבר|גברים|לבעלי|בעלי/, a: () => 'בטח, מטפלים גם בגברים 💪' },
];
const SLOTS = () => { const d1 = nextDow(2, 1), d2 = nextDow(4, 1); return [`שלישי ${dm(d1)} ב-18:30`, `חמישי ${dm(d2)} ב-10:00`]; };
function newState() { return { stage: 'start', treatment: '', area: '', firstTime: '', slot: '', name: '', offer: '', asked: {}, agreed: false, route: 'owner', questions: [] }; }
let S = newState();
function parse(text) {
  const t = ' ' + text.replace(/[׳']/g, "'") + ' ', f = {};
  if (/לייזר|הסרת שיער|שיער/.test(t)) { S.treatment = 'הסרת שיער בלייזר'; f.t = 1; }
  else if (/טיפול פנים|ניקוי פנים|פילינג|אקנה|פיגמנט|כתמים/.test(t)) { S.treatment = 'טיפול פנים'; f.t = 1; }
  const A = [[/רגליים|רגלים|רגל/, 'רגליים מלאות'], [/בית שחי|בתי שחי/, 'בית שחי'], [/מפשעה|ביקיני/, 'מפשעה'], [/שפם|שפה עליונה/, 'שפם'], [/פנים|לחיים|סנטר/, 'פנים'], [/גב/, 'גב'], [/זרוע|ידיים/, 'זרועות'], [/בטן/, 'בטן']];
  for (const [re, v] of A) if (re.test(t)) { S.area = v; f.area = 1; if (!S.treatment && v !== 'פנים') S.treatment = 'הסרת שיער בלייזר'; break; }
  if (/פעם ראשונה|אף פעם|לא עשיתי|מעולם|חדשה/.test(t)) { S.firstTime = 'כן'; f.ft = 1; }
  else if (/כבר עשיתי|עשיתי בעבר|ממשיכה|המשך|התחלתי/.test(t)) { S.firstTime = 'לא, כבר עשתה טיפולים'; f.ft = 1; }
  else if (S.stage === 'askFirst' && isYes(t)) { S.firstTime = 'כן'; f.ft = 1; } else if (S.stage === 'askFirst' && isNo(t)) { S.firstTime = 'לא, כבר עשתה טיפולים'; f.ft = 1; }
  if (S.stage === 'askSlot') { const sl = SLOTS(); if (/שלישי|ראשון|הראשון|18/.test(t)) { S.slot = sl[0]; f.slot = 1; } else if (/חמישי|שני|השני|10/.test(t)) { S.slot = sl[1]; f.slot = 1; } else if (/ערב|אחרי העבודה/.test(t)) { S.slot = sl[0]; f.slot = 1; } else if (/בוקר/.test(t)) { S.slot = sl[1]; f.slot = 1; } else if (/אחר|לא מתאים|לא יכולה|לא יכול/.test(t)) { f.otherSlot = 1; } }
  const n = grabName(text, S.stage === 'askName'); if (n) { S.name = n; f.name = 1; }
  f.q = CFAQ.filter((x) => x.re.test(t)).map((x) => x.k);
  return f;
}
function leadNow() { return { name: S.name, treatment: S.treatment, area: S.area, firstTime: S.firstTime, slot: S.slot, offer: S.offer, questions: S.questions.join(', ') }; }
function engineReply(text) {
  const first = S.stage === 'start'; if (first) S.stage = 'collect';
  const st = smallTalk(text, first); if (st && !/לייזר|טיפול|שיער/.test(text)) { return { reply: st }; }
  const f = parse(text), pre = [];
  if (first) pre.push(f.q.length ? 'שלום!' : 'שלום 😊');
  f.q.forEach((k) => { const it = CFAQ.find((x) => x.k === k); pre.push(it.a()); if (!S.questions.includes(k)) S.questions.push(k); });
  const say = (main, ready, photos) => ({ reply: [pre.join(' '), main].filter(Boolean).join(pre.join(' ').length < 40 ? ' ' : '\n\n'), ready: !!ready, photos: photos || null });
  if (S.agreed) { if (isThanks(text)) return say('בכיף! מחכות לך 💕'); if (f.q.length) return say(''); return say(`הכל רשום 😊 ${OWNER} תשלח לך אישור ותזכורת יום לפני.`); }
  if (!S.treatment) { if (!S.asked.t) { S.asked.t = 1; return say('איזה טיפול מעניין אותך? לייזר להסרת שיער, או טיפול פנים?'); } return say('ספרי לי במילה, לייזר או טיפול פנים? 😊'); }
  if (S.treatment === 'הסרת שיער בלייזר' && !S.area) { S.stage = 'askArea'; if (!S.asked.area) { S.asked.area = 1; return say(pick(['מעולה! לאיזה אזור? רגליים, בית שחי, מפשעה, פנים?', 'איזה כיף ✨ איזה אזור חשבת?'])); } return say('לאיזה אזור בגוף? 😊'); }
  if (!S.firstTime) { S.stage = 'askFirst'; if (!S.asked.ft) { S.asked.ft = 1; return say(`${S.area ? S.area + ', מעולה. ' : ''}זו פעם ראשונה שאת עושה ${S.treatment === 'טיפול פנים' ? 'טיפול כזה' : 'לייזר'}?`); } S.firstTime = 'לא צוין'; }
  if (!S.slot) {
    S.stage = 'askSlot'; const sl = SLOTS();
    if (!S.asked.slot) { S.asked.slot = 1; if (S.firstTime === 'כן') S.offer = S.offer || 'פגישת ייעוץ + טיפול ניסיון בחינם'; return say(`${S.firstTime === 'כן' ? 'אז מגיע לך פגישת ייעוץ וטיפול ניסיון בחינם 🎁 ' : ''}יש לי מקום ב${sl[0]} או ב${sl[1]}. מה מתאים לך?`); }
    if (f.otherSlot) { S.slot = 'מבקשת זמן אחר'; } else return say(`מה יותר נוח, ${sl[0]} או ${sl[1]}? או שאבדוק זמן אחר?`);
  }
  if (!S.name) { S.stage = 'askName'; if (!S.asked.name) { S.asked.name = 1; return say(`${S.slot === 'מבקשת זמן אחר' ? `אין בעיה, ${OWNER} תחזור אלייך עם זמנים נוספים. ` : 'שריינתי לך 💕 '}על איזה שם לרשום?`); } return say('על איזה שם? 😊'); }
  S.agreed = true; S.stage = 'done';
  return say(`תודה ${S.name}! ${S.slot === 'מבקשת זמן אחר' ? `${OWNER} חוזרת אלייך היום עם זמנים` : `נתראה ב${S.slot}. ${OWNER} תשלח לך אישור, ותזכורת יום לפני`} ✨`, true);
}
function suggestions() {
  if (!turns.length) return ['היי מה נשמע?', 'כמה עולה לייזר לרגליים?', 'זה כואב?', 'רוצה לקבוע טיפול פנים', 'יש הנחה?'];
  if (S.agreed) return ['תודה!', 'איפה אתם נמצאים?'];
  if (!S.treatment) return ['לייזר להסרת שיער', 'טיפול פנים'];
  if (S.treatment === 'הסרת שיער בלייזר' && !S.area) return ['רגליים', 'בית שחי', 'מפשעה'];
  if (!S.firstTime) return ['כן, פעם ראשונה', 'כבר עשיתי בעבר', 'זה כואב?'];
  if (!S.slot) return ['שלישי בערב', 'חמישי בבוקר', 'כמה זה עולה?'];
  if (!S.name) return ['מיכל', 'נועה'];
  return [];
}
