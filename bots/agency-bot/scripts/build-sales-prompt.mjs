// הופך את ההנחיה של בוט המכירות (Markdown, כמו שאליה כותבת אותה) לקובץ JS שהשרת טוען.
// מוריד את ההערות להטמעה (לפני "## מי את") ואת השורות בהערה <!-- --> (יכולות שעוד לא אושרו).
// הרצה: node scripts/build-sales-prompt.mjs clients/oneh-rishon-sales
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function cleanPrompt(md) {
  const start = md.indexOf('## מי את');
  if (start < 0) throw new Error('missing "## מי את" section');
  return md.slice(start)
    .split('\n').filter((l) => !/^\s*-?\s*<!--.*-->\s*$/.test(l)).join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const md = readFileSync(join(dir, 'sales-bot-prompt-v3.md'), 'utf8');
  writeFileSync(join(dir, 'sales-prompt.js'), `// נוצר אוטומטית מ-sales-bot-prompt-v3.md (node scripts/build-sales-prompt.mjs ${dir}). לא לערוך ידנית.\nexport default ${JSON.stringify(cleanPrompt(md))};\n`);
  console.log('ok');
}
