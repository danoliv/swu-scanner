import { describe, expect, it } from 'vitest';
import {
  cardmarketKey,
  linkSet,
  printingKey,
  type CmPrice,
  type CmProduct,
  type SwuPrinting,
} from './link-cardmarket.ts';

const printing = (
  over: Partial<SwuPrinting> & Pick<SwuPrinting, 'number' | 'variantType'>,
): SwuPrinting => ({
  set: 'JTL',
  name: 'Colossus',
  subtitle: 'Castilon',
  tcgplayerId: '1',
  marketPrice: '1.00',
  foilPrice: '',
  ...over,
});

const product = (
  idProduct: number,
  idExpansion: number,
  name = 'Colossus, Castilon',
): CmProduct => ({
  idProduct,
  idExpansion,
  name,
  idMetacard: 1,
});

const price = (
  idProduct: number,
  trend: number | null,
  trendFoil: number | null = null,
): CmPrice => ({
  idProduct,
  low: null,
  trend,
  'trend-foil': trendFoil,
});

const pricesOf = (...p: CmPrice[]) => new Map(p.map((x) => [x.idProduct, x]));

describe('chiavi di confronto', () => {
  it('normalizza maiuscole, accenti e punteggiatura', () => {
    expect(printingKey({ name: 'Chirrut Îmwe', subtitle: 'One With the Force' })).toBe(
      'chirrut imwe one with the force',
    );
  });

  it('unisce nome e sottotitolo come fa Cardmarket', () => {
    expect(printingKey({ name: 'Colossus', subtitle: 'Castilon' })).toBe(
      cardmarketKey('Colossus, Castilon'),
    );
  });

  it('ignora la parte "// Experience Token" dei prodotti Cardmarket', () => {
    expect(cardmarketKey('Capital City // Experience Token')).toBe('capital city');
  });

  it('per i leader a doppia faccia tiene il nome e il sottotitolo del lato frontale', () => {
    expect(cardmarketKey('Chancellor Palpatine // Darth Sidious, Playing Both Sides')).toBe(
      printingKey({ name: 'Chancellor Palpatine', subtitle: 'Playing Both Sides' }),
    );
  });

  it('accetta carte senza sottotitolo', () => {
    expect(printingKey({ name: 'Vanquish' })).toBe('vanquish');
  });
});

