import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, parseCsv, parseListCsv, toCsv, type CsvListRow } from './list-csv.ts';

const row = (over: Partial<CsvListRow> = {}): CsvListRow => ({
  quantity: 2,
  name: 'Darth Vader',
  subtitle: 'Dark Lord of the Sith',
  set: 'SOR',
  number: '010',
  variant: 'Hyperspace Foil',
  finish: 'foil',
  idProduct: 123456,
  priceEur: '18.67',
  language: 'fr',
  ...over,
});

describe('toCsv', () => {
  it("scrive l'intestazione e una riga per voce", () => {
    const lines = toCsv([row()]).trimEnd().split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]).toBe(
      '2,Darth Vader,Dark Lord of the Sith,SOR,010,Hyperspace Foil,foil,123456,18.67,fr',
    );
  });

  it('mette tra virgolette i campi con virgole, virgolette o a capo', () => {
    const csv = toCsv([row({ name: 'Tarfful, Kashyyyk "Chief"', subtitle: 'a\nb' })]);
    expect(csv).toContain('"Tarfful, Kashyyyk ""Chief"""');
    expect(csv).toContain('"a\nb"');
  });

  it('lascia vuoti set, numero e prodotto per le voci da scegliere', () => {
    const csv = toCsv([
      row({
        set: '',
        number: '',
        variant: '',
        finish: '',
        idProduct: null,
        priceEur: '',
        language: '',
      }),
    ]);
    expect(csv.trimEnd().split('\r\n')[1]).toBe('2,Darth Vader,Dark Lord of the Sith,,,,,,,');
  });

  it('neutralizza le formule per i fogli di calcolo', () => {
    const csv = toCsv([row({ name: '=HYPERLINK("http://x")' })]);
    expect(csv).toContain('"\'=HYPERLINK(');
  });

  it("con una lista vuota scrive solo l'intestazione", () => {
    expect(toCsv([])).toBe(CSV_COLUMNS.join(',') + '\r\n');
  });
});

describe('parseCsv', () => {
  it('legge campi semplici, tra virgolette e con virgolette doppie', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });
  it('accetta a capo nei campi tra virgolette e righe senza a capo finale', () => {
    expect(parseCsv('a,"x\ny"\n1,2')).toEqual([
      ['a', 'x\ny'],
      ['1', '2'],
    ]);
  });
  it('salta le righe vuote e toglie il BOM', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('riconosce il punto e virgola come separatore (Excel italiano)', () => {
    expect(parseCsv('a;b\n1;2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseListCsv', () => {
  it('rilegge quello che toCsv ha scritto', () => {
    const rows = [row(), row({ name: 'Tarfful, "T"', idProduct: null, finish: '', priceEur: '' })];
    const back = parseListCsv(toCsv(rows));
    expect(back.rows).toHaveLength(2);
    expect(back.rows[0]).toMatchObject({
      quantity: 2,
      name: 'Darth Vader',
      idProduct: 123456,
      finish: 'foil',
    });
    expect(back.rows[1]).toMatchObject({ name: 'Tarfful, "T"', idProduct: null });
    expect(back.errors).toEqual([]);
  });

  it("toglie l'apostrofo messo contro le formule", () => {
    const back = parseListCsv(toCsv([row({ name: '=2+2' })]));
    expect(back.rows[0]?.name).toBe('=2+2');
  });

  it('accetta colonne in qualsiasi ordine e ne ignora di extra', () => {
    const csv = 'name,extra,quantity\nLuke,zzz,3\n';
    expect(parseListCsv(csv).rows[0]).toMatchObject({ name: 'Luke', quantity: 3 });
  });

  it('con quantità mancante o non valida usa 1 e segnala la riga', () => {
    const r = parseListCsv('quantity,name\n,Luke\nx,Leia\n');
    expect(r.rows.map((x) => x.quantity)).toEqual([1, 1]);
    expect(r.errors).toHaveLength(2);
  });

  it('scarta le righe senza nome e le segnala', () => {
    const r = parseListCsv('quantity,name\n2,\n1,Luke\n');
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });

  it('rifiuta un file senza la colonna "name"', () => {
    const r = parseListCsv('foo,bar\n1,2\n');
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatch(/name/);
  });

  it('ignora una finitura sconosciuta', () => {
    expect(parseListCsv('name,finish\nLuke,sparkly\n').rows[0]?.finish).toBe('');
  });
});

describe('lingua nel CSV', () => {
  it('si scrive e si rilegge; una lingua sconosciuta diventa vuota', () => {
    const back = parseListCsv(toCsv([row({ language: 'de' })]));
    expect(back.rows[0]?.language).toBe('de');
    const odd = parseListCsv(toCsv([row({ language: 'klingon' })]));
    expect(odd.rows[0]?.language).toBe('');
  });
  it('un CSV senza la colonna (vecchio) si legge senza lingua', () => {
    const old =
      'quantity,name,subtitle,set,number,variant,finish,idProduct,price_eur\r\n1,Darth Vader,X,,,,,,\r\n';
    expect(parseListCsv(old).rows[0]?.language).toBe('');
  });
});
