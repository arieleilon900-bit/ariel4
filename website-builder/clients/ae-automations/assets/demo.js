/* A.E Automations: interactive demo of the WhatsApp secretary.
   Scripted on purpose: nothing is sent or stored, answers follow the real bot's rules
   (no prices, no medical advice, asks only what is missing, urgent goes straight to the owner). */
(function () {
  var d = document;
  var CITIES = ['תל אביב','ירושלים','חיפה','ראשון לציון','פתח תקווה','אשדוד','נתניה','באר שבע','בני ברק','חולון','רמת גן','אשקלון','רחובות','בת ים','בית שמש','כפר סבא','הרצליה','חדרה','מודיעין','נצרייה','נצרת','לוד','רמלה','רעננה','רהט','הוד השרון','גבעתיים','קריית גת','נהריה','עפולה','אילת','ראש העין','קריית אתא','קריית ביאליק','קריית מוצקין','קריית ים','עכו','טבריה','צפת','דימונה','אור יהודה','יבנה','אופקים','שדרות','נתיבות','קריית שמונה','זכרון יעקב','פרדס חנה','כרמיאל','מעלות','אריאל','גדרה','נס ציונה','אור עקיבא','יהוד','קריית אונו','טירת כרמל','יקנעם','רמת השרון','אבן יהודה','קדימה','גבעת שמואל','שוהם','באר יעקב','מבשרת','מעלה אדומים','אלעד','ביתר','קציר','תל מונד','כפר יונה','צור הדסה'];
  var NICHES = {
    laser: {
      label: 'מכון לייזר', biz: 'מכון הלייזר שלך', owner: 'המכון', she: true, cust: 'נועה',
      slots: ['area', 'city', 'when'],
      labels: { area: 'אזור טיפול', city: 'עיר', when: 'מתי נוח' },
      ask: { area: 'איזה אזורים מעניינים אותך?', city: 'מאיזו עיר את?', when: 'ומתי נוח שהמכון יחזור אלייך?' },
      words: { area: /(רגליים|רגל|בית שחי|שחי|פנים|שפם|סנטר|גב|בטן|ביקיני|ידיים|זרועות|גוף מלא|צוואר|חזה|כתפיים|לחיים)/g },
      script: ['היי, ראיתי אתכם באינסטגרם. כמה עולה לייזר לרגליים?', 'רגליים ובית שחי. זה כואב?', 'מחולון, מחר אחרי 12'],
      chips: ['כמה עולה?', 'זה כואב?', 'רגליים ובית שחי', 'מנתניה', 'מחר בבוקר'],
      voice: 'היי, רציתי לשאול על לייזר לרגליים ולבית שחי. אני מכפר סבא, נוח לי מחר בערב',
      appt: 'תור מחר 14:30', apptMsg: function (n) { return 'היי ' + n + ' 😊 נקבע לך תור מחר ב-14:30 במכון. נתראה!'; },
      remind: 'תזכורת: היום ב-14:30 יש לך תור במכון. מחכות לך 🌸',
      doneMsg: 'תודה שבאת אלינו 💛 אם היה לך טוב, נשמח לביקורת קצרה בגוגל, זה עוזר לנו מאוד: g.page/r/…'
    },
    locks: {
      label: 'מנעולן', biz: 'המנעולן שלך', owner: 'המנעולן', she: false, cust: 'דני',
      slots: ['problem', 'danger', 'addr'],
      labels: { problem: 'מה קרה', danger: 'מישהו בפנים?', addr: 'כתובת' },
      ask: { problem: 'מה קרה? ננעלת בחוץ, מפתח נשבר, או משהו אחר?', danger: 'יש מישהו בפנים, ילד, מבוגר או חיית מחמד, או משהו על האש?', addr: 'איפה זה? עיר, רחוב ומספר בית' },
      words: { problem: /(ננעל|ננעלתי|נטרק|נתקע|מפתח|צילינדר|מנעול|דלת|פריצה|כספת|רכב)[^,.!?]*/g },
      script: ['היי, ננעלתי מחוץ לבית, המפתח נשאר בפנים', 'לא, אין אף אחד', 'הרצל 12 נתניה, קומה 3'],
      chips: ['ננעלתי בחוץ', 'כמה זה עולה?', 'יש תינוק בפנים!', 'הרצל 12 נתניה'],
      voice: 'אהלן, נטרקה לי הדלת והמפתחות בפנים. אני ברחוב ויצמן 8 בכפר סבא, אין אף אחד בבית',
      appt: 'בדרך 20', apptMsg: function (n) { return 'היי ' + n + ', המנעולן יצא אליך ויגיע בעוד כ-20 דקות 🚗'; },
      remind: '',
      doneMsg: 'תודה שבחרת בנו! אם היה טוב, נשמח לביקורת קצרה בגוגל 🙏 g.page/r/…'
    },
    plumber: {
      label: 'אינסטלטור', biz: 'האינסטלטור שלך', owner: 'האינסטלטור', she: false, cust: 'יוסי',
      slots: ['problem', 'photo', 'city', 'when'],
      labels: { problem: 'מה קרה', photo: 'תמונה', city: 'עיר', when: 'מתי נוח' },
      ask: { problem: 'מה קרה? נזילה, סתימה, דוד?', photo: 'אפשר תמונה של המקום? זה עוזר להגיע עם הציוד הנכון 📸', city: 'באיזו עיר?', when: 'ומתי נוח לך שיגיעו?' },
      words: { problem: /(נזילה|נוזל|סתימה|סתום|דוד|ברז|הצפה|הוצף|אסלה|כיור|מים חמים|ביוב|צנרת|פיצוץ)[^,.!?]*/g },
      script: ['יש לי נזילה מתחת לכיור, אפשר היום?', '📷', 'ברחובות, מתי שאפשר היום'],
      chips: ['יש לי נזילה', '📷 שליחת תמונה', 'כמה זה עולה?', 'ברמת גן', 'היום אחה"צ'],
      voice: 'שלום, הכיור במטבח סתום לגמרי והמים לא יורדים. אני בפתח תקווה, אפשר מחר בבוקר?',
      appt: 'תור מחר 9:00', apptMsg: function (n) { return 'היי ' + n + ', נקבע: מחר ב-9:00 מגיעים אליך 👍'; },
      remind: 'תזכורת: היום ב-9:00 מגיעים אליך לתיקון.',
      doneMsg: 'תודה שבחרת בנו! קבלה נשלחה אליך. אם היה טוב, נשמח לביקורת בגוגל 🙏 g.page/r/…'
    },
    sofa: {
      label: 'ניקוי ספות', biz: 'ניקוי הספות שלך', owner: 'העסק', she: false, cust: 'מיכל',
      slots: ['problem', 'photo', 'city', 'when'],
      labels: { problem: 'מה לנקות', photo: 'תמונה', city: 'עיר', when: 'מתי נוח' },
      ask: { problem: 'מה צריך לנקות? ספה, כורסה, שטיח, מזרן?', photo: 'אפשר תמונה של הכתם או של הספה? 📸', city: 'באיזו עיר?', when: 'ומתי נוח שיגיעו?' },
      words: { problem: /(ספה|כורסה|כורסא|שטיח|מזרן|כתם|קפה|יין|שתן|ריפוד|כיסאות|פינת אוכל)[^,.!?]*/g },
      script: ['נשפך לי קפה על הספה, אתם מגיעים היום?', '📷', 'בהרצליה, מחר בבוקר'],
      chips: ['כתם על הספה', '📷 שליחת תמונה', 'כמה עולה?', 'בחולון', 'ביום ראשון'],
      voice: 'היי, יש לי ספה בד של שלושה מושבים עם כתמים של יין. אני בראשון לציון, מתי אתם פנויים?',
      appt: 'תור ראשון 10:00', apptMsg: function (n) { return 'היי ' + n + ' 😊 נקבע: יום ראשון ב-10:00 מגיעים לנקות את הספה.'; },
      remind: 'תזכורת: מחר ב-10:00 מגיעים לנקות את הספה.',
      doneMsg: 'תודה! מקווים שהספה נראית כמו חדשה ✨ נשמח לביקורת קצרה בגוגל: g.page/r/…'
    }
  };
  var PRICE = /(כמה (זה )?(עולה|עולים|יעלה)|מחיר|עלות|כמה זה|כמה כסף|₪|שקל)/;
  var MED = /(כואב|כאב|הריון|בהריון|עור כהה|עור רגיש|רגיש|תופעות|מתאים לי|כוויה|קעקוע|תרופות|שומות|סוכרת|פיגמנט)/;
  var DANGER = /(ילד|ילדה|תינוק|תינוקת|ילדים|אמא שלי|אבא שלי|קשיש|כלב|חתול|גז|אש|כיריים|תנור דולק|סיר)/;
  var NODANGER = /^(לא|לא,|אין|אף אחד|ריק|לא אין)/;
  var WHEN = /(עכשיו|היום|מחרתיים|מחר|בבוקר|בצהריים|אחה"צ|אחר הצהריים|בערב|בלילה|ראשון|שני|שלישי|רביעי|חמישי|שישי|מתי שאפשר|אחרי \d{1,2}|לפני \d{1,2}|\b\d{1,2}(:\d{2})?\b)/;
  var HELLO = /^(היי|הי|שלום|אהלן|הלו|בוקר טוב|ערב טוב|מה נשמע)[\s!.,?]*$/;
  var NAME = /(קוראים לי|שמי|אני) ([א-ת]{2,})/;

  function now() { var n = new Date(); return (n.getHours() < 10 ? '0' : '') + n.getHours() + ':' + (n.getMinutes() < 10 ? '0' : '') + n.getMinutes(); }

  AE.mountDemo = function (host, opt) {
    opt = opt || {};
    var nicheKey = opt.niche || 'laser', N, S, timers = [], auto = false;
    host.innerHTML =
      (opt.tabs === false ? '' : '<div class="niche-tabs" role="group" aria-label="בחירת עסק להמחשה">' + Object.keys(NICHES).map(function (k) { return '<button type="button" data-n="' + k + '">' + NICHES[k].label + '</button>'; }).join('') + '</div>') +
      '<div class="demo">' +
      '<div class="demo-phone" data-cursor="כתבו"><div class="scr">' +
      '<div class="wa-top"><div class="av">AE</div><div><b data-biz></b><small data-status>מחובר/ת</small></div></div>' +
      '<div class="wa-body" aria-live="polite" data-body></div>' +
      '<div class="chips" data-chips></div>' +
      '<form class="wa-input" data-form><label class="sr" for="dm-in-' + (opt.id || 'a') + '">הודעה למזכירה</label><input id="dm-in-' + (opt.id || 'a') + '" autocomplete="off" placeholder="כתבו כאילו אתם הלקוח…"><button aria-label="שליחה"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></form>' +
      '</div></div>' +
      '<div><div class="owner"><div class="owner-hd"><b>מה ' + '<span data-ownerword></span> מקבל/ת</b><span data-clock></span></div>' +
      '<div class="mail"><h4>🔔 פנייה חדשה: <span data-cust></span></h4><div class="urgent" data-urgent>🚨 דחוף! התקשרו ללקוח עכשיו</div><div class="ask" data-ask></div><dl data-dl></dl></div>' +
      '<div class="mail-status" data-mstatus>המייל נשלח כ-3 דקות אחרי שהלקוח מסיים לכתוב</div>' +
      '<div class="owner-actions"><button type="button" data-appt disabled></button><button type="button" data-done disabled>סיימתי</button><button type="button" data-reset>מהתחלה</button><button type="button" data-auto>▶ הפעלה אוטומטית</button></div></div>' +
      '<ol class="flow" data-flow><li>הלקוח כותב בוואטסאפ</li><li>המזכירה עונה תוך שניות</li><li>כל הפרטים נאספו</li><li>מייל אחד מסודר אצלכם</li><li>אתם קובעים במשפט אחד, והלקוח מקבל אישור</li><li>בסוף: בקשת ביקורת בגוגל</li></ol>' +
      '<p class="demo-legal">זו המחשה: התשובות כתובות מראש לפי הכללים של המזכירה האמיתית, ומה שכותבים כאן לא נשלח ולא נשמר. אצלכם היא עובדת בוואטסאפ מהמספר של העסק, במילים שלכם, ואתם יכולים להיכנס לכל שיחה מתי שתרצו.</p></div></div>';

    var $ = function (s) { return host.querySelector(s); };
    var body = $('[data-body]'), form = $('[data-form]'), input = form.querySelector('input'), chips = $('[data-chips]'),
      dl = $('[data-dl]'), ask = $('[data-ask]'), urgent = $('[data-urgent]'), mstatus = $('[data-mstatus]'),
      bAppt = $('[data-appt]'), bDone = $('[data-done]'), flow = $('[data-flow]').children;

    function clear() { timers.forEach(clearTimeout); timers = []; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function step(i) { for (var k = 0; k <= i; k++) flow[k].classList.add('done'); }

    function reset(k) {
      clear(); auto = false;
      if (k) nicheKey = k; N = NICHES[nicheKey];
      S = { slots: {}, asked: {}, price: false, med: false, urgent: false, done: false, msgs: 0, finished: false };
      host.querySelectorAll('.niche-tabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.n === nicheKey); });
      $('[data-biz]').textContent = N.biz; $('[data-cust]').textContent = N.cust;
      $('[data-ownerword]').textContent = N.owner;
      $('[data-clock]').textContent = now();
      body.innerHTML = ''; ask.className = 'ask'; urgent.className = 'urgent';
      bAppt.textContent = N.appt; bAppt.disabled = true; bDone.disabled = true;
      mstatus.innerHTML = 'המייל נשלח כ-3 דקות אחרי שהלקוח מסיים לכתוב';
      [].forEach.call(flow, function (li) { li.classList.remove('done'); });
      chips.innerHTML = N.chips.concat(['🎤 הודעה קולית']).map(function (c) { return '<button type="button">' + c + '</button>'; }).join('');
      renderMail();
      sys('המחשה · כתבו כאילו אתם ' + (N.she ? 'לקוחה של ' : 'לקוח של ') + N.biz.replace(' שלך', ''));
    }
    function renderMail() {
      dl.innerHTML = '<dt>שם</dt><dd>' + N.cust + ' <span style="font-weight:400;color:#8a7a84">(מהוואטסאפ)</span></dd><dt>טלפון</dt><dd class="mono">050-0000000</dd>' +
        N.slots.map(function (s) { var v = S.slots[s]; return '<dt>' + N.labels[s] + '</dt><dd class="' + (v ? '' : 'empty') + '">' + (v || 'עוד לא נאמר') + '</dd>'; }).join('');
      var q = [];
      if (S.price) q.push('שאל/ה כמה זה עולה');
      if (S.med) q.push('שאלה מקצועית שמחכה לך');
      ask.className = 'ask' + (q.length ? ' on' : ''); ask.textContent = '❓ מחכה לתשובה ממך: ' + q.join(', ');
      urgent.className = 'urgent' + (S.urgent ? ' on' : '');
    }
    function add(cls, text, extra) {
      var m = d.createElement('div'); m.className = 'msg ' + cls + (extra ? ' ' + extra : '');
      m.textContent = text; var t = d.createElement('time'); t.textContent = now(); m.appendChild(t);
      body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
    }
    function sys(t) { var m = d.createElement('div'); m.className = 'msg sys'; m.textContent = t; body.appendChild(m); }
    function typing(ms, then) {
      var t = d.createElement('div'); t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; body.appendChild(t); body.scrollTop = body.scrollHeight;
      $('[data-status]').textContent = 'מקליד/ה…';
      later(function () { t.remove(); $('[data-status]').textContent = 'מחובר/ת'; then(); }, ms);
    }

    function understand(text) {
      var got = [], t = text.trim();
      if (t === '📷' || /שליחת תמונה/.test(t)) { if (N.slots.indexOf('photo') > -1) { S.slots.photo = 'התקבלה ✓'; got.push('photo'); } return { got: got, photo: true }; }
      var mName = t.match(NAME); if (mName) N.cust = mName[2], $('[data-cust]').textContent = N.cust;
      if (N.words.area) { var a = t.match(N.words.area); if (a) { S.slots.area = uniq(a).join(' + '); got.push('area'); } }
      if (N.words.problem && !S.slots.problem) { var p = t.match(N.words.problem); if (p) { S.slots.problem = p[0].trim().slice(0, 60); got.push('problem'); } }
      var city = CITIES.filter(function (c) { return t.indexOf(c) > -1; })[0];
      if (city) {
        if (N.slots.indexOf('addr') > -1) { S.slots.addr = t.replace(/^(אני |זה )?(ב|ברחוב |רחוב )?/, '').slice(0, 60); got.push('addr'); }
        else { S.slots.city = city; got.push('city'); }
      }
      var w = t.match(WHEN);
      if (w && N.slots.indexOf('when') > -1 && !(city && /^\d/.test(w[0]) && N.slots.indexOf('addr') > -1)) {
        var seg = t.slice(t.indexOf(w[0])).split(/[,.!?]/)[0].trim(); S.slots.when = seg.slice(0, 40); got.push('when');
      }
      var danger = DANGER.test(t);
      if (N.slots.indexOf('danger') > -1) {
        if (danger) { S.slots.danger = 'כן! ' + t.match(DANGER)[0]; S.urgent = true; got.push('danger'); }
        else if (S.asked.danger && NODANGER.test(t)) { S.slots.danger = 'אין'; got.push('danger'); }
        else if (/אין אף אחד|אף אחד לא|אין אף/.test(t)) { S.slots.danger = 'אין'; got.push('danger'); }
      }
      var price = PRICE.test(t), med = N === NICHES.laser && MED.test(t);
      if (price) S.price = true; if (med) S.med = true;
      return { got: got, price: price, med: med, hello: HELLO.test(t), danger: danger };
    }
    function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

    function reply(u) {
      var out = [], she = N.she, you = she ? 'אלייך' : 'אליך';
      if (S.urgent && u.danger) {
        out.push((N.owner === 'המנעולן' ? 'המנעולן' : N.owner) + ' מקבל את זה עכשיו. אם מישהו בסכנה, תתקשר מיד למד"א 101 או למשטרה 100.');
        if (!S.slots.addr) out.push('תשלח לי כתובת או מיקום בוואטסאפ.');
        return finishIfReady(out);
      }
      if (S.msgs === 1 && (u.hello || u.got.length || u.price || u.med)) out.push(she ? 'היי! כיף שפנית 😊' : 'אהלן, איזה כיף שכתבת.');
      if (u.photo) out.push(N.slots.indexOf('photo') > -1 ? 'קיבלתי את התמונה, תודה 🙏' : 'קיבלתי, תודה.');
      if (u.price) out.push(N === NICHES.laser ? 'את המחיר המכון ייתן לך לפי האזורים, רשמתי שזה חשוב לך.' : N.owner + ' ייתן לך מחיר בעצמו כשיחזור ' + you + '.');
      if (u.med) out.push('את זה המטפלת תסביר לך הכי טוב, רשמתי לה את השאלה.');
      if (u.got.indexOf('danger') > -1 && S.slots.danger === 'אין') out.push('מעולה.');
      return finishIfReady(out);
    }
    function nextSlot() { for (var i = 0; i < N.slots.length; i++) { var s = N.slots[i]; if (!S.slots[s] && !(s === 'photo' && S.asked.photo > 1)) return s; } return null; }
    function finishIfReady(out) {
      var n = nextSlot();
      if (n === 'photo' && S.asked.photo) { S.slots.photo = 'לא נשלחה'; n = nextSlot(); }
      if (n) { out.push(N.ask[n]); S.asked[n] = (S.asked[n] || 0) + 1; }
      else if (!S.done) {
        S.done = true;
        var when = S.slots.when ? ' ' + S.slots.when.replace(/^(ב|ל)?/, '') : ' בהקדם';
        out.push(S.urgent ? 'קיבלתי, הפרטים אצלו עכשיו והוא בדרך ' + (N.she ? 'אלייך' : 'אליך') + '.' :
          (N.she ? 'רשמתי 🙏 המכון יחזור אלייך' + when + '.' : 'קיבלתי, הפרטים הועברו ו' + N.owner.replace(/^ה/, 'ה') + ' יחזור אליך' + when + '. המשך יום טוב'));
      }
      return out;
    }

    function handle(text, isVoice) {
      if (!text.trim() || S.finished) return;
      S.msgs++; step(0);
      if (isVoice) { add('in', '🎤 הודעה קולית · 0:09', 'voice'); later(function () { sys('המזכירה שמעה: "' + text + '"'); }, 400); }
      else add('in', text === '📷' ? '📷 תמונה' : text);
      var u = understand(text), out = reply(u);
      renderMail();
      var delay = isVoice ? 1500 : 900;
      out.forEach(function (o, i) {
        later(function () { typing(650 + Math.min(900, o.length * 12), function () { add('out', o); step(1); if (S.done && i === out.length - 1) wrapUp(); }); }, delay + i * 1500);
      });
      if (!out.length && !S.done) later(function () { typing(700, function () { add('out', 'קיבלתי 🙏 ' + N.ask[nextSlot() || 'when']); }); }, delay);
    }
    function wrapUp() {
      step(2); S.finished = true;
      mstatus.innerHTML = '⏳ הלקוח סיים לכתוב. בעוד כ-3 דקות המייל אצלכם…';
      later(function () { mstatus.innerHTML = '<b>✓ המייל נשלח</b> · ' + now() + ' (בהמחשה קיצרנו את 3 הדקות)'; step(3); bAppt.disabled = false; d.dispatchEvent(new CustomEvent('ae-demo-done')); }, 2200);
    }
    bAppt.addEventListener('click', function () {
      bAppt.disabled = true; step(4);
      sys('בעל/ת העסק כתב/ה: "' + N.appt + '"');
      later(function () { add('out', N.apptMsg(N.cust)); }, 700);
      if (N.remind) later(function () { sys('ולפני התור, אוטומטית:'); add('out', N.remind); }, 2000);
      later(function () { bDone.disabled = false; }, 2400);
    });
    bDone.addEventListener('click', function () {
      bDone.disabled = true; step(5);
      sys('בעל/ת העסק לחץ/ה "סיימתי"');
      later(function () { add('out', N.doneMsg); }, 700);
    });
    $('[data-reset]').addEventListener('click', function () { reset(); });
    $('[data-auto]').addEventListener('click', function () { play(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); clearAuto(); handle(input.value); input.value = ''; });
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; clearAuto();
      var t = b.textContent;
      if (t.indexOf('🎤') === 0) handle(N.voice, true);
      else handle(t.indexOf('📷') === 0 ? '📷' : t);
    });
    host.querySelectorAll('.niche-tabs button').forEach(function (b) { b.addEventListener('click', function () { reset(b.dataset.n); }); });
    function clearAuto() { if (auto) { clear(); auto = false; } }
    function play() {
      reset(); auto = true; var t = 600;
      N.script.forEach(function (line, i) { later(function () { handle(line); }, t); t += 4200 + (i === 0 ? 1800 : 0); });
    }
    reset();
    if (opt.autoplay) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); play(); } }, { threshold: .35 });
      io.observe(host);
    }
    return { play: play, reset: reset };
  };

  /* home timeline phone: three moments of a day */
  AE.dayChat = function (el, seg) {
    var sets = [
      [['in', 'היי, אפשר פרטים על לייזר לרגליים?'], ['in', 'יש לכם תור השבוע?'], ['out', 'היי! כיף שפנית 😊 איזה אזורים מעניינים אותך?'], ['out', 'בטח, המכון יחזור אלייך היום עם מועדים. מאיזו עיר את?']],
      [['sys', '📧 3 פניות חדשות, מסודרות במייל'], ['out', 'רשמתי 🙏 המכון יחזור אלייך מחר אחרי 12.'], ['sys', 'בעלת המכון כתבה: "תור מחר 14:30"'], ['out', 'היי נועה 😊 נקבע לך תור מחר ב-14:30. נתראה!']],
      [['in', 'ערב טוב, יש מצב לייזר לפנים? מאיפה אתם?'], ['out', 'ערב טוב! כיף שכתבת 😊 אנחנו בנתניה. לפנים, ומה עוד מעניין אותך?'], ['in', 'רק פנים. מחר אחרי העבודה'], ['out', 'רשמתי. המכון יחזור אלייך מחר אחרי העבודה. לילה טוב 🌙']]
    ];
    var body = el.querySelector('.wa-body'); body.innerHTML = '';
    sets[seg].forEach(function (m, i) {
      setTimeout(function () {
        var b = d.createElement('div'); b.className = 'msg ' + m[0]; b.textContent = m[1];
        if (m[0] !== 'sys') { var t = d.createElement('time'); t.textContent = ['11:40', '14:05', '22:14'][seg]; b.appendChild(t); }
        body.appendChild(b);
      }, i * 420);
    });
  };

  d.querySelectorAll('[data-demo]').forEach(function (h, i) {
    AE.mountDemo(h, { id: 'd' + i, autoplay: h.hasAttribute('data-autoplay'), tabs: h.getAttribute('data-tabs') !== 'false', niche: h.getAttribute('data-niche') || 'laser' });
  });
})();
