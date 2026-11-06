// Colla tra il Catalogo grezzo di swu-db e il collegamento con Cardmarket.
import { linkFields, type RawPrinting } from './catalog.ts';
import type { SwuPrinting } from './link-cardmarket.ts';
import type { Corrections } from './name-corrections.ts';

/** Una stampa come la restituisce swu-db (solo i campi usati). */
export interface RawCard extends RawPrinting {
  tcgplayerId?: string;
  MarketPrice?: string;
  FoilPrice?: string;
}

export function toSwuPrinting(c: RawCard, corrections: Corrections): SwuPrinting {
  const fixed = linkFields(c, corrections);
  return {
    set: c.Set,
    number: c.Number,
    name: fixed.name,
    ...(fixed.subtitle ? { subtitle: fixed.subtitle } : {}),
    variantType: c.VariantType,
    tcgplayerId: c.tcgplayerId ?? '',
    ...(c.MarketPrice !== undefined ? { marketPrice: c.MarketPrice } : {}),
    ...(c.FoilPrice !== undefined ? { foilPrice: c.FoilPrice } : {}),
  };
}
