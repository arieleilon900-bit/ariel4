/* A.E Automations: page behaviour (no dependencies, works without WebGL) */
(function () {
  var WA = '972524666175';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  window.AE = window.AE || {};
  AE.wa = function (text) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(text); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* header border on scroll */
  var hdr = d.querySelector('.hdr'), ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; if (hdr) hdr.classList.toggle('scrolled', scrollY > 10); });
  }, { passive: true });

  /* reveal (content is visible without JS) */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    d.querySelectorAll('.rv').forEach(function (e) { io.observe(e); });
  } else d.querySelectorAll('.rv').forEach(function (e) { e.classList.add('in'); });

  /* money + hours calculator */
  var calc = d.querySelector('[data-calc]');
  if (calc) {
    var ins = calc.querySelectorAll('input[type=range]'), big = calc.querySelector('[data-money]'), year = calc.querySelector('[data-year]'),
      hrs = calc.querySelector('[data-hours]'), cta = calc.querySelector('[data-calc-cta]'), shown = 0, raf;
    var BOOK = .2, MIN_PER_LEAD = 5; // stated on the page
    function upd() {
      var v = {};
      ins.forEach(function (i) {
        v[i.name] = +i.value;
        i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%');
        var o = calc.querySelector('output[for=' + i.id + ']'); if (o) o.textContent = (i.dataset.pre || '') + fmt(i.value) + (i.dataset.suf || '');
      });
      var money = v.leads * (v.late / 100) * BOOK * v.value, hours = v.leads * MIN_PER_LEAD / 60;
      cancelAnimationFrame(raf);
      var from = shown, t0 = performance.now();
      (function anim(t) { var k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3); shown = from + (money - from) * e; big.textContent = '₪' + fmt(shown); if (k < 1) raf = requestAnimationFrame(anim); })(t0);
      year.textContent = '₪' + fmt(money * 12);
      hrs.textContent = fmt(hours);
      cta.href = AE.wa('היי אריאל, עשיתי את החישוב באתר: בערך ' + v.leads + ' פניות בחודש, ' + v.late + '% מחכות יותר משעה, לקוח שווה ' + fmt(v.value) + ' ₪. יצא לי בערך ' + fmt(money) + ' ₪ בחודש ו-' + fmt(hours) + ' שעות. אני מעוניין/ת במזכירה 🙌');
    }
    ins.forEach(function (i) { i.addEventListener('input', upd); });
    upd();
  }

  /* before / after drag */
  d.querySelectorAll('.ba').forEach(function (ba) {
    var after = ba.querySelector('.ba-after'), h = ba.querySelector('.ba-handle'), drag = false;
    function set(p) { p = Math.min(.95, Math.max(.05, p)); after.style.clipPath = 'inset(0 0 0 ' + p * 100 + '%)'; h.style.left = p * 100 + '%'; h.setAttribute('aria-valuenow', Math.round(p * 100)); }
    function fromX(x) { var r = ba.getBoundingClientRect(); set((x - r.left) / r.width); }
    ba.addEventListener('pointerdown', function (e) { drag = true; fromX(e.clientX); });
    addEventListener('pointermove', function (e) { if (drag) fromX(e.clientX); });
    addEventListener('pointerup', function () { drag = false; });
    h.addEventListener('keydown', function (e) {
      var cur = (parseFloat(h.style.left) || 50) / 100;
      if (e.key === 'ArrowLeft') { set(cur - .05); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(cur + .05); e.preventDefault(); }
    });
    if (!reduce && 'IntersectionObserver' in window) {
      var io2 = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return; io2.disconnect(); var t0 = performance.now();
        (function a(t) { var k = Math.min(1, (t - t0) / 1600); if (!drag) set(.5 + .3 * Math.sin(k * Math.PI * 2) * (1 - k)); if (k < 1 && !drag) requestAnimationFrame(a); })(t0);
      }, { threshold: .5 });
      io2.observe(ba);
    }
  });
})();
