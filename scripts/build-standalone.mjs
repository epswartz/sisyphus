// Bundles the app into one self-contained HTML file that opens straight from
// disk (file://), where ES modules and service workers do not work.
// Usage: node scripts/build-standalone.mjs   →  standalone/sisyphus.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const stripExports = (src) => src.replace(/^export (?=(class|function|const|async) )/gm, '');
const exportedNames = (src) => [...src.matchAll(/^export (?:class|function|const|async function) (\w+)/gm)].map((m) => m[1]);

const coreSrc = read('js/core.js');
const core = `const core = (() => {\n${stripExports(coreSrc)}\nreturn { ${exportedNames(coreSrc).join(', ')} };\n})();`;
const art = stripExports(read('js/art.js'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
const version = `const BUILD = ${JSON.stringify(commit ? `local · ${commit}` : 'local')};`;
const app = read('js/app.js')
  .replace(/^import .*$/gm, '')
  .replace(/if \('serviceWorker' in navigator[\s\S]*$/, '');

const scriptBody = [version, core, art, app].join('\n\n').replace(/<\/script/gi, '<\\/script');
const iconData = 'data:image/svg+xml,' + encodeURIComponent(read('icon.svg').trim());

const html = read('index.html')
  .replace(/<link rel="manifest"[^>]*>\n/, '')
  .replace(/<link rel="(icon|apple-touch-icon)" href="icon.svg"[^>]*>/g, (_m, rel) => `<link rel="${rel}" href="${iconData}">`)
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n(() => {\n${scriptBody}\n})();\n</script>`);

mkdirSync(new URL('standalone/', root), { recursive: true });
writeFileSync(new URL('standalone/sisyphus.html', root), html);
console.log('Wrote standalone/sisyphus.html (' + Math.round(html.length / 1024) + ' KB)');
