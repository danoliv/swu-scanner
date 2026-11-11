import { describe, expect, it } from 'vitest';
import type { LinkedCard } from '../lib/attach-links.ts';
import type { DetectedCard } from '../lib/detect-cards.ts';
import type { ListEntry } from '../lib/list.ts';
import type { PriceRow } from '../lib/prices.ts';
import type { SharedEntry } from '../lib/share.ts';
import {
  cardKey,
  createCatalog,
  entriesFromCsv,
  entriesFromShared,
  listToCsvRows,
  resolveItem,
  reviewFromDetected,
  searchCards,
  toNewEntries,
  unresolvedRange,
} from './model.ts';

const vader: LinkedCard = {
  name: 'Darth Vader',
  subtitle: 'Dark Lord of the Sith',
  type: 'Leader',
  printings: [
    ['SOR', '010', 'Normal', 1, 2],
    ['SOR', '262', 'Hyperspace', 2, 2],
    ['TWI', '254', 'Normal', 3, 2],
    ['TWI', '254F', 'Foil', 3, 2],
    ['P25', '95', 'Normal', 0, 0],
  ],
};
const marine: LinkedCard = {
  name: 'Battlefield Marine',
  subtitle: null,
  type: 'Unit',
  printings: [['SOR', '100', 'Normal', 9, 2]],
};
const prices: Record<string, PriceRow> = {
  '1': [1000, 900, 0, 0],
  '2': [5000, 4000, 0, 0],
  '3': [100, 90, 300, 250],
  '9': [0, 5, 0, 0],
};
const ghost: LinkedCard = {
  name: 'Ghost Card',
  subtitle: null,
  type: 'Unit',
  printings: [['SOR', '200', 'Normal', 77, 2]],
};
const catalog = createCatalog([vader, marine, ghost], prices);
const vaderKey = cardKey(vader.name, vader.subtitle);
const marineKey = cardKey(marine.name, marine.subtitle);

describe('cardKey', () => {
  it('normalizza titolo e sottotitolo', () => {
    expect(cardKey('Darth Vader', 'Dark Lord of the Sith')).toBe(
      'darth vader|dark lord of the sith',
    );
    expect(cardKey('Battlefield Marine', null)).toBe('battlefield marine|');
  });
});

describe('createCatalog', () => {
  it('trova le Carte per chiave e ne costruisce le versioni una volta sola', () => {
    expect(catalog.card(vaderKey)?.name).toBe('Darth Vader');
    expect(catalog.versionsOf(vaderKey)).toBe(catalog.versionsOf(vaderKey));
    expect(catalog.versionsOf('non|esiste')).toEqual([]);
  });

  describe('priceOf', () => {
    const entry = (over: Partial<ListEntry>): ListEntry => ({
      id: 'x',
      cardKey: vaderKey,
      idProduct: 1,
      finish: 'normal',
      quantity: 1,
      ...over,
    });
    it('usa il prezzo ricevuto, finché la versione non cambia', () => {
      const shared = { cents: 777, kind: 'low' as const, date: '2026-11-07' };
      expect(catalog.priceOf(entry({ shared }))).toEqual({
        status: 'chosen',
        cents: 777,
        kind: 'low',
      });
      expect(catalog.priceOf(entry({ idProduct: null, finish: null, shared }))).toEqual({
        status: 'to-choose',
      });
    });
    it('dà il prezzo di una versione scelta', () => {
      expect(catalog.priceOf(entry({}))).toEqual({ status: 'chosen', cents: 1000, kind: 'trend' });
    });
    it('"da scegliere" senza versione', () => {
      expect(catalog.priceOf(entry({ idProduct: null, finish: null }))).toEqual({
        status: 'to-choose',
      });
    });
    it('"da scegliere" se la finitura non è decisa e serve sceglierla', () => {
      expect(catalog.priceOf(entry({ idProduct: 3, finish: null }))).toEqual({
        status: 'to-choose',
      });
      expect(catalog.priceOf(entry({ idProduct: 3, finish: 'foil' }))).toEqual({
        status: 'chosen',
        cents: 300,
        kind: 'trend',
      });
    });
    it('usa il prezzo "da" quando manca il trend', () => {
      expect(catalog.priceOf(entry({ cardKey: marineKey, idProduct: 9 }))).toEqual({
        status: 'chosen',
        cents: 5,
        kind: 'low',
      });
    });
    it('"prezzo non disponibile" se il prodotto non ha prezzi', () => {
      expect(
        catalog.priceOf(entry({ cardKey: cardKey('Ghost Card', null), idProduct: 77 })),
      ).toEqual({
        status: 'unavailable',
      });
    });
    it('"da scegliere" se la Carta o il prodotto non esistono più nel Catalogo', () => {
      expect(catalog.priceOf(entry({ cardKey: 'x|y' }))).toEqual({ status: 'to-choose' });
      expect(catalog.priceOf(entry({ idProduct: 4242 }))).toEqual({ status: 'to-choose' });
    });
  });
});

