# אפקטים פרימיום: תבניות קוד שעבדו

מבוסס על `clients/aven-residences/` (נבדק ב-Playwright, דסקטופ + מובייל). להקשר העסקי ראו `../PREMIUM_PLAYBOOK.md`. לתבניות הקלות יותר (wireframe, tilt, קורסור בסיסי) ראו `3d-effects.md`.

## 1. Three.js בלי build step: importmap + fallback
```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
} }
</script>
<script type="module"> import * as THREE from 'three'; /* ... */ window.AVEN.ready = true; </script>
```
- אם מודול נכשל בטעינה, הוא פשוט לא רץ, בלי אירוע שגיאה נוח. לכן **סקריפט קלאסי נפרד** מחזיק את ה-preloader ובודק את `ready`. אחרי 10 שניות בלי סצנה הוא מוסיף ל-`<html>` את `no-webgl` (שמציג רקע CSS + SVG במקום ה-canvas). המודול מסיר את `no-webgl` אם הוא בכל זאת מסיים מאוחר.
- כל ה-UI שאינו תלת-ממד (בחירת קומה בחצים, גלריה, reveal) נמצא בסקריפט הקלאסי ועובד גם בלי Three.js.

## 2. Canvas קבוע + מסע מצלמה לפי גלילה
```js
// כל תחנה: [זווית, רדיוס, גובה, גובה נקודת מבט, הסטה צידית]
const stops = { hero:[0.35,27,3.2,6.8,-2.6], aerial:[1.25,36,20,4.5,3.2], /* ... */ };
const smooth = x => x*x*(3-2*x);
const lerpStop = (a,b,t) => a.map((v,i) => v + (b[i]-v)*t);
// בכל פריים: target נקבע מהתקדמות הסקציה, והמצלמה "נגררת" אליו בדעיכה אקספוננציאלית
const k = 1 - Math.pow(0.0015, dt);          // בלתי תלוי ב-framerate
cam[key] += (tgt[key] - cam[key]) * k;
camera.position.set(Math.cos(a)*r, h, Math.sin(a)*r);
// הסטה צידית: מזיזים מצלמה + מטרה לאורך וקטור ה-right, כדי לפנות מקום לטקסט
side.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(cam.s);
```
- `progress(el) = -rect.top / (rect.height - innerHeight)` עבור סקציה גבוהה (300vh+) עם תוכן `sticky` בפנים.
- **במובייל משתמשים בתחנות נפרדות** (הסטה 0, מרחק גדול יותר, נקודת מבט נמוכה כדי שהאובייקט יעלה לחלק העליון של המסך מעל הטקסט).
- **לבדוק שאין גאומטריה במסלול המצלמה.** בגרסה הראשונה בלוקים של "עיר" ישבו ברדיוס 2–60, והמצלמה נכנסה לתוכם (מסך שחור). פתרון: טבעת עיר ברדיוס 44–94, מחוץ למסלול.
- מפסיקים לרנדר כשהתוכן האטום מכסה את ה-canvas (`visibility:hidden` + `return`) וכשהטאב ברקע.

## 3. בחירת אובייקט (raycasting) עם פאנל עסקי
```js
const ray = new THREE.Raycaster();
ray.setFromCamera(ndc, camera);
const hit = ray.intersectObjects(pickables, false)[0];   // רק מסכים עם userData.floor
```
- מפעילים picking רק כשהסקציה הרלוונטית על המסך, ומדלגים כשהעכבר מעל פאנל/כפתור (`elementFromPoint(...).closest(...)`).
- ההדגשה היא **mesh נפרד** (halo עם AdditiveBlending + LineLoop) שממקמים על הקומה. לא משכפלים חומרים לכל קומה.
- תמיד יש חלופה נגישה: כפתורי ▲▼ שמפעילים את אותה פונקציה `select(f)` (גם למובייל ולמקלדת).
- ה-CTA מקבל את ההקשר: `wa.me/...?text=` + "תוכנית לקומה 18". זה ליד חם.

## 4. שמיים ב-shader שנאפים לסביבה (השתקפויות בלי HDR)
```js
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms:{sun:{value:SUN_DIR}}, /* gradient + sun glow */ });
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10,32,16), skyMat));
scene.environment = pmrem.fromScene(envScene, 0.02).texture;
```
זכוכית = `MeshStandardMaterial({metalness:.92, roughness:.07})` + `emissiveMap` של חלונות מוארים (canvas 512×32 פרוצדורלי, `texture.clone()` עם `offset.x` שונה לכל קומה).

## 5. Shader injection לחומר קיים (גלים במים)
```js
seaMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = { value: 0 }; seaMat.userData.shader = sh;
  // מוסיפים varying של מיקום עולם ומעוותים את ה-normal ב-<normal_fragment_maps>
};
```
שומר על כל התאורה/הערפל/tone mapping של three ומוסיף רק את מה שצריך.

## 6. Bloom רק בדסקטופ
`EffectComposer` → `RenderPass` → `UnrealBloomPass(size, 0.32, 0.5, 0.9)` → `OutputPass`. ערכים גבוהים יותר (0.55 / 0.82) שרפו את האופק, אז עדיף מאופק. במובייל: בלי bloom, בלי צללים, DPR ≤ 1.5.

