#!/usr/bin/env python3
"""Builds the Arik Locks site: shared header/footer, one HTML file per page.

Run from this folder:  python3 _build.py
Every page is plain static HTML (GitHub Pages); edit the content here and rebuild.
Copy rules: website-builder/ANTI_AI_RULES.md (no em dashes, no triads, real facts only).
"""
import json, os, html

BASE = 'https://arieleilon900-bit.github.io/ariel4/website-builder/clients/arik-locks-v1/'
PHONE = '052-5585883'
TEL = '+972525585883'
WA = 'https://wa.me/972525585883'
HERE = os.path.dirname(os.path.abspath(__file__))

ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>'
ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.3z"/></svg>'
LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="8" fill="#10202e"/><circle cx="20" cy="16" r="5.5" fill="#b0823f"/><path d="M17.6 19h4.8l1.6 11h-8z" fill="#b0823f"/></svg>'

# ---------------------------------------------------------------- content ---
REVIEWS = [
    ('אחד האנשים הכי מקצועיים ונחמדים שפגשתי. התעקש לנסות להציל לי את המנעול ולחסוך לי הרבה, הרבה כסף (וגם הצליח). יושר והגינות שכבר כמעט לא רואים היום בבעלי מקצוע. ממליצה בחום רב', 'ליאת ש.'),
    ('אריק, איש מקצוע אמין. רציני, יסודי, עובד מהלב. מומלץ ביותר. וטוב שיש אחד כמוהו', 'עדי ת.'),
    ('תודה רבה לאריק על עבודה מקצועית שביצעה, עבודה מהירה ונקייה. ממליץ מאוד!!', 'Sem M.'),
    ('שירות סופר מקצועי. אמין ונעים עם המון סבלנות. ממליצה בחום', 'אינגודהי ג.'),
    ('אריק מנעולים בנאדם הגון וישר. ממליצה בחום', 'מרינה ד.'),
    ('שירות מקצועי ואדם מדהים. מומלץ בחום.', 'מיכל ר.'),
    ('שרות מעולה, מקצועי ואדיב', 'Ronit O.'),
    ('אריק מדויק אמין ומקצועי', 'בני מ.'),
]

