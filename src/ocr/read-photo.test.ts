import { describe, expect, it } from 'vitest';
import type { OcrEngine, TextLine } from './engine.ts';
import type { RawImage } from './image.ts';
import { readPhoto } from './read-photo.ts';

const blank = (width: number, height: number): RawImage => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

describe('readPhoto', () => {
  it('legge le rotazioni richieste e riporta i riquadri alla foto originale', async () => {
    const seen: [number, number][] = [];
    const engine: OcrEngine = {
      id: 'fake',
      load: () => Promise.resolve(),
      dispose: () => undefined,
      recognize: (img): Promise<TextLine[]> => {
        seen.push([img.width, img.height]);
        // una riga in alto a sinistra di ogni immagine ruotata
        return Promise.resolve([
          { text: 'x', box: { x: 0, y: 0, width: 10, height: 4 }, confidence: 1 },
        ]);
      },
    };
    const lines = await readPhoto(engine, blank(100, 60), [0, 90, 180, 270]);
    expect(seen).toEqual([
      [100, 60],
      [60, 100],
      [100, 60],
      [60, 100],
    ]);
    expect(lines.map((l) => l.rotation)).toEqual([0, 90, 180, 270]);
    expect(lines[0]?.box).toEqual({ x: 0, y: 0, width: 10, height: 4 });
    // 180°: l'angolo in alto a sinistra dell'immagine ruotata è in basso a destra dell'originale
    expect(lines[2]?.box).toEqual({ x: 90, y: 56, width: 10, height: 4 });
  });

  it('di default legge tutte e 4 le rotazioni', async () => {
    let calls = 0;
    const engine: OcrEngine = {
      id: 'fake',
      load: () => Promise.resolve(),
      dispose: () => undefined,
      recognize: () => {
        calls++;
        return Promise.resolve([]);
      },
    };
    await readPhoto(engine, blank(10, 10));
    expect(calls).toBe(4);
  });

  it('usa il rilevamento unico se il motore lo offre, senza ruotare la foto', async () => {
    let plain = 0;
    let all = 0;
    const engine: OcrEngine = {
      id: 'fake',
      load: () => Promise.resolve(),
      dispose: () => undefined,
      recognize: () => {
        plain++;
        return Promise.resolve([]);
      },
      recognizeAllOrientations: () => {
        all++;
        return Promise.resolve([
          { text: 'x', box: { x: 1, y: 2, width: 3, height: 4 }, confidence: 1, rotation: 90 },
        ]);
      },
    };
    const lines = await readPhoto(engine, blank(10, 10));
    expect(all).toBe(1);
    expect(plain).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.rotation).toBe(90);
  });

  it("passa all'esterno l'avanzamento del motore con il rilevamento unico", async () => {
    const engine: OcrEngine = {
      id: 'fake',
      load: () => Promise.resolve(),
      dispose: () => undefined,
      recognize: () => Promise.resolve([]),
      recognizeAllOrientations: (_image, onProgress) => {
        onProgress?.(0.5);
        return Promise.resolve([]);
      },
    };
    const seen: number[] = [];
    await readPhoto(engine, blank(10, 10), undefined, (f) => seen.push(f));
    expect(seen).toEqual([0.5]);
  });

  it('con le rotazioni una alla volta dice a che punto è', async () => {
    const engine: OcrEngine = {
      id: 'fake',
      load: () => Promise.resolve(),
      dispose: () => undefined,
      recognize: () => Promise.resolve([]),
    };
    const seen: number[] = [];
    await readPhoto(engine, blank(10, 10), [0, 90], (f) => seen.push(f));
    expect(seen).toEqual([0, 0.5]);
  });
});
