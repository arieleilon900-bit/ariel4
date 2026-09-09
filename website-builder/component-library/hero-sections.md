# Hero Sections

תבניות Hero שכבר עבדו טוב באתרי לקוחות. המטרה של ה-Hero: תוך 2 שניות הגולש צריך לדעת מי אתה, מה אתה נותן, ולמי להתקשר.

## תבנית סטנדרטית (עסקי שירות מקומיים — מנעולן, אינסטלטור, גנן וכו')

מקור: `clients/moshayev-lock`, `clients/adiel-shiputsim`, `clients/peleg-handyman`

מבנה:
1. לוגו (אם יש) או קיקר טקסטואלי קטן (שם העסק + תחום)
2. `h1` אחד, ממוקד בכאב/בצורך של הלקוח — לא "ברוכים הבאים"
3. פסקת `sub` קצרה (2-3 משפטים) שמסבירה מה מקבלים ולמה לבחור בכם
4. שורת כפתורים (`btn-row`): כפתור ראשי `tel:` + כפתור משני `wa.me`
5. אלמנט רקע דקורטיבי עדין (SVG פשוט בשקיפות נמוכה) — לא מסיח דעת

```html
<section class="hero">
  <svg class="hero-key" viewBox="0 0 200 200" fill="none"><!-- אייקון רקע דקורטיבי --></svg>
  <div class="container">
    <img class="logo" src="logo.png" alt="שם העסק — תיאור קצר">
    <span class="kicker">שם העסק · תחום/אזור שירות</span>
    <h1>כותרת שממוקדת בבעיה של הלקוח, לא בעסק</h1>
    <p class="sub">מה נותנים בפועל, בלי באזז-וורדס, עם התחייבות קונקרטית (זמינות, שקיפות במחיר וכו').</p>
    <div class="btn-row">
      <a href="tel:+972XXXXXXXXX" class="btn btn-primary">התקשרו עכשיו</a>
      <a href="https://wa.me/972XXXXXXXXX" target="_blank" rel="noopener" class="btn btn-outline-light">וואטסאפ</a>
    </div>
  </div>
</section>
```

CSS עקרונות:
- `.hero` עם `position:relative` + רקע כהה/מותג בולט, כדי שהכפתורים יבלטו
- הרקע הדקורטיבי (`hero-key` וכו') תמיד `opacity` נמוך (0.06-0.15) ו-`z-index:0`, עם `.container{position:relative; z-index:1}` מעליו
- ב-mobile: מקטינים לוגו, מקטינים `h1`, מצמצמים padding אנכי (ראו `@media` בכל האתרים)

## מתי לסטות מהתבנית
- עסק עם תדמית פרימיום/עיצובית (למשל גלריה, סטודיו) — אפשר Hero עם תמונת רקע מלאה במקום SVG דקורטיבי
- עסק עם הרבה שירותים שונים — כדאי להוסיף שורת "chips" קצרה מתחת ל-`sub` עם 3-4 שירותים עיקריים (ראו `clients/hashraa-lariza`)

## מה לא לעשות
- אל תשימו טופס בתוך ה-Hero — אף אחד מהאתרים שבנינו לא השתמש ב-`<form>`; תמיד `tel:`/`wa.me`. ראו `contact-forms.md`.
- אל תשימו יותר מ-2 כפתורים בשורה הראשונה — פוגע בהמרה.
