#!/usr/bin/env python3
"""Builds the Dan Eilon site: shared header/footer, one HTML file per page.

Run from this folder:  python3 _build.py
Every page is plain static HTML (GitHub Pages); edit the content here and rebuild.
Copy rules: website-builder/ANTI_AI_RULES.md (no em dashes, no triads, real facts only).

Five main pages, by the client's own request: rehearsal room, the "פריצת
דיסק" band, digital guitar courses, private music lessons across Jerusalem
and the surrounding area, and sound/lighting/equipment rental. The band's
real YouTube videos, event credits, phone and email were sourced from
dan-eilon.com and public band pages -- see website-builder/build-log.md.
No fabricated reviews, no invented prices.
"""
import json, os, html

BASE = 'https://arieleilon900-bit.github.io/ariel4/website-builder/clients/dan-eilon/'
PHONE = '052-437-8572'
TEL = '+972524378572'
WA = 'https://wa.me/972524378572'
EMAIL = 'daneilon10@gmail.com'
HERE = os.path.dirname(os.path.abspath(__file__))

ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>'
ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.3z"/></svg>'
ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>'
LOGO = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="8" fill="#18130e"/><path d="M20 6 35 20 26 34 14 34 5 20Z" fill="#c8922f"/><circle cx="20" cy="20" r="3.2" fill="#18130e"/></svg>'

# ---------------------------------------------------------------- content ---
NAV = [('studio/', 'חדר חזרות'), ('band/', 'פריצת דיסק'), ('digital-guitar/', 'קורס דיגיטלי'),
       ('private-lessons/', 'שיעורים פרטיים'), ('equipment-rental/', 'הגברה ותאורה'),
       ('about/', 'על דן'), ('contact/', 'יצירת קשר')]

SERVICES = [
    dict(slug='private-lessons', name='שיעורי מוזיקה פרטיים', short='גיטרה, תופים, פסנתר ושירה, באולפן או אצלכם בבית, בכל ירושלים והסביבה'),
    dict(slug='digital-guitar', name='קורסי גיטרה דיגיטליים', short='שיעורים מצולמים ללימוד עצמי בקצב אישי, עם ליווי בוואטסאפ'),
    dict(slug='studio', name='חדר חזרות', short='מערכת תופים, קלידים וגיטרות באולפן בבית הכרם, להשכרה לפי שעה'),
    dict(slug='band', name='פריצת דיסק', short='להקת קאברים ומחווה לרוק, לחתונות, בר מצווה ואירועים'),
    dict(slug='equipment-rental', name='הגברה, תאורה והשכרת ציוד', short='מערכות הגברה, תאורה וכלי נגינה לאירוע או להפקה'),
]

INSTRUMENTS = [
    dict(name='גיטרה', text='קלאסית, אקוסטית או חשמלית, לרוב מתחילים מהכלי שכבר יש בבית. אקורדים וליווי למי שרוצה לנגן שירים, קריאת תווים למי שרוצה גם את זה.'),
    dict(name='תופים', text='קצב ותיאום ידיים ורגליים על משטח תרגול, ותרגול על מערכת מלאה באולפן. גם בלי מערכת בבית אפשר להתחיל.'),
    dict(name='פסנתר וקלידים', text='קלידים חשמליים מספיקים כדי להתחיל. אקורדים וליווי, או קריאת תווים ותיאוריה, לפי מה שהתלמיד רוצה.'),
    dict(name='פיתוח קול ושירה', text='טכניקת נשימה וטווח, לצד עבודה על שיר שלם שהתלמיד בוחר. לנוער ולמבוגרים.'),
    dict(name='הדרכת הרכבים', text='מתאמנים ומופיעים כקבוצה. תלמידים שמתקדמים מוזמנים להצטרף להרכב שמתאמן באולפן.'),
]

VIDEOS = [
    dict(id='XUSqmL6BEgY', title='להקת פריצת דיסק', desc='קליפ הופעה של הלהקה.'),
    dict(id='y2GQTsdZAfU', title='פריצת דיסק, קליפ מסיבות', desc='סט מסיבות, אנרגיה גבוהה.'),
    dict(id='Jga5UCIiITw', title='Get Back, סט אקוסטי ביקב נבו', desc='ההרכב האקוסטי המצומצם, מופע חי ביקב נבו.'),
]

