const CACHE_PREFIX = 'onion-shell-';
const CACHE = CACHE_PREFIX + '__BUILD_ID__';
const SHELL = [
  '/',
  '/assets/main-__BUILD_ID__.js',
  '/assets/main-__BUILD_ID__.css',
  ...__PUBLIC_ASSETS__,
];

self.addEventListener('install', event => {
  // Stable public URLs still need fresh bytes when a new release is installed.
  const requests = SHELL.map(path => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || url.pathname.includes('chatgpt') ||
      url.pathname === '/callback') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/', { cacheName: CACHE })));
    return;
  }
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(event.request, { cacheName: CACHE }).then(response =>
      response || fetch(event.request)));
  }
});