SERVICES = [
    dict(slug='door-opening', name='פתיחת דלתות', short='ננעלתם בחוץ או שהמנעול לא מסתובב',
         title='פתיחת דלת נעולה', review=2,
         lead='ננעלתם בחוץ, המפתח נשאר בפנים או שהמנעול פשוט לא מסתובב. זה הרגע שבשבילו שומרים מספר של מנעולן.',
         body=[
            ('מה עושים ברגע שננעלים', 'קודם כול להתקשר או לשלוח וואטסאפ עם הכתובת. אם יש ילד קטן, תבשיל על הגז או מים זורמים בפנים, תגידו את זה כבר בהודעה הראשונה. ככה אריק יודע מה דחוף.'),
            ('איך אריק פותח', 'הוא מתחיל מהדרך העדינה ביותר שמתאימה למנעול שלכם. המטרה היא שתיכנסו הביתה, ושהדלת והמשקוף יישארו כמו שהם. אם בסוף צריך להחליף צילינדר, הוא יגיד לכם לפני שהוא עושה את זה.'),
            ('דלתות רב-בריח, דלתות פנים ומשרדים', 'דלת כניסה רגילה, דלת רב-בריח, חדר בבית או משרד שננעל. בכל מקרה כדאי לשלוח תמונה של המנעול מבחוץ, זה עוזר לאריק להגיע עם מה שצריך.'),
         ],
         tip='צלמו את המנעול מבחוץ ושלחו בוואטסאפ יחד עם הכתובת.'),
    dict(slug='cylinder', name='החלפת צילינדר', short='אחרי מעבר דירה, מפתח שאבד או צילינדר שנתקע',
         title='החלפת צילינדר', review=0,
         lead='הצילינדר הוא החלק במנעול שהמפתח נכנס אליו. מחליפים אותו כשעוברים דירה, כשמפתח הלך לאיבוד, או כשהוא מתחיל להיתקע.',
         body=[
            ('מתי כדאי להחליף', 'עברתם לדירה חדשה ואין לכם מושג למי עוד יש מפתח. מפתח אבד או נגנב. המפתח נכנס בקושי או מסתובב רק אחרי כמה ניסיונות. בכל המקרים האלה צילינדר חדש סוגר את הסיפור.'),
            ('קודם בודקים, אחר כך מחליפים', 'לא כל צילינדר שנתקע צריך ללכת לפח. לפעמים מספיק ניקוי או כיוון. אריק בודק את זה קודם, ואם אפשר לתקן הוא מתקן. זה בדיוק מה שלקוחות כותבים עליו.'),
            ('כמה מפתחות לקבל', 'עם צילינדר חדש מקבלים סט מפתחות. אם צריך עוד עותקים לבני הבית, תגידו מראש.'),
         ],
         tip='מדדו או צלמו את הצילינדר הקיים מהצד. ככה אריק יודע איזה גודל להביא.'),
    dict(slug='keys', name='מפתח שנשבר במנעול', short='חילוץ מפתח שבור והחלפת מפתח',
         title='מפתח שנשבר או נתקע במנעול', review=1,
         lead='חצי מפתח ביד וחצי בתוך המנעול. אל תנסו לחלץ אותו עם סיכה או מספריים, ככה הוא רק נדחף עמוק יותר.',
         body=[
            ('מה אריק עושה', 'מחלץ את החלק השבור מתוך הצילינדר, בודק שהמנגנון לא נפגע ומחליף את המפתח. אם הצילינדר עצמו נפגע, הוא יסביר לכם מה האפשרויות.'),
            ('מפתח שאבד', 'אם אין לכם מפתח בכלל, כדאי לחשוב גם על החלפת צילינדר. מפתח שאבד יכול להגיע לידיים של מישהו אחר.'),
         ],
         tip='אל תזרקו את החלק של המפתח שנשאר לכם ביד. הוא יכול לעזור.'),
    dict(slug='locks', name='התקנה ותיקון מנעולים', short='דלתות כניסה, דלתות פנים ושערים',
         title='התקנה ותיקון מנעולים', review=0,
         lead='מנעול שנתקע, ידית שיורדת, בריח שלא נכנס עד הסוף. לפני שמחליפים, אריק בודק אם אפשר לתקן.',
         body=[
            ('תיקון לפני החלפה', 'הרבה תקלות במנעול נפתרות בכיוון, בשימון או בהחלפה של חלק אחד. ככה לא משלמים על מנעול חדש כשלא צריך.'),
            ('התקנה של מנעול חדש', 'כשכן צריך מנעול חדש, הוא מותקן כך שהדלת נסגרת חלק והבריח נכנס עד הסוף. זה נכון לדלת כניסה, לדלת פנים ולשער בחצר.'),
         ],
         tip='תארו מה בדיוק קורה: המפתח לא נכנס, לא מסתובב, או שהדלת לא נסגרת. וידאו קצר עוזר עוד יותר.'),
    dict(slug='safes', name='כספות', short='פתיחה ותיקון של מנעול לכספת',
         title='פתיחה ותיקון מנעולים לכספות', review=3,
         lead='הקוד נשכח, הסוללה נגמרה או שהמנגנון פשוט לא מגיב. אריק פותח ומתקן מנעולים לכספות.',
         body=[
            ('לפני שמתקשרים', 'בכספות דיגיטליות הרבה פעמים הבעיה היא סוללה חלשה. אם יש תא סוללות מבחוץ, כדאי לנסות להחליף אותן קודם.'),
            ('בשקט ובלי מבוכה', 'כספת היא דבר אישי. אריק פותח, מתקן, ולא שואל שאלות מיותרות.'),
         ],
         tip='צלמו את הכספת מקדימה ואת הלוח או החוגה.'),
    dict(slug='electric-locks', name='מנעולים חשמליים', short='התקנה לבית, לעסק ולשער',
         title='התקנת מנעולים חשמליים', review=7,
         lead='מנעול חשמלי או אלקטרומגנטי פותח דלת או שער בלחיצה, בלי לרדת עם מפתח. מתאים לבניין, לעסק ולשער בחצר.',
         body=[
            ('איפה זה שימושי', 'שער חצר שרוצים לפתוח מהבית, דלת כניסה לבניין, משרד או חנות שבהם הרבה אנשים נכנסים ויוצאים.'),
            ('מה צריך לבדוק מראש', 'איזו דלת או שער, האם יש חשמל בקרבת מקום ואיך רוצים לפתוח: לחצן, קודן או אינטרקום. שלחו תמונות ואריק יגיד מה אפשר.'),
         ],
         tip='צלמו את הדלת או השער, ואת המשקוף מקרוב.'),
]

AREAS = [
    dict(slug='hadera', name='חדרה', h1='מנעולן בחדרה',
         lead='אריק מגיע לחדרה מהמושב השכן, מאור. פתיחת דלתות, החלפת צילינדרים ותיקון מנעולים בבתים, בדירות ובעסקים בעיר.',
         text='בחדרה יש הרבה בנייני מגורים עם דלתות רב-בריח ודלתות כניסה לבניין, וגם בתים פרטיים עם שערים. אריק עובד עם כל הסוגים. אם אתם בבניין, תכתבו בהודעה גם קומה וקוד כניסה, זה חוסך זמן.'),
    dict(slug='pardes-hanna', name='פרדס חנה-כרכור', h1='מנעולן בפרדס חנה-כרכור',
         lead='גם בפרדס חנה וגם בכרכור. אריק מגיע לבתים הפרטיים, לדירות ולעסקים במושבה.',
         text='בפרדס חנה-כרכור יש הרבה בתים פרטיים עם חצר, ולכן גם שערים, מחסנים ודלתות אחוריות. חוץ מפתיחת דלתות והחלפת צילינדרים, אריק מתקין גם מנעולים חשמליים לשערים.'),
    dict(slug='emek-hefer', name='עמק חפר', h1='מנעולן בעמק חפר',
         lead='אריק מגיע למושבים ולקיבוצים של עמק חפר. בית, משק, מחסן או משרד.',
         text='ביישובים של עמק חפר הכתובת לא תמיד ברורה מהניווט. תשלחו מיקום בוואטסאפ ואריק יגיע ישר לדלת.'),
    dict(slug='maor', name='מאור', h1='מנעולן במושב מאור',
         lead='אריק גר ועובד במושב מאור, ברחוב הזית. אם אתם במאור, הוא ממש קרוב.',
         text='במושב אריק מכיר את הדרכים ואת הבתים. גם לשכנים מהיישובים הסמוכים הוא מגיע מהר, פשוט כי הוא כבר באזור.'),
]

