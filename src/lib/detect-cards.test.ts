import { describe, expect, it } from 'vitest';
import { detectCards, type CatalogEntry } from './detect-cards.ts';
import type { TextLine } from '../ocr/engine.ts';

const line = (text: string, x: number, y: number, w = 200, h = 24): TextLine => ({
  text,
  box: { x, y, width: w, height: h },
  confidence: 0.95,
});

const catalog: CatalogEntry[] = [
  { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
  { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
  { name: 'Luke Skywalker', subtitle: 'Faithful Friend' },
  { name: 'Battlefield Marine', subtitle: null },
  { name: 'Mandalorian', subtitle: 'Fierce Warrior' },
];

describe('detectCards', () => {
  it('riconosce una carta con un solo sottotitolo dal solo titolo', () => {
    const [c] = detectCards([line('Battlefield Marine', 100, 50)], catalog);
    expect(c?.status).toBe('recognized');
    expect(c?.candidates).toEqual([{ name: 'Battlefield Marine', subtitle: null }]);
  });

  it('usa la riga sotto il titolo per scegliere il sottotitolo', () => {
    const [c] = detectCards(
      [line('Darth Vader', 100, 50), line('Commanding the First Legion', 100, 80)],
      catalog,
    );
    expect(c?.status).toBe('recognized');
    expect(c?.candidates[0]?.subtitle).toBe('Commanding the First Legion');
  });

  it('tollera errori di lettura nel titolo e nel sottotitolo', () => {
    const [c] = detectCards(
      [line('Darth Vadar', 100, 50), line('Dark Lord of the Sith', 100, 80)],
      catalog,
    );
    expect(c?.status).toBe('recognized');
    expect(c?.candidates[0]?.subtitle).toBe('Dark Lord of the Sith');
  });

  it('senza sottotitolo leggibile propone le candidate da scegliere (al massimo 3)', () => {
    const [c] = detectCards([line('Darth Vader', 100, 50)], catalog);
    expect(c?.status).toBe('choose');
    expect(c?.candidates).toHaveLength(2);
  });

  it('ignora righe sotto il titolo ma lontane in orizzontale (altra carta)', () => {
    const [c] = detectCards(
      [line('Darth Vader', 100, 50), line('Commanding the First Legion', 900, 80)],
      catalog,
    );
    expect(c?.status).toBe('choose');
  });

  it('ignora righe troppo in basso rispetto al titolo', () => {
    const [c] = detectCards(
      [line('Darth Vader', 100, 50), line('Commanding the First Legion', 100, 600)],
      catalog,
    );
    expect(c?.status).toBe('choose');
  });

  it('trova più carte nella stessa foto', () => {
    const cards = detectCards(
      [
        line('Luke Skywalker', 100, 50),
        line('Faithful Friend', 100, 80),
        line('Battlefield Marine', 500, 50),
      ],
      catalog,
    );
    expect(cards.map((c) => c.candidates[0]?.name)).toEqual([
      'Luke Skywalker',
      'Battlefield Marine',
    ]);
  });

  it('non crea carte da righe che non somigliano a nessun titolo', () => {
    expect(detectCards([line('Unità Veicolo', 100, 50)], catalog)).toEqual([]);
  });

  it('esclude i titoli indicati (parole dei tratti che coincidono con un titolo)', () => {
    const cards = detectCards([line('Mandalorian', 100, 50)], catalog, {
      ignoreTitles: new Set(['mandalorian']),
    });
    expect(cards).toEqual([]);
  });

  it('conta una volta sola lo stesso titolo letto due volte nello stesso punto', () => {
    const cards = detectCards(
      [line('Battlefield Marine', 100, 50), line('Battlefield Marine', 104, 52)],
      catalog,
    );
    expect(cards).toHaveLength(1);
  });

  it('tiene separate due copie dello stesso titolo in punti diversi', () => {
    const cards = detectCards(
      [line('Battlefield Marine', 100, 50), line('Battlefield Marine', 700, 50)],
      catalog,
    );
    expect(cards).toHaveLength(2);
  });

  it('restituisce il riquadro del titolo per il ritaglio', () => {
    const [c] = detectCards([line('Battlefield Marine', 100, 50)], catalog);
    expect(c?.titleBox).toEqual({ x: 100, y: 50, width: 200, height: 24 });
  });
});

describe('detectCards con titoli in più lingue', () => {
  const ref = { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' };
  const multi: CatalogEntry[] = [
    { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', ref },
    { name: 'Dark Vador', subtitle: 'Seigneur noir des Sith', ref },
    { name: 'Darth Vader', subtitle: 'Dunkler Lord der Sith', ref },
    {
      name: 'Dark Vador',
      subtitle: 'Commandant de la première légion',
      ref: { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
    },
  ];

  it('riconosce una carta dal titolo e dal sottotitolo francesi', () => {
    const [c] = detectCards(
      [line('Dark Vador', 100, 50), line('Seigneur noir des Sith', 100, 80)],
      multi,
    );
    expect(c?.status).toBe('recognized');
    expect(c?.candidates[0]?.ref).toEqual(ref);
  });

  it('non conta come due carte diverse la stessa carta in lingue diverse', () => {
    const [c] = detectCards([line('Darth Vader', 100, 50)], [multi[0], multi[2]] as CatalogEntry[]);
    expect(c?.status).toBe('recognized');
  });

  it('propone da scegliere le carte diverse con lo stesso titolo francese', () => {
    const [c] = detectCards([line('Dark Vador', 100, 50)], multi);
    expect(c?.status).toBe('choose');
    expect(c?.candidates).toHaveLength(2);
  });
});

describe('detectCards con carte ruotate e righe di regole', () => {
  const rot = (l: TextLine, rotation: 0 | 90 | 180 | 270): TextLine => ({ ...l, rotation });

  it('cerca il sottotitolo "sotto" il titolo nel riferimento della carta ruotata di 90°', () => {
    // Letta con rotazione 90°: la direzione "sotto" della carta è verso sinistra nella foto.
    const title = rot(line('Darth Vader', 300, 100, 24, 200), 90);
    const sub = rot(line('Commanding the First Legion', 270, 100, 24, 200), 90);
    const [c] = detectCards([title, sub], catalog);
    expect(c?.status).toBe('recognized');
    expect(c?.candidates[0]?.subtitle).toBe('Commanding the First Legion');
  });

  it('non cerca il sottotitolo dal lato sbagliato di una carta ruotata', () => {
    const title = rot(line('Darth Vader', 300, 100, 24, 200), 90);
    const wrongSide = rot(line('Commanding the First Legion', 330, 100, 24, 200), 90);
    const [c] = detectCards([title, wrongSide], catalog);
    expect(c?.status).toBe('choose');
  });

  it('gestisce la rotazione di 180° e di 270°', () => {
    const t180 = rot(line('Darth Vader', 100, 300, 200, 24), 180);
    const s180 = rot(line('Dark Lord of the Sith', 100, 270, 200, 24), 180);
    expect(detectCards([t180, s180], catalog)[0]?.candidates[0]?.subtitle).toBe(
      'Dark Lord of the Sith',
    );
    const t270 = rot(line('Darth Vader', 300, 100, 24, 200), 270);
    const s270 = rot(line('Dark Lord of the Sith', 330, 100, 24, 200), 270);
    expect(detectCards([t270, s270], catalog)[0]?.candidates[0]?.subtitle).toBe(
      'Dark Lord of the Sith',
    );
  });

  it('usa solo righe lette con la stessa rotazione del titolo', () => {
    const title = rot(line('Darth Vader', 100, 50), 0);
    const other = rot(line('Commanding the First Legion', 100, 80), 90);
    expect(detectCards([title, other], catalog)[0]?.status).toBe('choose');
  });

  it('scarta come ancora una riga molto più piccola dei titoli della foto (testo delle regole)', () => {
    const lines = [
      line('Luke Skywalker', 100, 50),
      line('Battlefield Marine', 500, 50),
      line('Darth Vader', 900, 50),
      line('Mandalorian', 100, 400, 100, 11),
    ];
    const names = detectCards(lines, catalog, { minRelativeHeight: 0.65 }).map(
      (c) => c.candidates[0]?.name,
    );
    expect(names).not.toContain('Mandalorian');
    expect(names).toHaveLength(3);
  });

  it("non scarta nulla se ogni ancora ha un'altezza simile", () => {
    const lines = [
      line('Luke Skywalker', 100, 50, 200, 24),
      line('Battlefield Marine', 500, 50, 200, 20),
    ];
    expect(detectCards(lines, catalog)).toHaveLength(2);
  });

  it("il filtro sull'altezza si può disattivare", () => {
    const lines = [
      line('Luke Skywalker', 100, 50),
      line('Battlefield Marine', 500, 50),
      line('Darth Vader', 900, 50),
      line('Mandalorian', 100, 400, 100, 11),
    ];
    expect(detectCards(lines, catalog, { minRelativeHeight: 0 })).toHaveLength(4);
    expect(detectCards(lines, catalog)).toHaveLength(4); // spento di default
  });

  it('riconosce il sottotitolo francese anche quando il titolo è uguale in tutte le lingue', () => {
    const ref = { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' };
    // "Darth Vader" è lo stesso titolo in inglese, francese e tedesco: il sottotitolo decide.
    const entries: CatalogEntry[] = [
      { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', ref },
      { name: 'Darth Vader', subtitle: 'Seigneur noir des Sith', ref },
      {
        name: 'Darth Vader',
        subtitle: 'Commanding the First Legion',
        ref: { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
      },
      {
        name: 'Darth Vader',
        subtitle: 'Commandant de la première légion',
        ref: { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
      },
    ];
    const [c] = detectCards(
      [line('Darth Vader', 100, 50), line('Seigneur noir des Sith', 100, 80)],
      entries,
    );
    expect(c?.status).toBe('recognized');
    expect(c?.candidates[0]?.ref).toEqual(ref);
  });

  it('propone una sola voce per Carta quando il sottotitolo non si legge', () => {
    const ref = { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' };
    const entries: CatalogEntry[] = [
      { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith', ref },
      { name: 'Darth Vader', subtitle: 'Seigneur noir des Sith', ref },
      {
        name: 'Darth Vader',
        subtitle: 'Commanding the First Legion',
        ref: { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
      },
    ];
    const [c] = detectCards([line('Darth Vader', 100, 50)], entries);
    expect(c?.status).toBe('choose');
    expect(c?.candidates).toHaveLength(2);
  });
});
