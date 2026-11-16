import sys, re
T=open('david-demo/david-demo.html').read()
def cut(a,b,src=None):
    src=src or T; i=src.index(a); j=src.index(b,i); return src[i:j]
head = T[:T.index('<header class="hero">')]
ui = cut("/* ================= ממשק", "/* ================= שאלות נפוצות")
ui = re.sub(r"const LABELS = \{[^\n]*\n", "", ui)
ui = ui.replace("'הלקוח הסכים: לשלוח קישור לתשלום'", "READY_TEXT")
glue = cut("/* ================= מצב חי (AI) עם גיבוי", "/* כרטיסי הדירות */")
glue = glue[:glue.index("function suggestions() {")] + glue[glue.index("function buildChips() {"):]
lightbox = cut("/* לייטבוקס */", "/* מחשבון */")
calc = T[T.index("/* מחשבון */"):T.index("</script>")]
common = open('gen/eng-common.js').read()
CFG = {
 'lock': dict(file='manulan.html', engine='gen/eng-lock.js', title='מזכירה למנעולן', hero='p/lock.jpg', av='p/lock.jpg', bar='אבי המנעולן 🔑',
   kind='מנעולנים ובעלי מקצוע', h1='ככה לקוח בחירום מקבל מענה <em>גם כשאתה על סולם</em>.',
   lede='לקוח ננעל בחוץ וכותב בוואטסאפ. המזכירה עונה תוך שניות, מבינה מה קרה, מזהה חירום (ילד נעול ברכב? מפנה מיד ל-100), אוספת כתובת ושם, ושולחת לך הכל בהודעה אחת.',
   facts=['⚡ עונה תוך שניות, גם בלילה', '🚨 מזהה חירום ומפנה ל-100/101', '💬 לא נותנת מחירים, רק אתה'],
   tries=[('👋 להגיד שלום','היי מה נשמע?','"היי מה נשמע?"'),('🚪 ננעלתי בחוץ','ננעלתי מחוץ לבית, המפתח בפנים','חירום: אוספת כתובת ושם מהר'),('🔧 החלפת מנעול','רוצה להחליף צילינדר בדלת','לא דחוף: מתאמים לימים הקרובים'),('🚗 ילד באוטו','יש ילד נעול באוטו!','מפנה מיד ל-100 ומעדכן אותך'),('💰 כמה עולה?','כמה עולה פריצה של דלת?','לא נותנת מחיר, מסבירה למה')],
   tip='💡 נסה לשאול "תוך כמה זמן אתה מגיע?" או "יש חשבונית?". היא עונה ומחזירה לשיחה.',
   ready='כל הפרטים נאספו: להתקשר ללקוח',
   save=[('אף קריאה לא הולכת למתחרה','מי שננעל בחוץ כותב לשלושה מנעולנים. הראשון שעונה מקבל את העבודה.'),('יודעת מה דחוף','ננעל בחוץ? היא מטפלת מיד. החלפת מנעול? מתאמת לימים הקרובים.'),('שומרת על הכללים שלך','לא נותנת מחיר ולא מבטיחה זמן הגעה, חוץ מחירום שבו אמרת: חצי שעה עד 40 דקות.'),('אתה מקבל הכל מסודר','מה קרה, כתובת, שם, כמה דחוף. אתה רק מתקשר ויוצא.')],
   avg=('עבודה ממוצעת, בש״ח',450,100,2000,50)),
 'clinic': dict(file='klinika.html', engine='gen/eng-clinic.js', title='מזכירה לקליניקה', hero='p/clinic.jpg', av='p/clinic.jpg', bar='שירן · קליניקת לייזר ✨',
   kind='קליניקות לייזר ואסתטיקה', h1='ככה לקוחה חדשה קובעת תור <em>בזמן שאת באמצע טיפול</em>.',
   lede='לקוחה שראתה את המודעה כותבת "כמה עולה?". המזכירה עונה מיד בשם הקליניקה, עונה על "זה כואב?" ו"כמה טיפולים צריך?", מציעה טיפול ניסיון, ומשריינת תור.',
   facts=['⚡ עונה תוך שניות, גם בזמן טיפול', '❓ עונה על כל השאלות', '📅 משריינת תור לבד'],
   tries=[('👋 להגיד שלום','היי מה נשמע?','"היי מה נשמע?"'),('🦵 לייזר לרגליים','כמה עולה לייזר לרגליים?','מחיר, הנחה לסדרה, ותור'),('😬 זה כואב?','זה כואב?','עונה בחום ומחזירה לשיחה'),('✨ טיפול פנים','רוצה לקבוע טיפול פנים','שואלת, מציעה זמנים, משריינת'),('💸 יש הנחה?','יש הנחה? זה קצת יקר לי','טיפול ראשון בחצי מחיר')],
   tip='💡 נסי לשאול "כמה טיפולים צריך?", "איפה אתם?" או "צריך לגלח לפני?".',
   ready='תור שוריין: לאשר ללקוחה',
   save=[('אף לקוחה לא הולכת למכון אחר','לקוחה ששואלת "כמה עולה?" ולא מקבלת תשובה תוך דקות, קובעת במקום אחר.'),('עונה על השאלות שחוזרות כל יום','"זה כואב?", "כמה טיפולים?", "צריך לגלח?". את לא עונה על זה יותר.'),('משריינת תור לבד','מציעה זמנים פנויים, הלקוחה בוחרת, ואת רק מאשרת.'),('מגדילה את הסדרה','מציעה טיפול ניסיון והנחה על סדרה, וכך לקוחה אחת שווה 6-8 טיפולים.')],
   avg=('לקוחה חדשה שווה (סדרה), בש״ח',1500,200,6000,100)),
}
def build(key):
    c=CFG[key]
    tries=''.join(f'<button type="button" data-t="{t}"><b>{a}</b><span>{d}</span></button>' for a,t,d in c['tries'])
    facts=''.join(f'<span>{x}</span>' for x in c['facts'])
    save=''.join(f'<div><b>{a}</b><span>{b}</span></div>' for a,b in c['save'])
    lab,val,mn,mx,stp=c['avg']
    body=f'''<header class="hero">
  <img class="hero-bg" src="{c['hero']}" alt="">
  <div class="wrap hero-in">
    <div class="topbar"><div class="brand"><a href="index.html" style="color:inherit;text-decoration:none">עונה ראשון</a><small>הדגמה: {c['kind']}</small></div><span class="tag">הדגמה. שום הודעה לא יוצאת לאף אחד</span></div>
    <div class="hero-txt">
      <h1>{c['h1']}</h1>
      <p class="lede">{c['lede']}</p>
      <a class="go" href="#try">לנסות עכשיו כמו לקוח <span aria-hidden="true">↓</span></a>
      <div class="facts">{facts}</div>
    </div>
  </div>
</header>
<main class="wrap stage" id="try">
  <section>
    <h2 class="sec">תהיה הלקוח. תכתוב לו.</h2>
    <p class="lede dark">תכתוב בטלפון כל מה שלקוח היה כותב. או תלחץ על אחד מאלה:</p>
    <div class="tries" id="tries">{tries}</div>
    <p class="tip">{c['tip']}</p>
    <div class="sumcard" aria-live="polite">
      <div class="sumhead"><span class="dot"></span><div><h2>מה שמגיע לבעל העסק</h2><p class="sub">כל מה שנאסף, בהודעה אחת.</p></div></div>
      <div id="sum"><p class="empty">עוד לא נאסף כלום. תתחיל שיחה בטלפון.</p></div>
      <div class="mem" id="mem" hidden></div>
    </div>
    <div class="mode" id="mode" hidden></div>
  </section>
  <section class="phone-col" aria-label="וואטסאפ להדגמה">
    <div class="phone"><div class="screen">
      <div class="bar"><span class="back" aria-hidden="true">›</span><img class="av" src="{c['av']}" alt=""><div><b>{c['bar']}</b><small id="status">מחובר/ת</small></div></div>
      <div class="chat" id="chat" aria-live="polite"></div>
      <div class="chips" id="chips" aria-label="תשובות מהירות"></div>
      <form class="send" id="send" autocomplete="off"><input id="msg" name="msg" placeholder="הודעה" aria-label="הודעה"><button id="sendBtn" aria-label="שליחה"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></form>
    </div></div>
    <div class="resets"><button type="button" id="again" hidden>↻</button><button type="button" id="fresh">✚ לקוח חדש</button></div>
  </section>
</main>
<section class="save">
  <div class="wrap">
    <h2>מה זה חוסך לך</h2>
    <p class="intro">זו הדגמה עם עסק לדוגמה. אצלך המזכירה עונה בשם שלך, בסגנון שלך, ולפי הכללים שלך.</p>
    <div class="grid2">
      <div class="list">{save}</div>
      <div class="calc">
        <label for="r1">פניות חדשות בשבוע <output id="o1">15</output></label>
        <input type="range" id="r1" min="2" max="60" value="15">
        <label for="r2">כמה מהן הולכות למתחרה כי לא ענו מהר <output id="o2">10%</output></label>
        <input type="range" id="r2" min="0" max="40" value="10">
        <label for="r3">{lab} <output id="o3">{val:,}</output></label>
        <input type="range" id="r3" min="{mn}" max="{mx}" step="{stp}" value="{val}">
        <div class="res"><div>הכנסה שהולכת למתחרה בחודש</div><div class="big" id="loss">₪0</div><small>חישוב לפי המספרים שהזנת, לא הבטחה.</small></div>
      </div>
    </div>
    <div class="cta"><a href="https://wa.me/972524666175?text=%D7%94%D7%99%D7%99%20%D7%90%D7%A8%D7%99%D7%90%D7%9C%2C%20%D7%A8%D7%90%D7%99%D7%AA%D7%99%20%D7%90%D7%AA%20%D7%94%D7%93%D7%9E%D7%95" target="_blank" rel="noopener">רוצה את זה אצלי</a><span>או בטלפון: <span class="num">052-4666175</span>, אריאל</span></div>
  </div>
</section>
<footer>עונה ראשון · מזכירה בוואטסאפ לעסקים · עסק, שמות ומחירים לדוגמה בלבד · <a href="index.html">לעוד הדגמות</a></footer>
<div class="lb" id="lb" hidden><button type="button" id="lbx" aria-label="סגור">✕</button><button type="button" class="nav prev" id="lbp" aria-label="הקודמת">›</button><img id="lbimg" alt=""><button type="button" class="nav next" id="lbn" aria-label="הבאה">‹</button><span class="cnt" id="lbc"></span></div>
'''
    data=f"""/* ================= בסיס ================= */
const DAY = 864e5, TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
const addD = (d, n) => new Date(d.getTime() + n * DAY);
const iso = (d) => `${{d.getFullYear()}}-${{String(d.getMonth() + 1).padStart(2, '0')}}-${{String(d.getDate()).padStart(2, '0')}}`;
const dm = (d) => `${{d.getDate()}}/${{d.getMonth() + 1}}`;
const WD = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const nextDow = (dow, minAhead) => {{ let d = addD(TODAY, minAhead); while (d.getDay() !== dow) d = addD(d, 1); return d; }};
const nis = (n) => Math.round(n).toLocaleString('he-IL') + ' ₪';
const APTS = {{ clinic: {{ name: 'הקליניקה', pics: ['p/clinic.jpg'] }}, lock: {{ name: 'העבודה', pics: ['p/lock.jpg'] }} }};
const READY_TEXT = {c['ready']!r};
const BOT_ID = {('lock' if key=='lock' else 'clinic')!r};
"""
    script = '<script>\n' + data + ui + common + open(c['engine']).read() + '\n' + glue + "clearChat(); showMem(); setMode(); buildChips();\n(async () => { try { const r = await fetch('/api/chat', { cache: 'no-store' }); live = r.ok && !!(await r.json()).ai; } catch { live = false; } if (!turns.length) { engineMode = !live; setMode(); buildChips(); } })();\n" + lightbox + calc + '</script>\n'
    out = head + body + script
    open('gen/'+c['file'].replace('.html','-src.html'),'w').write(out)
    print('built', c['file'], len(out))
for k in CFG: build(k)
