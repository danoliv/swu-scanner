// Scarica il Catalogo di api.swu-db.com (un file JSON per set) in una cartella.
// Uso: node scripts/fetch-swudb.ts <cartella-destinazione>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'https://api.swu-db.com';
const DELAY_MS = 400;

const outDir = process.argv[2];
if (!outDir) {
  console.error('Uso: node scripts/fetch-swudb.ts <cartella-destinazione>');
  process.exit(1);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'swu-scanner/0.1 (personal)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
  return res.json();
}

const sets = (await getJson(`${BASE}/sets`)) as { setId: string }[];
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, '_sets.json'), JSON.stringify(sets));

let total = 0;
for (const { setId } of sets) {
  const body = (await getJson(`${BASE}/cards/${setId.toLowerCase()}`)) as { data: unknown[] };
  await writeFile(join(outDir, `${setId}.json`), JSON.stringify(body.data));
  total += body.data.length;
  console.log(`${setId}: ${body.data.length}`);
  await new Promise((r) => setTimeout(r, DELAY_MS));
}
console.log(`Totale ${total} stampe in ${sets.length} set`);