CREDITS = [
    ('מופע מחווה לקווין', 'היכל התרבות, מעלה אדומים', 'https://www.facebook.com/pritzatdisc/'),
    ('ערב מחווה לקווין, דייר סטרייטס וגאנז אנד רוזס', 'הופעה חיה', 'https://modiinapp.com/en/page/5732/queen-dire-straits-guns-roses-tribute-night-with-pritzat-disc-live-at'),
    ('הופעה במועדון Volume', 'מעלה אדומים', 'https://www.instagram.com/pritzat_disc_band/'),
    ('סט אקוסטי, Get Back', 'יקב נבו', 'https://www.youtube.com/watch?v=Jga5UCIiITw'),
    ('רישום קונצרטים ואירועים', 'כיכר המוזיקה', 'https://kikar-hamusica.com/shows/he/event/%D7%A4%D7%A8%D7%99%D7%A6%D7%AA-%D7%93%D7%99%D7%A1%D7%A7/'),
]

FAQ = [
    ('לאילו גילאים מתאימים השיעורים?', 'לכולם. ילדים, נוער ומבוגרים, בלי גיל מינימום או מקסימום. הקצב מותאם לכל תלמיד בנפרד.'),
    ('השיעורים רק באולפן בבית הכרם?', 'לא בהכרח. אפשר גם באולפן וגם אצלכם בבית, בכל ירושלים והסביבה. אומרים מה נוח ומתאמים לפי זה.'),
    ('מה זה קורס גיטרה דיגיטלי, ובמה הוא שונה משיעור פרטי?', 'קורס מצולם ללימוד עצמי, בקצב שלכם ומכל מקום, עם אפשרות לשלוח שאלה או הקלטת תרגול לקבלת משוב. שיעור פרטי הוא מפגש חי, אישי, קבוע.'),
    ('אפשר גם להזמין את הלהקה או ציוד הגברה לאירוע?', 'כן. אני מנהל גם את להקת פריצת דיסק וגם מספק הגברה, תאורה והשכרת ציוד. אותו מספר לכל הדברים.'),
]

# ------------------------------------------------------------- templates ---
def esc(s): return html.escape(s, quote=True)

def business_ld():
    return {
        "@type": "LocalBusiness", "@id": BASE + "#business", "name": "דן אילון, שיעורי נגינה", "url": BASE,
        "telephone": TEL, "email": EMAIL, "image": BASE + "assets/og.png",
        "address": {"@type": "PostalAddress", "addressLocality": "ירושלים", "addressCountry": "IL"},
        "areaServed": "ירושלים והסביבה",
        "description": "שיעורי מוזיקה פרטיים, קורסי גיטרה דיגיטליים, חדר חזרות, הגברה ותאורה, ולהקת פריצת דיסק לאירועים. ירושלים והסביבה.",
    }

def band_ld():
    return {"@type": "MusicGroup", "@id": BASE + "band/#band", "name": "פריצת דיסק",
            "genre": ["Rock", "Cover"], "url": BASE + "band/",
            "member": {"@type": "Person", "name": "דן אילון"}}

