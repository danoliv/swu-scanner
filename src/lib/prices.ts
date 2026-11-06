// Price guide Cardmarket in formato compatto (SPEC §7): prezzi separati dal Catalogo,
// in centesimi interi, solo i campi usati. 0 = prezzo non disponibile.

export interface RawPriceGuide {
  createdAt: string;
  priceGuides: {
    idProduct: number;
    low?: number | null;
    trend?: number | null;
    'low-foil'?: number | null;
    'trend-foil'?: number | null;
  }[];
}

/** [trend, minimo, trend foil, minimo foil], in centesimi */
export type PriceRow = [trend: number, low: number, trendFoil: number, lowFoil: number];

export interface Prices {
  /** Data del price guide, come scritta da Cardmarket. */
  date: string;
  /** idProduct → prezzi. */
  p: Record<string, PriceRow>;
}

export function toCents(euro: number | null | undefined): number {
  if (euro === null || euro === undefined || !Number.isFinite(euro) || euro < 0) return 0;
  return Math.round(euro * 100);
}

export function buildPrices(raw: RawPriceGuide): Prices {
  if (raw.priceGuides.length === 0) throw new Error('Price guide vuoto: non si pubblica');
  const p: Record<string, PriceRow> = {};
  for (const g of raw.priceGuides) {
    const row: PriceRow = [
      toCents(g.trend),
      toCents(g.low),
      toCents(g['trend-foil']),
      toCents(g['low-foil']),
    ];
    if (row.some((c) => c > 0)) p[String(g.idProduct)] = row;
  }
  return { date: raw.createdAt, p };
}
