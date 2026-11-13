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

L'app è statica ed è pubblicata con GitHub Pages dal branch `main` (cartella
principale): **https://nicolagalassi.github.io/app_volley_csi/**. Ogni push su
`main` la aggiorna. Dal telefono apri l'indirizzo e scegli *Aggiungi a schermata Home*.

## Sviluppo

```bash
npm install
npm test                 # test del parser e della classifica
npm run data             # rigenera data/campionati.json dal PDF in tests/fixtures
npm start                # http://localhost:8080
```

- `js/parser.js` — legge il PDF del CSI (posizioni del testo estratte con pdf.js)
- `js/standings.js` — calcolo della classifica
- `js/app.js` — interfaccia
- `vendor/pdfjs/` — pdf.js 4.10.38 (Mozilla, licenza Apache 2.0)
