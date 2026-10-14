// בונה את דף הניסיון: node sim/build.mjs ← sim/dist/agency-demo.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const swap = {
  name: 'sim-swap',
  setup(b) {
    // הבוט האמיתי מדבר עם Anthropic וגוגל; בדף הניסיון מחליפים את שני הקבצים האלה בלבד
    b.onResolve({ filter: /^\.\/(ai|sheets)\.js$/ }, (args) => (args.importer.includes('/src/') ? { path: resolve(here, args.path) } : undefined));
    // דף הניסיון לא מדבר עם Anthropic ישירות (רק דרך Claude של מי שפותח את הדף)
    b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: 'anthropic-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default class Anthropic { constructor() { throw new Error("not in the trial page"); } }', loader: 'js' }));
  },
};
const out = await build({
  entryPoints: [resolve(here, 'entry.js')], bundle: true, format: 'iife', globalName: 'BotSim',
  platform: 'browser', target: 'es2020', write: false, plugins: [swap], loader: { '.sql': 'text' }, legalComments: 'none',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = readFileSync(resolve(here, 'page.html'), 'utf8').replace('/*__BOT_BUNDLE__*/', () => js);
mkdirSync(resolve(here, 'dist'), { recursive: true });
writeFileSync(resolve(here, 'dist/agency-demo.html'), page);
console.log('sim/dist/agency-demo.html', Math.round(page.length / 1024), 'KB');
