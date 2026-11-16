// Copia in dist/ solo i file dell'app da pubblicare (Cloudflare Workers).
import fs from 'node:fs';
const FILES = ['index.html', '404.html', 'manifest.webmanifest', 'sw.js', '_headers', 'css', 'js', 'data', 'icons', 'vendor'];
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
for (const f of FILES) fs.cpSync(f, `dist/${f}`, { recursive: true });
console.log(`dist/ pronto: ${FILES.join(', ')}`);