describe('searchCards', () => {
  const entries = [
    {
      name: 'Darth Vader',
      subtitle: 'Dark Lord of the Sith',
      ref: { name: vader.name, subtitle: vader.subtitle },
    },
    {
      name: 'Dark Vador',
      subtitle: 'Seigneur noir des Sith',
      ref: { name: vader.name, subtitle: vader.subtitle },
    },
    { name: 'Battlefield Marine', subtitle: null, ref: { name: marine.name, subtitle: null } },
  ];
  it('cerca per inizio del titolo, in qualsiasi lingua, senza ripetere la stessa Carta', () => {
    expect(searchCards(entries, 'dar')).toEqual([vaderKey]);
    expect(searchCards(entries, 'vador')).toEqual([vaderKey]);
  });
  it('trova anche per parole interne e tollera accenti e maiuscole', () => {
    expect(searchCards(entries, 'MARINE')).toEqual([marineKey]);
    expect(searchCards(entries, 'seigneur')).toEqual([vaderKey]);
  });
  it('mette prima i titoli che iniziano con il testo', () => {
    const more = [
      { name: "Vader's Fury", subtitle: null, ref: { name: "Vader's Fury", subtitle: null } },
      ...entries,
    ];
    expect(searchCards(more, 'vad')[0]).toBe(cardKey("Vader's Fury", null));
  });
  it('rispetta il limite e restituisce vuoto per testo vuoto o senza risultati', () => {
    expect(searchCards(entries, 'a', 1)).toHaveLength(1);
    expect(searchCards(entries, '')).toEqual([]);
    expect(searchCards(entries, 'zzzz')).toEqual([]);
  });
});

