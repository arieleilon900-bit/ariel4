// Renders ad.html to ad.png (1080x1350 at 2x). Usage: node ads/whatsapp-secretary/render.mjs
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto('file://' + path.join(dir, 'ad.html'));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(dir, 'ad.png') });
await browser.close();
