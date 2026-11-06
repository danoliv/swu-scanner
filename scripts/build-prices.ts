// Converte il price guide Cardmarket scaricato nel file di prezzi compatto.
// Uso: node scripts/build-prices.ts <price_guide_21.json> <file-di-uscita.json>
import { readFile, writeFile } from 'node:fs/promises';
import { buildPrices, type RawPriceGuide } from '../src/lib/prices.ts';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('Uso: node scripts/build-prices.ts <price_guide_21.json> <file-di-uscita.json>');
  process.exit(1);
}
const raw = JSON.parse(await readFile(inFile, 'utf8')) as RawPriceGuide;
const prices = buildPrices(raw);
await writeFile(outFile, JSON.stringify(prices));
console.log(`${raw.priceGuides.length} prodotti -> ${Object.keys(prices.p).length} con prezzo`);
