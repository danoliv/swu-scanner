// Collega le Stampe del Catalogo (swu-db) ai prodotti Cardmarket (idProduct).
// Cardmarket non pubblica set, numero né versione: si ricostruisce il legame
// con nome, espansione, finish, ordine degli id e prezzi. Vedi
// .wayfinder/research/02-collegamento-cardmarket.md.

export interface SwuPrinting {
  set: string;
  number: string;
  name: string;
  subtitle?: string;
  variantType: string;
  tcgplayerId: string;
  marketPrice?: string;
  foilPrice?: string;
}

export interface CmProduct {
  idProduct: number;
  idExpansion: number;
  name: string;
  idMetacard: number;
}

export interface CmPrice {
  idProduct: number;
  low: number | null;
  trend: number | null;
  'trend-foil': number | null;
}

export type Confidence = 'alta' | 'media';
export type Method = 'strutturale' | 'euristica' | 'nessuno';

export interface Link {
  set: string;
  number: string;
  variantType: string;
  idProduct: number | null;
  confidence: Confidence | null;
  method: Method;
  note?: string;
}

interface SetExpansions {
  base: number;
  extras?: number;
  /** In questi set Foil e Normal sono lo stesso prodotto Cardmarket. */
  foilSharesProduct?: boolean;
  /** Il numero più basso corrisponde all'idProduct più alto (verificato in IBH su 37 carte). */
  reverseIdOrder?: boolean;
}

/** Tabella a mano: un nuovo set richiede nuovi idExpansion (nessun campo li rende derivabili). */
export const SET_EXPANSIONS: Readonly<Record<string, SetExpansions>> = {
  SOR: { base: 5618, extras: 5638, foilSharesProduct: true },
  SHD: { base: 5769, extras: 5781, foilSharesProduct: true },
  TWI: { base: 5888, extras: 5937, foilSharesProduct: true },
  JTL: { base: 5995, extras: 6074 },
  LOF: { base: 6105, extras: 6188 },
  SEC: { base: 6333, extras: 6364 },
  LAW: { base: 6451, extras: 6452 },
  ASH: { base: 6591, extras: 6642 },
  HMW: { base: 6759, extras: 6788 },
  IBH: { base: 6268, reverseIdOrder: true },
  TS26: { base: 6532 },
};

type Cls = 'base' | 'extras';

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const printingKey = (p: Pick<SwuPrinting, 'name' | 'subtitle'>): string =>
  normalize(p.subtitle ? `${p.name}, ${p.subtitle}` : p.name);

/** Le basi su Cardmarket sono "X // Experience Token": si tiene solo la parte prima di " // ". */
export const cardmarketKey = (name: string): string => {
  const [front = name, back = ''] = name.split(' // ');
  // Leader a doppia faccia: "A // B, Sottotitolo" -> "A, Sottotitolo" (il sottotitolo è del lato frontale).
  const comma = back.indexOf(', ');
  return normalize(comma === -1 ? front : `${front}, ${back.slice(comma + 2)}`);
};

const isFoilVariant = (v: string): boolean => /foil/i.test(v);
const classOf = (p: SwuPrinting, exp: SetExpansions): Cls =>
  exp.extras !== undefined && p.variantType !== 'Normal' && p.variantType !== 'Foil'
    ? 'extras'
    : 'base';

const toNumber = (s: string | undefined): number => {
  const n = Number.parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
};

const swuPrice = (p: SwuPrinting): number => {
  if (isFoilVariant(p.variantType)) {
    const foil = toNumber(p.foilPrice);
    return foil > 0 ? foil : toNumber(p.marketPrice);
  }
  return toNumber(p.marketPrice);
};

const cmPrice = (id: number, foil: boolean, prices: ReadonlyMap<number, CmPrice>): number => {
  const g = prices.get(id);
  if (!g) return 0;
  return (foil ? g['trend-foil'] : g.trend) ?? g.low ?? 0;
};

const isFoilProduct = (id: number, prices: ReadonlyMap<number, CmPrice>): boolean =>
  (prices.get(id)?.['trend-foil'] ?? 0) > 0;

const numericPart = (number: string): number => Number.parseInt(number.replace(/\D/g, ''), 10) || 0;

const MAX_BRUTE_FORCE = 7;

function* permutations(n: number): Generator<number[]> {
  const arr = Array.from({ length: n }, (_, i) => i);
  function* rec(k: number): Generator<number[]> {
    if (k === n) {
      yield [...arr];
      return;
    }
    for (let i = k; i < n; i++) {
      [arr[k], arr[i]] = [arr[i]!, arr[k]!];
      yield* rec(k + 1);
      [arr[k], arr[i]] = [arr[i]!, arr[k]!];
    }
  }
  yield* rec(0);
}

