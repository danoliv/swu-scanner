// Lista e impostazioni sul telefono (localStorage). Ogni lettura e scrittura è protetta: l'archivio può
// mancare, essere pieno o bloccato (finestra privata, dati del sito cancellati) e il sito deve funzionare.
import type { ListEntry } from '../lib/list.ts';
import { LOCALES, type Locale } from './i18n.ts';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LIST_KEY = 'swu-scanner:list:v1';
const SETTINGS_KEY = 'swu-scanner:settings:v1';

function read(store: KV | null, key: string): unknown {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(store: KV | null, key: string, value: unknown): boolean {
  try {
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function validEntry(e: unknown): e is ListEntry {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.cardKey === 'string' &&
    (x.idProduct === null || (typeof x.idProduct === 'number' && Number.isInteger(x.idProduct))) &&
    (x.finish === null || x.finish === 'normal' || x.finish === 'foil') &&
    typeof x.quantity === 'number' &&
    Number.isInteger(x.quantity) &&
    x.quantity >= 1 &&
    x.quantity <= 999
  );
}

function validLocal(l: unknown): l is NonNullable<ListEntry['local']> {
  if (typeof l !== 'object' || l === null) return false;
  const x = l as Record<string, unknown>;
  return typeof x.name === 'string' && (x.subtitle === null || typeof x.subtitle === 'string');
}

export function loadList(store: KV | null): ListEntry[] {
  const data = read(store, LIST_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter(validEntry).map((e) => {
    if (e.local === undefined || validLocal(e.local)) return e;
    const clean: ListEntry = { ...e };
    delete clean.local;
    return clean;
  });
}

export function saveList(store: KV | null, list: readonly ListEntry[]): boolean {
  return write(store, LIST_KEY, list);
}

export type ReadingModel = 'light' | 'precise';

export interface Settings {
  /** Lingua scelta dall'utente; null = quella del telefono. */
  locale: Locale | null;
  model: ReadingModel;
}

export function loadSettings(store: KV | null): Settings {
  const data = read(store, SETTINGS_KEY) as Partial<Record<keyof Settings, unknown>> | null;
  const locale = LOCALES.find((l) => l === data?.locale) ?? null;
  const model = data?.model === 'precise' ? 'precise' : 'light';
  return { locale, model };
}

export function saveSettings(store: KV | null, settings: Settings): boolean {
  return write(store, SETTINGS_KEY, settings);
}
