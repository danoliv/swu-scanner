// Le lingue in cui esiste una Carta (SPEC §9): inglese, francese, tedesco, spagnolo, italiano.

export const CARD_LANGUAGES = ['en', 'fr', 'de', 'es', 'it'] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

/** Il nome della lingua scritto nella lingua stessa. */
export const LANGUAGE_NAMES: Record<CardLanguage, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
};

export const isCardLanguage = (x: unknown): x is CardLanguage =>
  typeof x === 'string' && (CARD_LANGUAGES as readonly string[]).includes(x);

/** Un numero con un bit per lingua (en = 1, fr = 2, de = 4, es = 8, it = 16): per i titoli compatti. */
export function languagesToMask(languages: readonly CardLanguage[]): number {
  return languages.reduce((mask, l) => mask | (1 << CARD_LANGUAGES.indexOf(l)), 0);
}

export function maskToLanguages(mask: number): CardLanguage[] {
  return CARD_LANGUAGES.filter((_, i) => (mask & (1 << i)) !== 0);
}
