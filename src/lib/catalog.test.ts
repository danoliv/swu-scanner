import { describe, expect, it } from 'vitest';
import { buildCatalog, linkFields, type RawPrinting } from './catalog.ts';

const p = (over: Partial<RawPrinting>): RawPrinting => ({
  Set: 'SOR',
  Number: '5',
  Name: 'Luke Skywalker',
  Subtitle: 'Faithful Friend',
  Type: 'Leader',
  VariantType: 'Normal',
  ...over,
});

describe('buildCatalog', () => {
  it('raggruppa le stampe della stessa Carta (titolo + sottotitolo)', () => {
    const cat = buildCatalog(
      [p({}), p({ Set: 'SOR', Number: '263', VariantType: 'Hyperspace' })],
      {},
    );
    expect(cat).toHaveLength(1);
    expect(cat[0]?.printings).toEqual([
      ['SOR', '5', 'Normal'],
      ['SOR', '263', 'Hyperspace'],
    ]);
  });
  it('tiene separate Carte con lo stesso titolo e sottotitolo diverso', () => {
    const cat = buildCatalog([p({}), p({ Subtitle: 'Jedi Knight', Number: '6' })], {});
    expect(cat).toHaveLength(2);
  });
  it('applica la tabella di correzione ai nomi', () => {
    const cat = buildCatalog([p({ Name: 'C-3P0', Subtitle: undefined })], { 'C-3P0': 'C-3PO' });
    expect(cat[0]?.name).toBe('C-3PO');
  });
  it('applica le correzioni scritte come "titolo, sottotitolo" ai campi separati', () => {
    const cat = buildCatalog([p({ Name: 'C-3P0', Subtitle: 'Protocol Droid' })], {
      'C-3P0, Protocol Droid': 'C-3PO, Protocol Droid',
    });
    expect(cat[0]?.name).toBe('C-3PO');
    expect(cat[0]?.subtitle).toBe('Protocol Droid');
  });
  it('corregge un errore nel sottotitolo senza spostare la divisione', () => {
    const cat = buildCatalog([p({ Name: 'Iden Versio', Subtitle: 'Infero Squad Commander' })], {
      'Iden Versio, Infero Squad Commander': 'Iden Versio, Inferno Squad Commander',
    });
    expect(cat[0]).toMatchObject({ name: 'Iden Versio', subtitle: 'Inferno Squad Commander' });
  });
  it('divide bene quando il sottotitolo contiene una virgola', () => {
    const cat = buildCatalog([p({ Name: 'C-3P0', Subtitle: 'Oh Dear, Oh Dear' })], {
      'C-3P0, Oh Dear, Oh Dear': 'C-3PO, Oh Dear, Oh Dear',
    });
    expect(cat[0]).toMatchObject({ name: 'C-3PO', subtitle: 'Oh Dear, Oh Dear' });
  });
  it('unisce i set promo con il nome canonico', () => {
    const cat = buildCatalog([p({ Set: 'SECOP', Number: '5' })], {});
    expect(cat[0]?.printings[0]?.[0]).toBe('SECP');
  });
  it('gestisce il sottotitolo assente', () => {
    const cat = buildCatalog([p({ Subtitle: undefined, Name: 'Battlefield Marine' })], {});
    expect(cat[0]?.subtitle).toBeNull();
  });
  it('ordina le stampe per set e numero crescente', () => {
    const cat = buildCatalog([p({ Number: '10' }), p({ Number: '9' })], {});
    expect(cat[0]?.printings.map((x) => x[1])).toEqual(['9', '10']);
  });
  it('non duplica la stessa stampa', () => {
    expect(buildCatalog([p({}), p({})], {})[0]?.printings).toHaveLength(1);
  });
});

describe('linkFields', () => {
  it('per le basi toglie il sottotitolo (il luogo): Cardmarket usa solo il nome', () => {
    expect(linkFields({ Name: 'Echo Base', Subtitle: 'Hoth', Type: 'Base' }, {})).toEqual({
      name: 'Echo Base',
      subtitle: null,
    });
  });
  it('per le altre carte tiene il sottotitolo e applica le correzioni', () => {
    expect(
      linkFields(
        { Name: 'C-3P0', Subtitle: 'Protocol Droid', Type: 'Unit' },
        {
          'C-3P0, Protocol Droid': 'C-3PO, Protocol Droid',
        },
      ),
    ).toEqual({ name: 'C-3PO', subtitle: 'Protocol Droid' });
  });
  it('per le carte a doppia faccia tiene nome e sottotitolo del lato frontale', () => {
    expect(
      linkFields(
        {
          Name: 'Grand Moff Tarkin // The Death Star',
          Subtitle: 'Tyrant of the Outer Rim // Icon of Tyranny',
          Type: 'Leader',
        },
        {},
      ),
    ).toEqual({ name: 'Grand Moff Tarkin', subtitle: 'Tyrant of the Outer Rim' });
  });
  it('gestisce il sottotitolo assente', () => {
    expect(linkFields({ Name: 'Shield', Type: 'Token Upgrade' }, {})).toEqual({
      name: 'Shield',
      subtitle: null,
    });
  });
});
