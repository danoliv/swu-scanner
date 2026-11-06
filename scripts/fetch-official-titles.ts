// Scarica titolo, sottotitolo, numero, set e varianti di tutte le carte dall'API pubblica del sito ufficiale
// (admin.starwarsunlimited.com), una lingua per file. Una richiesta ogni DELAY_MS, con tentativi su errore.
// Uso: node fetch-official-titles.ts <cartella-destinazione> [lingue separate da virgola]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://admin.starwarsunlimited.com/api/card-list';
const DELAY_MS = 300;
const PAGE_SIZE = 100;
const UA = 'swu-scanner-research/0.1 (personal, low-rate)';

const outDir = process.argv[2];
const locales = (process.argv[3] ?? 'en,fr,de,es,it').split(',');
if (!outDir) {
  console.error('Uso: node fetch-official-titles.ts <cartella> [lingue]');
  process.exit(1);
}

const fields = [
  'title',
  'subtitle',
  'cardNumber',
  'cardCount',
  'cardUid',
  'locale',
  'hyperspace',
  'showcase',
  'unique',
  'serialCode',
];
function url(locale: string, page: number): string {
  const q = new URLSearchParams({
    locale,
    'pagination[page]': String(page),
    'pagination[pageSize]': String(PAGE_SIZE),
    'sort[0]': 'id',
  });
  fields.forEach((f, i) => q.set(`fields[${i}]`, f));
  q.set('populate[expansion][fields][0]', 'code');
  q.set('populate[variantTypes][fields][0]', 'name');
  q.set('populate[variantTypes][fields][1]', 'variantId');
  q.set('populate[variantTypes][fields][2]', 'foil');
  q.set('populate[type][fields][0]', 'value');
  return `${BASE}?${q}`;
}
interface Attr {
  [key: string]: unknown;
  cardUid?: string;
  locale?: string;
  title?: string;
  subtitle?: string | null;
  cardNumber?: number;
  cardCount?: number;
  serialCode?: string;
  unique?: boolean;
  hyperspace?: boolean;
  showcase?: boolean;
  expansion?: { data?: { attributes?: { code?: string } } };
  type?: { data?: { attributes?: { value?: string } } };
  variantTypes?: {
    data?: { attributes: { name: string; variantId: number; foil: boolean } }[];
  };
}
interface Entry {
  id: number;
  attributes: Attr;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getPage(
  locale: string,
  page: number,
): Promise<{ data: Entry[]; meta: { pagination: { pageCount: number; total: number } } }> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url(locale, page), {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (res.ok) return (await res.json()) as Awaited<ReturnType<typeof getPage>>;
      console.error(`${locale} p${page}: HTTP ${res.status} (tentativo ${attempt})`);
    } catch (e) {
      console.error(`${locale} p${page}: ${(e as Error).message} (tentativo ${attempt})`);
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`${locale} pagina ${page}: troppi errori, mi fermo`);
}

const outputDir: string = outDir;
await mkdir(outputDir, { recursive: true });

/** Scarica tutte le pagine di una lingua (una richiesta alla volta, con pausa). */
async function fetchLocale(locale: string): Promise<void> {
  const cards: object[] = [];
  let pageCount = 1;
  for (let page = 1; page <= pageCount; page++) {
    const body = await getPage(locale, page);
    pageCount = body.meta.pagination.pageCount;
    for (const d of body.data) {
      const a = d.attributes;
      cards.push({
        id: d.id,
        uid: a.cardUid,
        locale: a.locale,
        title: a.title,
        subtitle: a.subtitle ?? null,
        number: a.cardNumber,
        count: a.cardCount,
        serial: a.serialCode,
        unique: a.unique,
        hyperspace: a.hyperspace,
        showcase: a.showcase,
        set: a.expansion?.data?.attributes?.code ?? null,
        type: a.type?.data?.attributes?.value ?? null,
        variants: (a.variantTypes?.data ?? []).map((v) => ({
          name: v.attributes.name,
          vid: v.attributes.variantId,
          foil: v.attributes.foil,
        })),
      });
    }
    if (page % 10 === 0 || page === pageCount)
      console.log(`${locale}: pagina ${page}/${pageCount}, ${cards.length} carte`);
    await sleep(DELAY_MS);
  }
  await writeFile(join(outputDir, `${locale}.json`), JSON.stringify(cards));
  console.log(`${locale}: salvate ${cards.length} carte`);
}

// Le lingue si scaricano in parallelo: ognuna resta cortese (una richiesta alla volta, con pausa), ma
// il tempo totale è quello di una lingua sola invece della somma (circa 10 minuti invece di 50).
await Promise.all(locales.map((locale) => fetchLocale(locale)));
console.log('fine');
