// Uso: node tools/parse-pdf.mjs <calendario.pdf> [altri.pdf...] > data/campionati.json
// Genera i dati iniziali inclusi nell'app a partire dai PDF del CSI.
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractItems } from '../js/pdf-extract.js';
import { parseCalendar } from '../js/parser.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node tools/parse-pdf.mjs <calendario.pdf> [...]');
  process.exit(1);
}

const championships = [];
for (const f of files) {
  const items = await extractItems(pdfjs, new Uint8Array(fs.readFileSync(f)));
  const c = parseCalendar(items);
  c.importedAt = new Date().toISOString();
  championships.push(c);
  console.error(`${f}: "${c.title}", ${c.matches.length} partite, ${c.matches.filter(m => m.result).length} giocate`);
}
process.stdout.write(JSON.stringify({ championships }, null, 2) + '\n');
