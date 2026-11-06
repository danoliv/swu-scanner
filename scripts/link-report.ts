// Applica il collegamento Stampa -> idProduct ai dump salvati e stampa la copertura per set.
// Uso: node scripts/link-report.ts <dump-swudb> <dump-cardmarket> [file-output.json]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fillSubtitles, type OfficialCard } from '../src/lib/official-titles.ts';
import { toSwuPrinting, type RawCard } from '../src/lib/pipeline.ts';
import { loadCorrections } from '../src/lib/name-corrections.ts';
import {
  linkSet,
  SET_EXPANSIONS,
  type CmPrice,
  type CmProduct,
  type Link,
  type SwuPrinting,
} from '../src/lib/link-cardmarket.ts';

const [swuDir, cmDir, outFile, officialFile] = process.argv.slice(2);
if (!swuDir || !cmDir) {
  console.error(
    'Uso: node scripts/link-report.ts <dump-swudb> <dump-cardmarket> [file-output.json]',
  );
  process.exit(1);
}

const corrections = loadCorrections(
  JSON.parse(
    await readFile(new URL('./data/name-corrections.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>,
);

const official = officialFile ? await readJson<OfficialCard[]>(officialFile) : [];

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

const products = (
  await readJson<{ products: CmProduct[] }>(join(cmDir, 'products_singles_21.json'))
).products;
const guides = (await readJson<{ priceGuides: CmPrice[] }>(join(cmDir, 'price_guide_21.json')))
  .priceGuides;
const prices = new Map(guides.map((g) => [g.idProduct, g]));

const all: Link[] = [];
const rows: Record<string, string | number>[] = [];
for (const set of Object.keys(SET_EXPANSIONS)) {
  const raw = fillSubtitles(await readJson<RawCard[]>(join(swuDir, `${set}.json`)), official);
  const printings: SwuPrinting[] = raw.map((c) => toSwuPrinting(c, corrections));
  const links = linkSet(set, printings, products, prices);
  all.push(...links);
  const n = links.length;
  const count = (f: (l: Link) => boolean) => links.filter(f).length;
  const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`;
  rows.push({
    set,
    stampe: n,
    alta: pct(count((l) => l.confidence === 'alta')),
    media: pct(count((l) => l.confidence === 'media')),
    senza: pct(count((l) => l.idProduct === null)),
  });
}
console.table(rows);

// Controllo di integrità: un idProduct non dovrebbe servire stampe diverse oltre al caso Foil che condivide il prodotto.
const owners = new Map<number, Link[]>();
for (const l of all)
  if (l.idProduct !== null) owners.set(l.idProduct, [...(owners.get(l.idProduct) ?? []), l]);
const shared = [...owners.entries()].filter(
  ([, ls]) =>
    new Set(ls.map((l) => l.variantType.replace(/\s*Foil$/i, '').trim() || 'Normal')).size > 1,
);
console.log(`idProduct condivisi da varianti diverse: ${shared.length}`);
for (const [id, ls] of shared.slice(0, 5))
  console.log(' ', id, ls.map((l) => `${l.set} ${l.number} ${l.variantType}`).join(' | '));

const reasons = new Map<string, number>();
for (const l of all)
  if (l.note)
    reasons.set(l.note.replace(/\d+/g, 'N'), (reasons.get(l.note.replace(/\d+/g, 'N')) ?? 0) + 1);
console.log('Motivi di mancato collegamento:', Object.fromEntries(reasons));

if (outFile) {
  await writeFile(outFile, JSON.stringify(all));
  console.log(`Scritto ${all.length} collegamenti in ${outFile}`);
}