FAQ = [
    ('ננעלתי בחוץ עכשיו. מה לעשות?', f'להתקשר ל-{PHONE} או לשלוח וואטסאפ עם הכתובת. אם יש משהו דחוף בפנים, כמו ילד או תבשיל על הגז, תגידו את זה מיד.'),
    ('כמה זה עולה?', 'המחיר תלוי בסוג המנעול ובעבודה. שלחו תמונה של המנעול בוואטסאפ ותקבלו הערכה עוד לפני שאריק יוצא.'),
    ('אפשר לתקן במקום להחליף?', 'הרבה פעמים כן, ואריק תמיד בודק את זה קודם. אם צריך להחליף, הוא מסביר למה.'),
    ('מתי אפשר להשיג את אריק?', 'בימים ראשון עד חמישי בכל שעה, גם בלילה. בשישי עד כניסת שבת. אריק שומר שבת, והודעות שנשלחות בשבת נענות במוצאי שבת.'),
    ('לאילו אזורים אריק מגיע?', 'חדרה, פרדס חנה-כרכור, עמק חפר ומושב מאור.'),
    ('עברתי דירה. צריך להחליף צילינדר?', 'מומלץ. אין לכם דרך לדעת כמה מפתחות של הדירה מסתובבים בחוץ. צילינדר חדש פותר את זה.'),
    ('מה לשלוח בוואטסאפ כדי לחסוך זמן?', 'כתובת, תמונה של המנעול מבחוץ ומשפט אחד על מה קרה.'),
    ('הכספת לא נפתחת. מה אפשר לנסות לבד?', 'אם זו כספת דיגיטלית, להחליף סוללות. אם זה לא עזר, אריק פותח ומתקן.'),
]

NAV = [('services/', 'שירותים'), ('areas/', 'אזורים'), ('reviews/', 'ביקורות'), ('about/', 'על אריק'), ('faq/', 'שאלות'), ('contact/', 'יצירת קשר')]

HOURS_DL = '''<dl>
  <dt>ראשון עד חמישי</dt><dd>24 שעות</dd>
  <dt>שישי</dt><dd>עד כניסת שבת</dd>
  <dt>שבת</dt><dd>סגור</dd>
  <dt>מוצאי שבת</dt><dd>חוזר לעבוד</dd>
</dl>'''

# ------------------------------------------------------------- templates ---
def esc(s): return html.escape(s, quote=True)

