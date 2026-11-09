/* A.E Automations: 3D phone in the hero. The screen is a live canvas where the secretary answers;
   WhatsApp notifications orbit the phone. Mouse tilts it, scroll turns it away. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('phone3d');
if (canvas) boot().catch(e => { console.warn('3d off', e); document.documentElement.classList.add('no-webgl'); });

async function boot() {
  try { await document.fonts.ready; await document.fonts.load('600 40px "IBM Plex Sans Hebrew"'); } catch (e) {}
  const mobile = matchMedia('(max-width:1020px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, mobile ? 15.5 : 14.2);

  scene.add(new THREE.AmbientLight(0xffffff, .35));
  const key = new THREE.DirectionalLight(0xfff1e6, 2.2); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6b3d, 3.2); rim.position.set(6, -2, -5); scene.add(rim);
  const rim2 = new THREE.PointLight(0x25d366, 18, 14); rim2.position.set(-4, -3, 2); scene.add(rim2);

  const phone = new THREE.Group(); scene.add(phone);
  const W = 3.1, H = 6.4, D = .34;
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 8, .42),
    new THREE.MeshPhysicalMaterial({ color: 0x1a1418, metalness: .75, roughness: .28, clearcoat: 1, clearcoatRoughness: .15 }));
  phone.add(body);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(W - .1, H - .1, D + .02, 8, .38), new THREE.MeshStandardMaterial({ color: 0x050405, roughness: .4 }));
  phone.add(bezel);

  // screen canvas (live chat)
  const SC = document.createElement('canvas'); SC.width = 600; SC.height = 1260;
  const g = SC.getContext('2d');
  const tex = new THREE.CanvasTexture(SC); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sw = W - .3, sh = H - .3;
  const screenShape = roundedRectShape(sw, sh, .3);
  const sGeo = new THREE.ShapeGeometry(screenShape, 12);
  remapUV(sGeo, sw, sh);
  const screen = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = D / 2 + .012; phone.add(screen);
  const glass = new THREE.Mesh(sGeo, new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .14, roughness: .05, metalness: 0, clearcoat: 1, color: 0xffffff }));
  glass.position.z = D / 2 + .02; phone.add(glass);
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .08, 32), new THREE.MeshPhysicalMaterial({ color: 0x0c0c10, metalness: .9, roughness: .1, clearcoat: 1 }));
  cam.rotation.x = Math.PI / 2; cam.position.set(W / 2 - .55, H / 2 - .6, -D / 2 - .04); phone.add(cam);

  // chat script on screen
  const msgs = [
    ['in', 'היי, אפשר פרטים על לייזר לרגליים?', '22:14'],
    ['out', 'היי! כיף שפנית 😊 איזה אזורים מעניינים אותך?', '22:14'],
    ['in', 'רגליים ובית שחי. זה כואב?', '22:15'],
    ['out', 'את זה המטפלת תסביר לך הכי טוב. מאיזו עיר את?', '22:15'],
    ['in', 'מנתניה, מחר אחרי 12', '22:16'],
    ['out', 'רשמתי 🙏 המכון יחזור אלייך מחר אחרי 12. לילה טוב!', '22:16'],
  ];
  let shown = 0, typingOn = false, scrollOff = 0, targetOff = 0;
  const FONT = '"IBM Plex Sans Hebrew", sans-serif';
  function wrap(text, maxW) {
    const words = text.split(' '); const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line); return lines;
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#efe6dd'; g.fillRect(0, 0, 600, 1260);
    g.fillStyle = '#e2d6cb'; for (let y = 160; y < 1260; y += 34) for (let x = (y / 34) % 2 ? 10 : 27; x < 600; x += 34) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    // messages
    g.direction = 'rtl'; g.textBaseline = 'top';
    let y = 250 - scrollOff;
    const list = msgs.slice(0, shown);
    for (const [who, text, time] of list) {
      g.font = '500 30px ' + FONT;
      const lines = wrap(text, 400);
      const tw = Math.max(...lines.map(l => g.measureText(l).width), 90) + 44;
      const h = lines.length * 42 + 46;
      const x = who === 'in' ? 600 - 26 - tw : 26;
      g.fillStyle = who === 'in' ? '#ffffff' : '#dcf8c6';
      rr(g, x, y, tw, h, 20); g.fill();
      g.fillStyle = '#0b211c';
      lines.forEach((l, i) => { g.textAlign = 'right'; g.fillText(l, x + tw - 22, y + 14 + i * 42); });
      g.font = '400 20px "IBM Plex Mono", monospace'; g.fillStyle = who === 'in' ? '#8a9a94' : '#53bdeb'; g.textAlign = 'left';
      g.direction = 'ltr'; g.fillText(time + (who === 'out' ? '  ✓✓' : ''), x + 18, y + h - 30); g.direction = 'rtl';
      y += h + 16;
    }
    if (typingOn) { g.fillStyle = '#dcf8c6'; rr(g, 26, y, 120, 58, 20); g.fill(); g.fillStyle = '#6c8a77'; const t = performance.now() / 200; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(58 + i * 28, y + 29 - Math.max(0, Math.sin(t - i)) * 6, 7, 0, 7); g.fill(); } y += 74; }
    const contentBottom = y + scrollOff;
    targetOff = Math.max(0, contentBottom - 1140);
    // header (drawn last, on top)
    g.fillStyle = '#075e54'; g.fillRect(0, 0, 600, 215);
    g.fillStyle = '#000'; rr(g, 225, 22, 150, 44, 22); g.fill();
    g.direction = 'ltr'; g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '600 24px "IBM Plex Mono", monospace'; g.fillText('22:14', 52, 30);
    g.textAlign = 'right'; g.fillText('5G ▮▮▮', 548, 30);
    g.fillStyle = '#cfe9dd'; g.beginPath(); g.arc(530, 148, 34, 0, 7); g.fill();
    g.fillStyle = '#075e54'; g.font = '700 24px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.fillText('AE', 530, 136); g.direction = 'rtl';
    g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.font = '600 32px ' + FONT; g.fillText('מכון הלייזר שלך', 476, 112);
    g.font = '400 23px ' + FONT; g.fillStyle = '#d6efe7'; g.fillText(typingOn ? 'מקלידה…' : 'מחוברת', 476, 156);
    g.fillStyle = '#f0ebe6'; g.fillRect(0, 1160, 600, 100);
    g.fillStyle = '#ffffff'; rr(g, 20, 1180, 470, 62, 31); g.fill();
    g.fillStyle = '#9a8e88'; g.font = '400 24px ' + FONT; g.fillText('הודעה', 460, 1196);
    g.fillStyle = '#128c4a'; g.beginPath(); g.arc(540, 1211, 32, 0, 7); g.fill();
    tex.needsUpdate = true;
  }
  let nextAt = performance.now() + 900;
  function stepChat(t) {
    if (t < nextAt) return;
    if (shown >= msgs.length) { shown = 0; scrollOff = 0; nextAt = t + 900; return; }
    const m = msgs[shown];
    if (m[0] === 'out' && !typingOn) { typingOn = true; nextAt = t + 1300; return; }
    typingOn = false; shown++; nextAt = t + (shown >= msgs.length ? 4200 : m[0] === 'in' ? 1100 : 1700);
  }

  // orbiting notifications
  const notes = [['נועה', 'היי, כמה עולה לייזר לרגליים?'], ['שירן', 'יש לכם תור השבוע?'], ['מאיה', 'אפשר פרטים על בית שחי?'], ['דנה', 'אתם פתוחים בשישי?']];
  const cards = notes.map((n, i) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 170; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.97)'; rr(x, 4, 4, 632, 162, 34); x.fill();
    x.fillStyle = '#25d366'; rr(x, 520, 35, 96, 96, 24); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(568, 83, 26, 0, 7); x.fill(); x.fillStyle = '#25d366'; x.beginPath(); x.arc(568, 83, 18, 0, 7); x.fill();
    x.direction = 'rtl'; x.textAlign = 'right'; x.textBaseline = 'top';
    x.fillStyle = '#0b211c'; x.font = '700 34px ' + FONT; x.fillText(n[0], 492, 34);
    x.fillStyle = '#33463f'; x.font = '400 29px ' + FONT; x.fillText(n[1], 492, 86);
    x.direction = 'ltr'; x.textAlign = 'left'; x.fillStyle = '#9a8a94'; x.font = '400 22px "IBM Plex Mono", monospace'; x.fillText('עכשיו', 34, 38);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, .61), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false }));
    m.userData = { a: i / notes.length * Math.PI * 2, r: mobile ? 1.6 : 1.75, y: [1.8, .6, -.6, -1.8][i], sp: .16 + i * .02 };
    scene.add(m); return m;
  });

  // particles
  const pg = new THREE.BufferGeometry(); const N = mobile ? 120 : 260; const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 16; pos[i * 3 + 1] = (Math.random() - .5) * 11; pos[i * 3 + 2] = (Math.random() - .5) * 8 - 2; }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dots = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xe6c46a, size: .035, transparent: true, opacity: .55, depthWrite: false }));
  scene.add(dots);

  // pointer + scroll
  let mx = 0, my = 0, sx = 0, sy = 0;
  addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
  const hero = canvas.closest('.hero');
  function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  let last = performance.now(), visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    stepChat(t); scrollOff += (targetOff - scrollOff) * Math.min(1, dt * 6); draw();
    const p = hero ? Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / hero.offsetHeight)) : 0;
    sx += (mx - sx) * Math.min(1, dt * 3); sy += (my - sy) * Math.min(1, dt * 3);
    const idle = reduce ? 0 : Math.sin(t / 1600) * .06;
    phone.rotation.y = -.32 + sx * .28 + p * 1.2 + idle;
    phone.rotation.x = .08 + sy * .14 - p * .25;
    phone.rotation.z = -.04 + Math.sin(t / 2300) * .02;
    phone.position.y = (reduce ? 0 : Math.sin(t / 1300) * .1) + p * 1.5;
    cards.forEach((m, i) => {
      const u = m.userData; const a = u.a + (reduce ? 0 : t / 1000 * u.sp);
      m.position.set(Math.cos(a) * u.r, u.y + Math.sin(t / 900 + i) * .08 + p * 1.5, Math.sin(a) * u.r * .7);
      m.lookAt(camera.position); m.material.opacity = Math.min(1, Math.max(0, (m.position.z - .1) / .8));
      m.renderOrder = m.position.z > 0 ? 2 : 0;
    });
    dots.rotation.y = t / 30000;
    renderer.render(scene, camera);
  }
  draw(); requestAnimationFrame(frame);
  document.documentElement.classList.remove('no-webgl');
  window.AE = window.AE || {}; AE.ready3d = true;
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function remapUV(geo, w, h) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getY(i) / h + .5);
  uv.needsUpdate = true;
}
