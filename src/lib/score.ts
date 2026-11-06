// Confronto tra le carte rilevate in una foto e il riferimento (verita.csv), per le soglie di SPEC §11.
import type { DetectedCard } from './detect-cards.ts';
import { normalize } from './text-match.ts';

export interface TruthCard {
  name: string;
  /** null = nel riferimento c'è solo il titolo: vale qualsiasi carta con quel titolo. */
  subtitle: string | null;
}

export interface Score {
  truth: number;
  recognizedCorrect: number;
  /** Riconosciuta con titolo giusto e sottotitolo sbagliato: l'errore silenzioso. */
  wrongSilent: number;
  chooseCorrect: number;
  chooseWrong: number;
  /** Righe rilevate che non corrispondono a nessuna carta vera rimasta. */
  falseRows: number;
  /** Carte vere senza nessuna riga. */
  missed: number;
}

const sameName = (a: string, b: string): boolean => normalize(a) === normalize(b);
type Candidate = {
  name: string;
  subtitle: string | null;
  ref?: { name: string; subtitle: string | null };
};
/** Il riferimento è in inglese: se la candidata ha un nome in un'altra lingua si usa la sua Carta (`ref`). */
const canon = (c: Candidate): { name: string; subtitle: string | null } => c.ref ?? c;
const matches = (t: TruthCard, c: Candidate): boolean =>
  sameName(t.name, canon(c).name) &&
  (t.subtitle === null || normalize(t.subtitle) === normalize(canon(c).subtitle ?? ''));

export function scoreDetection(
  truth: readonly TruthCard[],
  detected: readonly DetectedCard[],
): Score {
  const left = [...truth];
  const s: Score = {
    truth: truth.length,
    recognizedCorrect: 0,
    wrongSilent: 0,
    chooseCorrect: 0,
    chooseWrong: 0,
    falseRows: 0,
    missed: 0,
  };
  const take = (i: number): void => void left.splice(i, 1);

  for (const d of detected) {
    const exact = left.findIndex((t) => d.candidates.some((c) => matches(t, c)));
    if (d.status === 'recognized') {
      if (exact !== -1) {
        s.recognizedCorrect++;
        take(exact);
        continue;
      }
      const sameTitle = left.findIndex((t) =>
        d.candidates.some((c) => sameName(t.name, canon(c).name)),
      );
      if (sameTitle !== -1) {
        s.wrongSilent++;
        take(sameTitle);
      } else s.falseRows++;
    } else {
      if (exact !== -1) {
        s.chooseCorrect++;
        take(exact);
        continue;
      }
      const sameTitle = left.findIndex((t) =>
        d.candidates.some((c) => sameName(t.name, canon(c).name)),
      );
      if (sameTitle !== -1) {
        s.chooseWrong++;
        take(sameTitle);
      } else s.falseRows++;
    }
  }
  s.missed = left.length;
  return s;
}