describe('reviewFromDetected', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  it('una carta riconosciuta ha la Carta scelta e nessuna versione', () => {
    const d: DetectedCard = {
      status: 'recognized',
      candidates: [
        {
          name: 'Darth Vader',
          subtitle: 'Dark Lord of the Sith',
          ref: { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
        },
      ],
      titleBox: box,
      rotation: 0,
    };
    const item = reviewFromDetected(d, catalog, () => 'r1');
    expect(item).toMatchObject({
      id: 'r1',
      status: 'recognized',
      cardKey: vaderKey,
      idProduct: null,
      finish: null,
    });
  });
  it('una carta "da scegliere" tiene le candidate e non ha ancora la Carta', () => {
    const d: DetectedCard = {
      status: 'choose',
      candidates: [
        { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
        { name: 'Battlefield Marine', subtitle: null },
      ],
      titleBox: box,
      rotation: 0,
    };
    const item = reviewFromDetected(d, catalog, () => 'r2');
    expect(item).toMatchObject({
      status: 'choose',
      cardKey: null,
      candidates: [vaderKey, marineKey],
    });
  });
  it('tiene il titolo nella lingua letta, se diverso da quello inglese', () => {
    const d: DetectedCard = {
      status: 'recognized',
      candidates: [
        {
          name: 'Dark Vador',
          subtitle: 'Seigneur noir des Sith',
          ref: { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
        },
      ],
      titleBox: box,
      rotation: 0,
    };
    const item = reviewFromDetected(d, catalog, () => 'r4');
    expect(item?.locals).toEqual({
      [vaderKey]: { name: 'Dark Vador', subtitle: 'Seigneur noir des Sith' },
    });
  });
  it('non tiene un titolo locale uguale a quello inglese', () => {
    const d: DetectedCard = {
      status: 'recognized',
      candidates: [
        {
          name: 'Darth Vader',
          subtitle: 'Dark Lord of the Sith',
          ref: { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
        },
      ],
      titleBox: box,
      rotation: 0,
    };
    expect(reviewFromDetected(d, catalog, () => 'r5')?.locals).toEqual({});
  });
  it('tiene i titoli locali di tutte le candidate di una carta "da scegliere"', () => {
    const d: DetectedCard = {
      status: 'choose',
      candidates: [
        {
          name: 'Dark Vador',
          subtitle: 'A',
          ref: { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
        },
        { name: 'Marine', subtitle: null, ref: { name: 'Battlefield Marine', subtitle: null } },
      ],
      titleBox: box,
      rotation: 0,
    };
    expect(Object.keys(reviewFromDetected(d, catalog, () => 'r6')?.locals ?? {})).toEqual([
      vaderKey,
      marineKey,
    ]);
  });
  it('scarta le candidate che non sono nel Catalogo', () => {
    const d: DetectedCard = {
      status: 'recognized',
      candidates: [{ name: 'Carta Sconosciuta', subtitle: null }],
      titleBox: box,
      rotation: 0,
    };
    expect(reviewFromDetected(d, catalog, () => 'r3')).toBeNull();
  });
});

describe('resolveItem e toNewEntries', () => {
  const choose = {
    id: 'r1',
    status: 'choose' as const,
    cardKey: null,
    candidates: [vaderKey, marineKey],
    idProduct: null,
    finish: null,
    locals: { [marineKey]: { name: 'Marine', subtitle: null } },
  };
  it('scegliere una candidata fissa la Carta e azzera la versione', () => {
    const item = resolveItem({ ...choose, idProduct: 5 }, { cardKey: marineKey });
    expect(item.cardKey).toBe(marineKey);
    expect(item.idProduct).toBeNull();
  });
  it('scegliere versione e finitura le aggiorna', () => {
    const item = resolveItem({ ...choose, cardKey: vaderKey }, { idProduct: 3, finish: 'foil' });
    expect(item).toMatchObject({ idProduct: 3, finish: 'foil' });
  });
  it('alla conferma le carte senza Carta scelta restano fuori e le altre diventano voci', () => {
    const ready = {
      ...choose,
      cardKey: vaderKey,
      status: 'recognized' as const,
      idProduct: 1,
      finish: 'normal' as const,
    };
    const { entries, skipped } = toNewEntries([ready, choose]);
    expect(entries).toEqual([{ cardKey: vaderKey, idProduct: 1, finish: 'normal' }]);
    expect(skipped).toBe(1);
  });
  it('alla conferma porta il titolo locale della Carta scelta nella voce', () => {
    const item = {
      ...choose,
      cardKey: marineKey,
      status: 'recognized' as const,
      locals: { [marineKey]: { name: 'Marine', subtitle: null } },
    };
    expect(toNewEntries([item]).entries[0]).toEqual({
      cardKey: marineKey,
      idProduct: null,
      finish: null,
      local: { name: 'Marine', subtitle: null },
    });
  });
});

describe('CSV della Lista', () => {
  const entry = (over: Partial<ListEntry>): ListEntry => ({
    id: 'x',
    cardKey: vaderKey,
    idProduct: 2,
    finish: 'normal',
    quantity: 2,
    ...over,
  });

  it('listToCsvRows descrive versione, finitura e prezzo unitario', () => {
    const [row] = listToCsvRows([entry({})], catalog);
    expect(row).toMatchObject({
      quantity: 2,
      name: 'Darth Vader',
      subtitle: 'Dark Lord of the Sith',
      set: 'SOR',
      number: '262',
      variant: 'Hyperspace',
      finish: 'normal',
      idProduct: 2,
      priceEur: '50.00',
    });
  });

  it('listToCsvRows lascia vuoti versione e prezzo per le voci da scegliere', () => {
    const [row] = listToCsvRows([entry({ idProduct: null, finish: null })], catalog);
    expect(row).toMatchObject({
      set: '',
      number: '',
      variant: '',
      finish: '',
      idProduct: null,
      priceEur: '',
    });
  });

  it('listToCsvRows lascia il prezzo vuoto se non disponibile o ancora da scegliere (finitura)', () => {
    const [shared] = listToCsvRows([entry({ idProduct: 3, finish: null })], catalog);
    expect(shared?.priceEur).toBe('');
    const [unavail] = listToCsvRows(
      [entry({ cardKey: cardKey('Ghost Card', null), idProduct: 77 })],
      catalog,
    );
    expect(unavail?.priceEur).toBe('');
  });

  it('entriesFromCsv ritrova la Carta dal prodotto e, in mancanza, dal titolo', () => {
    const rows = [
      {
        quantity: 3,
        name: 'Qualsiasi',
        subtitle: '',
        set: '',
        number: '',
        variant: '',
        finish: 'normal',
        idProduct: 1,
        priceEur: '',
      },
      {
        quantity: 1,
        name: 'battlefield marine',
        subtitle: '',
        set: '',
        number: '',
        variant: '',
        finish: '',
        idProduct: null,
        priceEur: '',
      },
      {
        quantity: 1,
        name: 'Darth Vader',
        subtitle: 'Dark Lord of the Sith',
        set: '',
        number: '',
        variant: '',
        finish: '',
        idProduct: null,
        priceEur: '',
      },
    ];
    const { entries, unknown } = entriesFromCsv(rows, catalog);
    expect(entries).toEqual([
      { cardKey: vaderKey, idProduct: 1, finish: 'normal', quantity: 3 },
      { cardKey: marineKey, idProduct: null, finish: null, quantity: 1 },
      { cardKey: vaderKey, idProduct: null, finish: null, quantity: 1 },
    ]);
    expect(unknown).toEqual([]);
  });

  it('entriesFromCsv segnala i nomi che non sono nel Catalogo', () => {
    const { entries, unknown } = entriesFromCsv(
      [
        {
          quantity: 1,
          name: 'Carta Inventata',
          subtitle: '',
          set: '',
          number: '',
          variant: '',
          finish: '',
          idProduct: null,
          priceEur: '',
        },
      ],
      catalog,
    );
    expect(entries).toEqual([]);
    expect(unknown).toEqual(['Carta Inventata']);
  });

  it('entriesFromCsv scarta un prodotto che non appartiene alla Carta con quel nome', () => {
    const { entries } = entriesFromCsv(
      [
        {
          quantity: 1,
          name: 'Darth Vader',
          subtitle: 'Dark Lord of the Sith',
          set: '',
          number: '',
          variant: '',
          finish: '',
          idProduct: 9,
          priceEur: '',
        },
      ],
      catalog,
    );
    expect(entries).toEqual([{ cardKey: vaderKey, idProduct: null, finish: null, quantity: 1 }]);
  });
});

describe('unresolvedRange', () => {
  const entry = (over: Partial<ListEntry>): ListEntry => ({
    id: 'x',
    cardKey: vaderKey,
    idProduct: null,
    finish: null,
    quantity: 1,
    ...over,
  });

  it('per una carta senza versione va dal prezzo più basso al più alto tra le sue versioni', () => {
    // Vader: prodotti 1 (10,00 €), 2 (50,00 €), 3 (normale 1,00 € / foil 3,00 €)
    expect(unresolvedRange([entry({})], catalog)).toEqual({
      minCents: 100,
      maxCents: 5000,
      noPrice: 0,
    });
  });

  it('moltiplica per la quantità e somma le carte', () => {
    const r = unresolvedRange(
      [entry({ quantity: 2 }), entry({ id: 'y', cardKey: marineKey })],
      catalog,
    );
    expect(r).toEqual({ minCents: 2 * 100 + 5, maxCents: 2 * 5000 + 5, noPrice: 0 });
  });

  it('con la versione scelta ma la finitura da scegliere conta solo le due finiture', () => {
    expect(unresolvedRange([entry({ idProduct: 3 })], catalog)).toEqual({
      minCents: 100,
      maxCents: 300,
      noPrice: 0,
    });
  });

  it('ignora le voci già decise', () => {
    expect(unresolvedRange([entry({ idProduct: 1, finish: 'normal' })], catalog)).toEqual({
      minCents: 0,
      maxCents: 0,
      noPrice: 0,
    });
  });

  it('conta le carte da scegliere senza nessun prezzo disponibile', () => {
    const r = unresolvedRange(
      [entry({ cardKey: cardKey('Ghost Card', null), quantity: 3 })],
      catalog,
    );
    expect(r).toEqual({ minCents: 0, maxCents: 0, noPrice: 3 });
  });

  it('per una lista vuota è tutto a zero', () => {
    expect(unresolvedRange([], catalog)).toEqual({ minCents: 0, maxCents: 0, noPrice: 0 });
  });
});

describe('entriesFromShared', () => {
  const price = { cents: 321, kind: 'trend' as const, date: '2026-11-07' };
  const sh = (over: Partial<SharedEntry>): SharedEntry => ({
    quantity: 1,
    idProduct: 1,
    finish: 'normal',
    cardKey: null,
    price,
    ...over,
  });

  it('ricava la Carta dal prodotto e tiene finitura e prezzo ricevuto', () => {
    const { entries, unknown } = entriesFromShared([sh({ quantity: 2 })], catalog);
    expect(unknown).toBe(0);
    expect(entries).toEqual([
      { cardKey: vaderKey, idProduct: 1, finish: 'normal', quantity: 2, shared: price },
    ]);
  });

  it('una voce da scegliere resta da scegliere, dalla chiave della Carta', () => {
    const { entries } = entriesFromShared(
      [sh({ idProduct: null, finish: null, cardKey: marineKey, price: null })],
      catalog,
    );
    expect(entries).toEqual([{ cardKey: marineKey, idProduct: null, finish: null, quantity: 1 }]);
  });

  it('salta le carte che il Catalogo non conosce, contando le quantità', () => {
    const { entries, unknown } = entriesFromShared(
      [
        sh({ idProduct: 424242, quantity: 2 }),
        sh({ idProduct: null, finish: null, cardKey: 'non|esiste', price: null }),
      ],
      catalog,
    );
    expect(entries).toEqual([]);
    expect(unknown).toBe(3);
  });

  it('un prodotto sconosciuto con la chiave giusta torna una voce da scegliere, senza prezzo', () => {
    const { entries } = entriesFromShared([sh({ idProduct: 424242, cardKey: vaderKey })], catalog);
    expect(entries).toEqual([{ cardKey: vaderKey, idProduct: null, finish: null, quantity: 1 }]);
  });
});