def page(path, title, desc, body, crumbs=None, current=None, extra_ld=None):
    depth = path.count('/')
    r = '../' * depth
    ld = {"@context": "https://schema.org", "@graph": [business_ld(), band_ld()] + (extra_ld or [])}
    if crumbs:
        items = [{"@type": "ListItem", "position": 1, "name": "ראשי", "item": BASE}]
        for i, (u, n) in enumerate(crumbs, 2):
            items.append({"@type": "ListItem", "position": i, "name": n, **({"item": BASE + u} if u else {})})
        ld["@graph"].append({"@type": "BreadcrumbList", "itemListElement": items})
        crumb_html = '<nav class="crumbs" aria-label="פירורי לחם"><a href="' + r + '">ראשי</a>' + ''.join(
            '<span>/</span>' + (f'<a href="{r}{u}">{esc(n)}</a>' if u else f'<span aria-current="page">{esc(n)}</span>') for u, n in crumbs) + '</nav>'
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
<meta name="theme-color" content="#18130e">
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
<link href="https://fonts.googleapis.com/css2?family=Suez+One&family=IBM+Plex+Sans+Hebrew:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{r}assets/site.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<a class="skip" href="#main">דלג לתוכן</a>
<header class="hdr">
  <div class="wrap">
    <a class="logo" href="{r}" aria-label="דן אילון, לדף הבית">{LOGO}<b>דן אילון</b></a>
    <nav class="menu" id="menu" aria-label="ניווט ראשי">{menu}</nav>
    <button class="burger" type="button" aria-label="תפריט" aria-controls="menu" aria-expanded="false"><span></span></button>
    <div class="hdr-call"><a class="num" href="tel:{TEL}">{PHONE}</a><a class="btn btn-ink btn-small" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a></div>
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
        <h2>דן אילון</h2>
        <p>שיעורי מוזיקה ולהקת פריצת דיסק, ירושלים והסביבה.</p>
        <a class="num big" href="tel:{TEL}">{PHONE}</a>
        <a href="{WA}" target="_blank" rel="noopener">וואטסאפ</a>
      </div>
      <div><h2>שירותים</h2><ul>{''.join(f'<li><a href="{r}{s["slug"]}/">{s["name"]}</a></li>' for s in SERVICES)}</ul></div>
      <div><h2>עוד</h2><ul><li><a href="{r}about/">על דן</a></li><li><a href="{r}contact/">יצירת קשר</a></li><li><a href="{r}assets/dan-eilon.vcf" download>שמירת איש קשר</a></li></ul></div>
      <div><h2>ברשת</h2><ul><li><a href="https://www.facebook.com/DanEilonMusic/" target="_blank" rel="noopener">פייסבוק</a></li><li><a href="https://www.instagram.com/pritzat_disc_band/" target="_blank" rel="noopener">אינסטגרם</a></li></ul></div>
    </div>
    <div class="base"><span>© דן אילון, ירושלים והסביבה</span><span><a href="{r}accessibility/">הצהרת נגישות</a> · אתר: <a href="{r}../../../index.html">אריאל אילון</a></span></div>
  </div>
</footer>
<nav class="mbar" aria-label="יצירת קשר מהירה"><a href="tel:{TEL}">חייגו לדן</a><a href="{WA}" target="_blank" rel="noopener">וואטסאפ</a></nav>
<script src="{r}assets/site.js" defer></script>
</body>
</html>
'''

def call_card(kicker='שאלה על שיעור, על הלהקה או על ציוד?'):
    return f'''<div class="card-call">
  <h2>{esc(kicker)}</h2>
  <p>הכי מהיר זה וואטסאפ. אפשר גם להתקשר.</p>
  <a class="num" href="tel:{TEL}">{PHONE}</a>
  <a class="btn btn-ink" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a>
  <a class="btn btn-line" href="tel:{TEL}">{ICON_PHONE}חייגו</a>
</div>'''

def aside(r, current_slug=None):
    others = ''.join(f'<li><a href="{r}{s["slug"]}/">{s["name"]}</a></li>' for s in SERVICES if s['slug'] != current_slug)
    return f'''<aside class="aside">
  {call_card()}
  <div class="card-plain"><h3>עוד שירותים</h3><ul>{others}</ul></div>
</aside>'''

def band_strip(r):
    return f'''<section class="band-strip" aria-label="שמירת המספר">
  <div class="wrap">
    <div><h2>שמרו את המספר של דן.</h2><p>שיעור, קורס דיגיטלי, חדר חזרות, הלהקה או ציוד הגברה, אותו מספר לכול.</p></div>
    <a class="btn btn-ink" href="{r}assets/dan-eilon.vcf" download>שמירה באנשי הקשר</a>
  </div>
</section>'''

def yt_box(v):
    return f'''<div class="yt rv" data-id="{v['id']}" data-title="{esc(v['title'])}" role="button" tabindex="0" aria-label="הפעלת סרטון: {esc(v['title'])}">
  <img src="https://img.youtube.com/vi/{v['id']}/hqdefault.jpg" alt="" loading="lazy">
  <div class="play"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span></div>
  <figcaption>{esc(v['title'])}</figcaption>
</div>'''

def hero_photo(r, kicker, h1, lead, short=False, img_alt='להקת פריצת דיסק מופיעה בלילה'):
    return f'''<section class="hero-photo{" short" if short else ""}" aria-label="פתיח">
  <picture>
    <source media="(max-width:640px)" srcset="{r}assets/img/hero-band-sm.jpg">
    <img src="{r}assets/img/hero-band.jpg" alt="{esc(img_alt)}" loading="eager" fetchpriority="high">
  </picture>
  <div class="hero-photo-scrim" aria-hidden="true"></div>
  <div class="hero-photo-inner">
    <div class="wrap">
      <p class="where">{kicker}</p>
      <h1>{h1}</h1>
      <p class="lead">{lead}</p>
    </div>
  </div>
