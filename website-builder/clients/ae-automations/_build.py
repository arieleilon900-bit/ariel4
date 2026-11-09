# -*- coding: utf-8 -*-
"""Builds the A.E Automations site (5 pages + accessibility). Edit content here, run: python3 _build.py"""
import os, json
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = 'https://go.onerishon.com'
PHONE, WA = '052-4666175', '972524666175'
PIXEL = '346922048470137'

WA_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-2a13 13 0 0 0 6.6 1.8c7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2.1 0-4.1-.6-5.9-1.7l-.4-.3-3.8 1.2 1.2-3.7-.3-.4a10.4 10.4 0 0 1-1.7-5.7C5.1 10 10 5.2 16 5.2S26.9 10 26.9 15.9 22 26.4 16 26.4zm5.9-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.3c-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.6.3-.5c.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.4 1.4.6 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>'

def wa(text):
    from urllib.parse import quote
    return f'https://wa.me/{WA}?text={quote(text)}'

PAGES = [('index.html','בית'),('demo.html','דמו חי'),('how.html','איך זה עובד'),('who.html','למי זה מתאים'),('about.html','עלינו וצור קשר')]

def head(title, desc, path):
    return f'''<!doctype html>
<html lang="he" dir="rtl" class="js-off no-webgl-pending">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0b211c">
<link rel="canonical" href="{SITE}/{'' if path=='index.html' else path}">
<meta property="og:type" content="website"><meta property="og:locale" content="he_IL">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{SITE}/assets/og.png"><meta property="og:url" content="{SITE}/{'' if path=='index.html' else path}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230d3a2b'/%3E%3Ctext x='32' y='42' font-size='26' font-family='monospace' font-weight='700' text-anchor='middle' fill='%23e6c46a'%3EAE%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=Suez+One&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
<script>document.documentElement.classList.remove('js-off')</script>
<!-- Meta Pixel (same pixel as the current landing page) -->
<script>!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','{PIXEL}');fbq('track','PageView');</script>
<script type="application/ld+json">{json.dumps({"@context":"https://schema.org","@type":"ProfessionalService","name":"A.E Automations","description":"מזכירה דיגיטלית בוואטסאפ לעסקים קטנים: מכוני לייזר, קליניקות ובעלי מקצוע","telephone":"+972524666175","areaServed":"IL","url":SITE}, ensure_ascii=False)}</script>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
'''

def header(cur, solid=False):
    links = ''.join(f'<a href="{p}"{" aria-current=page" if p==cur else ""}>{n}</a>' for p,n in PAGES)
    mlinks = ''.join(f'<a href="{p}"><span>0{i+1}</span>{n}</a>' for i,(p,n) in enumerate(PAGES))
    return f'''<header class="hdr{' solid' if solid else ''}"><div class="wrap">
<a class="logo" href="index.html" aria-label="A.E Automations, לדף הבית"><span class="logo-mark"><span>AE</span></span><b>A.E Automations</b></a>
<nav class="nav" aria-label="ראשי">{links}</nav>
<a class="btn wa sm hdr-cta" href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener">{WA_SVG}וואטסאפ</a>
<button class="burger" aria-label="תפריט" aria-expanded="false"><i></i><i></i><i></i></button>
</div></header>
<nav class="mnav" aria-label="תפריט נייד">{mlinks}<a class="btn wa" href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener">{WA_SVG}דברו עם אריאל</a></nav>
'''

def footer(extra_js=''):
    return f'''<footer class="ftr"><div class="wrap">
<div><a class="logo" href="index.html"><span class="logo-mark"><span>AE</span></span><b>A.E Automations</b></a>
<p style="margin-top:18px;max-width:38ch">מזכירה דיגיטלית בוואטסאפ לעסקים קטנים. עונה ללקוחות שלכם בשמכם, ושולחת לכם כל פנייה מסודרת.</p></div>
<div><h4>האתר</h4>{''.join(f'<a href="{p}">{n}</a>' for p,n in PAGES)}</div>
<div><h4>דברו איתנו</h4><a href="{wa('היי אריאל, הגעתי מהאתר')}" target="_blank" rel="noopener">וואטסאפ: <span class="mono" dir="ltr">{PHONE}</span></a><a href="tel:+972524666175">טלפון: <span class="mono" dir="ltr">{PHONE}</span></a><a href="accessibility.html">הצהרת נגישות</a></div>
<div class="small"><span>© 2026 A.E Automations · אריאל ואליה</span><span>הדמו באתר הוא המחשה. מה שכותבים בו לא נשלח ולא נשמר. האתר משתמש בפיקסל של Meta למדידת מודעות.</span></div>
</div></footer>
<a class="fab" href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener" aria-label="וואטסאפ" style="color:#fff">{WA_SVG}</a>
<div class="mbar"><a class="btn wa" href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener">{WA_SVG}וואטסאפ</a><a class="btn" href="demo.html">לנסות את הדמו</a></div>
<script src="assets/site.js"></script>
<script src="assets/demo.js"></script>
{extra_js}
</body></html>'''

def phead(crumb, title_lines, lede):
    lines = ''.join(f'<span class="ln"><span>{l}</span></span>' for l in title_lines)
    return f'''<section class="phead" data-hero><div class="wrap">
<span class="crumb"><a href="index.html">בית</a> / {crumb}</span>
<h1 class="d1">{lines}</h1><p class="lede rv">{lede}</p></div></section>'''

