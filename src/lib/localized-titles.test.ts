import { describe, expect, it } from 'vitest';
import { buildLocalizedEntries, type OfficialRecord } from './localized-titles.ts';

const rec = (
  uid: string,
  locale: string,
  title: string,
  subtitle: string | null,
): OfficialRecord => ({
  uid,
  locale,
  title,
  subtitle,
});

const catalog = [
  { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
  { name: 'Battlefield Marine', subtitle: null },
];

describe('buildLocalizedEntries', () => {
  const records = [
    rec('1', 'en', 'Darth Vader', 'Dark Lord of the Sith'),
    rec('1', 'fr', 'Dark Vador', 'Seigneur noir des Sith'),
    rec('1', 'de', 'Darth Vader', 'Dunkler Lord der Sith'),
    rec('2', 'en', 'Battlefield Marine', null),
    rec('2', 'fr', 'Marine du champ de bataille', null),
  ];

  it('collega ogni lingua alla Carta del Catalogo tramite cardUid', () => {
    const { entries } = buildLocalizedEntries(records, catalog);
    const fr = entries.find((e) => e.name === 'Dark Vador');
    expect(fr?.ref).toEqual({ name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' });
    expect(fr?.subtitle).toBe('Seigneur noir des Sith');
  });

  it('include anche i titoli inglesi e quelli senza sottotitolo', () => {
    const { entries } = buildLocalizedEntries(records, catalog);
    expect(entries.some((e) => e.name === 'Battlefield Marine' && e.subtitle === null)).toBe(true);
    expect(entries.some((e) => e.name === 'Marine du champ de bataille')).toBe(true);
  });

  it('non duplica voci uguali (stessa Carta, stesso nome e sottotitolo)', () => {
    const dup = [...records, rec('1', 'en', 'Darth Vader', 'Dark Lord of the Sith')];
    const { entries } = buildLocalizedEntries(dup, catalog);
    expect(
      entries.filter((e) => e.name === 'Darth Vader' && e.subtitle === 'Dark Lord of the Sith'),
    ).toHaveLength(1);
  });

  it('segnala le Carte ufficiali senza corrispondenza nel Catalogo e le salta', () => {
    const { entries, unmatched } = buildLocalizedEntries(
      [rec('9', 'en', 'Carta Nuova', 'Mai Vista'), rec('9', 'fr', 'Nouvelle Carte', 'Jamais Vue')],
      catalog,
    );
    expect(entries).toEqual([]);
    expect(unmatched).toEqual(['Carta Nuova, Mai Vista']);
  });

  it('salta le lingue di una carta senza versione inglese', () => {
    const { entries } = buildLocalizedEntries([rec('7', 'fr', 'Orpheline', null)], catalog);
    expect(entries).toEqual([]);
  });

  it('abbina il titolo inglese ignorando maiuscole e accenti', () => {
    const { entries } = buildLocalizedEntries(
      [rec('1', 'en', 'DARTH VADER', 'dark lord of the sith')],
      catalog,
    );
    expect(entries).toHaveLength(1);
  });

  it('abbina le basi ufficiali (senza sottotitolo) alla base del Catalogo con il luogo', () => {
    const { entries, unmatched } = buildLocalizedEntries(
      [rec('5', 'en', 'Echo Base', null), rec('5', 'fr', 'Base Écho', null)],
      [{ name: 'Echo Base', subtitle: 'Hoth' }],
    );
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(['Echo Base', 'Base Écho']);
    expect(entries[0]?.ref).toEqual({ name: 'Echo Base', subtitle: 'Hoth' });
  });

  it('non abbina per solo titolo se nel Catalogo ci sono più carte con quel titolo', () => {
    const { entries } = buildLocalizedEntries(
      [rec('6', 'en', 'Vader', null)],
      [
        { name: 'Vader', subtitle: 'A' },
        { name: 'Vader', subtitle: 'B' },
      ],
    );
    expect(entries).toEqual([]);
  });

  it('abbina i leader a doppia faccia dal lato frontale', () => {
    const { entries } = buildLocalizedEntries(
      [rec('8', 'en', 'Chancellor Palpatine', 'Playing Both Sides')],
      [
        {
          name: 'Chancellor Palpatine // Darth Sidious',
          subtitle: 'Playing Both Sides // Not So Fast',
        },
      ],
    );
    expect(entries).toHaveLength(1);
  });

  it('tratta il sottotitolo vuoto come assente', () => {
    const { entries, unmatched } = buildLocalizedEntries(
      [rec('5', 'en', 'Remote Village', ''), rec('5', 'fr', 'Village isolé', '')],
      [{ name: 'Remote Village', subtitle: 'Sorgan' }],
    );
    expect(unmatched).toEqual([]);
    expect(entries.map((e) => e.subtitle)).toEqual([null, null]);
  });
});