def business_ld():
    return {
        "@type": "Locksmith", "@id": BASE + "#business", "name": "אריק מנעולים", "url": BASE,
        "telephone": "+972-52-558-5883", "image": BASE + "assets/og.png",
        "address": {"@type": "PostalAddress", "streetAddress": "הזית", "addressLocality": "מאור", "postalCode": "3883000", "addressCountry": "IL"},
        "areaServed": [a['name'] for a in AREAS],
        "openingHoursSpecification": [
            {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Sunday","Monday","Tuesday","Wednesday","Thursday"], "opens": "00:00", "closes": "23:59"},
            {"@type": "OpeningHoursSpecification", "dayOfWeek": "Friday", "opens": "00:00", "closes": "14:00"},
            {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "21:00", "closes": "23:59"}],
    }

def page(path, title, desc, body, crumbs=None, current=None, extra_ld=None):
    depth = path.count('/')
    r = '../' * depth                       # relative root
    ld = {"@context": "https://schema.org", "@graph": [business_ld()] + (extra_ld or [])}
    if crumbs:
        items = [{"@type": "ListItem", "position": 1, "name": "ראשי", "item": BASE}]
        for i, (u, n) in enumerate(crumbs, 2):
            items.append({"@type": "ListItem", "position": i, "name": n, **({"item": BASE + u} if u else {})})
        ld["@graph"].append({"@type": "BreadcrumbList", "itemListElement": items})
        crumb_html = '<nav class="crumbs" aria-label="פירורי לחם"><a href="' + r + '">ראשי</a>' + ''.join(
            f'<span>/</span>' + (f'<a href="{r}{u}">{esc(n)}</a>' if u else f'<span aria-current="page">{esc(n)}</span>') for u, n in crumbs) + '</nav>'
    else:
        crumb_html = ''
    CUR = ' aria-current="page"'
    menu = ''.join(f'<a href="{r}{u}"{CUR if current == u else ""}>{n}</a>' for u, n in NAV)
    canon = BASE + (path[:-10] if path.endswith('index.html') else path)
    return f'''<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canon}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{BASE}assets/og.png">
<link rel="icon" href="{r}assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{r}assets/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=IBM+Plex+Sans+Hebrew:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{r}assets/site.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<a class="skip" href="#main">דלג לתוכן</a>
<header class="hdr">
  <div class="wrap">
    <a class="logo" href="{r}" aria-label="אריק מנעולים, לדף הבית">{LOGO}<b>אריק מנעולים</b></a>
    <nav class="menu" id="menu" aria-label="ניווט ראשי">{menu}</nav>
    <button class="burger" type="button" aria-label="תפריט" aria-controls="menu" aria-expanded="false"><span></span></button>
    <div class="hdr-call"><a class="num" href="tel:{TEL}">{PHONE}</a><a class="btn btn-ink btn-small" href="tel:{TEL}">{ICON_PHONE}חייגו</a></div>
  </div>
</header>
<main id="main">
{('<div class="wrap">' + crumb_html + '</div>') if crumb_html else ''}
{body}
</main>
<footer class="ftr">
  <div class="wrap">
    <div class="cols">
      <div>
        <h2>אריק מנעולים</h2>
        <p>מנעולן ממושב מאור. עובד בחדרה, פרדס חנה-כרכור ועמק חפר. שומר שבת.</p>
        <a class="num big" href="tel:{TEL}">{PHONE}</a>
        <a href="{WA}" target="_blank" rel="noopener">וואטסאפ לאריק</a>
      </div>
      <div><h2>שירותים</h2><ul>{''.join(f'<li><a href="{r}services/{s["slug"]}/">{s["name"]}</a></li>' for s in SERVICES)}</ul></div>
      <div><h2>אזורים</h2><ul>{''.join(f'<li><a href="{r}areas/{a["slug"]}/">{a["name"]}</a></li>' for a in AREAS)}</ul></div>
      <div><h2>עוד</h2><ul><li><a href="{r}about/">על אריק</a></li><li><a href="{r}reviews/">ביקורות</a></li><li><a href="{r}faq/">שאלות נפוצות</a></li><li><a href="{r}contact/">יצירת קשר</a></li><li><a href="{r}assets/arik.vcf" download>שמירת איש קשר</a></li></ul></div>
    </div>
    <div class="base"><span>© אריק מנעולים, מושב מאור</span><span><a href="{r}accessibility/">הצהרת נגישות</a> · אתר: <a href="{r}../../../index.html">אריאל אילון</a></span></div>
  </div>
</footer>
<nav class="mbar" aria-label="יצירת קשר מהירה"><a href="tel:{TEL}">חייגו לאריק</a><a href="{WA}" target="_blank" rel="noopener">וואטסאפ</a></nav>
<script src="{r}assets/site.js" defer></script>
</body>
</html>
'''

def call_card():
    return f'''<div class="card-call">
  <h2>צריכים את אריק?</h2>
  <p data-status data-shabbat="שבת שלום. אפשר להשאיר הודעה, אריק עונה במוצאי שבת.">זמין עכשיו. ראשון עד חמישי גם בלילה.</p>
  <a class="num" href="tel:{TEL}">{PHONE}</a>
  <a class="btn btn-ink" href="tel:{TEL}">{ICON_PHONE}חייגו</a>
  <a class="btn btn-line" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a>
</div>'''

def aside(r, current_service=None):
    others = ''.join(f'<li><a href="{r}services/{s["slug"]}/">{s["name"]}</a></li>' for s in SERVICES if s['slug'] != current_service)
    return f'''<aside class="aside">
  {call_card()}
  <div class="plate"><h3>שעות</h3>{HOURS_DL}</div>
  <div class="card-plain"><h3>{"עוד שירותים" if current_service else "שירותים"}</h3><ul>{others}</ul></div>
</aside>'''

def band(r):
    return f'''<section class="band" aria-label="שמירת המספר">
  <div class="wrap">
    <div><h2>שמרו את המספר של אריק עכשיו, לפני שתצטרכו אותו.</h2><p>כרטיס איש קשר עם הטלפון, הוואטסאפ והשעות.</p></div>
    <a class="btn btn-ink" href="{r}assets/arik.vcf" download>שמירה באנשי הקשר</a>
  </div>
</section>'''

def quote_inline(i):
    q, n = REVIEWS[i]
    return f'<figure class="quote-inline"><blockquote>״{esc(q)}״</blockquote><cite>{esc(n)}, ביקורת בגוגל</cite></figure>'

LOCK_SVG = '''<svg viewBox="0 0 200 220" fill="none" aria-hidden="true">
  <circle cx="100" cy="128" r="98" fill="#f2f6f9"/>
  <path class="shackle" d="M58 100V66a42 42 0 0 1 84 0v34" stroke="#10202e" stroke-width="14" stroke-linecap="round"/>
  <rect x="30" y="96" width="140" height="112" rx="22" fill="#10202e"/>
  <rect x="30" y="96" width="140" height="112" rx="22" stroke="#b0823f" stroke-width="2"/>
  <g class="plug"><circle cx="100" cy="150" r="24" fill="#b0823f"/><circle cx="100" cy="150" r="17" fill="#1b2e40"/><rect x="97" y="137" width="6" height="26" rx="3" fill="#b0823f"/></g>
</svg>'''

# ----------------------------------------------------------------- pages ---
def home():
    r = ''
    svc = ''.join(f'<a href="services/{s["slug"]}/"><h3>{s["name"]}</h3><p>{s["short"]}</p><span class="go">לפרטים</span></a>' for s in SERVICES)
    areas = ''.join(f'<li><a href="areas/{a["slug"]}/">{a["name"]}<small>{a["lead"].split(".")[0]}.</small></a></li>' for a in AREAS)
    faq = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ[:3])
    q, n = REVIEWS[0]
    body = f'''<div class="wrap">
<section class="hero" aria-label="פתיח">
  <div>
    <p class="where">מנעולן בחדרה, פרדס חנה, עמק חפר ומאור</p>
    <h1>ננעלתם בחוץ? <em>אריק</em> כבר בדרך.</h1>
    <p class="lead">מנעולן שקודם מנסה <b>לתקן</b>, ורק אם אין ברירה מחליף. ככה חוסכים לכם כסף, וככה כל הביקורות עליו בגוגל הן חמישה כוכבים.</p>
    <div class="actions">
      <a class="btn btn-ink" href="tel:{TEL}">{ICON_PHONE}<span class="num">{PHONE}</span></a>
      <a class="btn btn-line" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ לאריק</a>
    </div>
    <div class="proof">
      <span class="status" data-status><i></i><span>זמין עכשיו, גם בלילה</span></span>
      <span><span class="stars">★★★★★</span> כל הביקורות בגוגל</span>
    </div>
  </div>
  <div class="lockart">{LOCK_SVG}</div>
</section>
</div>

<div class="wrap">
<section class="quick" aria-label="הודעה מוכנה">
  <div>
    <h2>הודעה מוכנה לאריק</h2>
    <p>למי שלא בא לו להסביר בטלפון. בוחרים מה קרה, כותבים איפה אתם, וההודעה נפתחת בוואטסאפ מוכנה לשליחה.</p>
  </div>
  <div>
    <div class="chips" id="chips" role="group" aria-label="מה קרה">
      <button type="button" class="chip" data-t="ננעלתי מחוץ לבית">ננעלתי בחוץ</button>
      <button type="button" class="chip" data-t="מפתח נשבר לי בתוך המנעול">מפתח נשבר</button>
      <button type="button" class="chip" data-t="אני רוצה להחליף צילינדר">להחליף צילינדר</button>
      <button type="button" class="chip" data-t="כספת לא נפתחת">כספת</button>
      <button type="button" class="chip" data-t="אני צריך מנעול חשמלי">מנעול חשמלי</button>
      <button type="button" class="chip" data-t="יש לי בעיה במנעול">משהו אחר</button>
    </div>
    <label class="field">איפה אתם?<input id="where" type="text" placeholder="עיר ורחוב" autocomplete="street-address"></label>
    <p class="preview" id="msg" aria-live="polite"></p>
    <a class="btn btn-ink" id="send" href="{WA}" target="_blank" rel="noopener">{ICON_WA}לשלוח בוואטסאפ</a>
  </div>
</section>
</div>

<section class="sec" aria-label="שירותים">
  <div class="wrap">
    <h2 class="sec-title">מה אריק עושה</h2>
    <p class="sec-intro">לכל שירות יש עמוד עם הסבר, טיפים ומה לשלוח בוואטסאפ.</p>
    <div class="svc">{svc}</div>
  </div>
</section>

<section class="sec ice" aria-label="ביקורת">
  <div class="wrap">
    <div class="bigquote">
      <span class="mark" aria-hidden="true">״</span>
      <figure><blockquote>{esc(q)}</blockquote><cite>{esc(n)}, ביקורת בגוגל · <a href="reviews/">לכל הביקורות</a></cite></figure>
    </div>
  </div>
</section>

<section class="sec" aria-label="אזורים ושעות">
  <div class="wrap split">
    <div>
      <h2 class="sec-title">איפה אריק עובד</h2>
      <p class="sec-intro">אריק גר במושב מאור ומגיע לבתים ולעסקים באזור.</p>
      <ul class="areas">{areas}</ul>
    </div>
    <div class="plate"><h3>שעות</h3>{HOURS_DL}<p class="now" data-status data-shabbat="עכשיו שבת. אפשר להשאיר הודעה.">עכשיו: פתוח</p></div>
  </div>
</section>

<section class="sec" aria-label="שאלות" style="padding-top:0">
  <div class="wrap faq">
    <h2 class="sec-title">שאלות שחוזרות</h2>
    {faq}
    <p style="margin-top:18px"><a href="faq/">לכל השאלות</a></p>
  </div>
</section>
{band(r)}'''
    faq_ld = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ[:3]]}
    return page('index.html', 'אריק מנעולים | מנעולן בחדרה, פרדס חנה ועמק חפר | 052-5585883',
                'מנעולן ממושב מאור: פתיחת דלתות, החלפת צילינדרים, מפתחות, כספות ומנעולים חשמליים בחדרה, פרדס חנה-כרכור ועמק חפר. שומר שבת. 052-5585883',
                body, extra_ld=[faq_ld])