def band(title, sub, cta_text, cta_msg, clock='22:14'):
    return f'''<section class="band"><span class="t">{clock}</span><div class="wrap">
<div><h2 class="d2 rv">{title}</h2><p class="rv" style="margin-top:14px;max-width:46ch;font-size:19px;opacity:.9">{sub}</p></div>
<a class="btn wa rv" href="{wa(cta_msg)}" target="_blank" rel="noopener" data-cursor="כתבו">{WA_SVG}{cta_text}</a></div></section>'''

def cphone(inner, cls=''):
    return f'<div class="cphone {cls}"><div class="scr"><div class="wa-top"><div class="av">AE</div><div><b>מכון הלייזר שלך</b><small>מחוברת</small></div></div><div class="wa-body">{inner}</div></div></div>'

def m(cls, text, t=''):
    return f'<div class="msg {cls}">{text}{f"<time>{t}</time>" if t else ""}</div>'

# ---------------------------------------------------------------- HOME
home = head('A.E Automations · מזכירה בוואטסאפ שעונה ללקוחות שלכם', 'מזכירה דיגיטלית בוואטסאפ למכוני לייזר, קליניקות ובעלי מקצוע. עונה תוך שניות בשם העסק, אוספת פרטים ושולחת לכם מייל מסודר על כל פנייה.', 'index.html') + '''
<div class="pre" aria-hidden="true"><div><div class="mono">00:00</div><small>הלקוחה כותבת…</small></div></div>
''' + header('index.html') + f'''
<main id="main">
<section class="hero" data-hero>
  <div class="wrap">
    <div>
      <h1 class="d1"><span class="ln"><span>מזכירה בוואטסאפ</span></span><span class="ln"><span>שעונה <span class="hl">תוך שניות</span></span></span><span class="ln"><span>בשם העסק שלכם</span></span></h1>
      <p class="lede rv">לקוחה כותבת כשאתם באמצע טיפול, מתחת לכיור או ישנים. המזכירה עונה לה מהמספר שלכם ובמילים שלכם, מבררת מה היא צריכה ושולחת לכם מייל מסודר. אתם ממשיכים לעבוד.</p>
      <div class="hero-ctas rv">
        <a class="btn wa" href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener" data-cursor="כתבו">{WA_SVG}אני רוצה מזכירה כזו</a>
        <a class="btn ghost" href="demo.html">לנסות קודם את הדמו</a>
      </div>
      <p class="hero-note rv">לוחצים, וההודעה כבר כתובה. אריאל עונה בעצמו.</p>
      <div class="clock-chip rv">עכשיו <span class="mono" data-now>22:14</span> · <b>המזכירות שלנו מחוברות ועונות</b></div>
    </div>
    <div class="stage" aria-label="המחשה: טלפון שבו המזכירה עונה ללקוחה">
      <canvas id="phone3d" data-cursor="גררו"></canvas>
      <div class="phone-fallback">{cphone(m('in','היי, אפשר פרטים על לייזר לרגליים?','22:14')+m('out','היי! כיף שפנית 😊 איזה אזורים מעניינים אותך?','22:14')+m('in','רגליים ובית שחי, מנתניה','22:15')+m('out','רשמתי 🙏 המכון יחזור אלייך מחר אחרי 12.','22:15'))}</div>
    </div>
  </div>
  <div class="scroll-hint" aria-hidden="true">גללו<i></i></div>
</section>

<section class="day" aria-label="יום רגיל במכון">
  <div class="day-pin">
    <div>
      <div class="day-clock mono" aria-hidden="true">11:40</div>
      <div class="day-steps">
        <div class="day-step on"><h3>את באמצע טיפול. שלוש הודעות נכנסות.</h3><p>כל אחת מקבלת תשובה תוך שניות, בשם המכון. אף אחת לא מחכה עד שתתפני, ואף אחת לא הולכת לבדוק מכון אחר בינתיים.</p></div>
        <div class="day-step"><h3>הפסקה. במקום לגלול בין הודעות,</h3><p>מחכה לך מייל אחד על כל פנייה: שם, טלפון, מה היא רוצה ומתי נוח לה. כותבים "תור מחר 14:30", והלקוחה מקבלת אישור ותזכורת.</p></div>
        <div class="day-step"><h3>המכון סגור. היא עונה בכל זאת.</h3><p>מי שהחליטה ב-22:14 לברר על לייזר לא נשארת בלי מענה עד הבוקר. בבוקר הפרטים שלה כבר אצלך.</p></div>
      </div>
      <div class="day-bar" aria-hidden="true"><i><b></b></i><i><b></b></i><i><b></b></i></div>
    </div>
    <div class="day-phone day-chat">{cphone('')}</div>
  </div>
</section>

<section class="pad">
  <div class="wrap">
    <h2 class="d2 rv" style="max-width:16ch">אותו ערב, שני טלפונים</h2>
    <p class="lede rv" style="margin-top:16px">גררו את הקו באמצע. משמאל זה בלי מזכירה, מימין זה איתה.</p>
    <div class="ba rv" data-cursor="גררו">
      <div class="ba-side ba-before">
        <h3>בלי מזכירה: 4 הודעות מחכות מהבוקר</h3>
        <div class="mini"><div class="scr" style="background:#f6f1ec;padding:14px 10px;gap:8px">
          <div class="unread"><span class="dot">2</span><div><b>נועה</b><small>כמה עולה לייזר לרגליים? · 11:41</small></div></div>
          <div class="unread"><span class="dot">1</span><div><b>שירן</b><small>יש תור השבוע? · 13:02</small></div></div>
          <div class="unread"><span class="dot">3</span><div><b>מאיה</b><small>שלום?? 🙂 · 17:26</small></div></div>
          <div class="unread"><span class="dot">1</span><div><b>דנה</b><small>אתם פתוחים בשישי? · 22:14</small></div></div>
        </div></div>
      </div>
      <div class="ba-side ba-after">
        <div class="mini"><div class="scr"><div class="wa-body" style="gap:6px">{m('in','כמה עולה לייזר לרגליים?','11:41')}{m('out','היי! את המחיר המכון ייתן לך לפי האזורים. מאיזו עיר את?','11:41')}{m('in','מנתניה','11:42')}{m('out','רשמתי 🙏 המכון יחזור אלייך היום.','11:42')}</div></div></div>
        <h3>עם מזכירה: כולן קיבלו תשובה, והפרטים אצלכם</h3>
      </div>
      <span class="ba-lab l">בלי מזכירה</span><span class="ba-lab r">עם מזכירה</span>
      <div class="ba-handle" tabindex="0" role="slider" aria-label="השוואה" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><b>⇆</b></div>
    </div>
  </div>
</section>

<section class="pad cream" id="try">
  <div class="wrap">
    <h2 class="d2 rv">נסו אותה עכשיו</h2>
    <p class="lede rv" style="margin:16px 0 40px">כתבו כאילו אתם לקוחה של מכון לייזר. שאלו כמה זה עולה, שאלו אם זה כואב, שלחו הודעה קולית. מימין תראו מה בעלת המכון מקבלת.</p>
    <div data-demo data-tabs="false" data-niche="laser"></div>
    <p class="rv" style="margin-top:30px"><a class="btn line" href="demo.html">לדמו המלא: מנעולן, אינסטלטור, ניקוי ספות</a></p>
  </div>
</section>

<section class="pad" id="calc">
  <div class="wrap calc" data-calc>
    <div>
      <h2 class="d2 rv">כמה כסף מחכה לכם בוואטסאפ?</h2>
      <p class="lede rv" style="margin:16px 0 44px">הזיזו לפי מה שקורה אצלכם. החשבון נעשה רק עם המספרים שלכם.</p>
      <div class="field"><label for="c1">פניות חדשות בחודש <output for="c1"></output></label><input type="range" id="c1" name="leads" min="10" max="300" step="5" value="60"></div>
      <div class="field"><label for="c2">כמה מהן מחכות יותר משעה לתשובה <output for="c2"></output></label><input type="range" id="c2" name="late" min="5" max="80" step="5" value="35" data-suf="%"></div>
      <div class="field"><label for="c3">מתוך אלה, כמה היו קובעות אם היו מקבלות תשובה מהר <output for="c3"></output></label><input type="range" id="c3" name="book" min="5" max="60" step="5" value="20" data-suf="%"></div>
      <div class="field"><label for="c4">כמה שווה לקוחה אחת (₪) <output for="c4"></output></label><input type="range" id="c4" name="value" min="150" max="5000" step="50" value="1200"></div>
    </div>
    <div class="calc-out rv">
      <span class="mono" style="color:#9db8ad;font-size:14px">בערך בכל חודש, הולך למתחרים:</span>
      <div class="big mono">₪0</div>
      <p>זה רק מהפניות שמחכות. בלי לקוחות שלא הגיעו לתור, ובלי ביקורות שלא נכתבו.</p>
      <a class="btn wa" data-calc-cta href="#" target="_blank" rel="noopener">{WA_SVG}לשלוח לאריאל את החישוב</a>
      <p class="calc-note" style="color:#88a398">החישוב הוא הערכה לפי מה שהזנתם, לא הבטחה.</p>
    </div>
  </div>
</section>

<section class="pad gain">
  <div class="wrap">
    <h2 class="d2 rv" style="max-width:18ch">מה זה עושה לעסק שלכם</h2>
    <div class="gain-grid">
      <div class="rv"><span class="g-k mono">זמן</span><h3>פחות שעות בטלפון</h3>
        <ul><li>לא עונים שוב ושוב על "איפה אתם?" ו"יש תור?". היא עונה.</li><li>לא מחפשים פרטים בין עשרות הודעות. כל פנייה מגיעה במייל אחד מסודר.</li><li>קובעים תור במשפט אחד, והאישור יוצא לבד.</li><li>תזכורות ובקשות ביקורת יוצאות לבד, בלי לזכור לשלוח.</li></ul></div>
      <div class="rv"><span class="g-k mono">לקוחות</span><h3>פחות לקוחות שהולכים לאיבוד</h3>
        <ul><li>לקוח שבודק כמה עסקים הולך למי שעונה ראשון. עכשיו זה אתם.</li><li>פניות מהערב ומהשבת מחכות לכם מסודרות בבוקר, במקום להתקרר.</li><li>פחות לקוחות שלא מגיעים לתור, בזכות אישור ותזכורת.</li><li>יותר ביקורות בגוגל, שמביאות את הלקוחות הבאים.</li></ul></div>
    </div>
  </div>
</section>

<section class="pad cream">
  <div class="wrap">
    <h2 class="d2 rv" style="margin-bottom:50px">מה מקבלים</h2>
    <div class="feat">
      <article class="rv"><span class="stamp mono">22:14 ✓✓</span><h3>מענה בשם העסק, תוך שניות</h3><p>מהמספר שלכם ובמילים שלכם, גם בזמן טיפול ובשבת. כשאתם נכנסים לשיחה, היא שותקת.</p></article>
      <article class="rv"><span class="stamp mono">📧 מייל אחד</span><h3>כל פנייה מסודרת</h3><p>שם, טלפון, מה רוצים ומתי נוח. מגיע כמה דקות אחרי שהלקוח סיים לכתוב.</p></article>
      <article class="rv"><span class="stamp mono">🎤 0:09</span><h3>מבינה הקלטות ותמונות</h3><p>לקוחה שולחת הודעה קולית או תמונה, והמזכירה מבינה מה היא מבקשת.</p></article>
      <article class="rv"><span class="stamp mono">תור מחר 14:30</span><h3>אישור ותזכורת</h3><p>אתם קובעים במשפט אחד, והלקוח מקבל אישור ותזכורת לפני התור.</p></article>
      <article class="rv"><span class="stamp mono">★★★★★</span><h3>ביקורות בגוגל</h3><p>לוחצים "סיימתי", והלקוח מקבל בקשה לכתוב עליכם ביקורת.</p></article>
      <article class="rv"><span class="stamp mono">0 אנשי קשר</span><h3>לא עונה לחברים ולמשפחה</h3><p>מי ששמור אצלכם בטלפון מקבל רק אתכם. המזכירה מטפלת בפניות חדשות.</p></article>
      <article class="rv"><span class="stamp mono">ביום החיבור</span><h3>אנחנו מקימים הכל</h3><p>אתם לא מתקינים כלום ולא לומדים תוכנה חדשה. האפליקציה של וואטסאפ נשארת אצלכם.</p></article>
    </div>
  </div>
</section>

<section class="pad dark">
  <div class="wrap case">
    <div>
      <span class="mono" style="color:var(--terra)">תוצאה אמיתית</span>
      <h2 class="d2 rv" style="margin:14px 0 18px">מנעולן בנתניה, 4 הימים הראשונים</h2>
      <p class="lede rv">הלקוח הראשון שלנו. המספרים מהמערכת עצמה, מארבעת הימים הראשונים אחרי החיבור.</p>
    </div>
    <div class="case-nums rv">
      <div><b data-count>19</b><span>פניות קיבלו תשובה</span></div>
      <div><b>11</b><span>חשבוניות נשלחו ללקוחות לבד</span></div>
      <div><b>6</b><span>ביקורות חדשות בגוגל</span></div>
    </div>
  </div>
</section>

<section class="pad offer" id="offer">
  <div class="wrap">
    <div class="offer-card rv">
      <div class="offer-l">
        <span class="mono" style="color:var(--gold)">ההצעה</span>
        <h2 class="d2" style="margin:14px 0 20px">משלמים את רוב הסכום רק כשהיא כבר עונה ללקוחות שלכם</h2>
        <p class="lede">מתחילים במקדמה קטנה של <b class="mono" style="color:#fff">500 ₪</b>. את היתרה משלמים ביום החיבור, אחרי שראיתם אותה עונה על הפניות של העסק שלכם.</p>
      </div>
      <ul class="offer-list">
        <li><b>שיחת התאמה של 10 דקות</b><span>נגיד לכם בכנות אם זה שווה לכם, גם אם התשובה היא לא.</span></li>
        <li><b>אנחנו מקימים הכל</b><span>מלמדים אותה לדבר כמוכם, מחברים את המספר ובודקים. אתם לא מתקינים כלום.</span></li>
        <li><b>המספר והאפליקציה נשארים שלכם</b><span>הלקוחות רואים את אותו מספר ואת אותו שם.</span></li>
        <li><b>אתם בשליטה</b><span>נכנסים לכל שיחה מתי שרוצים, והיא שותקת.</span></li>
      </ul>
      <a class="btn wa offer-cta" href="{wa('היי אריאל, ראיתי את ההצעה באתר ואני מעוניין/ת להתחיל עם המזכירה בוואטסאפ 🙌')}" target="_blank" rel="noopener" data-cursor="כתבו">{WA_SVG}אני רוצה להתחיל</a>
    </div>
  </div>
</section>

{band('מה קורה אצלכם עם הודעה שמגיעה ב-22:14?', 'ספרו לאריאל. שיחה של כמה דקות, ותדעו אם זה מתאים לכם.', 'דברו עם אריאל', 'היי אריאל, הגעתי מהאתר. מה קורה אצלי עם הודעות שמגיעות בערב? אשמח לשמוע אם המזכירה מתאימה לי')}
</main>
''' + footer('''<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>
<script>setTimeout(function(){if(!(window.AE&&AE.ready3d))document.documentElement.classList.add('no-webgl')},9000);</script>
<script type="module" src="assets/phone3d.js"></script>''')

