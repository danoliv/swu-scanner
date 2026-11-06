import { describe, expect, it } from 'vitest';
import { bestMatch, makeMatcher, normalize, ocrKey, similarity } from './text-match.ts';

describe('normalize', () => {
  it('toglie accenti, maiuscole e punteggiatura', () => {
    expect(normalize('Chewbacca, Pyke Sentinel')).toBe('chewbacca pyke sentinel');
    expect(normalize('Général Krell')).toBe('general krell');
    expect(normalize("  Sabine's   Masterpiece ")).toBe('sabines masterpiece');
  });
  it('restituisce stringa vuota per input vuoto', () => {
    expect(normalize('')).toBe('');
  });
});

describe('similarity', () => {
  it('vale 1 per stringhe uguali dopo la normalizzazione', () => {
    expect(similarity('Darth Vader', 'DARTH  vader')).toBe(1);
  });
  it('vale 0 se una stringa è vuota', () => {
    expect(similarity('', 'abc')).toBe(0);
  });
  it('tollera un carattere letto male', () => {
    expect(similarity('Darth Vadar', 'Darth Vader')).toBeGreaterThan(0.9);
  });
  it('distingue titoli diversi', () => {
    expect(similarity('Luke Skywalker', 'Leia Organa')).toBeLessThan(0.5);
  });
});

describe('bestMatch', () => {
  const titles = ['Darth Vader', 'Luke Skywalker', 'Leia Organa'];
  it('trova il titolo più vicino sopra la soglia', () => {
    expect(bestMatch('Luke Skywaiker', titles, 0.9)).toEqual({
      title: 'Luke Skywalker',
      score: expect.any(Number),
    });
  });
  it('restituisce null sotto la soglia', () => {
    expect(bestMatch('Han Solo', titles, 0.9)).toBeNull();
  });
  it('restituisce null con elenco vuoto', () => {
    expect(bestMatch('Darth Vader', [], 0.9)).toBeNull();
  });
});

describe('makeMatcher', () => {
  const titles = ['Darth Vader', 'Luke Skywalker', 'Leia Organa', 'Han Solo'];
  it('dà lo stesso risultato di bestMatch', () => {
    const match = makeMatcher(titles, 0.9);
    for (const text of ['Luke Skywaiker', 'Han Solo', 'darth vader', 'Chewbacca', '', 'x']) {
      expect(match(text)).toEqual(bestMatch(text, titles, 0.9));
    }
  });
  it('sceglie il titolo più vicino tra due vicini', () => {
    const match = makeMatcher(['Rey Skywalker', 'Rey Skywalker II'], 0.8);
    expect(match('Rey Skywalker II')?.title).toBe('Rey Skywalker II');
  });
  it('scarta in fretta i titoli di lunghezza troppo diversa', () => {
    const match = makeMatcher(['A'], 0.9);
    expect(match('Un titolo lunghissimo che non c entra')).toBeNull();
  });
  it('restituisce null con elenco vuoto', () => {
    expect(makeMatcher([], 0.9)('Darth Vader')).toBeNull();
  });
  it('accetta una distanza di una lettera su titoli lunghi e non su corti', () => {
    const match = makeMatcher(['Luke Skywalker', 'Rey'], 0.9);
    expect(match('Luke Skywalkez')?.title).toBe('Luke Skywalker');
    expect(match('Rez')).toBeNull();
  });
});

describe('ocrKey', () => {
  it("unifica le confusioni tipiche dell'OCR tra cifre e lettere", () => {
    expect(ocrKey('K-2S0')).toBe(ocrKey('K-2SO'));
    expect(ocrKey('IG-BB')).toBe(ocrKey('IG-88'));
  });
  it('ignora gli spazi mancanti o in più', () => {
    expect(ocrKey('BOBAFETT')).toBe(ocrKey('Boba Fett'));
  });
  it('tiene distinti titoli diversi', () => {
    expect(ocrKey('Luke Skywalker')).not.toBe(ocrKey('Leia Organa'));
  });
});

describe('similarity e makeMatcher con una chiave di confronto', () => {
  it('similarity confronta con la chiave data', () => {
    expect(similarity('K-2S0', 'K-2SO')).toBeLessThan(1);
    expect(similarity('K-2S0', 'K-2SO', ocrKey)).toBe(1);
  });
  it('makeMatcher trova un titolo letto con 0 al posto di O', () => {
    const m = makeMatcher(["K-2SO, Cassian's Counterpart"], 0.9, ocrKey);
    expect(m('K-2S0, Cassians Counterpart')?.title).toBe("K-2SO, Cassian's Counterpart");
  });
});
