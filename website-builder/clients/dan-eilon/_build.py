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
    dict(name='פסנתר'), dict(name='גיטרה'), dict(name='תופים'), dict(name='פיתוח קול'),
]

LOCATIONS = ['ארנונה', 'בקעה', 'הגבעה הצרפתית', 'בית הכרם', 'הפלמ"ח', 'אחד העם', 'גבעת זאב', 'כפר אדומים']

ROOM_HOURS = [('8:00–14:00', '40 ₪', '100 ₪'), ('14:00–20:30', '60 ₪', '150 ₪')]
ROOM_EQUIPMENT = ['גיטרות', 'מגברים', 'מערכת תופים', 'פסנתר חשמלי', 'הגברה ומיקרופונים']
RENTAL_EQUIPMENT = ['מערכות הגברה', 'מערכות תופים', 'מגברים לגיטרות', 'כל סוגי הגיטרות', 'פסנתרים חשמליים']

TRIBUTE_ARTISTS = ['U2', 'Queen', 'Dire Straits', 'ABBA', 'The Beatles', 'Bon Jovi', 'Pink Floyd', 'Led Zeppelin',
                    "Guns N' Roses", 'Elton John', 'Sting', 'Leonard Cohen', 'Simon & Garfunkel', 'Elvis Presley', 'Frank Sinatra']
ISRAELI_SHOWS = ['מחווה לאסקימו לימון', 'ערב הדיוות הגדולות', 'נוסטלגיה ישראלית',
                 'שלמה ארצי וארז איינשטיין', 'להיטים ישראליים עכשוויים', 'מחווה למשפחת בנאי']
