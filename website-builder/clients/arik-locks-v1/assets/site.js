(function(){
  var WA = '972525585883';

  /* mobile menu */
  var burger = document.querySelector('.burger'), menu = document.getElementById('menu');
  if (burger && menu){
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  /* Shabbat-aware status. Friday 14:00 until Saturday 21:00, Israel time.
     A safe approximation: it never claims "open" after candle lighting. */
  var parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Jerusalem', weekday:'short', hour:'numeric', hour12:false}).formatToParts(new Date());
  var day = parts.find(function(x){ return x.type === 'weekday'; }).value,
      hour = +parts.find(function(x){ return x.type === 'hour'; }).value % 24;
  var shabbat = (day === 'Fri' && hour >= 14) || (day === 'Sat' && hour < 21);
  document.querySelectorAll('[data-status]').forEach(function(el){
    if (!shabbat) return;
    el.classList.add('closed');
    var t = el.querySelector('span') || el;
    t.textContent = el.dataset.shabbat || 'שבת שלום. אריק חוזר לעבוד במוצאי שבת';
  });

  /* quick WhatsApp message */
  var chips = document.getElementById('chips');
  if (chips){
    var where = document.getElementById('where'), msg = document.getElementById('msg'), send = document.getElementById('send'), what = '';
    var build = function(){
      var m = 'היי אריק, ' + (what || 'אני צריך מנעולן') + '.';
      if (where.value.trim()) m += ' אני ב' + where.value.trim() + '.';
      msg.textContent = m;
      send.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(m);
    };
    chips.querySelectorAll('.chip').forEach(function(c){ c.setAttribute('aria-pressed', 'false'); });
    chips.addEventListener('click', function(e){
      var b = e.target.closest('.chip'); if (!b) return;
      chips.querySelectorAll('.chip').forEach(function(c){ c.setAttribute('aria-pressed', c === b); });
      what = b.dataset.t; build();
    });
    where.addEventListener('input', build);
    build();
  }

  /* the padlock on the home page opens once */
  var lock = document.querySelector('.lockart');
  if (lock) setTimeout(function(){ lock.classList.add('open'); }, 500);

  /* mobile call bar: show after the first screen */
  var mbar = document.querySelector('.mbar');
  if (mbar){
    var onScroll = function(){ mbar.classList.toggle('show', scrollY > innerHeight * .7); };
    addEventListener('scroll', onScroll, {passive:true}); onScroll();
  }
})();
