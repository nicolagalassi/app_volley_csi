// Estrae gli elementi di testo da un PDF con pdf.js.
// `pdfjs` è il modulo pdf.js già caricato (browser o Node).

export async function extractItems(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      items.push({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        size: Math.abs(it.transform[0]),
        page: p,
      });
    }
  }
  await doc.destroy();
  return items;
}
