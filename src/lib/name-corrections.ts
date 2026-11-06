// Tabella di correzione dei nomi errati di swu-db (SPEC §7): corrisponde esattamente, mai per sottostringa.

export type Corrections = Readonly<Record<string, string>>;

export function correctName(name: string, table: Corrections): string {
  return Object.hasOwn(table, name) ? (table[name] as string) : name;
}

/** Valida una tabella letta da JSON. */
export function loadCorrections(raw: Record<string, unknown>): Corrections {
  const out: Record<string, string> = {};
  for (const [wrong, right] of Object.entries(raw)) {
    if (typeof right !== 'string')
      throw new Error(`Correzione per "${wrong}": il valore non è una stringa`);
    if (wrong === right) throw new Error(`Correzione per "${wrong}": nome uguale al corretto`);
    out[wrong] = right;
  }
  for (const right of Object.values(out)) {
    if (Object.hasOwn(out, right)) throw new Error(`Catena di correzioni su "${right}"`);
  }
  return out;
}
