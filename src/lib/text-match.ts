// Confronto approssimato tra il testo letto dall'OCR e i titoli del Catalogo (SPEC §5).

/** Minuscole, senza accenti né punteggiatura, spazi singoli. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/**
 * Chiave di confronto tollerante agli errori tipici dell'OCR: cifre al posto di lettere
 * (0↔O, 1↔L, 5↔S, 8↔B) e spazi mancanti o in più. Si applica a entrambi i lati del confronto.
 */
export function ocrKey(text: string): string {
  return normalize(text)
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/ /g, '');
}

/** Somiglianza tra 0 e 1 (1 = uguali dopo la normalizzazione, o dopo `key` se data). */
export function similarity(a: string, b: string, key: (t: string) => string = normalize): number {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export interface Match {
  title: string;
  score: number;
}

/** Il titolo più simile con somiglianza >= soglia, oppure null. */
export function bestMatch(
  text: string,
  titles: readonly string[],
  threshold: number,
): Match | null {
  let best: Match | null = null;
  for (const title of titles) {
    const score = similarity(text, title);
    if (score >= threshold && (!best || score > best.score)) best = { title, score };
  }
  return best;
}

/** Distanza di modifica limitata: restituisce `max + 1` appena supera `max`. */
function levenshteinWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/**
 * Come `bestMatch`, ma i titoli si normalizzano una volta sola e la distanza si ferma appena
 * supera quella ammessa dalla soglia: serve per confrontare ogni riga con migliaia di titoli.
 */
export function makeMatcher(
  titles: readonly string[],
  threshold: number,
  key: (t: string) => string = normalize,
): (text: string) => Match | null {
  const normalized = titles.map(key);
  return (text) => {
    const x = key(text);
    if (!x) return null;
    let best: Match | null = null;
    for (let i = 0; i < normalized.length; i++) {
      const y = normalized[i];
      if (!y) continue;
      const maxLen = Math.max(x.length, y.length);
      const maxDist = Math.floor((1 - threshold) * maxLen + 1e-9);
      if (Math.abs(x.length - y.length) > maxDist) continue;
      const d = x === y ? 0 : levenshteinWithin(x, y, maxDist);
      if (d > maxDist) continue;
      const score = 1 - d / maxLen;
      if (score >= threshold && (!best || score > best.score))
        best = { title: titles[i] ?? '', score };
    }
    return best;
  };
}
