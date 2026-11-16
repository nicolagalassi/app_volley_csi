# Fulgur Volley — partite CSI

App web (installabile sul telefono) che raccoglie le partite della **Fulgur** dai
calendari di pallavolo del CSI e mostra:

- **prossima partita** con conto alla rovescia, palestra e pulsante **Apri in Maps**;
- tutte le partite della squadra, con il **link a Google Maps della palestra** e i
  risultati con i parziali dei set;
- **classifica** calcolata dai risultati (3 punti per 3-0/3-1, 2-1 per il 3-2);
- calendario completo per giornata (solo Fulgur o tutte le partite);
- esportazione delle partite nel calendario del telefono (`.ics`).

## Come si aggiornano risultati e classifica

Il sito `live.centrosportivoitaliano.it` è protetto da Cloudflare e non permette
ad altre app di leggerlo in automatico. Per aggiornare:

1. nell'app, sezione **Aggiorna** → *Apri sito CSI*;
2. scarica il **PDF del calendario** (contiene risultati e set aggiornati);
3. caricalo nell'app (o, su Android con l'app installata, *Condividi → Fulgur Volley*).

L'app legge il PDF direttamente sul telefono e salva i dati sul dispositivo.
Si possono caricare i PDF di più campionati: le partite vengono raggruppate.

## Pubblicazione

### Cloudflare Workers — https://fulgur.dalinar.dev

Configurazione in `wrangler.jsonc` (Worker `fulgur`, solo file statici, dominio
personalizzato `fulgur.dalinar.dev`). `npm run build` copia in `dist/` i soli file
dell'app; `_headers` evita che il telefono tenga versioni vecchie.

Collegamento automatico (una volta sola), dalla dashboard Cloudflare:
*Workers & Pages → Create → Import a repository* → `nicolagalassi/app_volley_csi`,
branch `main`, **Build command** `npm run build`, **Deploy command** `npx wrangler deploy`.
Da quel momento ogni push su `main` ripubblica l'app.

A mano, da un computer: `npx wrangler login` e poi `npm run deploy`.

### GitHub Pages — https://nicolagalassi.github.io/app_volley_csi/

Pubblicata dal branch `main` (cartella principale), si aggiorna a ogni push.

## Sviluppo

```bash
npm install
npm test                 # test del parser e della classifica
npm run data             # rigenera data/campionati.json dal PDF in tests/fixtures
npm start                # http://localhost:8080
npm run build            # prepara dist/ per Cloudflare
```

- `js/parser.js` — legge il PDF del CSI (posizioni del testo estratte con pdf.js)
- `js/standings.js` — calcolo della classifica
- `js/app.js` — interfaccia
- `vendor/pdfjs/` — pdf.js 4.10.38 (Mozilla, licenza Apache 2.0)
