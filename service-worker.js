// Service Worker de la PWA de Organic English (piloto: Dirección).
// Estrategia "red primero": SIEMPRE intenta traer la version mas reciente
// del servidor. Solo usa la copia guardada localmente si no hay conexion
// -- asi nunca se queda viendo una version vieja por error de cache.

const CACHE_NAME = 'oe-app-v2';
const APP_SHELL = [
  'staff.html'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        var copia = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copia);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
