import { describe, expect, it } from 'vitest';
import {
  addEntry,
  clearSharedPrices,
  mergeEntries,
  removeEntry,
  setQuantity,
  summarize,
  updateEntry,
  type EntryPrice,
  type ListEntry,
} from './list.ts';

let n = 0;
const newId = (): string => `e${++n}`;
const base = { cardKey: 'luke|faithful friend', idProduct: 100, finish: 'normal' as const };

describe('addEntry', () => {
  it('aggiunge una voce con quantità 1', () => {
    const list = addEntry([], base, newId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ...base, quantity: 1 });
    expect(list[0]?.id).toMatch(/^e/);
  });

  it("aumenta la quantità se la stessa carta, versione e finitura c'è già", () => {
    const once = addEntry([], base, newId);
    const twice = addEntry(once, base, newId);
    expect(twice).toHaveLength(1);
    expect(twice[0]?.quantity).toBe(2);
  });

  it('tiene separate versioni e finiture diverse', () => {
    let list = addEntry([], base, newId);
    list = addEntry(list, { ...base, idProduct: 101 }, newId);
    list = addEntry(list, { ...base, finish: 'foil' }, newId);
    expect(list).toHaveLength(3);
  });

  it('unisce anche le carte ancora "da scegliere"', () => {
    const toChoose = { cardKey: 'vader', idProduct: null, finish: null };
    const list = addEntry(addEntry([], toChoose, newId), toChoose, newId);
    expect(list).toHaveLength(1);
    expect(list[0]?.quantity).toBe(2);
  });

  it('non modifica la lista di partenza', () => {
    const start: ListEntry[] = [];
    addEntry(start, base, newId);
    expect(start).toEqual([]);
  });
});

describe('titolo locale', () => {
  it('la voce tiene il titolo nella lingua della carta', () => {
    const local = { name: 'Dark Vador', subtitle: 'Seigneur noir des Sith' };
    const list = addEntry([], { ...base, local }, newId);
    expect(list[0]?.local).toEqual(local);
  });
  it('unendo due voci uguali si tiene il titolo locale della prima', () => {
    const local = { name: 'Dark Vador', subtitle: null };
    let list = addEntry([], { ...base, local }, newId);
    list = addEntry(list, { ...base }, newId);
    expect(list[0]?.quantity).toBe(2);
    expect(list[0]?.local).toEqual(local);
  });
  it("senza titolo locale il campo non c'è", () => {
    expect(addEntry([], base, newId)[0]).not.toHaveProperty('local');
  });
});

describe('updateEntry', () => {
  it('cambia versione e finitura di una voce', () => {
    const list = addEntry([], { cardKey: 'vader', idProduct: null, finish: null }, newId);
    const id = list[0]?.id as string;
    const updated = updateEntry(list, id, { idProduct: 7, finish: 'foil' });
    expect(updated[0]).toMatchObject({ id, idProduct: 7, finish: 'foil', quantity: 1 });
  });

  it('si unisce a una voce uguale già presente sommando le quantità', () => {
    let list = addEntry([], base, newId);
    list = addEntry(list, { ...base, idProduct: 200 }, newId);
    const second = list[1]?.id as string;
    const merged = updateEntry(list, second, { idProduct: 100 });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(2);
  });

  it('non fa nulla per un id sconosciuto', () => {
    const list = addEntry([], base, newId);
    expect(updateEntry(list, 'nope', { idProduct: 5 })).toEqual(list);
  });
});

describe('setQuantity / removeEntry', () => {
  it('imposta la quantità', () => {
    const list = addEntry([], base, newId);
    expect(setQuantity(list, list[0]?.id as string, 5)[0]?.quantity).toBe(5);
  });
  it('rimuove la voce con quantità 0 o negativa', () => {
    const list = addEntry([], base, newId);
    expect(setQuantity(list, list[0]?.id as string, 0)).toEqual([]);
    expect(setQuantity(list, list[0]?.id as string, -2)).toEqual([]);
  });
  it('arrotonda e limita le quantità non intere o enormi', () => {
    const list = addEntry([], base, newId);
    const id = list[0]?.id as string;
    expect(setQuantity(list, id, 2.7)[0]?.quantity).toBe(3);
    expect(setQuantity(list, id, 100000)[0]?.quantity).toBe(999);
  });
  it('rimuove una voce', () => {
    const list = addEntry(addEntry([], base, newId), { ...base, idProduct: 9 }, newId);
    expect(removeEntry(list, list[0]?.id as string)).toHaveLength(1);
  });
});

