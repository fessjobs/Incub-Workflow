// Service Worker für den Mitarbeiter-Link (/e/…): hält Seite und Daten der
// letzten Anzeige vor, damit das Formular auch ohne Netz in der Halle
// geöffnet werden kann. Eingaben puffert die Seite in IndexedDB und sendet
// sie nach (offline.ts); bei Background-Sync stößt der SW das Nachsenden an.
const CACHE = "fess-einsatz-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fess-einsatz-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".woff2")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Seite und Token-Daten: Netz zuerst, sonst letzte bekannte Version
  if (url.pathname.startsWith("/e/") || url.pathname.startsWith("/api/e/")) {
    if (url.pathname.endsWith("/pdf")) return;
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "fess-einsatz-flush") {
    event.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then((clients) => clients.forEach((c) => c.postMessage("flush"))));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "flush") {
    self.clients.matchAll().then((clients) => clients.forEach((c) => c.postMessage("flush")));
  }
});