SHOW_FORMATS = [
    ('אקוסטי', 'מופע מצומצם ומרגש, לאירוע אינטימי.'),
    ('קצבי', 'מופע קצבי ומקפיץ, לרחבת ריקודים.'),
    ('מסיבה', 'מופע המסיבה המטורף, האנרגיה הכי גבוהה.'),
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

def hero_photo(r, kicker, h1, lead, short=False, img_alt='להקת פריצת דיסק מופיעה בלילה', img='hero-band', caption=None):
    cap = f'<p class="hero-photo-caption">{esc(caption)}</p>' if caption else ''
    return f'''<section class="hero-photo{" short" if short else ""}" aria-label="פתיח">
  <picture>
    <source media="(max-width:640px)" srcset="{r}assets/img/{img}-sm.jpg">
    <img src="{r}assets/img/{img}.jpg" alt="{esc(img_alt)}" loading="eager" fetchpriority="high">
  </picture>
  <div class="hero-photo-scrim" aria-hidden="true"></div>
  <div class="hero-photo-inner">
    <div class="wrap">
      <p class="where">{kicker}</p>
      <h1>{h1}</h1>
      <p class="lead">{lead}</p>
      {cap}
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
      <figure><blockquote>פריצת דיסק היא הלהקה שלי לעשרים מופעי מחווה, ממופע רוק מקפיץ ועד סט אקוסטי מרגש. אפשר גם לבקש כל שיר ולבנות מופע לפי טעם.</blockquote><cite>דן אילון · <a href="band/">לעמוד הלהקה וסרטונים</a></cite></figure>
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
    inst = ''.join(f'<li>{esc(i["name"])}</li>' for i in INSTRUMENTS)
    locs = ''.join(f'<li>{esc(loc)}</li>' for loc in LOCATIONS)
    body = f'''{hero_photo(r, 'שיעורי מוזיקה פרטיים &middot; ירושלים והסביבה', 'שיעורי מוזיקה פרטיים',
        'פסנתר, גיטרה, תופים ופיתוח קול, עם מורים מקצועיים ונעימים שיודעים להתאים את הקצב לכל תלמיד ותלמידה.',
        short=True, img='hero-lessons', img_alt='ידיים מנגנות אקורד על גיטרה באור חם',
        caption='תמונת אווירה')}
<div class="wrap">
<div class="page">
  <article class="prose">
    <h2>כלי הנגינה</h2>
    <ul class="picklist" style="columns:2;column-gap:30px">{inst}</ul>
    <h2>בחרו את המקום הקרוב אליכם</h2>
    <p>השיעורים מתקיימים במספר מיקומים בירושלים והסביבה:</p>
    <ul class="picklist" style="columns:2;column-gap:30px">{locs}</ul>
    <h2>איך קובעים שיעור</h2>
    <p>שלחו הודעה בוואטסאפ, ואנחנו נחזור אליכם תוך 24 שעות.</p>
    <div class="note"><b>ציינו בהודעה:</b> שם התלמיד/ה, המקום המועדף עליכם, ואיזה כלי.</div>
    <h2>מי שרוצה גם ללמוד לבד</h2>
    <p>לצד השיעורים הפרטיים יש גם <a href="{r}digital-guitar/">קורס גיטרה דיגיטלי</a>, ומי שרוצה לתרגל על ציוד מלא יכול לשכור את <a href="{r}studio/">חדר החזרות</a> בבית הכרם.</p>
  </article>
  {aside(r, 'private-lessons')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Service", "name": "שיעורי מוזיקה פרטיים", "areaServed": ["ירושלים"] + LOCATIONS, "provider": {"@id": BASE + "#business"}}
    return page('private-lessons/index.html', 'שיעורי מוזיקה פרטיים | ירושלים והסביבה | דן אילון',
                'פסנתר, גיטרה, תופים ופיתוח קול, עם מורים מקצועיים ונעימים. שיעורים בארנונה, בקעה, הגבעה הצרפתית, בית הכרם, הפלמ"ח, אחד העם, גבעת זאב וכפר אדומים.',
                body, crumbs=[(None, 'שיעורים פרטיים')], current='private-lessons/', extra_ld=[svc_ld])

def digital_guitar():
    r = '../'
    body = f'''<div class="wrap">
<div class="page">
  <article class="prose">
    <h1>קורס גיטרה דיגיטלי</h1>
    <p class="lead">הקורס היחיד שבו אתם מקבלים פידבק אישי מגיטריסט מקצועי על הנגינה שלכם, לא רק סרטוני לימוד.</p>
    <h2>25 שנה, אלפי תלמידים</h2>
    <p>אני מלמד גיטרה כבר עשרים וחמש שנה, לאלפי תלמידים. הדבר הכי חשוב שלמדתי מזה הוא שפידבק ממורה מקצועי, שיכול לתקן ולהסביר בדיוק מה לשפר, שווה יותר מכל סרטון לימוד עצמו.</p>
    <h2>איך זה עובד</h2>
    <p>אתם מקבלים ממני סרטון קצר. אתם מתרגלים ומחזירים לי סרטון של עצמכם מנגנים את אותו הקטע. אני צופה בו, ועונה לכם בוואטסאפ עם הערות מדויקות: מה לתקן, ואיך.</p>
    <h2>שלושים רמות, שישה סרטונים בכל רמה</h2>
    <p>הקורס בנוי משלושים רמות. בכל רמה מקבלים שישה סרטונים מותאמים בדיוק לאיפה שאתם נמצאים, ומתקדמים משם לרמה הבאה. יש לי תלמידים שבשיטה הזו התקדמו הכי מהר מכל מי שלימדתי. עלות כל רמה: <b>99 ₪</b>.</p>
    <h2>למי זה מתאים</h2>
    <p>לתלמידים עם משמעת עצמית, שיכולים להתאמן לפחות עשרים דקות ביום, או שעה וחצי בשבוע. בלי תרגול קבוע, גם הפידבק הכי מדויק לא עוזר.</p>
    <div class="note"><b>לפרטי הרשמה:</b> שלחו הודעה בוואטסאפ. אפשר גם לשלב את הקורס עם <a href="{r}private-lessons/">שיעור פרטי</a> קבוע.</div>
  </article>
  {aside(r, 'digital-guitar')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Course", "name": "קורס גיטרה דיגיטלי", "description": "קורס גיטרה דיגיטלי בשלושים רמות, שישה סרטונים בכל רמה, עם פידבק אישי בוואטסאפ מגיטריסט מקצועי בעל 25 שנות ניסיון.",
              "provider": {"@id": BASE + "#business"}, "offers": {"@type": "Offer", "price": "99", "priceCurrency": "ILS"}}
    return page('digital-guitar/index.html', 'קורס גיטרה דיגיטלי | פידבק אישי מגיטריסט מקצועי | דן אילון',
                'קורס גיטרה דיגיטלי בשלושים רמות, שישה סרטונים בכל רמה, 99 ₪ לרמה. שולחים סרטון תרגול ומקבלים פידבק אישי בוואטסאפ מגיטריסט עם 25 שנות ניסיון.',
                body, crumbs=[(None, 'קורסי גיטרה דיגיטליים')], current='digital-guitar/', extra_ld=[svc_ld])

def studio():
    r = '../'
    equip = ''.join(f'<li>{esc(e)}</li>' for e in ROOM_EQUIPMENT)
    rows = ''.join(f'<tr><td><bdi>{esc(h)}</bdi></td><td class="num"><bdi>{esc(p1)}</bdi></td><td class="num"><bdi>{esc(p3)}</bdi></td></tr>' for h, p1, p3 in ROOM_HOURS)
    body = f'''{hero_photo(r, 'חדר חזרות &middot; בית הכרם, ירושלים', 'חדר חזרות, בית הכרם',
        'חדר חזרות ברמת בית הכרם, ירושלים. משמש לשיעורים, לתרגול חופשי ולחזרות של הרכבים.',
        short=True, img='hero-studio', img_alt='מערכת תופים וגיטרות בחדר חזרות באור חם',
        caption='תמונת אווירה')}
<div class="wrap">
<div class="page">
  <article class="prose">
    <h2>מה יש בחדר</h2>
    <ul class="picklist" style="columns:2;column-gap:30px">{equip}</ul>
    <h2>שעות פעילות ומחירים</h2>
    <table class="pricing">
      <thead><tr><th>שעות</th><th>לשעה</th><th>לשלוש שעות</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <div class="note"><b>לתשומת לב:</b> החדר מתנהל בתפעול עצמי, ההרכב מפעיל את הציוד בעצמו. אין טכנאי במקום.</div>
    <h2>תיאום</h2>
    <p>שכירת החדר מתואמת מראש בטלפון או בוואטסאפ, לפי שעות פנויות.</p>
  </article>
  <aside class="aside">
    {call_card('לתאם שעה בחדר החזרות')}
  </aside>
</div>
</div>
{band_strip(r)}'''
    return page('studio/index.html', 'חדר חזרות | דן אילון, בית הכרם', 'חדר חזרות ברמת בית הכרם, ירושלים: גיטרות, מגברים, מערכת תופים, פסנתר חשמלי, הגברה ומיקרופונים. 40–60 ₪ לשעה, תפעול עצמי.',
                body, crumbs=[(None, 'חדר חזרות')], current='studio/')

def band():
    r = '../'
    vids = ''.join(yt_box(v) for v in VIDEOS)
    credits = ''.join(f'<li><span class="what">{esc(name)}</span><a class="where" href="{url}" target="_blank" rel="noopener">{esc(where)} ↗</a></li>' for name, where, url in CREDITS)
    artists = ''.join(f'<span>{esc(a)}</span>' for a in TRIBUTE_ARTISTS)
    israeli = ''.join(f'<span>{esc(a)}</span>' for a in ISRAELI_SHOWS)
    formats = ''.join(f'<div><h3>{esc(name)}</h3><p>{esc(text)}</p></div>' for name, text in SHOW_FORMATS)
    body = f'''{hero_photo(r, 'פריצת דיסק &middot; להקת קאברים ומחווה לרוק',
        'פריצת דיסק', 'עשרים מופעי מחווה, מסיבה או סט אקוסטי, עם הגברה ותאורה מלאים. לא מצאתם מה שאתם מחפשים? מבקשים כל שיר, ובונים איתנו את המופע שאתם אוהבים.',
        short=True)}

<section class="sec paper2" aria-label="סרטונים">
  <div class="wrap">
    <h2 class="sec-title rv">מהבמה</h2>
    <p class="sec-intro rv">שלושה סרטונים אמיתיים מהופעות. לחיצה מפעילה את הסרטון מיוטיוב.</p>
    <div class="videos">{vids}</div>
  </div>
</section>

<section class="sec" aria-label="מופעי מחווה">
  <div class="wrap">
    <h2 class="sec-title rv">עשרים מופעי מחווה</h2>
    <p class="sec-intro rv">הלהיטים הגדולים, על במה אחת. אפשר לבחור מופע אחד, או לשלב בין כמה מהם באותו ערב.</p>
    <div class="lineup rv">{artists}</div>
    <h3 style="font-family:var(--display);font-weight:400;font-size:22px;margin:32px 0 14px">חגיגה ישראלית ונוסטלגית</h3>
    <div class="lineup israeli rv">{israeli}</div>
  </div>
</section>

<section class="sec paper2" aria-label="פורמט המופע">
  <div class="wrap">
    <h2 class="sec-title rv">איזה מופע מתאים לכם</h2>
    <div class="formats rv">{formats}</div>
  </div>
</section>

<section class="sec" aria-label="בקשות אישיות">
  <div class="wrap">
    <div class="bigquote rv">
      <span class="mark" aria-hidden="true">״</span>
      <figure><blockquote>לא מצאתם כלום שמתאים? איתנו אפשר לבקש כל שיר שרוצים, ולהרכיב בעצמכם את המופע האהוב עליכם. יש עוד עשרות אמנים ושירים מעבר לרשימה.</blockquote><cite>דן אילון</cite></figure>
    </div>
  </div>
</section>

<section class="sec paper2" aria-label="סוגי אירועים">
  <div class="wrap">
    <h2 class="sec-title rv">לאיזה אירוע</h2>
    <ul class="picklist rv" style="columns:2;column-gap:40px;max-width:640px">
      <li>חתונות וקבלות פנים</li>
      <li>בר ובת מצווה</li>
      <li>מסיבות פרטיות</li>
      <li>ערבי מחווה</li>
      <li>סט אקוסטי לאירוע אינטימי</li>
    </ul>
  </div>
</section>

<section class="sec" aria-label="קרדיטים">
  <div class="wrap">
    <h2 class="sec-title rv">איפה כבר הופענו</h2>
    <ul class="credits rv">{credits}</ul>
  </div>
</section>

<section class="sec paper2" aria-label="הזמנה">
  <div class="wrap">
    <div class="ticket rv">
      <h2>להזמין את פריצת דיסק לאירוע</h2>
      <p>ספרו מה סוג האירוע, מתי ואיפה, ואיזה מופע מעניין אתכם (או אם אתם רוצים לבנות מופע לפי בקשה) ותקבלו תשובה עם מה שאפשר להציע. הלהקה מגיעה עם הגברה ותאורה מלאים. אפשר להזמין גם רק ציוד, ראו <a href="{r}equipment-rental/">עמוד ההגברה והתאורה</a>.</p>
      <div class="row">
        <a class="btn btn-ink" href="{WA}" target="_blank" rel="noopener">{ICON_WA}וואטסאפ</a>
        <a class="btn btn-line" href="tel:{TEL}">{ICON_PHONE}חייגו</a>
        <a class="btn btn-line" href="mailto:{EMAIL}">{ICON_MAIL}מייל</a>
      </div>
    </div>
  </div>
</section>'''
    return page('band/index.html', 'פריצת דיסק | עשרים מופעי מחווה | דן אילון', 'להקת פריצת דיסק בניהול דן אילון: עשרים מופעי מחווה (Queen, ABBA, The Beatles ועוד), מופע מסיבה, סט אקוסטי, או מופע לפי בקשה. חתונות, בר ובת מצווה ומסיבות, עם הגברה ותאורה מלאים.',
                body, crumbs=[(None, 'פריצת דיסק')], current='band/')

def equipment_rental():
    r = '../'
    equip = ''.join(f'<li>{esc(e)}</li>' for e in RENTAL_EQUIPMENT)
    body = f'''{hero_photo(r, 'הגברה ותאורה &middot; ירושלים והסביבה', 'הגברה, תאורה והשכרת ציוד',
        'אנחנו מספקים הגברה ותאורה לכל סוגי האירועים, בירושלים והסביבה.',
        short=True, img='hero-equipment', img_alt='מערכת הגברה ותאורת במה זהובה',
        caption='תמונת אווירה')}
<div class="wrap">
<div class="page">
  <article class="prose">
    <h2>שתי דרכים לשכור</h2>
    <p><b>שכירת ציוד עצמאית:</b> אתם לוקחים את הציוד ומפעילים אותו בעצמכם.</p>
    <p><b>שירות מלא:</b> אנחנו מגיעים עם איש סאונד מקצועי שמפעיל הכל עבורכם, מהחיבור ועד סוף האירוע.</p>
    <h2>מה יש להשכרה</h2>
    <ul class="picklist" style="columns:2;column-gap:30px">{equip}</ul>
    <p>ועוד ציוד, לפי הצורך של האירוע.</p>
    <h2>למי זה מתאים</h2>
    <p>מפיקי אירועים, אולמות, ולהקות אחרות שצריכות ציוד לתאריך מסוים. גם כתוספת להזמנת פריצת דיסק לאירוע.</p>
    <div class="note"><b>לבדיקת זמינות ומחיר:</b> ספרו מה סוג האירוע, מתי ואיפה, ואם אתם צריכים גם איש סאונד, בוואטסאפ.</div>
  </article>
  {aside(r, 'equipment-rental')}
</div>
</div>
{band_strip(r)}'''
    svc_ld = {"@type": "Service", "name": "הגברה, תאורה והשכרת ציוד", "areaServed": "ירושלים והסביבה", "provider": {"@id": BASE + "#business"}}
    return page('equipment-rental/index.html', 'הגברה, תאורה והשכרת ציוד | דן אילון', 'מערכות הגברה, מערכות תופים, מגברים לגיטרות, גיטרות ופסנתרים חשמליים להשכרה, עצמאית או עם איש סאונד. ירושלים והסביבה.',
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