# ---------------------------------------------------------------- DEMO
demo = head('דמו חי · A.E Automations', 'נסו בעצמכם את המזכירה בוואטסאפ: מכון לייזר, מנעולן, אינסטלטור וניקוי ספות. כתבו כמו לקוח ותראו מה בעל העסק מקבל.', 'demo.html') + header('demo.html') + f'''
<main id="main">
{phead('דמו חי', ['תהיו הלקוח', 'לכמה דקות'], 'בחרו סוג עסק וכתבו כמו לקוח. אפשר לשאול על מחיר, לשלוח תמונה או הודעה קולית, ולראות מימין מה בעל העסק מקבל.')}
<section class="pad cream">
  <div class="wrap">
    <div data-demo data-autoplay></div>
  </div>
</section>
<section class="pad">
  <div class="wrap">
    <h2 class="d2 rv" style="max-width:18ch">כמה דברים ששווה לנסות</h2>
    <div class="nots rv" style="margin-top:44px">
      <div><span class="x mono">01</span><div><b>לשאול "כמה זה עולה?"</b><p>היא לא זורקת מספר. היא רושמת שזה חשוב ללקוח, והשאלה מחכה לכם במייל.</p></div></div>
      <div><span class="x mono">02</span><div><b>במכון לייזר: "זה כואב?"</b><p>שאלה מקצועית או רפואית נשארת אצל המטפלת. המזכירה לא ממציאה תשובות.</p></div></div>
      <div><span class="x mono">03</span><div><b>במנעולן: "יש תינוק בפנים!"</b><p>פנייה דחופה מגיעה אליכם מיד, והלקוח מקבל הפניה למד"א 101 או למשטרה 100.</p></div></div>
      <div><span class="x mono">04</span><div><b>הודעה קולית</b><p>לחצו על 🎤 ותראו איך היא מבינה מה נאמר בהקלטה, ולא שואלת שוב מה שכבר נאמר.</p></div></div>
    </div>
  </div>
</section>
{band('רוצים לראות אותה עם השם של העסק שלכם?', 'נבנה אותה עם המילים שלכם, ותראו אותה עונה על פניות אמיתיות.', 'אני רוצה את זה', 'היי אריאל, ניסיתי את הדמו באתר ואני רוצה לשמוע איך זה יעבוד אצלי')}
</main>''' + footer()

