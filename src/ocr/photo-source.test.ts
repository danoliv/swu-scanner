import { describe, expect, it } from 'vitest';
import type { RawImage } from './image.ts';
import { isRawImage, rawPhotoSource } from './photo-source.ts';

function gradient(width: number, height: number): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('rawPhotoSource', () => {
  it('riporta le dimensioni della foto', () => {
    const s = rawPhotoSource(gradient(80, 40));
    expect([s.width, s.height]).toEqual([80, 40]);
  });

  it('work non cambia una foto già abbastanza piccola', () => {
    const img = gradient(80, 40);
    expect(rawPhotoSource(img).work(100)).toBe(img);
  });

  it('work riduce la foto tenendo le proporzioni', async () => {
    const w = await rawPhotoSource(gradient(80, 40)).work(40);
    expect([w.width, w.height]).toEqual([40, 20]);
  });

  it('crop ritaglia il rettangolo e lo porta alla dimensione richiesta', async () => {
    const c = await rawPhotoSource(gradient(80, 40)).crop(
      { x: 10, y: 5, width: 20, height: 10 },
      40,
      20,
    );
    expect([c.width, c.height]).toEqual([40, 20]);
    expect(c.data[0]).toBe(10); // il primo pixel è il pixel (10, 5) della foto
    expect(c.data[1]).toBe(5);
  });

  it('crop taglia il rettangolo ai bordi della foto', async () => {
    const c = await rawPhotoSource(gradient(80, 40)).crop(
      { x: 70, y: 30, width: 50, height: 50 },
      10,
      10,
    );
    expect([c.width, c.height]).toEqual([10, 10]);
  });
});

describe('isRawImage', () => {
  it("distingue un'immagine grezza da una sorgente", () => {
    expect(isRawImage(gradient(2, 2))).toBe(true);
    expect(isRawImage(rawPhotoSource(gradient(2, 2)))).toBe(false);
  });
});
