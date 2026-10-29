import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, src, outDir, dur = '20', fps = '30', only] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto('file://' + process.cwd() + '/' + src, { waitUntil: 'networkidle' }).catch(() => {});
await p.waitForTimeout(1000);
const n = Math.round(+dur * +fps);
const frames = only ? only.split(',').map((s) => Math.round(+s * +fps)) : [...Array(n).keys()];
for (const i of frames) {
  await p.evaluate((t) => window.render(t), i / +fps);
  await p.screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
}
await b.close();
console.log('frames', frames.length);