# ---------------------------------------------------------------- HOW
how = head('איך זה עובד · A.E Automations', 'איך המזכירה בוואטסאפ עובדת: מה היא עושה, מה היא לא עושה, איך מחברים את המספר שלכם, ומה קורה ביום החיבור.', 'how.html') + header('how.html') + f'''
<main id="main">
{phead('איך זה עובד', ['מהודעה ראשונה', 'עד ביקורת בגוגל'], 'מה קורה מהרגע שלקוח כותב לכם בוואטסאפ, ומה אתם צריכים לעשות (כמעט כלום).')}

<section class="pad">
  <div class="wrap">
    <h2 class="d2 rv">פנייה אחת, מההתחלה עד הסוף</h2>
    <div class="nots rv" style="margin-top:50px">
      <div><span class="x mono" style="color:var(--terra)">22:14</span><div><b>לקוח כותב</b><p>טקסט, הודעה קולית או תמונה. מהמודעה, מגוגל או מחבר שהמליץ.</p></div></div>
      <div><span class="x mono" style="color:var(--terra)">22:14</span><div><b>המזכירה עונה</b><p>תוך שניות, בשם העסק ובסגנון שלכם. שואלת רק מה שחסר, שאלה אחת בכל פעם.</p></div></div>
      <div><span class="x mono" style="color:var(--terra)">22:17</span><div><b>מייל אחד אצלכם</b><p>כמה דקות אחרי שהלקוח סיים: שם, טלפון, מה הוא צריך, מתי נוח לו, ושאלות שמחכות לכם. דחוף? מגיע מיד.</p></div></div>
      <div><span class="x mono" style="color:var(--terra)">08:30</span><div><b>אתם קובעים</b><p>כותבים "תור מחר 14:30" או "בדרך 20". הלקוח מקבל אישור, ולפני התור תזכורת.</p></div></div>
      <div><span class="x mono" style="color:var(--terra)">14:30</span><div><b>לקוח שהפסיק לענות</b><p>מקבל תזכורת עדינה אחרי שעה ואחרי שעתיים, ואז אתם מקבלים מה שנאסף.</p></div></div>
      <div><span class="x mono" style="color:var(--terra)">15:20</span><div><b>"סיימתי"</b><p>הלקוח מקבל תודה וקישור לביקורת בגוגל, והפנייה מסומנת כטופלה.</p></div></div>
    </div>
  </div>
</section>

<section class="pad cream">
  <div class="wrap">
    <h2 class="d2 rv">מה היא לא עושה</h2>
    <p class="lede rv" style="margin:16px 0 44px">הכללים האלה קבועים, כדי שאף לקוח לא יקבל ממנה משהו שלא הייתם אומרים בעצמכם.</p>
    <div class="nots rv">
      <div><span class="x">✕</span><div><b>לא נותנת מחירים</b><p>אלא אם אתם רוצים ונותנים לה מחירון. אחרת השאלה מחכה לכם במייל.</p></div></div>
      <div><span class="x">✕</span><div><b>לא עונה על שאלות רפואיות</b><p>"זה מתאים לעור שלי?" נשאר אצל המטפלת. היא רושמת את השאלה ומעבירה.</p></div></div>
      <div><span class="x">✕</span><div><b>לא מבטיחה זמני הגעה</b><p>מה שאתם קובעים, היא מאשרת. היא לא ממציאה מועדים.</p></div></div>
      <div><span class="x">✕</span><div><b>לא עונה לאנשי הקשר שלכם</b><p>חברים, משפחה וספקים ששמורים בטלפון מקבלים רק אתכם.</p></div></div>
      <div><span class="x">✕</span><div><b>לא מתחזה לבן אדם</b><p>היא כותבת בשמכם, אבל אם שואלים אותה, היא אומרת שהיא מזכירה דיגיטלית.</p></div></div>
      <div><span class="x">✕</span><div><b>לא שולחת הודעות בשבת ובלילה</b><p>תזכורות יוצאות רק בין 07:00 ל-21:00, לא בשבת ולא בחג. לפניות חדשות היא עונה תמיד.</p></div></div>
    </div>
  </div>
</section>

<section class="pad dark">
  <div class="wrap">
    <h2 class="d2 rv">איך מתחילים</h2>
    <div class="steps">
      <div class="rv"><span class="t mono">יום 1</span><h3>הודעה אחת</h3><p>כמה דקות בוואטסאפ: מה קורה אצלכם היום עם פניות, והאם זה מתאים.</p></div>
      <div class="rv"><span class="t mono">לפני</span><h3>מלמדים אותה לדבר כמוכם</h3><p>אתם עונים על כמה שאלות על העסק, ואנחנו בונים לה את הסגנון, השירותים והשעות.</p></div>
      <div class="rv"><span class="t mono">יום החיבור</span><h3>מחברים ורואים אותה עובדת</h3><p>מחברים את המספר העסקי בדרך הרשמית של וואטסאפ. האפליקציה נשארת אצלכם בטלפון.</p></div>
    </div>
  </div>
</section>

<section class="pad">
  <div class="wrap" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:60px;align-items:center">
    <div>
      <h2 class="d2 rv">פקודות קצרות, מהטלפון</h2>
      <p class="lede rv" style="margin-top:16px">אין מערכת ללמוד. כותבים לה משפט, והיא מטפלת בלקוח.</p>
    </div>
    <div class="rv" style="background:#efe6dd;border-radius:6px;padding:22px;display:flex;flex-direction:column;gap:10px">
      {m('out','תור מחר 14:30')}<div class="msg sys">הלקוח קיבל אישור, ותזכורת לפני התור</div>
      {m('out','בדרך 20')}<div class="msg sys">הלקוח קיבל: "יוצאים אליך, בעוד כ-20 דקות"</div>
      {m('out','סיימתי')}<div class="msg sys">הלקוח קיבל תודה וקישור לביקורת בגוגל</div>
    </div>
  </div>
</section>
{band('רוצים לשמוע איך זה ייראה אצלכם?', 'שיחה קצרה עם אריאל, בלי התחייבות.', 'דברו עם אריאל', 'היי אריאל, קראתי באתר איך זה עובד ואשמח לשמוע איך זה ייראה אצלי')}
</main>''' + footer()

