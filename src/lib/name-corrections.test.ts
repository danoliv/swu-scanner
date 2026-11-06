import { describe, expect, it } from 'vitest';
import { correctName, loadCorrections } from './name-corrections.ts';

describe('correctName', () => {
  const table = { 'C-3P0, Anything I Might Do?': 'C-3PO, Anything I Might Do?' };
  it('sostituisce un nome errato noto', () => {
    expect(correctName('C-3P0, Anything I Might Do?', table)).toBe('C-3PO, Anything I Might Do?');
  });
  it('lascia invariato un nome non in tabella', () => {
    expect(correctName('Darth Vader', table)).toBe('Darth Vader');
  });
  it('non corregge per prefisso o sottostringa', () => {
    expect(correctName('C-3P0', table)).toBe('C-3P0');
  });
});

describe('loadCorrections', () => {
  it('rifiuta voci in cui sbagliato e corretto coincidono', () => {
    expect(() => loadCorrections({ A: 'A' })).toThrow(/uguale/);
  });
  it('rifiuta valori che non sono stringhe', () => {
    expect(() => loadCorrections({ A: 3 })).toThrow(/stringa/);
  });
  it('rifiuta catene di correzioni', () => {
    expect(() => loadCorrections({ A: 'B', B: 'C' })).toThrow(/catena/i);
  });
  it('accetta una tabella valida', () => {
    expect(loadCorrections({ A: 'B' })).toEqual({ A: 'B' });
  });
});