describe('summarize', () => {
  const entries: ListEntry[] = [
    { id: 'a', cardKey: 'a', idProduct: 1, finish: 'normal', quantity: 2 },
    { id: 'b', cardKey: 'b', idProduct: 2, finish: 'foil', quantity: 1 },
    { id: 'c', cardKey: 'c', idProduct: null, finish: null, quantity: 3 },
    { id: 'd', cardKey: 'd', idProduct: 4, finish: 'normal', quantity: 1 },
    { id: 'e', cardKey: 'e', idProduct: 5, finish: 'normal', quantity: 2 },
  ];
  const prices: Record<string, EntryPrice> = {
    a: { status: 'chosen', cents: 100, kind: 'trend' },
    b: { status: 'chosen', cents: 250, kind: 'low' },
    c: { status: 'to-choose' },
    d: { status: 'unavailable' },
    e: { status: 'chosen', cents: 30, kind: 'trend' },
  };
  const result = summarize(entries, (e) => prices[e.id] as EntryPrice);

  it('somma i prezzi scelti per la quantità', () => {
    expect(result.totalCents).toBe(2 * 100 + 250 + 2 * 30);
  });
  it('conta le carte da scegliere (con la quantità)', () => {
    expect(result.toChoose).toBe(3);
  });
  it('conta i prezzi "da" (solo minimo) e quelli non disponibili', () => {
    expect(result.lowCount).toBe(1);
    expect(result.unavailable).toBe(1);
  });
  it('conta tutte le carte con le quantità', () => {
    expect(result.cards).toBe(2 + 1 + 3 + 1 + 2);
  });
  it('per una lista vuota è tutto a zero', () => {
    expect(summarize([], () => ({ status: 'to-choose' }))).toEqual({
      totalCents: 0,
      toChoose: 0,
      lowCount: 0,
      unavailable: 0,
      cards: 0,
    });
  });
});

describe('Lista condivisa', () => {
  const price = { cents: 500, kind: 'trend' as const, date: '2026-11-07' };
  const mk = (over: Partial<ListEntry>): ListEntry => ({ id: 'a', ...base, quantity: 1, ...over });

  it('mergeEntries somma le voci già presenti e tiene il loro prezzo', () => {
    const own = mk({ quantity: 2 });
    const out = mergeEntries([own], [{ ...base, quantity: 3, shared: price }], newId);
    expect(out.merged).toBe(1);
    expect(out.list).toEqual([{ ...own, quantity: 5 }]);
  });

  it('mergeEntries aggiunge le voci nuove con il prezzo ricevuto', () => {
    const out = mergeEntries([], [{ ...base, quantity: 2, shared: price }], newId);
    expect(out.merged).toBe(0);
    expect(out.list).toHaveLength(1);
    expect(out.list[0]).toMatchObject({ quantity: 2, shared: price });
  });

  it('mergeEntries non supera 999 carte', () => {
    const out = mergeEntries([mk({ quantity: 998 })], [{ ...base, quantity: 5 }], newId);
    expect(out.list[0]?.quantity).toBe(999);
  });

  it('cambiare versione toglie il prezzo ricevuto', () => {
    const out = updateEntry([mk({ shared: price })], 'a', { idProduct: 200 });
    expect(out[0]?.shared).toBeUndefined();
  });

  it('clearSharedPrices toglie i prezzi ricevuti e lascia il resto', () => {
    const out = clearSharedPrices([mk({ shared: price }), mk({ id: 'b' })]);
    expect(out.every((e) => e.shared === undefined)).toBe(true);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
