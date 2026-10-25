// import-art.mjs — unpack the art pack made in the browser (assets-in/ng-art-pack.json: { files: { "art/x.webp": "data:…" },
// meta: {...} }) into public/art/. Run from prototype/:   node scripts/import-art.mjs [path/to/ng-art-pack.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? path.join(root, 'assets-in', 'ng-art-pack.json');
const pack = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = path.join(root, 'public', 'art');
fs.mkdirSync(out, { recursive: true });
let n = 0, bytes = 0;
for (const [name, url] of Object.entries(pack.files ?? {})) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!m || !name.startsWith('art/') || name.includes('..')) { console.warn('skip', name); continue; }
  const buf = Buffer.from(m[2], 'base64');
  fs.writeFileSync(path.join(out, path.basename(name)), buf);
  n++; bytes += buf.length;
}
if (pack.meta) fs.writeFileSync(path.join(out, 'credits.json'), JSON.stringify(pack.meta, null, 1));
console.log(`wrote ${n} files (${(bytes / 1024).toFixed(0)} KB) to public/art/`);
