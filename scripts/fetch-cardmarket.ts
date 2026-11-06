// Scarica catalogo prodotti e price guide di Cardmarket (gioco 21, file pubblici) in una cartella.
// Nessuno scraping: solo i file di download pubblici (SPEC §7). Si ferma se un file è vuoto o non è JSON.
// Uso: node scripts/fetch-cardmarket.ts <cartella-destinazione>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const FILES = [
  {
    url: `${BASE}/productList/products_singles_21.json`,
    name: 'products_singles_21.json',
    key: 'products',
  },
  {
    url: `${BASE}/priceGuide/price_guide_21.json`,
    name: 'price_guide_21.json',
    key: 'priceGuides',
  },
] as const;

const outDir = process.argv[2];
if (!outDir) {
  console.error('Uso: node scripts/fetch-cardmarket.ts <cartella-destinazione>');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
for (const f of FILES) {
  const res = await fetch(f.url, { headers: { 'User-Agent': 'swu-scanner/0.1 (personal)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${f.url}`);
  const text = await res.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  const list = body[f.key];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`${f.name}: campo "${f.key}" assente o vuoto, non lo salvo`);
  }
  await writeFile(join(outDir, f.name), text);
  console.log(`${f.name}: ${list.length} voci`);
}
