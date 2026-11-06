// Controlli di integrità prima di pubblicare i dati (SPEC §7).
import type { Link } from './link-cardmarket.ts';

export interface IntegrityInput {
  links: readonly Link[];
  /** Tutti gli idProduct del catalogo Cardmarket di oggi. */
  productIds: ReadonlySet<number>;
  /** Quota massima, per set, di stampe senza collegamento. */
  maxUnlinkedRatio: number;
  /** idExpansion di tutti i prodotti di oggi e quelli noti (per segnalare i set nuovi). */
  productExpansions?: readonly number[];
  knownExpansions?: ReadonlySet<number>;
}

export interface IntegrityResult {
  /** Bloccano la pubblicazione. */
  errors: string[];
  /** Si segnalano ma non bloccano. */
  warnings: string[];
}

/** Normal e Foil dei set vecchi condividono il prodotto: si confrontano senza "Foil". */
const baseVariant = (v: string): string => v.replace(/\s*Foil$/i, '').trim() || 'Normal';

/** Nei set vecchi la stampa foil ha il numero della normale con una "F" (es. 254F). */
const baseNumber = (n: string): string => n.replace(/(?<=\d)F$/, '');

export function checkIntegrity(input: IntegrityInput): IntegrityResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const owners = new Map<number, Set<string>>();
  const perSet = new Map<string, { total: number; unlinked: number }>();
  for (const l of input.links) {
    const s = perSet.get(l.set) ?? { total: 0, unlinked: 0 };
    s.total++;
    if (l.idProduct === null) s.unlinked++;
    perSet.set(l.set, s);
    if (l.idProduct === null) continue;
    if (!input.productIds.has(l.idProduct)) {
      errors.push(
        `idProduct ${l.idProduct} (${l.set} ${l.number}) non esiste nel catalogo di oggi`,
      );
    }
    const variants = owners.get(l.idProduct) ?? new Set<string>();
    variants.add(`${l.set}|${baseNumber(l.number)}|${baseVariant(l.variantType)}`);
    owners.set(l.idProduct, variants);
  }

  for (const [id, stampe] of owners) {
    if (stampe.size > 1) {
      errors.push(`idProduct ${id} assegnato a stampe diverse: ${[...stampe].join(', ')}`);
    }
  }

  for (const [set, s] of perSet) {
    if (s.unlinked / s.total > input.maxUnlinkedRatio) {
      errors.push(
        `Set ${set}: ${s.unlinked} stampe su ${s.total} senza collegamento (oltre il ${Math.round(input.maxUnlinkedRatio * 100)}%)`,
      );
    }
  }

  if (input.productExpansions && input.knownExpansions) {
    const unknown = new Set(input.productExpansions.filter((e) => !input.knownExpansions?.has(e)));
    for (const e of unknown) warnings.push(`idExpansion sconosciuto: ${e}`);
  }

  return { errors, warnings };
}
