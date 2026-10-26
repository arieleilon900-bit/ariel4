// Renders ad-video.html frame by frame into ad-video.mp4 (1080x1920, 30fps).
// Usage: node render.mjs            -> full video
//        node render.mjs 1 4.5 10   -> preview PNGs at those seconds
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DURATION = 18;
const previews = process.argv.slice(2).map(Number);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.join(dir, 'ad-video.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);

if (previews.length) {
  for (const t of previews) {
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: path.join(dir, `preview-${t}.png`) });
  }
} else {
  const frames = path.join(dir, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  for (let i = 0; i < FPS * DURATION; i++) {
    await page.evaluate(t => render(t), i / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart',
    path.join(dir, 'ad-video.mp4')]);
  rmSync(frames, { recursive: true, force: true });
}
await browser.close();
