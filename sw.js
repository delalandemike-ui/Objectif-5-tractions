const CACHE_NAME = "objectif-5-tractions-spark-v7";
const APP_SHELL = ["./", "./index.html"];
const MULTISPORT_SHELL = ['./athlete.html', './multisport.css', './js/athlete-page.js', './js/athlete-session.js', './js/program-account.js', './js/messages.js', './js/athlete-store.js', './js/athlete-data.js', './js/cloud.js', './js/invitations.js', './js/multisport-config.js', './js/auth.js', './js/firebase-config.js'];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...APP_SHELL, ...MULTISPORT_SHELL]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key === 'objectif-5-fractions-v1')
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Uniquement les fichiers statiques locaux : jamais Auth, Firestore ou les réponses serveur.
  const url = new URL(event.request.url, self.location.href);
  const root = new URL('./', self.location.href);
  const allowed = [...APP_SHELL, ...MULTISPORT_SHELL].map(path => new URL(path, root).pathname);
  if (url.origin !== root.origin || url.search || !allowed.includes(url.pathname)) return;

  event.respondWith(
    fetch(event.request).then((response) => {
        if (!response.ok) throw new Error('Static resource unavailable');
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request)))
  );
});
