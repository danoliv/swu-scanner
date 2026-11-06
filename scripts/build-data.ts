// Costruisce i dati del sito (Catalogo con collegamenti, prezzi, meta) da cartelle già scaricate,
// applica i controlli di integrità (SPEC §7) e si ferma se non passano.
// Uso: node scripts/build-data.ts <cartella-swudb> <cartella-cardmarket> <cartella-titoli-ufficiali> <cartella-uscita>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { attachLinks } from '../src/lib/attach-links.ts';
import { attachExtras } from '../src/lib/extra-products.ts';
import { buildCatalog } from '../src/lib/catalog.ts';
import { checkIntegrity } from '../src/lib/integrity.ts';
import {
  linkSet,
  SET_EXPANSIONS,
  type CmPrice,
  type CmProduct,
  type Link,
} from '../src/lib/link-cardmarket.ts';
import { compactTitles } from '../src/lib/titles.ts';
import { loadCatalogEntries } from './common.ts';
import { loadCorrections } from '../src/lib/name-corrections.ts';
import { fillSubtitles, type OfficialCard } from '../src/lib/official-titles.ts';
import { toSwuPrinting, type RawCard } from '../src/lib/pipeline.ts';
import { buildPrices, type RawPriceGuide } from '../src/lib/prices.ts';
import { readdir } from 'node:fs/promises';

const [swuDir, cmDir, officialDir, outDir] = process.argv.slice(2);
if (!swuDir || !cmDir || !officialDir || !outDir) {
  console.error(
    'Uso: node scripts/build-data.ts <cartella-swudb> <cartella-cardmarket> <cartella-titoli-ufficiali> <cartella-uscita>',
  );
  process.exit(1);
}

/** Quota massima, per set, di stampe senza collegamento (SPEC §7: "sotto soglia"). */
const MAX_UNLINKED_RATIO = 0.1;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

const corrections = loadCorrections(
  await readJson<Record<string, unknown>>(
    new URL('./data/name-corrections.json', import.meta.url).pathname,
  ),
);
const official = await readJson<OfficialCard[]>(join(officialDir, 'en.json'));
const { products } = await readJson<{ products: CmProduct[] }>(
  join(cmDir, 'products_singles_21.json'),
);
const priceGuide = await readJson<RawPriceGuide>(join(cmDir, 'price_guide_21.json'));
const prices = new Map<number, CmPrice>(
  priceGuide.priceGuides.map((g) => [
    g.idProduct,
    {
      idProduct: g.idProduct,
      low: g.low ?? null,
      trend: g.trend ?? null,
      'trend-foil': g['trend-foil'] ?? null,
    },
  ]),
);

const raw: RawCard[] = [];
for (const file of (await readdir(swuDir)).sort()) {
  if (file.endsWith('.json') && !file.startsWith('_'))
    raw.push(...(await readJson<RawCard[]>(join(swuDir, file))));
}
const filled = fillSubtitles(raw, official);

const links: Link[] = [];
for (const set of Object.keys(SET_EXPANSIONS)) {
  const printings = filled.filter((c) => c.Set === set).map((c) => toSwuPrinting(c, corrections));
  links.push(...linkSet(set, printings, products, prices));
}

const knownExpansions = new Set(
  Object.values(SET_EXPANSIONS).flatMap((e) => [
    e.base,
    ...(e.extras !== undefined ? [e.extras] : []),
  ]),
);
const integrity = checkIntegrity({
  links,
  productIds: new Set(products.map((p) => p.idProduct)),
  maxUnlinkedRatio: MAX_UNLINKED_RATIO,
  productExpansions: products.map((p) => p.idExpansion),
  knownExpansions,
});
for (const w of integrity.warnings) console.warn(`Avviso: ${w}`);
if (integrity.errors.length > 0) {
  for (const e of integrity.errors) console.error(`ERRORE: ${e}`);
  console.error('Controlli di integrità non superati: non scrivo nessun file.');
  process.exit(1);
}

// I prodotti Cardmarket non collegati a nessuna Stampa si allegano alla Carta con lo stesso nome (SPEC §4).
const setOfExpansion = new Map<number, string>();
for (const [set, e] of Object.entries(SET_EXPANSIONS)) {
  setOfExpansion.set(e.base, set);
  if (e.extras !== undefined) setOfExpansion.set(e.extras, set);
}
const linkedProducts = new Set(links.flatMap((l) => (l.idProduct === null ? [] : [l.idProduct])));
const catalog = attachExtras(
  attachLinks(buildCatalog(filled, corrections), links),
  products,
  linkedProducts,
  (id) => setOfExpansion.get(id) ?? '',
);
const extraCount = catalog.reduce((n, c) => n + (c.extras?.length ?? 0), 0);
const priceFile = buildPrices(priceGuide);

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'catalog.json'), JSON.stringify(catalog));
// Titoli in 5 lingue per la ricerca e il riconoscimento (richiede le cinque lingue in `officialDir`).
const titleEntries = await loadCatalogEntries(join(outDir, 'catalog.json'), officialDir);
const titles = compactTitles(titleEntries, catalog);
await writeFile(join(outDir, 'titles.json'), JSON.stringify(titles));
await writeFile(join(outDir, 'prices.json'), JSON.stringify(priceFile));
await writeFile(
  join(outDir, 'meta.json'),
  JSON.stringify({
    priceDate: priceFile.date,
    cards: catalog.length,
    linked: links.filter((l) => l.idProduct !== null).length,
    printings: filled.length,
  }),
);
console.log(`Titoli: ${titles.length} voci; prodotti extra allegati: ${extraCount}`);
console.log(
  `OK: ${catalog.length} carte, ${filled.length} stampe, ${links.filter((l) => l.idProduct !== null).length} collegate, ${Object.keys(priceFile.p).length} prezzi, ${integrity.warnings.length} avvisi`,
);
