import './style.css';
import { createApp, type ModelManager, type Scanner } from './app/app.ts';
import { loadData } from './app/data.ts';
import {
  downloadModel,
  isModelCached,
  loadCachedModel,
  modelBytes,
  type Manifest,
} from './app/model-store.ts';
import type { ReadingModel } from './app/storage.ts';
import { createInstallHelper } from './app/install.ts';
import { createEngineHost } from './app/worker-scanner.ts';

declare global {
  interface Window {
    /** Gancio per i test: sostituisce il motore di lettura. */
    __swuScanner?: Scanner;
  }
}

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app mancante');

const base = import.meta.env.BASE_URL;

let store: Storage | null = null;
try {
  store = window.localStorage;
} catch {
  store = null;
}

/** Il motore di lettura nel browser: worker + modelli in cache. Assente se manca il manifest o la Cache API. */
async function createEngine(
  data: Awaited<ReturnType<typeof loadData>>,
): Promise<{ scanner: Scanner; models: ModelManager } | null> {
  if (typeof Worker === 'undefined' || !('caches' in window)) return null;
  let manifest: Manifest;
  try {
    const res = await fetch(`${base}models/manifest.json`);
    if (!res.ok) return null;
    manifest = (await res.json()) as Manifest;
  } catch {
    return null;
  }
  const cache = await caches.open('swu-models-v1');
  const host = createEngineHost({
    worker: new Worker(new URL('./ocr/worker.ts', import.meta.url), { type: 'module' }),
    titles: data.compactTitles,
    cards: data.cardNames,
  });
  const ctx = (id: ReadingModel) => ({ base, id, manifest, cache });
  const models: ModelManager = {
    sizeMb: (id) => Math.round(modelBytes(manifest, id) / 1e6),
    isCached: (id) => isModelCached(ctx(id)),
    download: (id, onProgress) => downloadModel({ ...ctx(id), onProgress }),
    async activate(id) {
      const m = await loadCachedModel(ctx(id));
      if (!m) throw new Error(`Modello ${id} non in cache`);
      await host.activate(id, m);
    },
  };
  return { scanner: host.scanner, models };
}

const unavailable: Scanner = {
  scan: () => Promise.reject(new Error('Motore di lettura non disponibile')),
};

// Uso offline: il service worker tiene in cache interfaccia, Catalogo e prezzi (non in sviluppo).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined);
  });
}

// L'evento di installazione di Android può arrivare prima che l'app sia pronta: il listener va
// registrato subito, non dopo il caricamento dei dati.
let rerender: () => void = () => undefined;
const install = createInstallHelper(
  {
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    dismissed: false, // lo stato "chiuso" lo gestisce l'app
    maxTouchPoints: navigator.maxTouchPoints,
  },
  window,
  () => rerender(),
);

loadData(base)
  .then(async (data) => {
    const engine = await createEngine(data);
    const app = createApp({
      root,
      data,
      install,
      scanner: window.__swuScanner ?? engine?.scanner ?? unavailable,
      ...(engine && !window.__swuScanner ? { models: engine.models } : {}),
      storage: store,
      pageUrl: `${window.location.origin}${base}`,
      sharedHash: window.location.hash,
      clearHash: () =>
        window.history.replaceState(null, '', window.location.pathname + window.location.search),
      languages: navigator.languages?.length ? navigator.languages : [navigator.language],
    });
    rerender = app.refresh;
    window.addEventListener('hashchange', () => app.openSharedHash(window.location.hash));
  })
  .catch(() => {
    root.textContent = 'Could not load the card data. Check your connection and reload.';
  });
