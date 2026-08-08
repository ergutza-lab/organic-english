// Service Worker de la PWA de Organic English (piloto: Direccion).
// Estrategia "red primero, con limite de espera": intenta traer la
// version mas reciente del servidor, pero si la red tarda mas de 5
// segundos en responder (sin fallar ni tener exito -- tipico de redes
// con problemas de ruteo, como se detecto con Telcel), deja de esperar
// y usa la copia guardada localmente de inmediato. Asi la app nunca se
// queda congelada en la pantalla de carga esperando una respuesta que
// quiza nunca llegue.

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
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.url) || 'staff.html' }
  };
  self.registration.showNotification(titulo, opciones);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var urlDestino = (event.notification.data && event.notification.data.url) || 'staff.html';
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
const CACHE_NAME = 'oe-app-v3';
const APP_SHELL = [
  'staff.html'
];
// Cuanto tiempo maximo esperar a la red antes de rendirse y usar la
// copia guardada (o el aviso de sin conexion si no hay copia todavia).
const TIEMPO_MAXIMO_ESPERA_MS = 5000;

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

// Intenta la red, pero se rinde (rejecta) si tarda mas de "ms" -- a
// diferencia de un fetch normal, que puede quedarse pendiente para
// siempre si la conexion no falla activamente, solo se queda "pensando".
function fetchConLimiteDeTiempo(request, ms) {
  return new Promise(function (resolve, reject) {
    var yaSeDecidio = false;
    var temporizador = setTimeout(function () {
      if (yaSeDecidio) return;
      yaSeDecidio = true;
      reject(new Error('tiempo de espera agotado'));
    }, ms);

    fetch(request).then(function (respuesta) {
      if (yaSeDecidio) return; // el timeout ya gano la carrera, ignorar
      yaSeDecidio = true;
      clearTimeout(temporizador);
      resolve(respuesta);
    }).catch(function (err) {
      if (yaSeDecidio) return;
      yaSeDecidio = true;
      clearTimeout(temporizador);
      reject(err);
    });
  });
}

// Pagina simple que se muestra SOLO si no hay conexion Y tampoco hay
// ninguna copia guardada localmente todavia (por ejemplo, la primerisima
// vez que alguien abre la app y su red no responde). Evita que la
// persona se quede viendo una pantalla en blanco sin saber que paso.
function paginaSinConexion() {
  return new Response(
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Sin conexión — Organic English</title></head>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#0f1c3f;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
    'text-align:center;padding:24px;">' +
    '<div style="max-width:320px;">' +
    '<div style="font-size:48px;margin-bottom:16px;">📶</div>' +
    '<h2 style="margin:0 0 12px;">Sin conexión</h2>' +
    '<p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">' +
    'No pudimos cargar la app. Revisa tu conexión a internet (WiFi o datos) e intenta de nuevo.</p>' +
    '<button onclick="location.reload()" style="background:linear-gradient(135deg,#f97316,#ea580c);' +
    'color:#fff;border:none;border-radius:100px;padding:14px 28px;font-size:14px;font-weight:700;' +
    'cursor:pointer;">🔄 Reintentar</button>' +
    '</div></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetchConLimiteDeTiempo(event.request, TIEMPO_MAXIMO_ESPERA_MS)
      .then(function (response) {
        var copia = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copia);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cacheada) {
          return cacheada || paginaSinConexion();
        });
      })
  );
});
