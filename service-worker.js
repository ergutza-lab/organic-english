// Service Worker de la PWA de Organic English — v1.2
//
// Estrategias:
//  • Paginas HTML, scripts, estilos y manifest del MISMO sitio: "red primero".
//    Siempre se revalida contra el servidor (cache: 'no-cache'), asi que ya
//    no se queda una version vieja por el cache HTTP de GitHub Pages
//    (~10 min). Si la red tarda mas de 5 s o falla, se usa la copia guardada
//    y la descarga SIGUE en segundo plano para dejar lista la version nueva
//    en la proxima apertura.
//  • Imagenes, fuentes y recursos de otros sitios: "stale-while-revalidate"
//    (se sirve lo guardado al instante y se actualiza por detras).
//  • Llamadas a Google Apps Script: NUNCA se interceptan (son datos en vivo).
//
// Las paginas se guardan SIN el query string (alumno.html?id=...&email=...),
// para no acumular IDs ni correos de alumnos dentro del cache del dispositivo.

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

// ═══ PWA: cache + instalacion ═══
// IMPORTANTE: cada vez que quieras forzar limpieza total de caches viejos en
// todos los dispositivos, cambia este numero (v1.2 -> v1.3, etc.).
var CACHE_NAME = 'oe-app-v1.2';
var APP_SHELL = ['staff.html'];
var TIEMPO_MAXIMO_ESPERA_MS = 5000;
var HOSTS_SIN_INTERCEPTAR = ['script.google.com', 'script.googleusercontent.com'];

function ignorar() {}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(APP_SHELL.map(function (ruta) {
        // 'reload' = ignora el cache HTTP para guardar la version realmente nueva
        return fetch(new Request(ruta, { cache: 'reload' })).then(function (resp) {
          if (resp && resp.ok) return cache.put(ruta, resp);
        });
      }));
    }).catch(ignorar)
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
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Permite a una pagina preguntar que version del service worker esta activa:
//   navigator.serviceWorker.controller.postMessage('GET_VERSION')
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});

// Pagina simple que se muestra SOLO si no hay conexion Y tampoco hay copia
// guardada de ESA pagina. Solo se usa para paginas (navegacion), nunca para
// imagenes ni datos.
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

function esDocumento(req) {
  return req.mode === 'navigate' || req.destination === 'document' || req.destination === 'iframe';
}

// Todo lo que, si queda viejo, rompe la app: paginas, scripts, estilos, manifest.
function usaRedPrimero(req, url) {
  if (url.origin !== self.location.origin) return false;
  if (esDocumento(req)) return true;
  var d = req.destination;
  if (d === 'script' || d === 'style' || d === 'manifest' || d === 'worker') return true;
  var accept = req.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

function manejarRedPrimero(event, url) {
  var req = event.request;
  var esDoc = esDocumento(req);
  // Paginas: se guardan sin query string. Otros archivos: URL completa.
  var clave = esDoc ? (url.origin + url.pathname) : req.url;

  // 'no-cache' = siempre revalida con el servidor (barato: 304 si no cambio)
  var red = fetch(req, { cache: 'no-cache' }).then(function (resp) {
    if (resp && resp.ok) {
      var copia = resp.clone();
      caches.open(CACHE_NAME)
        .then(function (c) { return c.put(clave, copia); })
        .catch(ignorar);
    }
    return resp;
  });
  // Mantiene vivo el service worker para que la descarga termine y se guarde
  // aunque la pagina ya haya recibido la copia vieja por el limite de espera.
  event.waitUntil(red.catch(ignorar));

  var redOSinRed = red.then(
    function (r) { return (r && r.status >= 500) ? null : r; },
    function () { return null; }
  );
  var limite = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, TIEMPO_MAXIMO_ESPERA_MS);
  });

  return Promise.race([redOSinRed, limite]).then(function (resp) {
    if (resp) return resp;
    return caches.match(clave).then(function (cacheada) {
      if (cacheada) return cacheada;
      return esDoc ? paginaSinConexion() : Response.error();
    });
  });
}

function manejarStaleWhileRevalidate(event) {
  var req = event.request;
  return caches.match(req).then(function (cacheada) {
    var red = fetch(req).then(function (resp) {
      // 'opaque' = imagenes de otros dominios (raw.githubusercontent.com)
      if (resp && (resp.ok || resp.type === 'opaque')) {
        var copia = resp.clone();
        caches.open(CACHE_NAME)
          .then(function (c) { return c.put(req, copia); })
          .catch(ignorar);
      }
      return resp;
    });
    if (cacheada) {
      event.waitUntil(red.catch(ignorar));
      return cacheada;
    }
    return red.catch(function () { return Response.error(); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Video/audio con Range: se deja pasar tal cual.
  if (req.headers.has('range')) return;

  // Backend (Google Apps Script): NUNCA interceptar. Son datos JSON en vivo;
  // si se les aplica el limite de tiempo o el cache, un timeout puede entregar
  // la pagina "Sin conexion" como si fuera la respuesta de la API y romper
  // cualquier fetch() que espere JSON.
  if (HOSTS_SIN_INTERCEPTAR.indexOf(url.hostname) !== -1) return;

  if (usaRedPrimero(req, url)) {
    event.respondWith(manejarRedPrimero(event, url));
  } else {
    event.respondWith(manejarStaleWhileRevalidate(event));
  }
});
