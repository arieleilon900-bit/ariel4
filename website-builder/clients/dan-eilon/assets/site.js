(function(){
  var lenis = null;
  if (window.Lenis && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      lenis = new window.Lenis({ duration: 1.05, easing: function(t){ return 1 - Math.pow(1 - t, 3); } });
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    } catch (e) { lenis = null; }
  }

  var burger = document.querySelector('.burger');
  var mobileMenu = document.getElementById('mobile-menu');
  function setMenu(open) {
    mobileMenu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    if (lenis) { open ? lenis.stop() : lenis.start(); }
  }
  if (burger && mobileMenu) {
    burger.addEventListener('click', function(){ setMenu(!mobileMenu.classList.contains('open')); });
    mobileMenu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ setMenu(false); });
    });
  }

  var mbar = document.querySelector('.mbar');
  if (mbar) {
    var hero = document.querySelector('.hero-photo, .hero');
    if ('IntersectionObserver' in window && hero) {
      new IntersectionObserver(function(entries){
        mbar.classList.toggle('show', !entries[0].isIntersecting);
      }, { rootMargin: '-40% 0px 0px 0px' }).observe(hero);
    } else {
      mbar.classList.add('show');
    }
  }

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0 });
    document.querySelectorAll('.rv').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.rv').forEach(function(el){ el.classList.add('in'); });
  }

  var heroH1 = document.querySelector('.hero-photo-inner h1');
  if (heroH1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(function(){ heroH1.classList.add('reveal-in'); });
  }

  document.querySelectorAll('.yt').forEach(function(box){
    box.addEventListener('click', function(){
      var id = box.getAttribute('data-id');
      var title = box.getAttribute('data-title') || 'סרטון';
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      box.innerHTML = '';
      box.appendChild(iframe);
      box.style.cursor = 'default';
    }, { once: true });
  });
})();