</section>'''

# ----------------------------------------------------------------- pages ---
def home():
    r = ''
    faq = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ[:2])
    svc = ''.join(f'<a href="{s["slug"]}/"><h3>{s["name"]}</h3><p>{s["short"]}</p></a>' for s in SERVICES)
    body = f'''{hero_photo(r, 'ירושלים והסביבה &middot; עשרים שנה בעולם המוזיקה',
        'שיעורי נגינה, ולהקה שממשיכה עד הבמה.',
        'אני דן אילון. שיעורי מוזיקה פרטיים וקורסי גיטרה דיגיטליים בכל ירושלים והסביבה, חדר חזרות בבית הכרם, ולהקת <b>פריצת דיסק</b> עם הגברה ותאורה לאירועים.')}
<div class="wrap">
  <div class="fork lifted rv">
    <a href="private-lessons/">
      <span class="tag">ללמוד</span>
      <h2>שיעורי מוזיקה פרטיים</h2>
      <p>גיטרה, תופים, פסנתר, שירה והדרכת הרכבים. באולפן או אצלכם בבית, בכל ירושלים והסביבה.</p>
      <span class="go">לפרטים ←</span>
    </a>
    <a href="band/">
      <span class="tag">להזמין</span>
      <h2>פריצת דיסק</h2>
      <p>להקת קאברים ומחווה לרוק לחתונות, בר ובת מצווה ואירועים, כולל הגברה ותאורה.</p>
      <span class="go">לפרטי הלהקה ←</span>
    </a>
    <div class="stub-l" aria-hidden="true"></div>
    <div class="stub-r" aria-hidden="true"></div>
  </div>
</div>

<section class="sec" aria-label="שירותים">
  <div class="wrap">
    <h2 class="sec-title rv">חמישה דברים שאני עושה</h2>
    <p class="sec-intro rv">כל שירות עם עמוד משלו. אותו מספר וואטסאפ לכולם.</p>
    <div class="instruments board rv">{svc}</div>
  </div>
</section>

<section class="sec paper2" aria-label="הלהקה">
  <div class="wrap">
    <div class="bigquote rv">
      <span class="mark" aria-hidden="true">״</span>
      <figure><blockquote>פריצת דיסק היא להקת המחווה שלי לענקי הרוק: קווין, דייר סטרייטס וגאנז אנד רוזס, לצד סט אקוסטי לאירועים אינטימיים.</blockquote><cite>דן אילון · <a href="band/">לעמוד הלהקה וסרטונים</a></cite></figure>
    </div>
  </div>
</section>

<section class="sec" aria-label="שאלות" style="padding-top:36px">
  <div class="wrap faq rv">
    <h2 class="sec-title" style="font-size:32px">שאלות שחוזרות</h2>
    {faq}
    <p style="margin-top:18px"><a href="contact/">לכל השאלות בעמוד יצירת קשר</a></p>
  </div>