# ---------------------------------------------------------------- WHO
def niche(tag, title, text, ex, msg):
    return f'''<div class="niche"><span class="tag">{tag}</span><div><h3 class="rv">{title}</h3><p class="rv">{text}</p><a class="btn wa sm rv" href="{wa(msg)}" target="_blank" rel="noopener">{WA_SVG}זה העסק שלי</a></div><div class="ex rv">{ex}</div></div>'''
who = head('למי זה מתאים · A.E Automations', 'מכוני לייזר וקליניקות, מנעולנים, אינסטלטורים, חשמלאים וניקוי ספות: איך המזכירה בוואטסאפ עובדת בכל תחום, ותוצאות אמיתיות.', 'who.html') + header('who.html') + f'''
<main id="main">
{phead('למי זה מתאים', ['לכל מי שהידיים שלו', 'עסוקות כשהלקוח כותב'], 'מכון לייזר באמצע טיפול, אינסטלטור מתחת לכיור, מנעולן בדרך לקריאה. אותה בעיה, ואותו פתרון.')}
<section class="pad">
  <div class="wrap">
    {niche('לייזר ואסתטיקה','מכוני לייזר וקליניקות','את בטיפול של 40 דקות, והלקוחה מהמודעה שואלת כמה זה עולה. המזכירה עונה, מבררת אזור טיפול, עיר ומתי נוח, ומשאירה לך את המחיר ואת השאלות המקצועיות. אחרי שקבעת, הלקוחה מקבלת אישור ותזכורת.', m('in','היי, כמה עולה לייזר לרגליים?')+m('out','היי! את המחיר המכון ייתן לך לפי האזורים. איזה אזורים מעניינים אותך?')+m('in','רגליים ובית שחי, זה כואב?')+m('out','את זה המטפלת תסביר לך הכי טוב. מאיזו עיר את?'), 'היי אריאל, יש לי מכון לייזר ואשמח לשמוע על המזכירה בוואטסאפ')}
    {niche('מנעולנים','מנעולנים','לקוח ננעל בחוץ ב-23:00. המזכירה שואלת אם מישהו בפנים, ואם יש סכנה הפנייה מגיעה אליך מיד, עם הפניה ל-101 או 100. אחרת היא אוספת כתובת ומה קרה, ואתה מקבל הכל מסודר.', m('in','ננעלתי בחוץ, המפתח בפנים')+m('out','אוי, מבין אותך. יש מישהו בפנים, ילד, מבוגר או חיית מחמד, או משהו על האש?')+m('in','לא, אין אף אחד')+m('out','מעולה. איפה זה? עיר, רחוב ומספר בית'), 'היי אריאל, אני מנעולן ואשמח לשמוע על המזכירה בוואטסאפ')}
    {niche('אינסטלציה וחשמל','אינסטלטורים, חשמלאים וטכנאים','אתה מתחת לכיור, והלקוח הבא כותב "יש לי נזילה, אפשר היום?". המזכירה מבקשת תמונה ועיר, ואתה מגיע עם הציוד הנכון. אחרי העבודה הלקוח מקבל קבלה ובקשה לביקורת.', m('in','יש לי נזילה מתחת לכיור, אפשר היום?')+m('out','אהלן. אפשר תמונה של המקום? זה עוזר להגיע עם הציוד הנכון 📸')+m('in','📷 תמונה')+m('out','קיבלתי, תודה 🙏 באיזו עיר?'), 'היי אריאל, אני בעל מקצוע ואשמח לשמוע על המזכירה בוואטסאפ')}
    {niche('ניקיון','ניקוי ספות, שטיחים וריפודים','"נשפך לי קפה על הספה, אתם מגיעים?". המזכירה מבקשת תמונה של הכתם, שואלת אם זה בד או עור, עיר ומתי נוח. אתה מקבל פנייה מוכנה להצעת מחיר.', m('in','נשפך לי קפה על הספה, אתם מגיעים היום?')+m('out','אהלן. אפשר תמונה של הכתם ובאיזו עיר את? 📸'), 'היי אריאל, יש לי עסק לניקוי ספות ואשמח לשמוע על המזכירה בוואטסאפ')}
  </div>
</section>

<section class="pad dark">
  <div class="wrap case">
    <div>
      <span class="mono" style="color:var(--terra)">תוצאה אמיתית</span>
      <h2 class="d2 rv" style="margin:14px 0 18px">מנעולן בנתניה, 4 הימים הראשונים</h2>
      <p class="lede rv">הלקוח הראשון שלנו. כאן יופיעו גם ביקורות של לקוחות, מילה במילה ובאישור שלהם.</p>
    </div>
    <div class="case-nums rv">
      <div><b>19</b><span>פניות קיבלו תשובה</span></div>
      <div><b>11</b><span>חשבוניות נשלחו לבד</span></div>
      <div><b>6</b><span>ביקורות חדשות בגוגל</span></div>
    </div>
  </div>
</section>

<section class="pad cream">
  <div class="wrap" style="max-width:860px">
    <h2 class="d2 rv">למי זה פחות מתאים</h2>
    <p class="lede rv" style="margin-top:18px">אם כמעט כל הפניות שלכם מגיעות בשיחת טלפון ולא בוואטסאפ, או שיש לכם מוקד שעונה לכל הודעה תוך דקות, המזכירה תוסיף לכם פחות. עדיף שתדעו את זה לפני שמשלמים, ונגיד לכם את זה גם בשיחה.</p>
  </div>
</section>
{band('העסק שלכם לא ברשימה?', 'אם לקוחות כותבים לכם בוואטסאפ ואתם לא תמיד פנויים לענות, כנראה שזה מתאים. ספרו לנו מה העסק.', 'ספרו לאריאל', 'היי אריאל, יש לי עסק ש[...] ואשמח לדעת אם המזכירה בוואטסאפ מתאימה לי')}
</main>''' + footer()