## 7. UI שמרגיש יקר
- **חשיפת שורות**: `.ln{overflow:hidden}` + `span{transform:translateY(105%)}`, ו-`.in` מחזיר ל-`none` עם `1.3s cubic-bezier(.22,1,.36,1)`.
- **מילוי כפתור בהובר**: `::before` עם `transform:scaleX(0)` ו-origin שמתחלף (left→right). **לא** `translateY(101%)` + `overflow:hidden`: ב-Chrome, כשההורה עובר transform, הקליפ של border-radius נשבר ורואים חצי עיגול.
- **כפתור מגנטי**: `translate((x - w/2) * .22, (y - h/2) * .3)` ב-mousemove, וחזרה עם transition ב-mouseleave.
- **קורסור עם תווית**: טבעת שמתרחבת ל-84px עם טקסט ("בחרו") כשעוברים מעל אובייקט בחיר בתלת-ממד.
- **Grain**: SVG `feTurbulence` כ-data URI, `opacity:.07`, `mix-blend-mode:overlay`, מונפש ב-`steps(6)`.
- **גלילה אופקית ב-RTL**: `translateX(+progress * (track.scrollWidth - innerWidth))`, חיובי ולא שלילי.
- **Preloader**: `clip-path: inset(0 0 100% 0)` כיציאה, ורק אחריה מוסיפים `.in` לאלמנטים של ה-hero.

## 7.5 פתיח עם תמונה אמיתית מעל תלת-ממד
- ה-`.hero` מקבל רקע אטום (`var(--ink)`) ומסתיר את ה-canvas. כשגוללים, הפתיח עולה והתלת-ממד "נחשף" מתחתיו, וזה מרגיש כמו מעבר מכוון.
- `figure.hero-photo`: במחשב `width:52%` בצד שמאל (הטקסט מימין), במובייל `width:100%`.
- כניסה: `clip-path: inset(100% 0 0 0)` → `inset(0)` ו-`img` מ-`scale(1.16)` ל-`1.02` (2.8s). פרלקסה: `.px` זז ב-`translate3d(0, scrollY*0.22px, 0)` רק בזמן שהפתיח על המסך.
- שכבת מעבר מעל התמונה: gradient מצד הטקסט אל הדיו, ועוד אחד למעלה כדי שהניווט יהיה קריא. במובייל gradient מלמטה (הטקסט יושב על התמונה).
- `srcset` עם שני קבצים (900w / 1600w), `fetchpriority="high"`, `width/height` כדי שהפריסה לא תקפוץ, `og:image` עם כתובת מלאה.

## 7.6 פאנל הזמנה ורשימה עם תמונה צפה (`clients/kerem-hazeitim`)
- **פאנל הזמנה:** `input type=date` להגעה ועזיבה (העזיבה מתקדמת אוטומטית כשההגעה עוברת אותה) ומונה אורחים עם גבול עליון. הכול נבנה להודעת `wa.me` אחת עם `encodeURIComponent`. לכל יחידה יש שדה `inName` ("בבקתה הכחולה") כדי שהעברית בהודעה תהיה תקינה. `color-scheme:dark` על `html` כדי שבוחר התאריכים יהיה כהה.
- **החלפת תמונה בפאנל:** מוסיפים `.out` (opacity + scale), מחליפים `src` אחרי 280ms, ומורידים את `.out` ב-`load`.
- **יחידה נבחרת בתלת-ממד:** מרימים אותה (`position.y` נמשך ל-`base + 0.18 + sin`) ומסמנים טבעת זהב + דיסק שקוף על הקרקע (`RingGeometry`/`CircleGeometry`, AdditiveBlending). זה מתאים יותר מ-halo לאובייקטים נמוכים ורחבים.
- **רשימה עם תמונה צפה:** `div.float-photo` קבוע שעוקב אחרי העכבר ב-lerp 0.1 (איטי מהקורסור), ומוחלף ב-`mouseenter` של כל שורה לפי `data-img`. במובייל הוא מוסתר, ובמקומו תמונה ממוזערת בתוך השורה.
- **כרם/יער:** `InstancedMesh` אחד לגזעים ואחד לצמרות (`IcosahedronGeometry` + `flatShading`), עם רשת ורעש קל. מוציאים את הרדיוס שבו המצלמה עוברת.

## 8. מלכודות שעלו בבנייה
- **`IntersectionObserver` ו-`clip-path`:** אלמנט שמוסתר לגמרי ב-`clip-path` שלו לא נחשב כנראה, ולכן ה-reveal לא יופעל לעולם. שמים את ה-clip על ילד (ה-`img`) ומשאירים את הקופסה הנצפית בלי clip.
- **התנגשות class**: `.solid` שימש גם לעטיפת התוכן וגם ל-`.pill.solid`, ו-`querySelector('.solid')` תפס את הכפתור. התוצאה: ה-canvas הוסתר מהסקציה השנייה. לתת לעטיפות מבניות שמות ייחודיים (`.cover`).
- **בדיקות בסנדבוקס**: Chromium לא עובר דרך ה-proxy ל-CDN. בבדיקת Playwright מנתבים `page.route(/^https:\/\//)` שמביא את הקובץ עם `curl` ומחזיר `route.fulfill`. להרצה עם WebGL: `--use-angle=swiftshader --enable-unsafe-swiftshader`, ולחכות ~14 שניות לפני צילום.