</section>
{band_strip(r)}'''
    return page('index.html', 'דן אילון | שיעורי נגינה ולהקת פריצת דיסק, ירושלים והסביבה',
                'שיעורי מוזיקה פרטיים, קורסי גיטרה דיגיטליים, חדר חזרות, הגברה ותאורה, ולהקת פריצת דיסק לאירועים. ירושלים והסביבה. 052-437-8572.',
                body)

def private_lessons():
    r = '../'
    inst = ''.join(f'<h2>{esc(i["name"])}</h2><p>{esc(i["text"])}</p>' for i in INSTRUMENTS)
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>שיעורי מוזיקה פרטיים בכל ירושלים והסביבה</h1>
    <p class="lead">גיטרה, תופים, פסנתר, פיתוח קול והדרכת הרכבים. שיעור אישי, אחד על אחד, לכל גיל ורמה. באולפן בבית הכרם או אצלכם בבית, בכל ירושלים והסביבה.</p>
    <h2>איך בנוי השיעור</h2>
    <p>שיעור אישי, לא בקבוצה. הקצב נקבע לפי התלמיד. חלק מהשיעור טכני, וחלק עבודה על שיר או קטע שהתלמיד בחר.</p>
    <h2>באולפן או אצלכם בבית</h2>
    <p>מי שנוח לו להגיע, השיעור באולפן בבית הכרם. מי שמעדיף, אני מגיע אליכם, לכל ירושלים והסביבה. אומרים מה עדיף ומתאמים לפי זה.</p>
    {inst}
    <h2>תרגול בין השיעורים</h2>
    <p>תרגול קצר וקבוע עוזר יותר מתרגול ארוך פעם בשבוע. גם עשר דקות ביום, ברוב הימים, מספיקות כדי להתקדם. תלמידים שרוצים לתרגל על ציוד מלא יכולים לשכור את <a href="{r}studio/">חדר החזרות</a>.</p>
    <h2>מי שרוצה גם ללמוד לבד</h2>
    <p>לצד השיעורים הפרטיים יש גם <a href="{r}digital-guitar/">קורס גיטרה דיגיטלי</a>, ללימוד עצמי בין שיעור לשיעור או במקום שיעור קבוע.</p>
    <div class="note"><b>לא בטוחים באיזה כלי להתחיל?</b> אפשר לשלוח וואטסאפ ולהתייעץ לפני שקובעים שיעור ראשון.</div>
  </article>
  {aside(r, 'private-lessons')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Service", "name": "שיעורי מוזיקה פרטיים", "areaServed": "ירושלים והסביבה", "provider": {"@id": BASE + "#business"}}
    return page('private-lessons/index.html', 'שיעורי מוזיקה פרטיים | ירושלים והסביבה | דן אילון',
                'גיטרה, תופים, פסנתר, פיתוח קול והדרכת הרכבים. שיעורים אישיים לכל גיל, באולפן בבית הכרם או אצלכם בבית, בכל ירושלים והסביבה.',
                body, crumbs=[(None, 'שיעורים פרטיים')], current='private-lessons/', extra_ld=[svc_ld])

def digital_guitar():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>קורס גיטרה דיגיטלי</h1>
    <p class="lead">לא כולם יכולים להגיע לשיעור קבוע כל שבוע. הקורס הדיגיטלי בנוי משיעורים מצולמים שלומדים לפיהם בקצב אישי, מכל מקום.</p>
    <h2>למי זה מתאים</h2>
    <p>למי שרוצה להתחיל לנגן לבד, למי שגר רחוק מירושלים, ולתלמידים שרוצים תרגול נוסף בין השיעורים הפרטיים שלהם.</p>
    <h2>איך זה בנוי</h2>
    <p>שיעורים מצולמים לפי סדר, מהאחזקה הבסיסית של הגיטרה ועד אקורדים וליווי שירים שלמים. כל שיעור אפשר לחזור עליו כמה פעמים שצריך.</p>
    <h2>ליווי אישי, גם בדיגיטלי</h2>
    <p>מי שנתקע או רוצה משוב יכול לשלוח שאלה או הקלטת תרגול קצרה בוואטסאפ ולקבל תשובה אישית ממני, לא רק מהסרטונים.</p>
    <h2>שילוב עם שיעור חי</h2>
    <p>אפשר גם וגם: קורס דיגיטלי לתרגול עצמי, לצד <a href="{r}private-lessons/">שיעור פרטי</a> קבוע. מי שרוצה רק את הקורס, גם זה אפשרי.</p>
    <div class="note"><b>לפרטי הרשמה ומחיר:</b> שלחו הודעה בוואטסאפ, זה הכי מהיר.</div>
  </article>
  {aside(r, 'digital-guitar')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Course", "name": "קורס גיטרה דיגיטלי", "description": "שיעורי גיטרה מצולמים ללימוד עצמי בקצב אישי, עם ליווי אישי בוואטסאפ.", "provider": {"@id": BASE + "#business"}}
    return page('digital-guitar/index.html', 'קורס גיטרה דיגיטלי | דן אילון', 'שיעורי גיטרה מצולמים ללימוד עצמי בקצב אישי, מכל מקום, עם ליווי אישי בוואטסאפ.',
                body, crumbs=[(None, 'קורסי גיטרה דיגיטליים')], current='digital-guitar/', extra_ld=[svc_ld])

def studio():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>חדר חזרות, בית הכרם</h1>
    <p class="lead">חדר חזרות מאובזר באולפן בבית הכרם, ירושלים. משמש לשיעורים, לתרגול חופשי ולחזרות של הרכבים.</p>
    <h2>מה יש באולפן</h2>
    <ul class="picklist">
      <li>מערכת תופים מלאה</li>
      <li>קלידים חשמליים</li>
      <li>גיטרות קלאסיות, אקוסטיות וחשמליות</li>
      <li>גיטרת בס</li>
    </ul>
    <h2>למי זה מתאים</h2>
    <p>לתלמידים שרוצים לתרגל על ציוד מלא בין השיעורים, ולהרכבים שצריכים מקום קבוע לחזרות. גם מי שלא לומד אצלי באופן קבוע יכול לתאם שכירת החדר לפי שעה.</p>
    <h2>תיאום</h2>
    <p>שכירת החדר מתואמת מראש בטלפון או בוואטסאפ, לפי שעות פנויות.</p>
  </article>
  <aside class="aside">
    {call_card('לתאם שעה בחדר החזרות')}
  </aside>
</div>
</div>
{band_strip(r)}'''
    return page('studio/index.html', 'חדר חזרות | דן אילון, בית הכרם', 'חדר חזרות עם מערכת תופים, קלידים, גיטרות ובס, בבית הכרם, ירושלים. לשיעורים, לתרגול ולהרכבים, להשכרה לפי שעה.',
                body, crumbs=[(None, 'חדר חזרות')], current='studio/')

