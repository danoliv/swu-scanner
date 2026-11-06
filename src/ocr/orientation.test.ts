import { describe, expect, it } from 'vitest';
import { readBestOrientation, type Reading } from './orientation.ts';

const r = (text: string, confidence: number): Reading => ({ text, confidence });

describe('readBestOrientation', () => {
  it('tiene la prima lettura se la fiducia è alta e non prova il verso opposto', async () => {
    let flippedCalls = 0;
    const out = await readBestOrientation(
      () => Promise.resolve(r('Luke', 0.97)),
      () => {
        flippedCalls++;
        return Promise.resolve(r('x', 0.99));
      },
      0.85,
    );
    expect(out).toEqual({ reading: r('Luke', 0.97), flipped: false });
    expect(flippedCalls).toBe(0);
  });

  it('prova il verso opposto se la prima lettura è incerta e prende la migliore', async () => {
    const out = await readBestOrientation(
      () => Promise.resolve(r('lenl', 0.4)),
      () => Promise.resolve(r('Luke', 0.95)),
      0.85,
    );
    expect(out).toEqual({ reading: r('Luke', 0.95), flipped: true });
  });

  it('se la seconda lettura non è meglio, tiene la prima', async () => {
    const out = await readBestOrientation(
      () => Promise.resolve(r('Luke', 0.7)),
      () => Promise.resolve(r('eknL', 0.3)),
      0.85,
    );
    expect(out.flipped).toBe(false);
    expect(out.reading.text).toBe('Luke');
  });

  it('a parità tiene la prima', async () => {
    const out = await readBestOrientation(
      () => Promise.resolve(r('a', 0.5)),
      () => Promise.resolve(r('b', 0.5)),
      0.85,
    );
    expect(out.flipped).toBe(false);
  });

  it('con soglia 1 legge sempre entrambi i versi', async () => {
    let flippedCalls = 0;
    await readBestOrientation(
      () => Promise.resolve(r('a', 0.99)),
      () => {
        flippedCalls++;
        return Promise.resolve(r('b', 0.1));
      },
      1,
    );
    expect(flippedCalls).toBe(1);
  });
});
