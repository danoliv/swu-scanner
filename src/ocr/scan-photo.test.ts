import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../lib/detect-cards.ts';
import type { OcrEngine, TextLine } from './engine.ts';
import type { RawImage } from './image.ts';
import { scanPhoto } from './scan-photo.ts';

const catalog: CatalogEntry[] = [
  { name: 'Darth Vader', subtitle: 'Dark Lord of the Sith' },
  { name: 'Darth Vader', subtitle: 'Commanding the First Legion' },
  { name: 'Battlefield Marine', subtitle: null },
];

const blank = (width: number, height: number): RawImage => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

const line = (text: string, x: number, y: number, w: number, h: number): TextLine => ({
  text,
  box: { x, y, width: w, height: h },
  confidence: 0.95,
});

/** Motore finto: restituisce le righe della chiamata n-esima e ricorda le dimensioni delle immagini. */
function fakeEngine(calls: TextLine[][]): OcrEngine & { sizes: [number, number][] } {
  const sizes: [number, number][] = [];
  return {
    id: 'fake',
    sizes,
    load: () => Promise.resolve(),
    dispose: () => undefined,
    recognize: (image) => {
      sizes.push([image.width, image.height]);
      return Promise.resolve(calls[sizes.length - 1] ?? []);
    },
  };
}

describe('scanPhoto', () => {
  it('legge la foto in 4 rotazioni e riconosce le carte con titolo univoco senza ritagli', async () => {
    const engine = fakeEngine([[line('Battlefield Marine', 100, 50, 200, 20)]]);
    const r = await scanPhoto(engine, blank(400, 300), { catalog });
    expect(engine.sizes).toHaveLength(4); // 0°, 90°, 180°, 270°
    expect(engine.sizes[1]).toEqual([300, 400]); // la rotazione di 90° scambia i lati
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]?.status).toBe('recognized');
    expect(r.refinedCards).toBe(0);
  });

  it('rilegge ingrandito il ritaglio di una carta "da scegliere" e ne risolve il sottotitolo', async () => {
    // Chiamate 1-4: le rotazioni. Chiamata 5: il ritaglio ingrandito 2,5x attorno al titolo.
    // Il ritaglio parte da (0, 40) ed è 400x130: il sottotitolo a (100,80) cade a (250,100) ingrandito.
    const engine = fakeEngine([
      [line('Darth Vader', 100, 50, 200, 20)],
      [],
      [],
      [],
      [line('Commanding the First Legion', 250, 100, 500, 50)],
    ]);
    const r = await scanPhoto(engine, blank(400, 300), { catalog });
    expect(engine.sizes).toHaveLength(5);
    expect(engine.sizes[4]).toEqual([1000, 325]);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]?.status).toBe('recognized');
    expect(r.cards[0]?.candidates[0]?.subtitle).toBe('Commanding the First Legion');
    expect(r.refinedCards).toBe(1);
  });

  it('lascia "da scegliere" la carta se il ritaglio non dice nulla di utile', async () => {
    const engine = fakeEngine([[line('Darth Vader', 100, 50, 200, 20)], [], [], [], []]);
    const r = await scanPhoto(engine, blank(400, 300), { catalog });
    expect(r.cards[0]?.status).toBe('choose');
    expect(r.refinedCards).toBe(0);
  });

  it('riduce le foto grandi ma ritaglia dalla foto a piena risoluzione', async () => {
    // Foto 800x600, lato massimo 400: lavoro a 400x300. Il ritaglio, preso dall'originale,
    // è 400x130 nel riferimento di lavoro, quindi 1000x325 dopo l'ingrandimento 2,5x.
    const engine = fakeEngine([[line('Darth Vader', 100, 50, 200, 20)], [], [], [], []]);
    await scanPhoto(engine, blank(800, 600), { catalog, maxSide: 400 });
    expect(engine.sizes[0]).toEqual([400, 300]);
    expect(engine.sizes[4]).toEqual([1000, 325]);
  });

  it('riporta le dimensioni di lavoro e le righe lette', async () => {
    const engine = fakeEngine([[line('Battlefield Marine', 100, 50, 200, 20)]]);
    const r = await scanPhoto(engine, blank(800, 600), { catalog, maxSide: 400 });
    expect(r.size).toEqual({ width: 400, height: 300 });
    expect(r.lines.some((l) => l.text === 'Battlefield Marine' && l.rotation === 0)).toBe(true);
  });

  it('rispetta il numero massimo di ritagli', async () => {
    const lines = [
      line('Darth Vader', 20, 20, 150, 20),
      line('Darth Vader', 220, 20, 150, 20),
      line('Darth Vader', 20, 150, 150, 20),
    ];
    const engine = fakeEngine([lines, [], [], [], [], [], []]);
    await scanPhoto(engine, blank(400, 300), { catalog, maxCrops: 2 });
    expect(engine.sizes).toHaveLength(4 + 2);
  });

  it('con ritagli disattivati non rilegge nulla', async () => {
    const engine = fakeEngine([[line('Darth Vader', 100, 50, 200, 20)]]);
    await scanPhoto(engine, blank(400, 300), { catalog, zoom: false });
    expect(engine.sizes).toHaveLength(4);
  });

  it("segnala l'avanzamento", async () => {
    const engine = fakeEngine([[line('Darth Vader', 100, 50, 200, 20)]]);
    const seen: string[] = [];
    await scanPhoto(engine, blank(400, 300), { catalog, onProgress: (stage) => seen.push(stage) });
    expect(seen).toContain('read');
    expect(seen).toContain('zoom');
    expect(seen.at(-1)).toBe('done');
  });
});