def band():
    r = '../'
    vids = ''.join(yt_box(v) for v in VIDEOS)
    credits = ''.join(f'<li><span class="what">{esc(name)}</span><a class="where" href="{url}" target="_blank" rel="noopener">{esc(where)} ↗</a></li>' for name, where, url in CREDITS)
    body = f'''{hero_photo(r, 'פריצת דיסק &middot; להקת קאברים ומחווה לרוק',
        'פריצת דיסק', 'מופיעים בחתונות, בר ובת מצווה, מסיבות פרטיות וערבי מחווה לענקי הרוק: קווין, דייר סטרייטס וגאנז אנד רוזס. יש גם הרכב אקוסטי מצומצם לאירועים אינטימיים, ואפשר להזמין גם הגברה ותאורה לאירוע.',
        short=True)}

<section class="sec paper2" aria-label="סרטונים">
  <div class="wrap">
    <h2 class="sec-title rv">מהבמה</h2>
    <p class="sec-intro rv">שלושה סרטונים אמיתיים מהופעות. לחיצה מפעילה את הסרטון מיוטיוב.</p>
    <div class="videos">{vids}</div>
  </div>
</section>

<section class="sec" aria-label="סוגי אירועים">
  <div class="wrap">
    <h2 class="sec-title rv">לאיזה אירוע</h2>
    <ul class="picklist rv" style="columns:2;column-gap:40px;max-width:640px">
      <li>חתונות וקבלות פנים</li>
      <li>בר ובת מצווה</li>
      <li>מסיבות פרטיות</li>
      <li>ערבי מחווה לרוק</li>
      <li>סט אקוסטי לאירוע אינטימי</li>
    </ul>
  </div>
</section>

<section class="sec paper2" aria-label="קרדיטים">
  <div class="wrap">
    <h2 class="sec-title rv">איפה כבר הופענו</h2>
    <ul class="credits rv">{credits}</ul>
  </div>
</section>

<section class="sec" aria-label="הזמנה">
  <div class="wrap">
    <div class="ticket rv">
      <h2>להזמין את פריצת דיסק לאירוע</h2>
      <p>ספרו מה סוג האירוע, מתי ואיפה, ותקבלו תשובה עם מה שאפשר להציע. אפשר להזמין גם רק הגברה ותאורה, ראו <a href="{r}equipment-rental/">עמוד הציוד</a>.</p>
      <div class="row">
        <a class="btn btn-ink" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a>
        <a class="btn btn-line" href="tel:{TEL}">{ICON_PHONE}חייגו</a>
        <a class="btn btn-line" href="mailto:{EMAIL}">{ICON_MAIL}מייל</a>
      </div>
    </div>
  </div>
</section>'''
    return page('band/index.html', 'פריצת דיסק | להקת קאברים ומחווה לרוק | דן אילון', 'להקת פריצת דיסק בניהול דן אילון: קאברים ומחווה לקווין, דייר סטרייטס וגאנז אנד רוזס. חתונות, בר ובת מצווה, מסיבות וסט אקוסטי.',
                body, crumbs=[(None, 'פריצת דיסק')], current='band/')

