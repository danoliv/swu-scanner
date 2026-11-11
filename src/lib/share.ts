// Condivisione della Lista come link (SPEC §6): le voci con i prezzi di chi condivide, in JSON
// compatto, compresso (deflate) e scritto in base64url nel frammento dell'indirizzo (`#list=...`).
// Codifica e decodifica sono pure: non toccano né il DOM né la Lista.
import type { EntryPrice, ListEntry, SharedPrice } from './list.ts';
import type { Finish } from './pricing.ts';

/** Una voce ricevuta: la Carta (se non si ricava dal prodotto), la versione, la quantità e il prezzo. */
export interface SharedEntry {
  quantity: number;
  idProduct: number | null;
  finish: Finish | null;
  /** Chiave della Carta; presente solo se manca il prodotto. */
  cardKey: string | null;
  price: SharedPrice | null;
}

const MAX_ENTRIES = 2000;
const MAX_CENTS = 10_000_000;
const MAX_KEY = 300;

/** Compatto: [quantità, prodotto, finitura (0 normale, 1 foil), centesimi, 1 se "da", indice data, chiave?]. */
type Row = [number, number | null, 0 | 1 | null, number | null, 0 | 1, number, string?];
interface Payload {
  v: 1;
  d: string[];
  i: Row[];
}

/** Le voci della Lista per il link, con il prezzo che si vede ora (o quello ricevuto e ancora valido). */
export function toShared(
  list: readonly ListEntry[],
  priceOf: (entry: ListEntry) => EntryPrice,
  ownDate: string,
): Payload {
  const dates: string[] = [];
  const dateIndex = (date: string): number => {
    const found = dates.indexOf(date);
    if (found >= 0) return found;
    dates.push(date);
    return dates.length - 1;
  };
  const rows: Row[] = list.map((e) => {
    const p = priceOf(e);
    const finish = e.finish === null ? null : e.finish === 'foil' ? 1 : 0;
    const base: [number, number | null, 0 | 1 | null, number | null, 0 | 1, number] = [
      e.quantity,
      e.idProduct,
      finish,
      p.status === 'chosen' ? p.cents : null,
      p.status === 'chosen' && p.kind === 'low' ? 1 : 0,
      dateIndex(e.shared?.date ?? ownDate),
    ];
    return e.idProduct === null ? [...base, e.cardKey] : base;
  });
  return { v: 1, d: dates, i: rows };
}

const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

/** Legge il JSON ricevuto; scarta ciò che non è valido (null se non è una Lista condivisa). */
export function fromShared(input: unknown): SharedEntry[] | null {
  if (typeof input !== 'object' || input === null) return null;
  const { v, d, i } = input as Partial<Payload>;
  if (v !== 1 || !Array.isArray(d) || !Array.isArray(i) || i.length > MAX_ENTRIES) return null;
  const dates = d.map((x) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null));
  const out: SharedEntry[] = [];
  for (const row of i as unknown[]) {
    if (!Array.isArray(row)) continue;
    const [quantity, idProduct, finish, cents, low, dateIdx, key] = row as unknown[];
    if (!isInt(quantity, 1, 999)) continue;
    if (idProduct !== null && !isInt(idProduct, 1, 1e9)) continue;
    if (finish !== null && finish !== 0 && finish !== 1) continue;
    if (key !== undefined && (typeof key !== 'string' || key.length > MAX_KEY)) continue;
    if (idProduct === null && typeof key !== 'string') continue;
    const date = isInt(dateIdx, 0, 1e6) ? dates[dateIdx] : null;
    const price: SharedPrice | null =
      cents !== null && isInt(cents, 0, MAX_CENTS) && date
        ? { cents, kind: low === 1 ? 'low' : 'trend', date }
        : null;
    out.push({
      quantity,
      idProduct,
      finish: finish === null ? null : finish === 1 ? 'foil' : 'normal',
      cardKey: typeof key === 'string' ? key : null,
      price,
    });
  }
  return out;
}

// ---------- Testo del link ----------

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).catch(() => undefined);
  void writer.close().catch(() => undefined);
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * Il testo del link: `1.` (compresso) o `0.` (senza compressione, se il browser non la offre),
 * poi il JSON in base64url.
 */
export async function encodeShare(payload: Payload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'undefined') return `0.${toBase64Url(json)}`;
  return `1.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** Il contrario di `encodeShare`; lancia un errore se il testo non è una Lista condivisa. */
export async function decodeShare(code: string): Promise<SharedEntry[]> {
  const m = /^([01])\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!m) throw new Error('Link non valido');
  let bytes = fromBase64Url(m[2] as string);
  if (m[1] === '1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('Compressione non disponibile');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  const entries = fromShared(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  if (!entries) throw new Error('Link non valido');
  return entries;
}

const PREFIX = '#list=';

export const shareUrl = (page: string, code: string): string =>
  `${page.split('#')[0] as string}${PREFIX}${code}`;

/** Il testo della Lista nel frammento dell'indirizzo, se c'è. */
export function shareCodeFromHash(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null;
}
