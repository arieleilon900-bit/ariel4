// Screenshot + smoke test for a client site, desktop 1440 and mobile 390.
//
// Usage (from the repo root):
//   npx http-server -p 8765 -s . &
//   node website-builder/tools/shoot.mjs aven-residences [outDir]
//
// Takes one screenshot per scroll stop, prints console errors, horizontal
// overflow and (if the page exposes window.AVEN) the selected floor.
// WebGL runs on SwiftShader, so it is slow: the page gets 14s to boot.
// In the cloud sandbox Chromium can't reach the CDN through the proxy, so every
// https request is fetched with curl and fulfilled locally (CURL_ROUTE=0 turns
// this off on a normal machine).
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const client = process.argv[2];
if (!client) { console.error('usage: node shoot.mjs <client-folder> [outDir]'); process.exit(1); }
const out = process.argv[3] || `shots-${client}`;
mkdirSync(out, { recursive: true });
const url = `http://localhost:8765/website-builder/clients/${client}/index.html`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;

for (const [name, viewport] of [['desk', { width: 1440, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, ignoreHTTPSErrors: true });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  if (process.env.CURL_ROUTE !== '0') {
    await page.route(/^https:\/\//, async route => {
      const u = route.request().url();
      try {
        const body = execFileSync('curl', ['-sSL', u], { maxBuffer: 1 << 26 });
        const type = u.includes('css2') ? 'text/css' : /\.woff2/.test(u) ? 'font/woff2' : 'application/javascript';
        await route.fulfill({ status: 200, body, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
      } catch { await route.abort(); }
    });
  }
  await page.goto(url);
  await page.waitForTimeout(14000);

  // one stop per top-level section, plus the middle of tall (sticky) sections
  const stops = await page.evaluate(() => {
    const list = [];
    document.querySelectorAll('main section').forEach((s, i) => {
      const top = s.getBoundingClientRect().top + scrollY;
      const tall = s.offsetHeight > innerHeight * 1.5;
      list.push([`${String(i).padStart(2, '0')}-${s.id || s.className.split(' ')[0]}`, top]);
      if (tall) list.push([`${String(i).padStart(2, '0')}-${s.id || s.className.split(' ')[0]}-mid`, top + s.offsetHeight * 0.5]);
    });
    return list;
  });
  for (const [label, y] of stops) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${out}/${name}-${label}.png` });
  }

  const info = await page.evaluate(() => ({
    noWebgl: document.documentElement.classList.contains('no-webgl'),
    overflow: document.documentElement.scrollWidth - innerWidth,
    selected: window.AVEN ? window.AVEN.selected : null,
  }));
  console.log(`[${name}] no-webgl=${info.noWebgl} overflow=${info.overflow}px selected=${info.selected} shots=${stops.length}`);
  if (errs.length) { failed = true; console.log(errs.map(e => '  ! ' + e).join('\n')); }
  if (info.overflow > 0) failed = true;
  await page.close();
}
await browser.close();
console.log(failed ? 'FAIL' : 'OK', '→', out);
process.exit(failed ? 1 : 0);
