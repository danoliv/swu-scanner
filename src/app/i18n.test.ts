import { describe, expect, it } from 'vitest';
import { createT, detectLocale, LOCALES } from './i18n.ts';
import { MESSAGES } from './messages.ts';

describe('detectLocale', () => {
  it('sceglie la prima lingua supportata tra quelle del telefono', () => {
    expect(detectLocale(['it-IT', 'en-US'])).toBe('it');
    expect(detectLocale(['fr-CA'])).toBe('fr');
    expect(detectLocale(['de'])).toBe('de');
    expect(detectLocale(['es-419'])).toBe('es');
  });
  it('salta le lingue non supportate e prende la successiva', () => {
    expect(detectLocale(['pt-BR', 'ja', 'de-AT'])).toBe('de');
  });
  it("torna all'inglese se nessuna è supportata o la lista è vuota", () => {
    expect(detectLocale(['pt-BR', 'ja'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
  it('ignora maiuscole e separatori diversi', () => {
    expect(detectLocale(['IT_it'])).toBe('it');
    expect(detectLocale(['FR'])).toBe('fr');
  });
});

describe('createT', () => {
  it('traduce nella lingua scelta', () => {
    expect(createT('it')('nav.list')).toBe(MESSAGES.it['nav.list']);
    expect(createT('fr')('nav.list')).toBe(MESSAGES.fr['nav.list']);
  });
  it('sostituisce i segnaposto', () => {
    expect(createT('en')('list.total', { price: '€1.00' })).toContain('€1.00');
  });
  it('sceglie il plurale giusto', () => {
    const t = createT('en');
    expect(t('scan.found', { n: 1 })).toMatch(/^1 card found/);
    expect(t('scan.found', { n: 5 })).toMatch(/^5 cards found/);
    expect(createT('fr')('scan.found', { n: 0 })).toMatch(/^0 carte trouvée/);
  });
  it("torna all'inglese per una chiave mancante in una lingua", () => {
    const t = createT('it', { it: {} as never });
    expect(t('nav.list')).toBe(MESSAGES.en['nav.list']);
  });
  it('per una chiave sconosciuta restituisce la chiave stessa', () => {
    expect(createT('en')('non.esiste' as never)).toBe('non.esiste');
  });
  it('lascia il segnaposto se il parametro manca', () => {
    expect(createT('en')('list.total')).toContain('{price}');
  });
});

describe('messaggi', () => {
  const keys = Object.keys(MESSAGES.en);
  it.each(LOCALES)("%s ha tutte le chiavi dell'inglese e nessuna in più", (locale) => {
    expect(Object.keys(MESSAGES[locale]).sort()).toEqual([...keys].sort());
  });
  it.each(LOCALES)("%s: i segnaposto coincidono con quelli dell'inglese", (locale) => {
    const holders = (v: unknown): string[] =>
      (typeof v === 'string' ? [v] : Object.values(v as Record<string, string>))
        .flatMap((s) => s.match(/\{\w+\}/g) ?? [])
        .filter((x, i, a) => a.indexOf(x) === i)
        .sort();
    for (const k of keys) {
      const en = holders(MESSAGES.en[k as keyof typeof MESSAGES.en]);
      const other = holders(MESSAGES[locale][k as keyof typeof MESSAGES.en]);
      expect(other, `${locale}:${k}`).toEqual(en);
    }
  });
  it('nessun testo è vuoto', () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(MESSAGES[locale])) {
        const texts = typeof v === 'string' ? [v] : Object.values(v);
        for (const t of texts) expect(t.length, `${locale}:${k}`).toBeGreaterThan(0);
      }
    }
  });
});
