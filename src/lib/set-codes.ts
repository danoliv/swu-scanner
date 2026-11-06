// I due database nominano i set promo in modo diverso (SPEC §5): swu-db usa `SECOP`,
// il sito ufficiale `SECP`. Qui si unificano solo le corrispondenze verificate nei
// dump del 2026-10-18; ogni altro codice resta com'è.

/** Codice swu-db → codice ufficiale (forma canonica del sito). */
const SWUDB_TO_CANONICAL: Readonly<Record<string, string>> = {
  SECOP: 'SECP',
  ASHOP: 'ASHP',
  JTLOP: 'JTLP',
  LOFOP: 'LOFP',
};

/** Set promo noto → set di base. */
const PROMO_BASE: Readonly<Record<string, string>> = {
  SECP: 'SEC',
  ASHP: 'ASH',
  JTLP: 'JTL',
  LOFP: 'LOF',
  HMWP: 'HMW',
  LAWP: 'LAW',
};

export function canonicalSet(code: string): string {
  const c = code.toUpperCase();
  return SWUDB_TO_CANONICAL[c] ?? c;
}

export function isPromoSet(code: string): boolean {
  return Object.hasOwn(PROMO_BASE, canonicalSet(code));
}

export function baseSet(code: string): string {
  const c = canonicalSet(code);
  return PROMO_BASE[c] ?? c;
}

/** Il codice di set com'è nei percorsi delle immagini di swu-db (l'inverso di `canonicalSet`). */
export function imageSet(code: string): string {
  const c = code.toUpperCase();
  const hit = Object.entries(SWUDB_TO_CANONICAL).find(([, canonical]) => canonical === c);
  return hit ? hit[0] : c;
}
