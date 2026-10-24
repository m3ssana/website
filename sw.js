/* messana.ai PWA service worker — precache the app shell, serve offline. */
const CACHE = 'messana-v5-3';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=5.3',
  '/js/main.js?v=5.3',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // navigations: network-first, fall back to the cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  // everything else: cache-first, then network. Runtime-cache same-origin assets
  // and Google Fonts so the page renders fully offline on repeat visits.
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        const url = new URL(req.url);
        if (url.origin === location.origin || /fonts\.(?:googleapis|gstatic)\.com$/.test(url.host)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
