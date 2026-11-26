/*
 * Service worker de l'application installable (GDD §7.6, V4.2).
 * - Rend le site installable et l'ouvre instantanément depuis l'écran d'accueil.
 * - Ne met en cache que les fichiers du site (même origine, GET) : jamais les appels
 *   Supabase, les Edge Functions ni Open-Meteo, qui passent toujours par le réseau.
 * - Page HTML : réseau d'abord (une mise à jour publiée est visible au prochain lancement),
 *   copie de secours hors connexion. Fichiers /assets/ (noms hachés par Vite) : cache d'abord.
 */
const CACHE = 'les-gaulois-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('les-gaulois-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackKey ?? request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(fallbackKey ?? request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    // Une seule page (routeur par ancre) : la copie de secours est la page d'accueil.
    event.respondWith(networkFirst(request, scope.href));
  } else if (url.pathname.startsWith(`${scope.pathname}assets/`)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
