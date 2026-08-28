/* ============ SERVICE WORKER — Kegel Control ============
   Rend l'application installable sur téléphone (PWA) et utilisable hors-ligne
   (le prototype ne dépend d'aucun serveur : tout tourne déjà en local sur
   l'appareil). Stratégie "réseau d'abord" pour toujours servir la dernière
   version publiée quand une connexion est disponible, et se rabattre sur la
   copie locale sinon. */
const CACHE_NAME = 'kegel-control-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
