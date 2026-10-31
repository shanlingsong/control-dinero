// Service worker: guarda una copia de la app para que abra aunque no haya internet.
// Primero intenta descargar la versión más nueva; si no hay conexión, usa la copia guardada.

const CACHE = 'kashiki-v47';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'marca/kashiki.png', 'privacidad.html'];
// Con señal muy mala, la red puede tardar muchísimo en contestar. Si pasa este tiempo y ya hay
// una copia guardada de ESA MISMA versión, se usa la copia para que la app no se quede "trabada".
const ESPERA_RED = 3500; // milisegundos

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
  const deLaRed = fetch(pedido, { cache: 'no-cache' }).then((respuesta) => {
    const copia = respuesta.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copia));
    return respuesta;
  });

  evento.respondWith(
    new Promise((resolver) => {
      let listo = false;
      const usar = (respuesta) => {
        if (listo || !respuesta) return false;
        listo = true;
        resolver(respuesta);
        return true;
      };
      // Red lenta: solo se usa la copia si es exactamente la misma versión (mismo ?v=),
      // para no mezclar la página nueva con un diseño viejo.
      const reloj = setTimeout(() => caches.match(request).then(usar), ESPERA_RED);
      deLaRed
        .then((respuesta) => {
          clearTimeout(reloj);
          usar(respuesta);
        })
        .catch(async () => {
          // Sin internet: cualquier copia guardada sirve, aunque sea de otra versión.
          clearTimeout(reloj);
          if (!usar(await caches.match(request, { ignoreSearch: true }))) usar(Response.error());
        });
    })
  );
});

// ---------- Notificaciones ----------
// Llegan aunque Kashiki esté cerrada: el teléfono despierta este archivo y él muestra el aviso.
self.addEventListener('push', (evento) => {
  let aviso = { titulo: 'Kashiki', cuerpo: '', url: './' };
  try {
    aviso = { ...aviso, ...evento.data.json() };
  } catch {
    if (evento.data) aviso.cuerpo = evento.data.text();
  }
  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: aviso.url },
    })
  );
});

// Al tocar la notificación se abre Kashiki (o se trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url || './';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.registration.scope));
      return abierta ? abierta.focus() : self.clients.openWindow(url);
    })
  );
});
