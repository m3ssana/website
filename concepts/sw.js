/* messana.ai PWA service worker — precache the app shell, serve offline. */
const CACHE = 'messana-v3-1';
const SHELL = [
  '03-glass-score.html',
  'shared.css',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
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
    e.respondWith(fetch(req).catch(() => caches.match('03-glass-score.html')));
    return;
  }

  // everything else: cache-first, then network (runtime-caching same-origin + Google Fonts)
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        const url = new URL(req.url);
        if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.host)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
