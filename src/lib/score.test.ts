import { describe, expect, it } from 'vitest';
import { scoreDetection, type TruthCard } from './score.ts';
import type { DetectedCard } from './detect-cards.ts';

const box = { x: 0, y: 0, width: 10, height: 10 };
const rec = (name: string, subtitle: string | null): DetectedCard => ({
  status: 'recognized',
  candidates: [{ name, subtitle }],
  titleBox: box,
  rotation: 0,
});
const choose = (...c: [string, string | null][]): DetectedCard => ({
  status: 'choose',
  candidates: c.map(([name, subtitle]) => ({ name, subtitle })),
  titleBox: box,
  rotation: 0,
});
const t = (name: string, subtitle: string | null): TruthCard => ({ name, subtitle });

describe('scoreDetection', () => {
  it('conta le riconosciute giuste', () => {
    const s = scoreDetection([t('Luke', 'Faithful Friend')], [rec('Luke', 'Faithful Friend')]);
    expect(s).toMatchObject({ truth: 1, recognizedCorrect: 1, missed: 0, falseRows: 0 });
  });
  it('con la verità solo-titolo vale qualsiasi carta con quel titolo', () => {
    const s = scoreDetection([t('Luke', null)], [rec('Luke', 'Faithful Friend')]);
    expect(s.recognizedCorrect).toBe(1);
  });
  it('confronta titoli e sottotitoli ignorando maiuscole e accenti', () => {
    const s = scoreDetection([t('Général Krell', 'X')], [rec('GENERAL KRELL', 'x')]);
    expect(s.recognizedCorrect).toBe(1);
  });
  it('un sottotitolo sbagliato con titolo giusto è un errore silenzioso', () => {
    const s = scoreDetection([t('Vader', 'A')], [rec('Vader', 'B')]);
    expect(s).toMatchObject({ recognizedCorrect: 0, wrongSilent: 1, missed: 0 });
  });
  it('"da scegliere" è giusta se la carta vera è tra le candidate', () => {
    const s = scoreDetection([t('Vader', 'A')], [choose(['Vader', 'B'], ['Vader', 'A'])]);
    expect(s).toMatchObject({ chooseCorrect: 1, chooseWrong: 0 });
  });
  it('"da scegliere" senza la carta vera tra le candidate è sbagliata', () => {
    const s = scoreDetection([t('Vader', 'A')], [choose(['Vader', 'B'])]);
    expect(s).toMatchObject({ chooseCorrect: 0, chooseWrong: 1 });
  });
  it('una riga che non corrisponde a nessuna carta vera è una riga falsa', () => {
    const s = scoreDetection([t('Luke', null)], [rec('Leia', null)]);
    expect(s).toMatchObject({ falseRows: 1, missed: 1 });
  });
  it('le carte vere non trovate sono "mancate"', () => {
    const s = scoreDetection([t('Luke', null), t('Leia', null)], [rec('Luke', null)]);
    expect(s.missed).toBe(1);
  });
  it('ogni carta vera si può usare una volta sola (copie doppie)', () => {
    const s = scoreDetection([t('Luke', null)], [rec('Luke', null), rec('Luke', null)]);
    expect(s).toMatchObject({ recognizedCorrect: 1, falseRows: 1 });
  });
});
