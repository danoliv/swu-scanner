import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Scrive nel service worker l'elenco dei file con impronta della build (precache). */
function precacheList(): Plugin {
  let outDir = 'dist';
  return {
    name: 'swu-precache-list',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const assets = readdirSync(join(outDir, 'assets'))
        .filter((f) => !f.endsWith('.map'))
        .map((f) => `assets/${f}`);
      const path = join(outDir, 'sw.js');
      const source = readFileSync(path, 'utf8');
      if (!source.includes('/*__PRECACHE__*/ []'))
        throw new Error('Segnaposto del precache assente in sw.js');
      writeFileSync(path, source.replace('/*__PRECACHE__*/ []', JSON.stringify(assets)));
    },
  };
}

export default defineConfig({
  // GitHub Pages serve il sito da /swu-scanner/
  base: process.env.VITE_BASE ?? '/',
  // onnxruntime-web carica il suo WASM con un percorso relativo al proprio file: non va pre-impacchettato.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' },
  plugins: [precacheList()],
});
