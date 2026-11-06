/* Service worker di SWU Scanner: l'interfaccia, il Catalogo e i prezzi funzionano offline dopo il primo uso.
 * - pagina: prima la rete (con tempo massimo), altrimenti l'ultima copia;
 * - /assets/ (file con impronta nel nome): sempre dalla cache, non cambiano mai;
 * - /data/: catalogo e titoli dalla cache e aggiornati in secondo piano; prezzi e meta prima dalla rete;
 * - /models/: solo il manifest (piccolo) è in cache; i file dei modelli li gestisce l'app nella sua cache,
 *   con verifica SHA-256.
 * Una nuova versione della pagina si applica al caricamento successivo, mai durante una scansione. */
const VERSION = 'v1';
const SHELL = `swu-shell-${VERSION}`;
const ASSETS = `swu-assets-${VERSION}`;
const DATA = `swu-data-${VERSION}`;
const KEEP = [SHELL, ASSETS, DATA, 'swu-models-v1'];
const NETWORK_TIMEOUT_MS = 4000;
// I file in cache non dipendono dalle intestazioni della richiesta (es. `Origin` degli script a moduli,
// che altrimenti non corrisponderebbe alla voce messa in cache dal precache).
const MATCH = { ignoreVary: true };

const scope = new URL(self.registration.scope);
const relative = (url) => url.pathname.slice(scope.pathname.length);

// Elenco dei file con impronta nel nome (JS, CSS, worker, motore WASM): lo scrive la build al posto
// del segnaposto. Alla prima visita la pagina non è ancora controllata dal service worker, quindi
// senza precache i file caricati allora non finirebbero in cache e l'app non si aprirebbe offline.
const PRECACHE = /*__PRECACHE__*/ [];
const DATA_FILES = ['data/catalog.json', 'data/titles.json', 'data/prices.json', 'data/meta.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(SHELL)
        .then((cache) =>
          cache.addAll([
            scope.href,
            `${scope.href}manifest.webmanifest`,
            `${scope.href}icons/icon-192.png`,
            `${scope.href}icons/apple-touch-icon.png`,
          ]),
        ),
      caches.open(ASSETS).then((cache) => cache.addAll(PRECACHE.map((f) => scope.href + f))),
      caches.open(DATA).then((cache) =>
        Promise.all([
          cache.addAll(DATA_FILES.map((f) => scope.href + f)),
          // facoltativo: senza modelli pubblicati il file non esiste e l'installazione non deve fallire
          cache.add(`${scope.href}models/manifest.json`).catch(() => undefined),
        ]),
      ),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(fallbackUrl ?? request, MATCH);
    if (cached) return cached;
    return fetch(request);
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, MATCH);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, MATCH);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await refresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = relative(url);
  if (path === 'models/manifest.json') {
    event.respondWith(networkFirst(request, DATA));
    return;
  }
  if (path.startsWith('models/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, scope.href));
  } else if (path.startsWith('assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (path === 'data/prices.json' || path === 'data/meta.json') {
    event.respondWith(networkFirst(request, DATA));
  } else if (path.startsWith('data/')) {
    event.respondWith(staleWhileRevalidate(request, DATA));
  } else {
    event.respondWith(cacheFirst(request, SHELL));
  }
});
