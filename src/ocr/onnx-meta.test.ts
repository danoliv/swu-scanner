import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { readModelMetadata } from './onnx-meta.ts';

const enc = new TextEncoder();
const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
};
const field = (num: number, wire: number, payload: number[]): number[] => [
  ...varint((num << 3) | wire),
  ...payload,
];
const lenDelim = (num: number, bytes: number[]): number[] =>
  field(num, 2, [...varint(bytes.length), ...bytes]);
const entry = (key: string, value: string): number[] =>
  lenDelim(14, [...lenDelim(1, [...enc.encode(key)]), ...lenDelim(2, [...enc.encode(value)])]);

describe('readModelMetadata', () => {
  it('legge le coppie chiave/valore del modello (campo 14)', () => {
    const model = Uint8Array.from([
      ...field(1, 0, varint(8)), // ir_version
      ...lenDelim(7, [1, 2, 3, 4, 5]), // graph (ignorato)
      ...entry('character', 'a\nb\nc'),
      ...entry('altro', 'x'),
    ]);
    expect(readModelMetadata(model)).toEqual({ character: 'a\nb\nc', altro: 'x' });
  });

  it('gestisce valori lunghi (lunghezza su più byte) e caratteri non ASCII', () => {
    const value = 'é\n'.repeat(3000);
    const model = Uint8Array.from(entry('character', value));
    expect(readModelMetadata(model).character).toBe(value);
  });

  it('salta i campi con altri tipi di dato (32 e 64 bit)', () => {
    const model = Uint8Array.from([
      ...field(20, 5, [1, 2, 3, 4]),
      ...field(21, 1, [1, 2, 3, 4, 5, 6, 7, 8]),
      ...entry('k', 'v'),
    ]);
    expect(readModelMetadata(model)).toEqual({ k: 'v' });
  });

  it('restituisce un oggetto vuoto se non ci sono metadati', () => {
    expect(readModelMetadata(Uint8Array.from(lenDelim(7, [9, 9])))).toEqual({});
  });

  it('rifiuta un file troncato', () => {
    expect(() => readModelMetadata(Uint8Array.from([0x3a, 0x7f, 1]))).toThrow(/troncato/);
  });

  const real =
    '/tmp/claude-1000/-home-andrea-Projects-swu-scanner/c5b4ea80-d961-4565-9608-696b40fc3837/scratchpad/ocr/.venv/lib/python3.12/site-packages/rapidocr/models/PP-OCRv6_rec_tiny.onnx';
  it.skipIf(!existsSync(real))('estrae i 6904 caratteri dal modello vero', () => {
    const meta = readModelMetadata(new Uint8Array(readFileSync(real)));
    expect(meta.character?.split('\n')).toHaveLength(6904);
  });
});
