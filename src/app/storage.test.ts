import { describe, expect, it } from 'vitest';
import { loadList, loadSettings, saveList, saveSettings, type KV } from './storage.ts';
import type { ListEntry } from '../lib/list.ts';

function memory(initial: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}
const broken: KV = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

const entry: ListEntry = { id: 'a', cardKey: 'vader|x', idProduct: 5, finish: 'foil', quantity: 2 };

describe('lista', () => {
  it('salva e rilegge la lista', () => {
    const store = memory();
    expect(saveList(store, [entry])).toBe(true);
    expect(loadList(store)).toEqual([entry]);
  });
  it('torna vuota senza archivio, con dati assenti, rovinati o di forma sbagliata', () => {
    expect(loadList(null)).toEqual([]);
    expect(loadList(memory())).toEqual([]);
    expect(loadList(broken)).toEqual([]);
    expect(loadList(memory({ 'swu-scanner:list:v1': '{non json' }))).toEqual([]);
    expect(loadList(memory({ 'swu-scanner:list:v1': '{"a":1}' }))).toEqual([]);
  });
  it('tiene il titolo locale valido e ignora quello malformato', () => {
    const store = memory({
      'swu-scanner:list:v1': JSON.stringify([
        { ...entry, id: 'a', local: { name: 'Dark Vador', subtitle: null } },
        { ...entry, id: 'b', local: { name: 3 } },
        { ...entry, id: 'c', local: 'x' },
      ]),
    });
    const list = loadList(store);
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(list[0]?.local).toEqual({ name: 'Dark Vador', subtitle: null });
    expect(list[1]).not.toHaveProperty('local');
    expect(list[2]).not.toHaveProperty('local');
  });
  it('scarta le voci non valide e tiene le altre', () => {
    const store = memory({
      'swu-scanner:list:v1': JSON.stringify([
        entry,
        { id: 'b' },
        { ...entry, id: 'c', quantity: 0 },
        { ...entry, id: 'd', finish: 'sparkly' },
        { ...entry, id: 'e', idProduct: null, finish: null },
        'testo',
        null,
      ]),
    });
    expect(loadList(store).map((e) => e.id)).toEqual(['a', 'e']);
  });
  it('saveList segnala il fallimento (spazio pieno, archivio bloccato) senza lanciare', () => {
    expect(saveList(broken, [entry])).toBe(false);
    expect(saveList(null, [entry])).toBe(false);
  });
});

describe('impostazioni', () => {
  it('hanno valori predefiniti', () => {
    expect(loadSettings(memory())).toEqual({ locale: null, model: 'light' });
    expect(loadSettings(null)).toEqual({ locale: null, model: 'light' });
  });
  it('salvano e rileggono lingua e modello', () => {
    const store = memory();
    saveSettings(store, { locale: 'de', model: 'precise' });
    expect(loadSettings(store)).toEqual({ locale: 'de', model: 'precise' });
  });
  it('ignorano valori sconosciuti', () => {
    const store = memory({ 'swu-scanner:settings:v1': '{"locale":"xx","model":"huge"}' });
    expect(loadSettings(store)).toEqual({ locale: null, model: 'light' });
  });
  it("saveSettings non lancia se l'archivio è bloccato", () => {
    expect(saveSettings(broken, { locale: 'it', model: 'light' })).toBe(false);
  });
});