def services_index():
    r = '../'
    svc = ''.join(f'<a href="{s["slug"]}/"><h3>{s["name"]}</h3><p>{s["short"]}</p><span class="go">לפרטים</span></a>' for s in SERVICES)
    body = f'''<div class="wrap">
<div class="page">
  <div>
    <h1>שירותי מנעולנות</h1>
    <p class="lead">כל מה שאריק עושה, מדלת שננעלה באמצע הלילה ועד התקנה מתוכננת של מנעול חשמלי. בחרו שירות לפרטים.</p>
    <div class="svc" style="grid-template-columns:1fr">{svc}</div>
  </div>
  {aside(r)}
</div>
</div>
{band(r)}'''
    return page('services/index.html', 'שירותי מנעולנות | אריק מנעולים', 'פתיחת דלתות, החלפת צילינדר, מפתח שנשבר, התקנה ותיקון מנעולים, כספות ומנעולים חשמליים. אריק מנעולים, חדרה ופרדס חנה.',
                body, crumbs=[(None, 'שירותים')], current='services/')

def service(s):
    r = '../../'
    parts = ''.join(f'<h2>{esc(h)}</h2><p>{esc(t)}</p>' for h, t in s['body'])
    faq = [(q, a) for q, a in FAQ if any(w in q for w in s['name'].split())][:2]
    faq_html = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faq)
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>{esc(s["title"])} בחדרה, פרדס חנה ועמק חפר</h1>
    <p class="lead">{esc(s["lead"])}</p>
    {parts}
    <div class="note"><b>מה לשלוח בוואטסאפ:</b> {esc(s["tip"])}</div>
    {quote_inline(s["review"])}
    {('<div class="faq"><h2>שאלות</h2>' + faq_html + '</div>') if faq_html else ''}
    <h2>אזורים</h2>
    <p>אריק מגיע ל{", ".join(a["name"] for a in AREAS[:-1])} ול{AREAS[-1]["name"]}.</p>
    <div class="related">{''.join(f'<a href="{r}areas/{a["slug"]}/">{s["name"]} ב{a["name"]}</a>' for a in AREAS)}</div>
  </article>
  {aside(r, s["slug"])}
