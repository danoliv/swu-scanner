// Esportazione e importazione CSV della Lista (SPEC §6). Formato: una riga per voce, UTF-8, virgole,
// campi tra virgolette secondo RFC 4180; in lettura si accettano anche `;` e il BOM.

export const CSV_COLUMNS = [
  'quantity',
  'name',
  'subtitle',
  'set',
  'number',
  'variant',
  'finish',
  'idProduct',
  'price_eur',
] as const;

export interface CsvListRow {
  quantity: number;
  name: string;
  subtitle: string;
  set: string;
  number: string;
  variant: string;
  /** 'normal', 'foil' o '' (da scegliere). */
  finish: string;
  idProduct: number | null;
  /** Prezzo unitario in euro con il punto ("18.67"), o '' se non disponibile. */
  priceEur: string;
}

/** Un campo che inizia con questi caratteri sarebbe una formula per Excel e Fogli Google. */
const FORMULA = /^[=+\-@\t\r]/;

function field(value: string): string {
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly CsvListRow[]): string {
  const lines = rows.map((r) =>
    [
      String(r.quantity),
      field(r.name),
      field(r.subtitle),
      field(r.set),
      field(r.number),
      field(r.variant),
      field(r.finish),
      r.idProduct === null ? '' : String(r.idProduct),
      r.priceEur,
    ].join(','),
  );
  return [CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n';
}

/** Legge un CSV in righe di campi. Il separatore (`,` o `;`) si riconosce dalla prima riga. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const endField = (): void => {
    row.push(cur);
    cur = '';
  };
  const endRow = (): void => {
    endField();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) endField();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else cur += c;
  }
  if (cur !== '' || row.length > 0) endRow();
  return rows;
}

export interface ParsedList {
  rows: CsvListRow[];
  /** Messaggi per le righe scartate o corrette. */
  errors: string[];
}

const unformula = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

export function parseListCsv(text: string): ParsedList {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  if (col('name') === -1) {
    return {
      rows: [],
      errors: ['Colonna "name" mancante: il file non sembra una Lista esportata'],
    };
  }
  const rows: CsvListRow[] = [];
  const errors: string[] = [];
  for (const [i, cells] of table.slice(1).entries()) {
    const line = i + 2;
    const get = (name: string): string => unformula((cells[col(name)] ?? '').trim());
    const name = get('name');
    if (!name) {
      errors.push(`Riga ${line}: nome mancante, scartata`);
      continue;
    }
    const q = Number.parseInt(get('quantity'), 10);
    if (!Number.isFinite(q) || q < 1) errors.push(`Riga ${line}: quantità non valida, uso 1`);
    const id = Number.parseInt(get('idproduct'), 10);
    const finish = get('finish');
    rows.push({
      quantity: Number.isFinite(q) && q >= 1 ? Math.min(q, 999) : 1,
      name,
      subtitle: get('subtitle'),
      set: get('set'),
      number: get('number'),
      variant: get('variant'),
      finish: finish === 'normal' || finish === 'foil' ? finish : '',
      idProduct: Number.isFinite(id) && id > 0 ? id : null,
      priceEur: get('price_eur'),
    });
  }
  return { rows, errors };
}
