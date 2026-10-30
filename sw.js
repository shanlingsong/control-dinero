// Service worker: guarda una copia de la app para que abra aunque no haya internet.
// Primero intenta descargar la versión más nueva; si no hay conexión, usa la copia guardada.

const CACHE = 'kashiki-v24';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'marca/kashiki.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  // Tus datos de Supabase no se guardan aquí: esos los maneja la app.
  if (new URL(request.url).hostname.endsWith('supabase.co')) return;

  // cache: 'no-cache' = pregúntale siempre al servidor si hay versión nueva, aunque el navegador
  // tenga una copia "reciente". Así nunca se mezcla la página nueva con el diseño viejo.
  const pedido = request.mode === 'navigate' ? new Request(request.url) : request;
  evento.respondWith(
    fetch(pedido, { cache: 'no-cache' })
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copia));
        return respuesta;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