def equipment_rental():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>הגברה, תאורה והשכרת ציוד</h1>
    <p class="lead">מעבר להופעות של פריצת דיסק, אני מספק גם הגברה, תאורה וכלי נגינה לאירועים ולהפקות, בירושלים והסביבה.</p>
    <h2>הגברה</h2>
    <p>מערכות הגברה לאירועים בכל גודל, מקבלת פנים קטנה ועד אולם גדול. מתאים גם לאירוע בלי הזמנת הרכב מלא, כשצריך רק קול נקי לנאומים או למוזיקה מוקלטת.</p>
    <h2>תאורה</h2>
    <p>תאורת אווירה לאירוע, ותאורת במה להופעה. מותאם לגודל האירוע ולתקציב.</p>
    <h2>השכרת כלי נגינה</h2>
    <p>מערכת תופים, קלידים, גיטרות ובס להשכרה, אותו ציוד שבחדר החזרות באולפן. מתאים להרכב שצריך ציוד לערב אחד, בלי לסחוב את שלו.</p>
    <h2>למי זה מתאים</h2>
    <p>מפיקי אירועים, אולמות, ולהקות אחרות שצריכות ציוד לתאריך מסוים. גם כתוספת להזמנת פריצת דיסק לאירוע.</p>
    <div class="note"><b>לבדיקת זמינות ומחיר:</b> ספרו מה סוג האירוע, מתי ואיפה, בוואטסאפ.</div>
  </article>
  {aside(r, 'equipment-rental')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Service", "name": "הגברה, תאורה והשכרת ציוד", "areaServed": "ירושלים והסביבה", "provider": {"@id": BASE + "#business"}}
    return page('equipment-rental/index.html', 'הגברה, תאורה והשכרת ציוד | דן אילון', 'מערכות הגברה, תאורה וכלי נגינה להשכרה לאירועים והפקות, ירושלים והסביבה.',
                body, crumbs=[(None, 'הגברה ותאורה')], current='equipment-rental/', extra_ld=[svc_ld])

def about():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>קצת עליי</h1>
    <p class="lead">אני דן אילון. עשרים שנה בעולם המוזיקה, כנגן גיטרה ובס, כמורה וכמנהל להקה.</p>
    <h2>איך זה מתחבר</h2>
    <p>אני מלמד נגינה, פרטני ובקורס דיגיטלי, בכל ירושלים והסביבה: גיטרה, תופים, פסנתר, פיתוח קול והדרכת הרכבים. באותו זמן אני מנהל את פריצת דיסק, ומספק הגברה, תאורה וציוד לאירועים.</p>
    <h2>מהשיעור לבמה</h2>
    <p>שני העולמות מזינים אחד את השני. תלמידים שמתקדמים מוזמנים להצטרף להדרכת הרכבים באולפן, וחלקם ממשיכים לנגן גם בהרכבים חיים.</p>
    <h2>האולפן</h2>
    <p>השיעורים וההרכבים מתקיימים באולפן בבית הכרם, עם חדר חזרות מאובזר. פרטים בעמוד <a href="{r}studio/">חדר חזרות</a>.</p>
  </article>
  {aside(r)}
</div>
</div>
{band_strip(r)}'''
    return page('about/index.html', 'על דן אילון | שיעורי נגינה ולהקת פריצת דיסק', 'דן אילון, עשרים שנה בעולם המוזיקה: מורה למוזיקה בירושלים והסביבה, ומנהל להקת פריצת דיסק.',
                body, crumbs=[(None, 'על דן')], current='about/')

def contact():
    r = '../'
    faq_html = ''.join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in FAQ)
    body = f'''<div class="wrap">
<div class="page">
  <div>
    <h1>יצירת קשר</h1>
    <p class="lead">לשיעור, לקורס הדיגיטלי, לחדר החזרות, ללהקה או להגברה ותאורה, אותו מספר.</p>
    <p style="margin-bottom:10px"><a class="num" href="tel:{TEL}" style="font-size:clamp(32px,5vw,52px);color:var(--ink);text-decoration:none">{PHONE}</a></p>
    <p style="margin-bottom:26px"><a href="mailto:{EMAIL}">{EMAIL}</a></p>
    <div class="actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:40px">
      <a class="btn btn-ink" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a>
      <a class="btn btn-line" href="tel:{TEL}">{ICON_PHONE}חייגו</a>
      <a class="btn btn-line" href="mailto:{EMAIL}">{ICON_MAIL}מייל</a>
    </div>
    <h2 class="sec-title" style="font-size:30px;margin-bottom:16px">איפה זה</h2>
    <p style="color:var(--ink-2);margin-bottom:16px">האולפן וחדר החזרות בבית הכרם, ירושלים. שיעורים פרטיים גם בכל ירושלים והסביבה.</p>
    <div class="map"><iframe title="מפה: בית הכרם, ירושלים" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=%D7%91%D7%99%D7%AA+%D7%94%D7%9B%D7%A8%D7%9D+%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D&amp;z=13&amp;output=embed"></iframe></div>
    <h2 class="sec-title" style="font-size:30px;margin-top:48px">שאלות נפוצות</h2>
    <div class="faq">{faq_html}</div>
  </div>
  <aside class="aside">
    <div class="card-plain"><h3>שמירת איש קשר</h3><p style="margin-bottom:12px">כרטיס עם הטלפון והמייל, ישר לאנשי הקשר בטלפון.</p><a class="btn btn-line btn-small" href="{r}assets/dan-eilon.vcf" download>הורדה</a></div>
    <div class="card-plain"><h3>ברשת</h3><ul><li><a href="https://www.facebook.com/DanEilonMusic/" target="_blank" rel="noopener">פייסבוק, דן אילון</a></li><li><a href="https://www.facebook.com/pritzatdisc/" target="_blank" rel="noopener">פייסבוק, פריצת דיסק</a></li><li><a href="https://www.instagram.com/pritzat_disc_band/" target="_blank" rel="noopener">אינסטגרם, פריצת דיסק</a></li></ul></div>
  </aside>
</div>
</div>'''
    faq_ld = {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}
    return page('contact/index.html', f'יצירת קשר | דן אילון | {PHONE}', f'טלפון {PHONE}, וואטסאפ, מייל ומיקום. שיעורי מוזיקה, קורס גיטרה דיגיטלי, חדר חזרות, הגברה ותאורה, ולהקת פריצת דיסק.',
                body, crumbs=[(None, 'יצירת קשר')], current='contact/', extra_ld=[faq_ld])

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
    <p>המפה בעמוד יצירת הקשר וסרטוני היוטיוב בעמוד הלהקה מגיעים משירותי צד שלישי, ונגישותם תלויה בהם.</p>
    <h2>נתקלתם בבעיה?</h2>
    <p>ספרו לנו ונתקן. אפשר להתקשר ל-<a class="num" href="tel:{TEL}">{PHONE}</a> או לשלוח <a href="{WA}" target="_blank" rel="noopener">וואטסאפ</a>.</p>
    <p style="color:var(--mute);font-size:15px">ההצהרה עודכנה בספטמבר 2026.</p>
  </article>
  {aside(r)}
</div>
</div>'''
    return page('accessibility/index.html', 'הצהרת נגישות | דן אילון', 'הצהרת הנגישות של אתר דן אילון.', body, crumbs=[(None, 'הצהרת נגישות')])

# ----------------------------------------------------------------- write ---
def write(path, content):
    full = os.path.join(HERE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content)
    return path

def main():
    out = [write('index.html', home()), write('private-lessons/index.html', private_lessons()),
           write('digital-guitar/index.html', digital_guitar()), write('studio/index.html', studio()),
           write('band/index.html', band()), write('equipment-rental/index.html', equipment_rental()),
           write('about/index.html', about()), write('contact/index.html', contact()),
           write('accessibility/index.html', accessibility())]
    urls = ''.join(f'<url><loc>{BASE}{p[:-10]}</loc></url>' for p in out)
    write('sitemap.xml', f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    write('assets/dan-eilon.vcf', 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;דן אילון;;;\r\nFN:דן אילון\r\nORG:דן אילון, שיעורי נגינה\r\nTITLE:מורה למוזיקה\r\n'
          f'TEL;TYPE=CELL,VOICE:{TEL}\r\nEMAIL:{EMAIL}\r\nADR;TYPE=WORK:;;בית הכרם;ירושלים;;;ישראל\r\nURL:{BASE}\r\n'
          'NOTE:שיעורי מוזיקה פרטיים, קורס גיטרה דיגיטלי, חדר חזרות, הגברה ותאורה, ולהקת פריצת דיסק.\r\nEND:VCARD\r\n')
    write('assets/icon.svg', LOGO.replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"'))
    # remove files from the previous page structure that no longer exist
    import shutil
    for stale in ('lessons', 'students'):
        p = os.path.join(HERE, stale)
        if os.path.isdir(p):
            shutil.rmtree(p)
    print(len(out), 'pages')
    bad = [p for p in out if '—' in open(os.path.join(HERE, p), encoding='utf-8').read()]
    print('em-dash check:', 'OK' if not bad else bad)

if __name__ == '__main__':
    main()
