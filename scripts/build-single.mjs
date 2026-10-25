// build-single.mjs — pack the Vite build (dist/) into ONE self-contained HTML file: JS, CSS, fonts and every
// file of public/data/ inlined (data files as base64 in window.__NG_FILES__, read by src/data/load.ts).
// Run from prototype/ after `vite build`:   node scripts/build-single.mjs      (or: npm run build:single)
// Writes dist-single/neutral-ground.html (a complete page you can open by double-click) and
// dist-single/neutral-ground.fragment.html (the same without <html>/<head>/<body>, for hosts that add their own).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'dist-single');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Run `vite build` first (dist/index.html is missing).'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsRel = html.match(/<script[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const cssRel = html.match(/<link[^>]+href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!jsRel || !cssRel) { console.error('Could not find the built JS/CSS in dist/index.html'); process.exit(1); }
const favicon = html.match(/<link rel="icon"[^>]*>/)?.[0] ?? '';

// CSS: keep the Latin font subsets as woff2 data: URLs (the UI is English), drop the rest
let css = fs.readFileSync(path.join(dist, cssRel), 'utf8');
css = css.replace(/@font-face\{[^}]*\}/g, (rule) => {
  if (/(cyrillic|greek|vietnamese|hebrew)/.test(rule)) return '';
  return rule
    .replace(/,\s*url\(\.\/[^)]+\.woff\)\s*format\("woff"\)/g, '')
    .replace(/url\(\.\/([^)]+\.woff2)\)/g, (_m, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(dist, 'assets', f)).toString('base64')})`);
});
if (/url\(\.\//.test(css)) console.warn('warning: some CSS url(./…) references were not inlined');

let js = fs.readFileSync(path.join(dist, jsRel), 'utf8');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
js = esc(js);

const dataDir = path.join(dist, 'data');
const files = {};
for (const f of fs.readdirSync(dataDir).sort()) files[f] = fs.readFileSync(path.join(dataDir, f)).toString('base64');
// illustrations and the relief map (public/art/), keyed 'art/<name>' (read by src/ui/art.ts)
const artDir = path.join(dist, 'art');
if (fs.existsSync(artDir)) for (const f of fs.readdirSync(artDir).sort()) if (!f.endsWith('.md')) files[`art/${f}`] = fs.readFileSync(path.join(artDir, f)).toString('base64');
const filesJs = `window.__NG_FILES__=${JSON.stringify(files)};`;

const title = 'Neutral Ground';
const body = `<div id="root"></div>\n<script>${filesJs}</script>\n<script type="module">${js}</script>`;
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
${favicon}
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;
const fragment = `<title>${title}</title>\n<style>${css}</style>\n${body}\n`;
fs.writeFileSync(path.join(out, 'neutral-ground.html'), full);
fs.writeFileSync(path.join(out, 'neutral-ground.fragment.html'), fragment);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`dist-single/neutral-ground.html ${mb(Buffer.byteLength(full))} (JS ${mb(js.length)}, CSS ${mb(css.length)}, data ${mb(filesJs.length)} in ${Object.keys(files).length} files)`);
