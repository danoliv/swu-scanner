import { describe, expect, it } from 'vitest';
import {
  doneProgress,
  followProgress,
  passFraction,
  READ_SHARE,
  readProgress,
  START,
  zoomProgress,
} from './progress.ts';

describe('passFraction', () => {
  it('va da poco dopo l’inizio della passata alla sua fine', () => {
    expect(passFraction(0, 2, 0, 10)).toBeCloseTo(0.075);
    expect(passFraction(0, 2, 10, 10)).toBeCloseTo(0.5);
    expect(passFraction(1, 2, 5, 10)).toBeGreaterThan(passFraction(1, 2, 0, 10));
    expect(passFraction(1, 2, 10, 10)).toBe(1);
  });
  it('senza righe la passata vale intera; i valori assurdi restano tra 0 e 1', () => {
    expect(passFraction(0, 2, 0, 0)).toBe(0.5);
    expect(passFraction(3, 2, 0, 0)).toBe(1);
    expect(passFraction(0, 0, 0, 0)).toBe(1);
    expect(passFraction(0, 1, Number.NaN, 4)).toBeGreaterThanOrEqual(0);
  });
});

describe('avanzamento complessivo', () => {
  it('la lettura occupa la prima parte, la rilettura ingrandita il resto', () => {
    expect(readProgress(0).fraction).toBe(0);
    expect(readProgress(1).fraction).toBe(READ_SHARE);
    expect(readProgress(7).fraction).toBe(READ_SHARE); // oltre 1 non esce dalla fase
    expect(zoomProgress(0, 4, 9)).toMatchObject({ stage: 'zoom', fraction: READ_SHARE, cards: 9 });
    expect(zoomProgress(2, 4, 9).fraction).toBeCloseTo(READ_SHARE + (1 - READ_SHARE) / 2);
    expect(zoomProgress(0, 0, 3).fraction).toBe(READ_SHARE);
    expect(doneProgress(9)).toMatchObject({ stage: 'done', fraction: 1, cards: 9 });
  });
});

describe('followProgress', () => {
  it('non torna mai indietro e ricorda le carte già trovate', () => {
    const a = followProgress(START, zoomProgress(3, 4, 9));
    const b = followProgress(a, readProgress(0.1)); // un messaggio in ritardo
    expect(b.fraction).toBe(a.fraction);
    expect(b.cards).toBe(9);
  });
  it('parte da zero se non c’è un avanzamento precedente', () => {
    expect(followProgress(null, readProgress(0.2)).fraction).toBeCloseTo(0.15);
  });
});
