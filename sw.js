// Service worker: funzionamento offline e ricezione dei PDF condivisi (Android).
const VERSION = 'v4';
const SHELL = `shell-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/parser.js',
  'js/standings.js',
  'js/pdf-extract.js',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
  'data/campionati.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = scarica sempre dal server, mai dalla cache HTTP del browser.
  e.waitUntil(caches.open(SHELL)
    .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Web Share Target: il PDF condiviso arriva qui in POST.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const cache = await caches.open('share-inbox');
      let i = 0;
      for (const f of form.getAll('pdf')) {
        if (typeof f === 'string') continue;
        await cache.put(new Request(`./shared/${i++}/${encodeURIComponent(f.name || 'calendario.pdf')}`), new Response(f));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;

  // Rete prima, chiedendo sempre al server se il file è cambiato (GitHub Pages
  // altrimenti lascia al browser copie vecchie fino a 10 minuti); cache se offline.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
