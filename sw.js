// Offline support. Network first, so a new deploy is picked up on the next
// open; the cache is only used when the network is unavailable.
const CACHE = 'sisyphus-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/core.js',
  './js/art.js',
  './js/version.js',
  './sample-schedule.json',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // "no-cache" makes the browser check with the server instead of reusing
    // its own HTTP cache, which GitHub Pages lets it keep for 10 minutes.
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