</div>
</div>
{band(r)}'''
    svc_ld = {"@type": "Service", "name": s['title'], "serviceType": s['name'], "provider": {"@id": BASE + "#business"},
              "areaServed": [a['name'] for a in AREAS], "description": s['lead']}
    return page(f'services/{s["slug"]}/index.html', f'{s["title"]} בחדרה, פרדס חנה ועמק חפר | אריק מנעולים',
                s['lead'], body, crumbs=[('services/', 'שירותים'), (None, s['name'])], current='services/', extra_ld=[svc_ld])

def areas_index():
    r = '../'
    areas = ''.join(f'<li><a href="{a["slug"]}/">{a["name"]}<small>{a["lead"].split(".")[0]}.</small></a></li>' for a in AREAS)
    body = f'''<div class="wrap">
<div class="page">
  <div>
    <h1>אזורי שירות</h1>
    <p class="lead">אריק גר במושב מאור ומגיע לחדרה, לפרדס חנה-כרכור וליישובי עמק חפר.</p>
    <ul class="areas" style="grid-template-columns:1fr">{areas}</ul>
  </div>
  {aside(r)}
</div>
</div>
{band(r)}'''
    return page('areas/index.html', 'אזורי שירות | אריק מנעולים', 'אריק מנעולים מגיע לחדרה, פרדס חנה-כרכור, עמק חפר ומושב מאור.',
                body, crumbs=[(None, 'אזורים')], current='areas/')

def area(a, i):
    r = '../../'
    svc = ''.join(f'<li><a href="{r}services/{s["slug"]}/">{s["name"]} ב{a["name"]}</a></li>' for s in SERVICES)
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>{esc(a["h1"])}</h1>
    <p class="lead">{esc(a["lead"])}</p>
    <p>{esc(a["text"])}</p>
    <h2>מה אריק עושה ב{esc(a["name"])}</h2>
    <ul>{svc}</ul>
    {quote_inline([2, 3, 5, 4][i])}
    <h2>שעות</h2>
    <p>ראשון עד חמישי בכל שעה, גם בלילה. שישי עד כניסת שבת. במוצאי שבת אריק חוזר לעבוד.</p>
    <div class="note"><b>כדי שאריק יגיע מהר:</b> שלחו בוואטסאפ מיקום, תמונה של המנעול ומשפט על מה קרה.</div>
    <h2>עוד אזורים</h2>
    <div class="related">{''.join(f'<a href="{r}areas/{o["slug"]}/">מנעולן ב{o["name"]}</a>' for o in AREAS if o is not a)}</div>
  </article>
  {aside(r)}
</div>
</div>
{band(r)}'''
    return page(f'areas/{a["slug"]}/index.html', f'{a["h1"]} | אריק מנעולים | {PHONE}', a['lead'], body,
                crumbs=[('areas/', 'אזורים'), (None, a['name'])], current='areas/')