/** Restituisce, per ogni stampa, l'indice del prodotto assegnato (stesso numero di stampe e prodotti). */
function assign(
  printings: readonly SwuPrinting[],
  ids: readonly number[],
  foil: boolean,
  prices: ReadonlyMap<number, CmPrice>,
): number[] {
  const n = printings.length;
  const byTcg = [...printings.keys()].sort(
    (a, b) => toNumber(printings[a]!.tcgplayerId) - toNumber(printings[b]!.tcgplayerId),
  );
  const idOrder = [...ids.keys()].sort((a, b) => ids[a]! - ids[b]!);
  if (n > MAX_BRUTE_FORCE) {
    // Troppi gruppi per provare tutte le permutazioni: ordine dei tcgplayerId contro ordine degli idProduct.
    const out = new Array<number>(n).fill(0);
    byTcg.forEach((pi, rank) => {
      out[pi] = idOrder[rank]!;
    });
    return out;
  }
  const cost = (perm: number[]): number => {
    let c = 0;
    perm.forEach((prod, pi) => {
      const a = swuPrice(printings[pi]!) + 0.01;
      const b = cmPrice(ids[prod]!, foil, prices) + 0.01;
      c += Math.abs(Math.log(b / a));
    });
    let inversions = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (ids[perm[byTcg[i]!]!]! > ids[perm[byTcg[j]!]!]!) inversions++;
      }
    }
    return c + 3 * inversions;
  };
  let best: number[] = [...Array(n).keys()];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const perm of permutations(n)) {
    const c = cost(perm);
    if (c < bestCost) {
      bestCost = c;
      best = perm;
    }
  }
  return best;
}

export function linkSet(
  set: string,
  printings: readonly SwuPrinting[],
  products: readonly CmProduct[],
  prices: ReadonlyMap<number, CmPrice>,
): Link[] {
  const exp = SET_EXPANSIONS[set];
  if (!exp)
    throw new Error(`Set non mappato: ${set} (aggiungere gli idExpansion in SET_EXPANSIONS)`);

  const clsOfExpansion = new Map<number, Cls>([[exp.base, 'base']]);
  if (exp.extras !== undefined) clsOfExpansion.set(exp.extras, 'extras');

  const productsByGroup = new Map<string, number[]>();
  for (const p of products) {
    const cls = clsOfExpansion.get(p.idExpansion);
    if (!cls) continue;
    const k = `${cardmarketKey(p.name)}|${cls}`;
    productsByGroup.set(k, [...(productsByGroup.get(k) ?? []), p.idProduct]);
  }

  const results = new Map<SwuPrinting, Link>();
  const link = (
    p: SwuPrinting,
    idProduct: number | null,
    confidence: Confidence | null,
    method: Method,
    note?: string,
  ) =>
    results.set(p, {
      set: p.set,
      number: p.number,
      variantType: p.variantType,
      idProduct,
      confidence,
      method,
      ...(note ? { note } : {}),
    });

  const groups = new Map<string, SwuPrinting[]>();
  for (const p of printings) {
    const k = `${printingKey(p)}|${classOf(p, exp)}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  for (const [k, group] of groups) {
    const ids = [...(productsByGroup.get(k) ?? [])].sort((a, b) => a - b);
    if (ids.length === 0) {
      for (const p of group)
        link(p, null, null, 'nessuno', 'Nessun prodotto Cardmarket con questo nome');
      continue;
    }

    const apply = (members: SwuPrinting[], pool: number[], foil: boolean, uncertain: boolean) => {
      if (members.length !== pool.length) {
        for (const p of members) {
          link(
            p,
            null,
            null,
            'nessuno',
            `Conteggi diversi: ${members.length} stampe e ${pool.length} prodotti`,
          );
        }
        return;
      }
      if (members.length === 1 && !uncertain) {
        link(members[0]!, pool[0]!, 'alta', 'strutturale');
        return;
      }
      if (exp.reverseIdOrder && new Set(members.map((p) => p.variantType)).size === 1) {
        // Stessa variante ripetuta (mazzi introduttivi): si ordinano per numero crescente contro idProduct decrescente.
        const byNumber = [...members].sort((a, b) => numericPart(a.number) - numericPart(b.number));
        const descending = [...pool].sort((a, b) => b - a);
        byNumber.forEach((p, i) => link(p, descending[i]!, 'media', 'euristica'));
        return;
      }
      const perm = assign(members, pool, foil, prices);
      members.forEach((p, i) => link(p, pool[perm[i]!]!, 'media', 'euristica'));
    };

    if (exp.foilSharesProduct) {
      // Stesso prodotto per Normal e Foil: si abbina solo il non-foil e il Foil copia l'abbinamento.
      const plain = group.filter((p) => !isFoilVariant(p.variantType));
      apply(plain, ids, false, false);
      const twin = new Map(plain.map((p) => [p.variantType, results.get(p)!]));
      for (const p of group.filter((x) => isFoilVariant(x.variantType))) {
        const base = twin.get(p.variantType.replace(/\s*Foil$/i, '').trim() || 'Normal');
        if (base) link(p, base.idProduct, base.confidence, base.method, base.note);
        else link(p, null, null, 'nessuno', 'Foil senza stampa non-foil corrispondente');
      }
      continue;
    }

    const sf = group.filter((p) => isFoilVariant(p.variantType));
    const sn = group.filter((p) => !isFoilVariant(p.variantType));
    const pf = ids.filter((id) => isFoilProduct(id, prices));
    const pn = ids.filter((id) => !isFoilProduct(id, prices));
    if (sf.length === pf.length && sn.length === pn.length) {
      apply(sn, pn, false, false);
      apply(sf, pf, true, false);
    } else {
      // Il finish dei prodotti non è deducibile (prezzi mancanti): si abbina l'intero gruppo, con meno certezza.
      apply(group, ids, false, true);
    }
  }

  return printings.map((p) => results.get(p)!);
}
