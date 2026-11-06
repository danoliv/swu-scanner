// Miniature delle versioni (SPEC §3): immagini di cdn.swu-db.com, caricate solo quando la riga è aperta.
// Nessuna immagine sta nel repo; se un giorno vengono bloccate, si tolgono.
import { imageSet } from './set-codes.ts';

const BASE = 'https://cdn.swu-db.com/images/cards';

export function thumbnailUrl(set: string, number: string): string {
  return `${BASE}/${encodeURIComponent(imageSet(set))}/${encodeURIComponent(number)}.png`;
}