def about():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>קצת על אריק</h1>
    <p class="lead">אני אריק, מנעולן ממושב מאור. אני עובד בחדרה, בפרדס חנה-כרכור ובעמק חפר, ומגיע אליכם הביתה או לעסק.</p>
    <h2>קודם מתקנים</h2>
    <p>כשאני מגיע, קודם כול אני בודק אם אפשר לתקן את מה שיש. הרבה פעמים אפשר, וזה חוסך לכם החלפה מיותרת. אם צריך להחליף, אני מסביר למה, ואתם מחליטים.</p>
    {quote_inline(0)}
    <h2>שומר שבת</h2>
    <p>בימים ראשון עד חמישי אני זמין בכל שעה, גם בלילה. בשישי עד כניסת שבת. הודעות שנשלחות בשבת אני עונה עליהן במוצאי שבת.</p>
    <h2>מה הלקוחות כותבים</h2>
    <p>כל הביקורות עליי בגוגל הן חמישה כוכבים. את כולן אפשר לקרוא בעמוד <a href="{r}reviews/">הביקורות</a>, מילה במילה.</p>
  </article>
  {aside(r)}
</div>
</div>
{band(r)}'''
    return page('about/index.html', 'על אריק | אריק מנעולים, מושב מאור', 'אריק, מנעולן ממושב מאור. קודם מתקן, רק אם אין ברירה מחליף. שומר שבת.',
                body, crumbs=[(None, 'על אריק')], current='about/')

def reviews():
    r = '../'
    BIG = ' class="big"'
    figs = ''.join(f'<figure{BIG if i == 0 else ""}><blockquote>״{esc(q)}״</blockquote><cite><span class="stars">★★★★★</span>{esc(n)}, גוגל</cite></figure>' for i, (q, n) in enumerate(REVIEWS))
    body = f'''<div class="wrap">
<section class="sec" style="padding-top:28px">
  <h1 class="sec-title">מה אומרים על אריק</h1>
  <p class="sec-intro">כל הביקורות על אריק מנעולים בגוגל הן חמישה כוכבים. הנה הן, מועתקות מילה במילה.</p>
  <div class="reviews">{figs}</div>
  <p style="margin-top:28px"><a href="https://www.google.com/maps/search/%D7%90%D7%A8%D7%99%D7%A7+%D7%9E%D7%A0%D7%A2%D7%95%D7%9C%D7%99%D7%9D+%D7%9E%D7%90%D7%95%D7%A8" target="_blank" rel="noopener">לפרופיל של אריק בגוגל מפות</a></p>
</section>
</div>
{band(r)}'''
    return page('reviews/index.html', 'ביקורות על אריק מנעולים', 'כל הביקורות על אריק מנעולים בגוגל הן חמישה כוכבים. הציטוטים המלאים.',
                body, crumbs=[(None, 'ביקורות')], current='reviews/')

def faq():
    r = '../'
    items = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ)
    body = f'''<div class="wrap">
<div class="page">
  <div class="faq">
    <h1>שאלות נפוצות</h1>
    <p class="lead">התשובות הקצרות לשאלות שאריק שומע הכי הרבה.</p>
    {items}
  </div>
  {aside(r)}
</div>
</div>
{band(r)}'''
    faq_ld = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}
    return page('faq/index.html', 'שאלות נפוצות | אריק מנעולים', 'כמה עולה מנעולן, מתי להחליף צילינדר, מה עושים כשננעלים בחוץ ומתי אריק זמין.',
                body, crumbs=[(None, 'שאלות')], current='faq/', extra_ld=[faq_ld])

def contact():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <div>
    <h1>יצירת קשר</h1>
    <p class="lead">הכי מהר זה טלפון. אם לא נוח לדבר, וואטסאפ עם כתובת ותמונה של המנעול.</p>
    <p style="margin-bottom:26px"><a class="num" href="tel:{TEL}" style="font-size:clamp(34px,5vw,56px);color:var(--ink);text-decoration:none">{PHONE}</a></p>
    <div class="quick" style="grid-template-columns:1fr">
      <div><h2>הודעה מוכנה</h2><p>בוחרים מה קרה וכותבים איפה אתם.</p></div>
      <div>
        <div class="chips" id="chips" role="group" aria-label="מה קרה">
          <button type="button" class="chip" data-t="ננעלתי מחוץ לבית">ננעלתי בחוץ</button>
          <button type="button" class="chip" data-t="מפתח נשבר לי בתוך המנעול">מפתח נשבר</button>
          <button type="button" class="chip" data-t="אני רוצה להחליף צילינדר">להחליף צילינדר</button>
          <button type="button" class="chip" data-t="כספת לא נפתחת">כספת</button>
          <button type="button" class="chip" data-t="אני צריך מנעול חשמלי">מנעול חשמלי</button>
          <button type="button" class="chip" data-t="יש לי בעיה במנעול">משהו אחר</button>
        </div>
        <label class="field">איפה אתם?<input id="where" type="text" placeholder="עיר ורחוב" autocomplete="street-address"></label>
        <p class="preview" id="msg" aria-live="polite"></p>
        <a class="btn btn-ink" id="send" href="{WA}" target="_blank" rel="noopener">{ICON_WA}לשלוח בוואטסאפ</a>
      </div>
    </div>
    <h2 class="sec-title" style="font-size:32px;margin-top:48px">איפה אריק</h2>
    <p style="color:var(--ink-2);margin-bottom:16px">רחוב הזית, מושב מאור. מגיע לחדרה, לפרדס חנה-כרכור ולעמק חפר.</p>
    <div class="map"><iframe title="מפה: מושב מאור" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=%D7%94%D7%96%D7%99%D7%AA+%D7%9E%D7%90%D7%95%D7%A8&amp;z=13&amp;output=embed"></iframe></div>
  </div>
  <aside class="aside">
    <div class="plate"><h3>שעות</h3>{HOURS_DL}<p class="now" data-status data-shabbat="עכשיו שבת. אפשר להשאיר הודעה.">עכשיו: פתוח</p></div>
    <div class="card-plain"><h3>שמירת איש קשר</h3><p style="margin-bottom:12px">כרטיס עם הטלפון והשעות, ישר לאנשי הקשר בטלפון.</p><a class="btn btn-line btn-small" href="{r}assets/arik.vcf" download>הורדה</a></div>
  </aside>
</div>
</div>'''
    return page('contact/index.html', f'יצירת קשר | אריק מנעולים | {PHONE}', f'טלפון {PHONE}, וואטסאפ וכתובת. אריק מנעולים, מושב מאור.',
                body, crumbs=[(None, 'יצירת קשר')], current='contact/')

