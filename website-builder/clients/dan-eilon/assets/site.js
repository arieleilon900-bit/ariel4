(function(){
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('menu');
  if (burger && menu) {
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); });
    });
  }

  var mbar = document.querySelector('.mbar');
  if (mbar) {
    var hero = document.querySelector('.hero');
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
