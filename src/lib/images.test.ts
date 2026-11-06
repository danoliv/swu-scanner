import { describe, expect, it } from 'vitest';
import { thumbnailUrl } from './images.ts';

describe('thumbnailUrl', () => {
  it("compone l'indirizzo dell'immagine da set e numero", () => {
    expect(thumbnailUrl('SOR', '059')).toBe('https://cdn.swu-db.com/images/cards/SOR/059.png');
    expect(thumbnailUrl('SOR', '059F')).toBe('https://cdn.swu-db.com/images/cards/SOR/059F.png');
  });
  it('usa il codice swu-db per i set promo rinominati', () => {
    expect(thumbnailUrl('SECP', '5')).toBe('https://cdn.swu-db.com/images/cards/SECOP/5.png');
  });
  it('codifica i caratteri speciali del percorso', () => {
    expect(thumbnailUrl('SOR', 'A/B')).toBe('https://cdn.swu-db.com/images/cards/SOR/A%2FB.png');
  });
});
