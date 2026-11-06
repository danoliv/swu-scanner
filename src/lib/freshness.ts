// Quanto sono vecchi i prezzi (SPEC §8: la data è sempre visibile, con un avviso se i dati sono vecchi).
const DAY_MS = 86_400_000;

/** Giorni interi passati dalla data del price guide; null se la data non è valida. */
export function priceAgeDays(dateIso: string, now: Date): number | null {
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Vero se i prezzi hanno più di `maxDays` giorni o la data non si legge. */
export function pricesAreStale(dateIso: string, now: Date, maxDays = 3): boolean {
  const age = priceAgeDays(dateIso, now);
  return age === null || age > maxDays;
}
