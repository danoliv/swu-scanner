import { describe, expect, it } from 'vitest';
import { sha256Hex, verifySha256 } from './hash.ts';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('sha256Hex', () => {
  it("calcola l'impronta SHA-256 in esadecimale", async () => {
    expect(await sha256Hex(bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('verifySha256', () => {
  const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  it("accetta i byte con l'impronta giusta, anche in maiuscolo", async () => {
    await expect(verifySha256(bytes('abc'), abc)).resolves.toBeUndefined();
    await expect(verifySha256(bytes('abc'), abc.toUpperCase())).resolves.toBeUndefined();
  });
  it("rifiuta byte diversi dall'attesa e dice quale file è sbagliato", async () => {
    await expect(verifySha256(bytes('abd'), abc, 'modello.onnx')).rejects.toThrow(/modello\.onnx/);
  });
});
