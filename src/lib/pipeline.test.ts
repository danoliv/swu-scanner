import { describe, expect, it } from 'vitest';
import { toSwuPrinting, type RawCard } from './pipeline.ts';

const raw: RawCard = {
  Set: 'SEC',
  Number: '12',
  Name: 'C-3P0',
  Subtitle: 'Protocol Droid',
  Type: 'Unit',
  VariantType: 'Hyperspace',
  tcgplayerId: '55',
  MarketPrice: '1.5',
  FoilPrice: '',
};

describe('toSwuPrinting', () => {
  it('applica le correzioni e copia i campi usati dal collegamento', () => {
    const p = toSwuPrinting(raw, { 'C-3P0, Protocol Droid': 'C-3PO, Protocol Droid' });
    expect(p).toMatchObject({
      set: 'SEC',
      number: '12',
      name: 'C-3PO',
      subtitle: 'Protocol Droid',
      variantType: 'Hyperspace',
      tcgplayerId: '55',
      marketPrice: '1.5',
      foilPrice: '',
    });
  });
  it('omette sottotitolo e prezzi assenti', () => {
    const rest: RawCard = {
      Set: 'SEC',
      Number: '12',
      Name: 'Vanquish',
      Type: 'Event',
      VariantType: 'Normal',
    };
    const p = toSwuPrinting(rest, {});
    expect(p).not.toHaveProperty('subtitle');
    expect(p).not.toHaveProperty('marketPrice');
    expect(p.tcgplayerId).toBe('');
  });
  it('toglie il sottotitolo alle basi', () => {
    const p = toSwuPrinting({ ...raw, Name: 'Echo Base', Subtitle: 'Hoth', Type: 'Base' }, {});
    expect(p).not.toHaveProperty('subtitle');
  });
});
