// Prezzi e finitura di una versione (SPEC §4): trend, altrimenti "da" il minimo, altrimenti
// "prezzo non disponibile"; i set vecchi e alcuni Extras hanno due prezzi e sceglie l'utente.
import type { PriceRow } from './prices.ts';

export type Finish = 'normal' | 'foil';

export interface Quote {
  cents: number;
  /** `trend` = prezzo di tendenza; `low` = solo il minimo, da mostrare come "da X €". */
  kind: 'trend' | 'low';
}

export const isFoilVariant = (variantType: string): boolean => /foil/i.test(variantType);

/** Il prezzo di una finitura, o null se non c'è nessun prezzo ("prezzo non disponibile"). */
export function quote(row: PriceRow | undefined, finish: Finish): Quote | null {
  if (!row) return null;
  const [trend, low, trendFoil, lowFoil] = row;
  const t = finish === 'foil' ? trendFoil : trend;
  const l = finish === 'foil' ? lowFoil : low;
  if (t > 0) return { cents: t, kind: 'trend' };
  if (l > 0) return { cents: l, kind: 'low' };
  return null;
}

export interface FinishChoice {
  /** La finitura, o null se deve sceglierla l'utente. */
  finish: Finish | null;
  /** Le finitura possibili. */
  choices: Finish[];
}

/**
 * Quale finitura ha una versione: le varianti foil sono foil; se il prodotto ha sia stampe normali
 * sia foil (set vecchi) o, pur non essendo foil, due prezzi (alcuni Extras), sceglie l'utente.
 */
export function resolveFinish(
  variantTypes: readonly string[],
  row: PriceRow | undefined,
): FinishChoice {
  if (variantTypes.length === 0) {
    // Prodotto di variante ignota (non collegato a una Stampa): si decide dai soli prezzi.
    const normal = !!row && (row[0] > 0 || row[1] > 0);
    const foil = !!row && (row[2] > 0 || row[3] > 0);
    if (normal && foil) return { finish: null, choices: ['normal', 'foil'] };
    return foil ? { finish: 'foil', choices: ['foil'] } : { finish: 'normal', choices: ['normal'] };
  }
  const hasFoil = variantTypes.some(isFoilVariant);
  const hasNormal = variantTypes.some((v) => !isFoilVariant(v));
  if (hasFoil && hasNormal) return { finish: null, choices: ['normal', 'foil'] };
  if (hasFoil) return { finish: 'foil', choices: ['foil'] };
  if (row && row[0] > 0 && row[2] > 0) return { finish: null, choices: ['normal', 'foil'] };
  return { finish: 'normal', choices: ['normal'] };
}

/** Euro da centesimi, nella lingua dell'interfaccia (inglese se non valida). */
export function formatEuro(cents: number, locale: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount);
  } catch {
    return new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(amount);
  }
}
