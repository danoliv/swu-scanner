import { describe, expect, it } from 'vitest';
import { zoomCrop } from './zoom.ts';

const image = { width: 1920, height: 1440 };

describe('zoomCrop', () => {
  it('copre il titolo e la zona sotto, dove sta il sottotitolo (carta dritta)', () => {
    const c = zoomCrop({ x: 400, y: 300, width: 200, height: 20 }, 0, image);
    expect(c.x).toBeLessThan(400);
    expect(c.x + c.width).toBeGreaterThan(600);
    expect(c.y).toBeLessThanOrEqual(300);
    expect(c.y + c.height).toBeGreaterThan(300 + 20 + 3 * 20); // almeno 3 righe sotto
  });

  it('con carta ruotata di 90° la zona sotto il titolo è a sinistra', () => {
    const title = { x: 800, y: 300, width: 20, height: 200 };
    const c = zoomCrop(title, 90, image);
    expect(c.x).toBeLessThan(800 - 3 * 20);
    expect(c.x + c.width).toBeGreaterThanOrEqual(800 + 20);
  });

  it('con 180° la zona sotto il titolo è in alto nella foto', () => {
    const title = { x: 800, y: 700, width: 200, height: 20 };
    const c = zoomCrop(title, 180, image);
    expect(c.y).toBeLessThan(700 - 3 * 20);
  });

  it('non esce mai dalla foto', () => {
    const c = zoomCrop({ x: 5, y: 5, width: 300, height: 30 }, 0, image);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(image.width);
    expect(c.y + c.height).toBeLessThanOrEqual(image.height);
    const d = zoomCrop({ x: 1700, y: 1400, width: 300, height: 30 }, 0, image);
    expect(d.x + d.width).toBeLessThanOrEqual(image.width);
    expect(d.y + d.height).toBeLessThanOrEqual(image.height);
  });
});
