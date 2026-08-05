// Service Worker de la PWA de Organic English -- ALUMNOS.
// Copia de service-worker.js (piloto de Direccion) adaptada para que la
// instalacion de alumnos apunte a alumno-app.html en vez de staff.html,
// y no mezcle su cache con la de staff.
// Estrategia "red primero": SIEMPRE intenta traer la version mas reciente
// del servidor. Solo usa la copia guardada localmente si no hay conexion
// -- asi nunca se queda viendo una version vieja por error de cache.

// ═══ Firebase Cloud Messaging: recibir avisos aunque la app este cerrada ═══
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB8tBr0rYLbhDXUDHLCqJm2fM8lHA0aBlM",
  authDomain: "organic-english.firebaseapp.com",
  projectId: "organic-english",
  storageBucket: "organic-english.firebasestorage.app",
  messagingSenderId: "535971507724",
  appId: "1:535971507724:web:82f9f057936b4c2f8e0829"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  var titulo = (payload.notification && payload.notification.title) || 'Organic English';
  var opciones = {
    body: (payload.notification && payload.notification.body) || '',
    icon: 'https://raw.githubusercontent.com/ergutza-lab/organic-english/main/images/icon-192.png',
    badge: 'https://raw.githubusercontent.com/ergutza-lab/organic-english/main/images/icon-192.png',
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.url) || 'alumno-app.html' }
  };
  self.registration.showNotification(titulo, opciones);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var urlDestino = (event.notification.data && event.notification.data.url) || 'alumno-app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (listaVentanas) {
      for (var i = 0; i < listaVentanas.length; i++) {
        if ('focus' in listaVentanas[i]) return listaVentanas[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(urlDestino);
    })
  );
});

// ═══ PWA: cache + instalacion (lo que ya teniamos) ═══
const CACHE_NAME = 'oe-alumno-v1';
const APP_SHELL = [
  'alumno-app.html'
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
