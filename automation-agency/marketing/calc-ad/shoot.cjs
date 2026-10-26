// node shoot.cjs -> "מודעת חשבון - מרובעת.png" and "מודעת חשבון - סטורי.png"
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [q, h, name] of [['', 1080, 'מודעת חשבון - מרובעת.png'], ['?story', 1920, 'מודעת חשבון - סטורי.png']]) {
    const p = await b.newPage({ viewport: { width: 1080, height: h } });
    await p.goto('file://' + path.join(__dirname, 'calc-ad.html') + q);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(__dirname, name) });
  }
  await b.close();
})();
