# אפקטים תלת-ממדיים / אינטראקציה מתקדמת

## מצב נוכחי: לא בשימוש עדיין

בדקנו את כל 12 האתרים הקיימים — **אף אחד לא משתמש** ב-Three.js, WebGL, canvas, או `perspective`/`transform-style:preserve-3d`. כל האינטראקציה מוגבלת ל-hover פשוט:

```css
.btn:hover{ transform: translateY(-2px); }
```

זה מתאים לפרופיל הלקוחות עד כה — עסקי שירות מקומיים (מנעולן, אינסטלטור, מכבסה, גינון) שבהם מהירות טעינה ובהירות המסר חשובות הרבה יותר מאפקטים ויזואליים. **אל תוסיפו אפקטים תלת-ממדיים כברירת מחדל** — הם מוסיפים משקל, מורכבות תחזוקה, וסיכון לבאגים על מכשירים חלשים, בלי לתרום להמרה בעסק כזה.

## מתי כן להשתמש
כשהלקוח הוא מסוג שונה מהותית — סטודיו עיצוב, מותג פרימיום, פורטפוליו יצירתי, מוצר טכנולוגי — ואפקט ויזואלי הוא חלק מהמסר של המותג עצמו.

### אפקט קל: הטיית כרטיס לפי עכבר (tilt on hover), CSS בלבד
לא דורש ספרייה חיצונית, קליל, עובד טוב למכשירים חזקים ונופל בחן (`prefers-reduced-motion`) למכשירים חלשים/נגישות:

```css
.tilt-card{
  transition: transform .15s ease;
  transform-style: preserve-3d;
}
.tilt-card:hover{
  transform: perspective(600px) rotateX(4deg) rotateY(-4deg);
}
@media (prefers-reduced-motion: reduce){
  .tilt-card{ transition:none; }
  .tilt-card:hover{ transform:none; }
}
```

### אפקט כבד יותר: Three.js
רק אם הבריף דורש רקע תלת-ממדי אמיתי (למשל אתר סטודיו אדריכלות עם מודל 3D). במקרה כזה:
- טענו את הספרייה מ-CDN (`unpkg`/`jsdelivr`), לא כ-dependency מקומי, כדי לשמור על "אתר סטטי ללא build step"
- תמיד עם fallback סטטי (תמונה) למכשירים שנכשלים ב-WebGL
- תעדו כאן את התבנית אחרי הבנייה הראשונה, כדי שהפעם הבאה יהיה refernce אמיתי

## סיכום
המלצת ברירת מחדל: **בלי אפקטים תלת-ממדיים**. להוסיף רק לפי בקשה מפורשת של לקוח עם פרופיל מתאים, ואז לתעד כאן מה עבד.

## תבנית שעבדה: Three.js קליל + שכבות אינטראקציה (`clients/noa-sagi-architects`)

בנייה ראשונה בפועל של פרופיל "פרימיום" (דוגמת עיצוב לאדריכל/ית, לא לקוח אמיתי — ראו `build-log.md`). מה שעבד:

```js
// wireframe icosahedron מסתובב לאט ברקע ה-Hero, ולא יותר מזה
var geo = new THREE.IcosahedronGeometry(2.1, 1);
var edges = new THREE.EdgesGeometry(geo);
var lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color:0xd7ff3f, transparent:true, opacity:.55}));
// ברוטציה: t * .12 ו-t * .07 — מספיק איטי שלא מסיח, מספיק נראה שמוסיף חיים
```

עקרונות שחשוב לשמור עליהם בכל שימוש עתידי ב-Three.js:
1. **תמיד בתוך `try/catch`**, וללא await/blocking — אם ה-CDN נכשל (רשת חסומה, ad-blocker), שאר העמוד חייב לעבוד בלי שגיאה בקונסולה.
2. **טעינה מ-CDN (`cdnjs`), לא כתלות מקומית** — שומר על "קובץ HTML יחיד, בלי build step".
3. **`prefers-reduced-motion` מכבה את זה לגמרי**, לא רק מאט.
4. **אפקט דקורטיבי ברקע בלבד** — לא חוסם טקסט, לא תופס אינטראקציה (`pointer-events` לא רלוונטי כי זה סתם `<canvas>` מאחורי הכל).

### שכבות אינטראקציה נלוות שהוסיפו לתחושת "פרימיום" בלי Three.js נוסף
- **Tilt בכרטיסים דרך JS** (לא רק CSS hover) — `perspective(800px) rotateX/rotateY` לפי מיקום העכבר בתוך הכרטיס. תחושה משמעותית יותר "יקרה" מ-hover סטטי.
- **קורסור מותאם אישית** (נקודה + טבעת שעוקבות אחר העכבר, מתרחבות מעל לינקים) — desktop בלבד (`pointer:fine`), מתחיל ב-`opacity:0` ומופעל רק ב-`mousemove` הראשון (כדי לא "לקפוץ" מהפינה השמאלית-עליונה לפני שהעכבר זז — זה היה באג בגרסה הראשונה, ראו `build-log.md`).
- **Reveal בגלילה** עם `IntersectionObserver` — פשוט, קליל, נופל בחן ל-`opacity:1` אם `IntersectionObserver` לא נתמך.

כל השכבות האלה עטופות ב-`prefers-reduced-motion` ו/או `pointer` media queries, ונכשלות בשקט אם JS/CDN לא זמינים — שום דבר לא תלוי בהן כדי שהעמוד יהיה קריא ותפקודי.