def accessibility():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>הצהרת נגישות</h1>
    <p class="lead">חשוב לנו שכל אחד יוכל להשתמש באתר, כולל אנשים עם מוגבלות. האתר נבנה לפי ההנחיות של תקן ישראלי 5568 (WCAG 2.0 ברמה AA).</p>
    <h2>מה נעשה באתר</h2>
    <ul>
      <li>ניווט מלא במקלדת, כולל קישור "דלג לתוכן" בתחילת כל עמוד.</li>
      <li>ניגודיות צבעים שעומדת בדרישות, וטקסט שאפשר להגדיל בדפדפן בלי לשבור את העמוד.</li>
      <li>כותרות מסודרות, שפת עמוד מוגדרת (עברית, מימין לשמאל) ותיאורים לרכיבים שאינם טקסט.</li>
      <li>האתר מכבד את הגדרת "הפחתת תנועה" של מערכת ההפעלה.</li>
      <li>האתר מותאם לטלפונים ולמסכים בכל גודל.</li>
    </ul>
    <h2>מה עוד לא מושלם</h2>
    <p>המפה בעמוד יצירת הקשר מגיעה מגוגל מפות, ונגישותה תלויה בגוגל. את הכתובת אפשר למצוא גם כטקסט באותו עמוד.</p>
    <h2>נתקלתם בבעיה?</h2>
    <p>אם משהו באתר לא נגיש לכם, ספרו לנו ונתקן. אפשר להתקשר ל-<a class="num" href="tel:{TEL}">{PHONE}</a> או לשלוח <a href="{WA}" target="_blank" rel="noopener">וואטסאפ</a>.</p>
    <p style="color:var(--mute);font-size:15px">ההצהרה עודכנה בספטמבר 2026.</p>
  </article>
  {aside(r)}
</div>
</div>'''
    return page('accessibility/index.html', 'הצהרת נגישות | אריק מנעולים', 'הצהרת הנגישות של אתר אריק מנעולים.',
                body, crumbs=[(None, 'הצהרת נגישות')])

# ----------------------------------------------------------------- write ---
def write(path, content):
    full = os.path.join(HERE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def main():
    out = [write('index.html', home()), write('services/index.html', services_index()),
           write('areas/index.html', areas_index()), write('about/index.html', about()),
           write('reviews/index.html', reviews()), write('faq/index.html', faq()),
           write('contact/index.html', contact()), write('accessibility/index.html', accessibility())]
    out += [write(f'services/{s["slug"]}/index.html', service(s)) for s in SERVICES]
    out += [write(f'areas/{a["slug"]}/index.html', area(a, i)) for i, a in enumerate(AREAS)]
    urls = ''.join(f'<url><loc>{BASE}{p[:-10]}</loc></url>' for p in out)
    write('sitemap.xml', f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    write('assets/arik.vcf', 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;אריק מנעולים;;;\r\nFN:אריק מנעולים\r\nORG:אריק מנעולים\r\nTITLE:מנעולן\r\n'
          f'TEL;TYPE=CELL,VOICE:{TEL}\r\nADR;TYPE=WORK:;;הזית;מאור;;3883000;ישראל\r\nURL:{BASE}\r\n'
          'NOTE:ראשון עד חמישי 24 שעות. שישי עד כניסת שבת. שומר שבת.\r\nEND:VCARD\r\n')
    write('assets/icon.svg', LOGO.replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"'))
    print(len(out), 'pages')
    bad = [p for p in out if '—' in open(os.path.join(HERE, p), encoding='utf-8').read()]
    print('em-dash check:', 'OK' if not bad else bad)

if __name__ == '__main__':
    main()
