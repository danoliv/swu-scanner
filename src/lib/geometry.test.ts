import { describe, expect, it } from 'vitest';
import { fromUpright, upright, type Box } from './geometry.ts';

const box: Box = { x: 10, y: 20, width: 30, height: 8 };

describe('upright / fromUpright', () => {
  it('con rotazione 0 non cambia nulla', () => {
    expect(upright(box, 0)).toEqual(box);
  });
  it('scambia larghezza e altezza con 90° e 270°', () => {
    expect(upright(box, 90)).toMatchObject({ width: 8, height: 30 });
    expect(upright(box, 270)).toMatchObject({ width: 8, height: 30 });
    expect(upright(box, 180)).toMatchObject({ width: 30, height: 8 });
  });
  it("fromUpright è l'inverso di upright per ogni rotazione", () => {
    for (const r of [0, 90, 180, 270] as const) {
      expect(fromUpright(upright(box, r), r)).toEqual(box);
    }
  });
  it('con 90° il "sotto" della carta è a sinistra nella foto', () => {
    const title = upright({ x: 300, y: 100, width: 24, height: 200 }, 90);
    const left = upright({ x: 270, y: 100, width: 24, height: 200 }, 90);
    expect(left.y).toBeGreaterThan(title.y);
  });
});
