# גלריות תמונות

## תבנית: `.gallery-grid` עם תמונות מוטמעות כ-base64

מקור: `clients/ziko-cohen-rituch`, `clients/tzemach-bar-ganot`

```html
<div class="gallery-grid">
  <img src="data:image/jpeg;base64,/9j/4AAQ..." alt="תיאור התמונה">
  <img src="data:image/jpeg;base64,/9j/4AAQ..." alt="תיאור התמונה">
  <!-- ... -->
</div>
```

```css
.gallery-grid{
  display:grid;
  grid-template-columns:repeat(3, 1fr);
  gap:12px;
}
.gallery-grid img{
  width:100%;
  aspect-ratio:1;
  object-fit:cover;
  border-radius:8px;
}
@media (max-width:600px){
  .gallery-grid{grid-template-columns:repeat(2, 1fr);}
}
```

### ⚠️ שימו לב: base64 מנפח את הקובץ דרמטית
שני האתרים שמשתמשים בשיטה הזו (`ziko-cohen-rituch`, `tzemach-bar-ganot`) הם ה-`index.html` הכי כבדים במאגר — **965KB ו-1.5MB**, לעומת 8-26KB בשאר האתרים. זה עדיין עובד (GitHub Pages לא מגביל), אבל:
- טעינה איטית יותר במיוחד ב-mobile/רשת חלשה
- לא ניתן ל-cache נפרד של כל תמונה בדפדפן — כל שינוי קטן ב-HTML מוריד מחדש את כל התמונות

**המלצה קדימה:** להשתמש בקבצי תמונה נפרדים (`.jpg`/`.webp` בתיקיית הלקוח, כמו `clients/moshayev-lock/logo.png`) במקום base64, אלא אם יש סיבה ספציפית (למשל: רוצים קובץ HTML יחיד בלי תלויות, או אין אפשרות להעלות נכסים נוספים). דחסו תמונות ל-WebP לפני הטמעה.

## תבנית קלה יותר: "about-grid" / "chips" למידע טקסטואלי-ויזואלי
לעסקים בלי צילומי עבודות אמיתיים (או בשלב שאין עדיין תמונות), משתמשים ב-grid טקסטואלי במקום גלריית תמונות — קופסאות עם אייקון/כותרת קצרה (ראו `clients/adiel-shiputsim` class `about-grid`, ו-`clients/hashraa-lariza` class `chips`). זו חלופה סבירה כשאין נכסים ויזואליים איכותיים, לא רק "פחות טוב" — עדיף grid נקי בלי תמונות מ-stock גנריות.

```css
.about-grid{display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;}
@media (max-width:600px){.about-grid{grid-template-columns:1fr;}}
```