describe('linkSet', () => {
  it('collega in modo certo una stampa con un solo prodotto', () => {
    const res = linkSet(
      'JTL',
      [printing({ number: '021', variantType: 'Normal' })],
      [product(10, 5995)],
      pricesOf(price(10, 0.25)),
    );
    expect(res).toEqual([
      expect.objectContaining({
        number: '021',
        idProduct: 10,
        confidence: 'alta',
        method: 'strutturale',
      }),
    ]);
  });

  it('separa per finish nei set recenti: Normal/Foil e Hyperspace/Hyperspace Foil sono prodotti diversi', () => {
    const printings = [
      printing({ number: '021', variantType: 'Normal' }),
      printing({ number: '283', variantType: 'Hyperspace' }),
      printing({ number: '525', variantType: 'Foil' }),
      printing({ number: '761', variantType: 'Hyperspace Foil' }),
    ];
    const products = [
      product(808844, 5995),
      product(814905, 6074),
      product(815168, 5995),
      product(815506, 6074),
    ];
    const prices = pricesOf(
      price(808844, 0.25, 0),
      price(814905, 2.5, 0),
      price(815168, 0.25, 0.41),
      price(815506, 7, 7.37),
    );
    const byNumber = Object.fromEntries(
      linkSet('JTL', printings, products, prices).map((l) => [l.number, l]),
    );
    expect(byNumber['021']).toMatchObject({ idProduct: 808844, confidence: 'alta' });
    expect(byNumber['283']).toMatchObject({ idProduct: 814905, confidence: 'alta' });
    expect(byNumber['525']).toMatchObject({ idProduct: 815168, confidence: 'alta' });
    expect(byNumber['761']).toMatchObject({ idProduct: 815506, confidence: 'alta' });
  });

  it('nei set vecchi il Foil condivide il prodotto del Normal', () => {
    const printings = [
      printing({
        set: 'SOR',
        number: '051',
        variantType: 'Normal',
        name: 'Luke Skywalker',
        subtitle: 'Jedi Knight',
      }),
      printing({
        set: 'SOR',
        number: '051F',
        variantType: 'Foil',
        name: 'Luke Skywalker',
        subtitle: 'Jedi Knight',
      }),
    ];
    const res = linkSet(
      'SOR',
      printings,
      [product(1, 5618, 'Luke Skywalker, Jedi Knight')],
      pricesOf(price(1, 8, 24)),
    );
    expect(res.map((l) => [l.number, l.idProduct, l.confidence])).toEqual([
      ['051', 1, 'alta'],
      ['051F', 1, 'alta'],
    ]);
  });

  it('assegna per prezzo e ordine degli id quando restano più stampe nello stesso gruppo (confidenza media)', () => {
    const printings = [
      printing({
        set: 'SOR',
        number: '300',
        variantType: 'Hyperspace',
        tcgplayerId: '200',
        marketPrice: '30.00',
      }),
      printing({
        set: 'SOR',
        number: '400',
        variantType: 'Showcase',
        tcgplayerId: '100',
        marketPrice: '3.00',
      }),
    ];
    const products = [product(1, 5638), product(2, 5638)];
    const prices = pricesOf(price(1, 3), price(2, 28));
    const byNumber = Object.fromEntries(
      linkSet('SOR', printings, products, prices).map((l) => [l.number, l]),
    );
    expect(byNumber['300']).toMatchObject({
      idProduct: 2,
      confidence: 'media',
      method: 'euristica',
    });
    expect(byNumber['400']).toMatchObject({
      idProduct: 1,
      confidence: 'media',
      method: 'euristica',
    });
  });

  it('non collega quando stampe e prodotti sono in numero diverso', () => {
    const res = linkSet(
      'JTL',
      [printing({ number: '021', variantType: 'Normal' })],
      [product(1, 5995), product(2, 5995)],
      pricesOf(price(1, 1), price(2, 2)),
    );
    expect(res[0]).toMatchObject({ idProduct: null, confidence: null, method: 'nessuno' });
    expect(res[0]?.note).toMatch(/conteggi/i);
  });

  it('non collega quando non esiste nessun prodotto con quel nome', () => {
    const res = linkSet('JTL', [printing({ number: '021', variantType: 'Normal' })], [], new Map());
    expect(res[0]).toMatchObject({ idProduct: null, method: 'nessuno' });
    expect(res[0]?.note).toMatch(/nessun prodotto/i);
  });

  it('ignora i prodotti di altre espansioni (promo, altri set)', () => {
    const res = linkSet(
      'JTL',
      [printing({ number: '021', variantType: 'Normal' })],
      [product(1, 5995), product(2, 6101)],
      pricesOf(price(1, 1), price(2, 180)),
    );
    expect(res[0]).toMatchObject({ idProduct: 1, confidence: 'alta' });
  });

  it('segnala un set non mappato invece di fallire in silenzio', () => {
    expect(() =>
      linkSet('XXX', [printing({ set: 'XXX', number: '1', variantType: 'Normal' })], [], new Map()),
    ).toThrow(/set non mappato/i);
  });

  it('nei set con una sola espansione (IBH) non usa la classe Extras', () => {
    const res = linkSet(
      'IBH',
      [
        printing({
          set: 'IBH',
          number: '82',
          variantType: 'Normal',
          name: 'Admiral Ozzel',
          subtitle: 'Overconfident',
        }),
      ],
      [product(1, 6268, 'Admiral Ozzel, Overconfident')],
      pricesOf(price(1, 1)),
    );
    expect(res[0]).toMatchObject({ idProduct: 1, confidence: 'alta' });
  });

  it("in IBH il numero più basso corrisponde all'idProduct più alto (verificato su 37 carte)", () => {
    const ozzel = {
      set: 'IBH',
      name: 'Admiral Ozzel',
      subtitle: 'As Clumsy as He Is Stupid',
      variantType: 'Normal',
    } as const;
    const res = linkSet(
      'IBH',
      [
        printing({ ...ozzel, number: '85', tcgplayerId: '646353' }),
        printing({ ...ozzel, number: '82', tcgplayerId: '646352' }),
      ],
      [
        product(843727, 6268, 'Admiral Ozzel, As Clumsy as He Is Stupid'),
        product(843730, 6268, 'Admiral Ozzel, As Clumsy as He Is Stupid'),
      ],
      pricesOf(price(843727, 1.78), price(843730, 1.01)),
    );
    const byNumber = Object.fromEntries(res.map((l) => [l.number, l]));
    expect(byNumber['82']).toMatchObject({
      idProduct: 843730,
      confidence: 'media',
      method: 'euristica',
    });
    expect(byNumber['85']).toMatchObject({
      idProduct: 843727,
      confidence: 'media',
      method: 'euristica',
    });
  });

  it('in IBH con tre copie assegna i numeri crescenti agli id decrescenti', () => {
    const at = { set: 'IBH', name: 'Blizzard Force AT-ST', variantType: 'Normal' } as const;
    const res = linkSet(
      'IBH',
      ['103', '70', '89'].map((number) => printing({ ...at, number, subtitle: undefined })),
      [843715, 843734, 843748].map((id) => product(id, 6268, 'Blizzard Force AT-ST')),
      new Map(),
    );
    const byNumber = Object.fromEntries(res.map((l) => [l.number, l.idProduct]));
    expect(byNumber).toEqual({ '70': 843748, '89': 843734, '103': 843715 });
  });
});
