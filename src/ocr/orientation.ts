// Scelta dell'orientamento di una riga di testo: si legge nel verso più probabile e solo se la
// fiducia è bassa si prova anche il verso opposto (ruotato di 180°), tenendo la lettura migliore.
export interface Reading {
  text: string;
  confidence: number;
}

export async function readBestOrientation<T extends Reading>(
  primary: () => Promise<T>,
  flipped: () => Promise<T>,
  acceptAbove: number,
): Promise<{ reading: T; flipped: boolean }> {
  const first = await primary();
  if (first.confidence >= acceptAbove) return { reading: first, flipped: false };
  const second = await flipped();
  return second.confidence > first.confidence
    ? { reading: second, flipped: true }
    : { reading: first, flipped: false };
}
