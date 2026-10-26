// node render-ads.cjs -> renders the static ads to PNG (Hebrew file names, ready to upload)
const { chromium } = require('playwright');
const path = require('path');
const jobs = [
  ['facebook-ads/ad-square.html', 1080, 1080, 'facebook-ads/מודעה מרובעת.png'],
  ['facebook-ads/ad-story.html', 1080, 1920, 'facebook-ads/מודעה לסטורי.png'],
  ['ad-tradesmen.html', 1080, 1350, 'מודעה לקבוצות.png'],
];
(async () => {
  const b = await chromium.launch();
  for (const [src, w, h, out] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + path.join(__dirname, src));
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(__dirname, out) });
  }
  await b.close();
})();
