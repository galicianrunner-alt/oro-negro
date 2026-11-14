/* OPERACIÓN ORO NEGRO · sw.js
   Permite instalar el juego en el móvil y evita el problema de caché:
   siempre intenta descargar la versión nueva; solo si no hay conexión
   usa la copia guardada. Al publicar cambios, sube el número de VERSION. */
const VERSION = 'oro-negro-4';
const BASICOS = ['./', './index.html', './contenido.js', './juego.js', './manifest.json', './icono.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // mapas, Worker: directos
  if (/\.(mp4|mp3|jpg|png)$/i.test(url.pathname)) return;                    // vídeos e imágenes: directos
  e.respondWith(
    fetch(e.request).then(r => {
      const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
