// Service worker: guarda la app para que abra rápido y también sin conexión.
// Red primero (así siempre ves la última versión) y, si no hay red, lo último guardado.
const CACHE = 'sarten-v1';
const BASICO = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/store.js', 'js/lista.js', 'js/config.js',
  'img/icon.svg', 'img/icon-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // La IA, Supabase y las fotos de fuera siempre van por la red.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r ?? caches.match('index.html'))),
  );
});
