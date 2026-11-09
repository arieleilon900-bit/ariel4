/* A.E Automations: shared behaviour (no dependencies, works without WebGL) */
(function () {
  var WA = '972524666175';
  var d = document, root = d.documentElement;
  root.classList.remove('js-off');
  window.AE = window.AE || {};
  AE.wa = function (text) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* preloader: clock runs 00:00 -> 22:14, then the curtain lifts */
  var pre = d.querySelector('.pre');
  function start() {
    d.body.classList.add('ready');
    d.querySelectorAll('[data-hero] .ln').forEach(function (e) { e.classList.add('in'); });
  }
  if (pre && !reduce && !sessionStorageGet('ae-pre')) {
    var t = pre.querySelector('.mono'), m = 0, target = 22 * 60 + 14;
    var iv = setInterval(function () {
      m = Math.min(target, m + 37);
      t.textContent = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
      if (m >= target) { clearInterval(iv); setTimeout(function () { pre.classList.add('out'); start(); }, 280); setTimeout(function () { pre.remove(); }, 1300); }
    }, 22);
    sessionStorageSet('ae-pre', 1);
  } else { if (pre) pre.remove(); start(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* header + scroll handlers (rAF throttled) */
  var hdr = d.querySelector('.hdr'), ticking = false, scrollers = [];
  AE.onScroll = function (fn) { scrollers.push(fn); fn(); };
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (hdr && !hdr.classList.contains('solid')) hdr.classList.toggle('scrolled', scrollY > 40);
      scrollers.forEach(function (f) { f(); });
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* mobile menu (sibling of header, not inside it) */
  var burger = d.querySelector('.burger'), mnav = d.querySelector('.mnav');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var open = !mnav.classList.contains('open');
      mnav.classList.toggle('open', open); d.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', open); d.body.style.overflow = open ? 'hidden' : '';
    });
    mnav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { burger.click(); }); });
  }

  /* reveal */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  d.querySelectorAll('.rv,.reveal').forEach(function (e) { io.observe(e); });

  /* cursor + magnetic buttons (fine pointers only) */
  if (matchMedia('(hover:hover) and (pointer:fine)').matches && !reduce) {
    var cur = d.createElement('div'); cur.className = 'cur'; d.body.appendChild(cur);
    var cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; });
    (function loop() { cx += (tx - cx) * .2; cy += (ty - cy) * .2; cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)'; requestAnimationFrame(loop); })();
    d.querySelectorAll('[data-cursor]').forEach(function (el) {
      el.addEventListener('mouseenter', function () { cur.classList.add('big'); cur.textContent = el.getAttribute('data-cursor'); });
      el.addEventListener('mouseleave', function () { cur.classList.remove('big'); cur.textContent = ''; });
    });
    d.querySelectorAll('.btn').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + (e.clientX - r.left - r.width / 2) * .18 + 'px,' + (e.clientY - r.top - r.height / 2) * .28 + 'px)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }

  /* day timeline: sticky story, clock follows scroll */
  var day = d.querySelector('.day');
  if (day) {
    var steps = day.querySelectorAll('.day-step'), bars = day.querySelectorAll('.day-bar b'), clock = day.querySelector('.day-clock'),
      times = [[11, 40], [14, 5], [22, 14]], chat = day.querySelector('.day-chat');
    var last = -1;
    AE.onScroll(function () {
      var r = day.getBoundingClientRect(), p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      var seg = Math.min(2, Math.floor(p * 3)), local = p * 3 - seg;
      bars.forEach(function (b, i) { b.style.transform = 'scaleX(' + (i < seg ? 1 : i === seg ? local : 0) + ')'; });
      var a = times[seg], b2 = times[Math.min(2, seg + 1)];
      var mins = seg < 2 ? (a[0] * 60 + a[1]) + Math.floor(((b2[0] * 60 + b2[1]) - (a[0] * 60 + a[1])) * Math.max(0, local - .7) / .3) : a[0] * 60 + a[1];
      clock.textContent = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
      if (seg !== last) {
        last = seg;
        steps.forEach(function (s, i) { s.classList.toggle('on', i === seg); });
        if (chat && AE.dayChat) AE.dayChat(chat, seg);
      }
    });
  }

  /* loss calculator */
  var calc = d.querySelector('[data-calc]');
  if (calc) {
    var ins = calc.querySelectorAll('input[type=range]'), big = calc.querySelector('.big'), cta = calc.querySelector('[data-calc-cta]'),
      shown = 0, raf;
    function upd() {
      var v = {}; ins.forEach(function (i) { v[i.name] = +i.value; var o = calc.querySelector('output[for=' + i.id + ']'); if (o) o.textContent = fmt(i.value) + (i.dataset.suf || ''); });
      var lost = Math.round(v.leads * (v.late / 100) * (v.book / 100) * v.value);
      cancelAnimationFrame(raf);
      var from = shown, t0 = performance.now();
      (function anim(t) { var k = Math.min(1, (t - t0) / 500), e = 1 - Math.pow(1 - k, 3); shown = Math.round(from + (lost - from) * e); big.textContent = '₪' + fmt(shown); if (k < 1) raf = requestAnimationFrame(anim); })(t0);
      if (cta) cta.href = AE.wa('היי אריאל, עשיתי את החישוב באתר: בערך ' + v.leads + ' פניות בחודש, ' + v.late + '% מחכות יותר משעה, לקוחה שווה ' + fmt(v.value) + ' ₪. יוצא בערך ' + fmt(lost) + ' ₪ בחודש שהולכים למתחרים. אשמח לשמוע איך זה עובד.');
    }
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    ins.forEach(function (i) { i.addEventListener('input', upd); });
    upd();
  }

  /* before / after drag */
  d.querySelectorAll('.ba').forEach(function (ba) {
    var after = ba.querySelector('.ba-after'), h = ba.querySelector('.ba-handle'), drag = false;
    function set(x) { var r = ba.getBoundingClientRect(), p = Math.min(.95, Math.max(.05, (x - r.left) / r.width)); after.style.clipPath = 'inset(0 0 0 ' + p * 100 + '%)'; h.style.left = p * 100 + '%'; }
    ba.addEventListener('pointerdown', function (e) { drag = true; set(e.clientX); });
    addEventListener('pointermove', function (e) { if (drag) set(e.clientX); });
    addEventListener('pointerup', function () { drag = false; });
    h.addEventListener('keydown', function (e) {
      var cur = parseFloat(h.style.left) || 50;
      if (e.key === 'ArrowLeft') set(ba.getBoundingClientRect().left + (cur - 5) / 100 * ba.offsetWidth);
      if (e.key === 'ArrowRight') set(ba.getBoundingClientRect().left + (cur + 5) / 100 * ba.offsetWidth);
    });
    var io2 = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting && !reduce) { io2.disconnect(); var t0 = performance.now();
        (function a(t) { var k = Math.min(1, (t - t0) / 1600), r = ba.getBoundingClientRect(); set(r.left + r.width * (.5 + .3 * Math.sin(k * Math.PI * 2) * (1 - k))); if (k < 1 && !drag) requestAnimationFrame(a); })(t0); }
    }, { threshold: .5 }); io2.observe(ba);
  });

  /* live hero clock chip */
  var chip = d.querySelector('[data-now]');
  if (chip) { var tick = function () { var n = new Date(); chip.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()); }; tick(); setInterval(tick, 20000); }

  /* contact form -> WhatsApp */
  var form = d.querySelector('[data-wa-form]');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(form), lines = ['היי אריאל, השארתי פרטים באתר:'];
    if (f.get('name')) lines.push('שם: ' + f.get('name'));
    if (f.get('biz')) lines.push('העסק: ' + f.get('biz'));
    if (f.get('type')) lines.push('תחום: ' + f.get('type'));
    if (f.get('msg')) lines.push(f.get('msg'));
    var a=d.createElement('a');a.href=AE.wa(lines.join('\n'));a.target='_blank';a.rel='noopener';d.body.appendChild(a);a.click();a.remove();
  });
})();