# ---------------------------------------------------------------- ABOUT + CONTACT
faq = [
 ('זה עובד מהמספר שלי?', 'כן. מחברים את המספר העסקי שלכם בדרך הרשמית של וואטסאפ לעסקים, והאפליקציה נשארת אצלכם בטלפון. הלקוחות רואים את אותו מספר ואת אותו שם.'),
 ('אני ממשיך לענות בעצמי?', 'כן, מתי שתרצו. כשאתם עונים ללקוח, המזכירה שותקת בשיחה הזו.'),
 ('היא תענה לחברים ולמשפחה שלי?', 'לא. מי ששמור אצלכם באנשי הקשר מקבל רק אתכם.'),
 ('מה אם היא תגיד ללקוח משהו לא נכון?', 'היא לא נותנת מחירים, לא עונה על שאלות רפואיות ולא מבטיחה מועדים. את כל אלה היא רושמת ומעבירה אליכם. ואתם רואים כל שיחה.'),
 ('הלקוחות ירגישו שזה רובוט?', 'היא כותבת קצר, בסגנון שלכם ובשם העסק. אם שואלים אותה ישירות, היא אומרת בכנות שהיא מזכירה דיגיטלית.'),
 ('היא מבינה הודעות קוליות ותמונות?', 'כן. היא מבינה מה נאמר בהקלטה ומה רואים בתמונה, ולא שואלת שוב מה שכבר נאמר.'),
 ('כמה זה עולה?', 'תלוי במה שהעסק צריך. את המחיר אנחנו נותנים בשיחה קצרה, אחרי שמבינים מה קורה אצלכם, ולא לפני.'),
 ('מה צריך לעשות כדי להתחיל?', 'לכתוב לאריאל בוואטסאפ. משם אנחנו עושים את רוב העבודה, וביום החיבור אתם רואים אותה עונה.'),
]
about = head('עלינו וצור קשר · A.E Automations', 'אריאל ואליה, A.E Automations: מי אנחנו, איך אנחנו עובדים, שאלות נפוצות ודרכים ליצור קשר.', 'about.html') + header('about.html') + f'''
<main id="main">
{phead('עלינו וצור קשר', ['A.E זה', 'אריאל ואליה'], 'שני אנשים שבונים לעסקים קטנים מזכירה בוואטסאפ, ועונים לכם בעצמם.')}
<section class="pad">
  <div class="wrap">
    <div class="people">
      <div class="person rv"><span class="ini">א</span><div><span class="role">מכירות ולקוחות</span><h3>אריאל</h3><p>אני זה שתדברו איתו: מהשיחה הראשונה, דרך יום החיבור, ועד שהמזכירה עונה ללקוחות שלכם כמו שהייתם עונים בעצמכם.</p></div></div>
      <div class="person rv"><span class="ini">א</span><div><span class="role">בנייה וחיבור</span><h3>אליה</h3><p>בונה את המזכירה, מחבר אותה למספר שלכם ובודק שהיא עובדת לפי הכללים, כל יום.</p></div></div>
    </div>
    <div style="max-width:780px;margin-top:90px">
      <p class="quote rv">"התחלנו ממנעולן אחד בנתניה, שלא הספיק לענות לכל מי שכתב לו."</p>
      <p class="lede rv" style="margin-top:28px">כל עסק קטן שאנחנו מכירים מפסיד לקוחות באותה נקודה: ההודעה מגיעה כשאין ידיים פנויות. בנינו לו מזכירה שעונה בשמו, ושולחת לו כל פנייה מסודרת. היום אנחנו מקימים אותה גם למכוני לייזר, קליניקות ובעלי מקצוע.</p>
    </div>
  </div>
</section>
<section class="pad cream">
  <div class="wrap" style="max-width:900px">
    <h2 class="d2 rv" style="margin-bottom:30px">שאלות שעולות לפני שמתחילים</h2>
    <div class="faq">{''.join(f'<details class="rv"><summary>{q}</summary><p>{a}</p></details>' for q,a in faq)}</div>
  </div>
</section>
<section class="pad" id="contact">
  <div class="wrap contact">
    <div>
      <h2 class="d2 rv">דברו איתנו</h2>
      <p class="lede rv" style="margin:16px 0 40px">הכי מהיר בוואטסאפ. אריאל עונה בעצמו.</p>
      <div class="ways rv">
        <a href="{wa('היי אריאל, הגעתי מהאתר ואני מעוניין/ת במזכירה בוואטסאפ לעסק שלי 🙌')}" target="_blank" rel="noopener"><span style="color:var(--wa-d)">{WA_SVG.replace('<svg','<svg width="40" height="40"')}</span><div><b>וואטסאפ</b><span class="num">{PHONE}</span></div></a>
        <a href="tel:+972524666175"><span style="font-size:34px">☎</span><div><b>טלפון</b><span class="num">{PHONE}</span></div></a>
      </div>
    </div>
    <form class="form rv" data-wa-form>
      <label for="f1">שם</label><input id="f1" name="name" autocomplete="name" required>
      <label for="f2">שם העסק</label><input id="f2" name="biz" autocomplete="organization">
      <label for="f3">תחום</label><select id="f3" name="type"><option>מכון לייזר / קליניקה</option><option>מנעולן</option><option>אינסטלטור / חשמלאי / טכנאי</option><option>ניקוי ספות / שטיחים</option><option>אחר</option></select>
      <label for="f4">מה קורה אצלכם עם הודעות היום? (לא חובה)</label><textarea id="f4" name="msg" rows="3"></textarea>
      <button class="btn wa" type="submit">{WA_SVG}לשלוח לאריאל בוואטסאפ</button>
      <p class="calc-note">הכפתור פותח וואטסאפ עם ההודעה מוכנה. שום דבר לא נשמר באתר.</p>
    </form>
  </div>
</section>
</main>''' + footer()

