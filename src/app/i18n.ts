// Interfaccia localizzata (SPEC §1): inglese, francese, tedesco, spagnolo, italiano; lingua del
// telefono o del browser, inglese se non è tra le cinque.
import { MESSAGES, type MessageKey } from './messages.ts';

export const LOCALES = ['en', 'fr', 'de', 'es', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

export function detectLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split(/[-_]/)[0];
    const hit = LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return 'en';
}

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

type Table = Partial<Record<MessageKey, string | Record<string, string>>>;

export function createT(
  locale: Locale,
  tables: Partial<Record<Locale, Table>> = MESSAGES,
): Translate {
  const plural = new Intl.PluralRules(locale);
  return (key, params = {}) => {
    const raw = tables[locale]?.[key] ?? tables.en?.[key] ?? MESSAGES.en[key] ?? key;
    let text: string;
    if (typeof raw === 'string') text = raw;
    else {
      const form = typeof params.n === 'number' ? plural.select(params.n) : 'other';
      const forms: Record<string, string | undefined> = raw;
      text = forms[form] ?? forms.other ?? Object.values(raw)[0] ?? key;
    }
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    );
  };
}
