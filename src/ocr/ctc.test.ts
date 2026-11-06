import { describe, expect, it } from 'vitest';
import { buildCharset, ctcDecode } from './ctc.ts';

/** logits [passi][classi] -> Float32Array piatto. */
const flat = (rows: number[][]): Float32Array => Float32Array.from(rows.flat());

describe('buildCharset', () => {
  it('mette "blank" in testa e lo spazio in fondo', () => {
    expect(buildCharset(['a', 'b'])).toEqual(['blank', 'a', 'b', ' ']);
  });
});

describe('ctcDecode', () => {
  const charset = buildCharset(['a', 'b', 'c']); // blank=0, a=1, b=2, c=3, ' '=4

  const step = (cls: number, p = 0.9): number[] => {
    const row = new Array<number>(charset.length).fill((1 - p) / (charset.length - 1));
    row[cls] = p;
    return row;
  };

  it('legge i caratteri più probabili di ogni passo', () => {
    const { text } = ctcDecode(flat([step(1), step(2), step(3)]), 3, charset.length, charset);
    expect(text).toBe('abc');
  });

  it('toglie il blank e i ripetuti consecutivi', () => {
    const rows = [step(1), step(1), step(0), step(1), step(2), step(2)];
    expect(ctcDecode(flat(rows), rows.length, charset.length, charset).text).toBe('aab');
  });

  it('un blank tra due uguali le tiene distinte', () => {
    const rows = [step(3), step(0), step(3)];
    expect(ctcDecode(flat(rows), 3, charset.length, charset).text).toBe('cc');
  });

  it('la fiducia è la media delle probabilità dei passi scelti', () => {
    const rows = [step(1, 0.8), step(0, 0.99), step(2, 0.6)];
    const { confidence } = ctcDecode(flat(rows), 3, charset.length, charset);
    expect(confidence).toBeCloseTo(0.7, 5);
  });

  it('restituisce testo vuoto e fiducia 0 se ci sono solo blank', () => {
    const rows = [step(0), step(0)];
    expect(ctcDecode(flat(rows), 2, charset.length, charset)).toEqual({ text: '', confidence: 0 });
  });

  it('decodifica lo spazio', () => {
    const rows = [step(1), step(4), step(2)];
    expect(ctcDecode(flat(rows), 3, charset.length, charset).text).toBe('a b');
  });

  it('rifiuta un tensore di dimensione sbagliata', () => {
    expect(() => ctcDecode(new Float32Array(5), 3, charset.length, charset)).toThrow(/dimension/i);
  });
});