# ---------------------------------------------------------------- ACCESSIBILITY
acc = head('הצהרת נגישות · A.E Automations', 'הצהרת הנגישות של אתר A.E Automations.', 'accessibility.html') + header('', solid=True) + f'''
<main id="main" style="padding:150px 0 100px"><div class="wrap" style="max-width:820px">
<h1 class="d2" style="color:var(--plum);margin-bottom:24px">הצהרת נגישות</h1>
<p>אנחנו רוצים שכל אחד יוכל להשתמש באתר. האתר נבנה בהתאם להנחיות התקן הישראלי 5568 ו-WCAG 2.1 ברמה AA, ככל שהדבר אפשרי.</p>
<h2 class="d3" style="color:var(--plum);margin:34px 0 10px">מה עשינו</h2>
<p>ניווט מלא במקלדת וקישור "דילוג לתוכן", טקסט חלופי לרכיבים גרפיים, ניגודיות צבעים מספקת, התאמה למסכים קטנים, ותמיכה בהגדרה "הפחתת תנועה" של מערכת ההפעלה (האנימציות נעצרות). הדמו האינטראקטיבי זמין גם במקלדת, וכל הודעה חדשה בו מוקראת לקוראי מסך.</p>
<h2 class="d3" style="color:var(--plum);margin:34px 0 10px">מה עוד לא מושלם</h2>
<p>הטלפון התלת-ממדי בדף הבית הוא קישוט. כל המידע שבו מופיע גם כטקסט רגיל.</p>
<h2 class="d3" style="color:var(--plum);margin:34px 0 10px">נתקלתם בבעיה?</h2>
<p>כתבו לאריאל בוואטסאפ או התקשרו: <a href="tel:+972524666175" class="mono" dir="ltr">{PHONE}</a>. נחזור אליכם ונתקן.</p>
<p style="margin-top:24px;color:var(--muted);font-size:15px">עודכן: נובמבר 2026</p>
</div></main>''' + footer()

for name, html in [('index.html',home),('demo.html',demo),('how.html',how),('who.html',who),('about.html',about),('accessibility.html',acc)]:
    open(os.path.join(HERE,name),'w',encoding='utf-8').write(html)
print('built 6 pages')
