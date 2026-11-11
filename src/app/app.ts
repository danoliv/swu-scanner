// Le schermate dell'app: Scansiona (con "Da rivedere" e "Aggiungi una carta"), Lista, Impostazioni.
// Stato in un unico oggetto; ogni cambiamento ridisegna la schermata attiva.
import type { DetectedCard } from '../lib/detect-cards.ts';
import {
  addEntry,
  clearSharedPrices,
  mergeEntries,
  removeEntry,
  setQuantity,
  summarize,
  updateEntry,
  type ListEntry,
  type LocalTitle,
  type NewEntry,
} from '../lib/list.ts';
import { parseListCsv, toCsv } from '../lib/list-csv.ts';
import { decodeShare, encodeShare, shareCodeFromHash, shareUrl, toShared } from '../lib/share.ts';
import { priceAgeDays, pricesAreStale } from '../lib/freshness.ts';
import { thumbnailUrl } from '../lib/images.ts';
import { formatEuro, type Finish, type Quote } from '../lib/pricing.ts';
import type { Version } from '../lib/versions.ts';
import type { AppData } from './data.ts';
import { h, put } from './dom.ts';
import { createT, detectLocale, LOCALES, type Locale, type Translate } from './i18n.ts';
import type { InstallHelper } from './install.ts';
import type { MessageKey } from './messages.ts';
import {
  entriesFromCsv,
  entriesFromShared,
  listToCsvRows,
  resolveItem,
  reviewFromDetected,
  searchCards,
  toNewEntries,
  unresolvedRange,
  type ReviewItem,
} from './model.ts';
import {
  loadList,
  loadSettings,
  saveList,
  saveSettings,
  type KV,
  type ReadingModel,
  type Settings,
} from './storage.ts';

/** Legge una foto e restituisce le carte rilevate. Il motore vero (OCR) lo fornisce il chiamante. */
export interface Scanner {
  scan(file: File, onProgress: (message: MessageKey) => void): Promise<DetectedCard[]>;
}

/** Scaricamento, cache e caricamento nel motore dei modelli di lettura (SPEC §8). */
export interface ModelManager {
  /** Dimensione in MB, mostrata prima di scaricare. */
  sizeMb(id: ReadingModel): number;
  isCached(id: ReadingModel): Promise<boolean>;
  download(id: ReadingModel, onProgress: (fraction: number) => void): Promise<void>;
  /** Carica il modello (già in cache) nel motore. */
  activate(id: ReadingModel): Promise<void>;
}

export interface AppDeps {
  root: HTMLElement;
  data: AppData;
  scanner: Scanner;
  /** Senza gestore dei modelli (test, demo) si assume che il motore sia già pronto. */
  models?: ModelManager;
  storage: KV | null;
  languages: readonly string[];
  /** Installazione come app (suggerimento su iPhone, proposta su Android). */
  install?: InstallHelper;
  /** L'ora attuale (si può sostituire nei test). */
  now?: () => Date;
  /** Indirizzo dell'app, base del link di condivisione (default: la pagina aperta). */
  pageUrl?: string;
  /** Il frammento dell'indirizzo all'apertura (`#list=...` se si è aperto un link condiviso). */
  sharedHash?: string;
  /** Toglie il frammento dall'indirizzo, dopo averlo letto. */
  clearHash?: () => void;
}

type Tab = 'scan' | 'list' | 'settings';

interface State {
  tab: Tab;
  list: ListEntry[];
  review: ReviewItem[];
  scanning: MessageKey | null;
  scanError: boolean;
  open: string | null;
  searchOpen: boolean;
  query: string;
  settings: Settings;
  confirmClear: boolean;
  notice: string | null;
  /** Pagina del primo avvio: scelta del modello e scaricamento. */
  setup: {
    choice: ReadingModel;
    phase: 'choose' | 'downloading' | 'error';
    progress: number;
  } | null;
  /** Il modello è in caricamento nel motore. */
  modelLoading: boolean;
  /** Cambio di modello dalle impostazioni, mentre il precedente resta in uso. */
  modelSwitch: { id: ReadingModel; progress: number; error: boolean } | null;
  /** Si vede l'intervallo del totale per le carte da scegliere. */
  showRange: boolean;
  /** L'ultima rimozione, che si può annullare per qualche secondo. */
  undo: { message: MessageKey; list: ListEntry[]; review: ReviewItem[] } | null;
  installDismissed: boolean;
  /** Una Lista ricevuta con un link, in attesa della scelta dell'utente. */
  shared: {
    error: boolean;
    entries: (NewEntry & { quantity: number })[];
    unknown: number;
    cards: number;
    totalCents: number;
    /** Data dei prezzi ricevuti (la più recente), se ce ne sono. */
    date: string | null;
  } | null;
}

const INSTALL_KEY = 'swu-scanner:install-dismissed';
const UNDO_MS = 8000;

function read(store: KV | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

const CARDMARKET = 'https://www.cardmarket.com/en/StarWarsUnlimited/Products?idProduct=';

export function createApp(deps: AppDeps): {
  destroy(): void;
  refresh(): void;
  /** Apre la Lista di un link toccato mentre l'app è già aperta. */
  openSharedHash(hash: string): void;
} {
  const { root, data, scanner, storage } = deps;
  const { catalog } = data;
  let counter = 0;
  const newId = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}`;

  const state: State = {
    tab: 'scan',
    list: loadList(storage),
    review: [],
    scanning: null,
    scanError: false,
    open: null,
    searchOpen: false,
    query: '',
    settings: loadSettings(storage),
    confirmClear: false,
    notice: null,
    setup: null,
    modelLoading: false,
    modelSwitch: null,
    showRange: false,
    undo: null,
    installDismissed: read(storage, INSTALL_KEY) === '1',
    shared: null,
  };

  let t: Translate;
  let locale: Locale;
  const setLocale = (): void => {
    locale = state.settings.locale ?? detectLocale(deps.languages);
    t = createT(locale);
    document.documentElement.lang = locale;
  };
  setLocale();

  const persistList = (): void => {
    saveList(storage, state.list);
  };

  // ---------- Annulla ----------

  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  /** Offre di annullare un'azione per qualche secondo; `before` è lo stato di prima. */
  function offerUndo(
    message: MessageKey,
    before: { list: ListEntry[]; review: ReviewItem[] },
  ): void {
    state.undo = { message, ...before };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      state.undo = null;
      render();
    }, UNDO_MS);
  }

  function undoLast(): void {
    const u = state.undo;
    if (!u) return;
    clearTimeout(undoTimer);
    state.list = u.list;
    state.review = u.review;
    state.undo = null;
    persistList();
    render();
  }

  // ---------- Data dei prezzi ----------

  const nowDate = (): Date => deps.now?.() ?? new Date();

  /** "Prezzi del 18/10/2026", con un avviso se sono vecchi (SPEC §8). */
  function priceNote(): HTMLElement {
    const date = new Date(data.priceDate);
    const stale = pricesAreStale(data.priceDate, nowDate());
    const age = priceAgeDays(data.priceDate, nowDate());
    return h(
      'div',
      { class: 'price-note', attrs: { 'data-testid': 'price-date' } },
      h('p', {
        class: 'note',
        text: t('price.updated', {
          date: Number.isNaN(date.getTime()) ? '?' : date.toLocaleDateString(locale),
        }),
      }),
      stale && age !== null
        ? h('p', {
            class: 'note warn',
            text: t('price.stale', { days: age }),
            attrs: { role: 'status' },
          })
        : null,
    );
  }

  // ---------- Installazione ----------

  function installCard(): HTMLElement | null {
    const install = deps.install;
    if (!install || state.installDismissed) return null;
    const ios = install.iosHint;
    if (!ios && !install.canPrompt()) return null;
    const dismiss = (): void => {
      state.installDismissed = true;
      try {
        storage?.setItem(INSTALL_KEY, '1');
      } catch {
        // il suggerimento tornerà alla prossima apertura
      }
      render();
    };
    return h(
      'aside',
      { class: 'install', attrs: { 'aria-label': t('install.title'), 'data-testid': 'install' } },
      h('strong', { text: t('install.title') }),
      ios && h('p', { class: 'note', text: t('install.ios') }),
      h(
        'div',
        { class: 'actions' },
        !ios &&
          h('button', {
            class: 'primary',
            text: t('install.android'),
            attrs: { type: 'button', 'data-testid': 'install-now' },
            on: { click: () => void install.prompt().then(render) },
          }),
        h('button', {
          class: 'secondary',
          text: t('install.dismiss'),
          attrs: { type: 'button', 'data-testid': 'install-dismiss' },
          on: { click: dismiss },
        }),
      ),
    );
  }

  // ---------- Prezzi e versioni ----------

  const priceText = (q: Quote | null): string =>
    q
      ? q.kind === 'low'
        ? t('price.from', { price: formatEuro(q.cents, locale) })
        : formatEuro(q.cents, locale)
      : t('price.unavailable');

  const labelOf = (v: Version): string =>
    v.label.kind === 'base'
      ? t('version.base')
      : v.label.kind === 'v'
        ? t('version.v', { n: v.label.n })
        : t('version.unidentified');

  const versionName = (v: Version): string => {
    const p = v.printings[0];
    const where = v.set ? `${v.set}${p ? ` ${p[1]}` : ''}` : t('version.otherSet');
    return `${where} · ${labelOf(v)}`;
  };

  function versionPicker(
    cardKey: string,
    selected: { idProduct: number | null; finish: Finish | null },
    onPick: (idProduct: number, finish: Finish | null) => void,
  ): HTMLElement {
    const versions = catalog.versionsOf(cardKey);
    const list = h('ul', { class: 'versions' });
    for (const v of versions) {
      const isSelected = v.idProduct !== null && v.idProduct === selected.idProduct;
      const head = h(
        'div',
        { class: 'version-head' },
        h('span', { class: 'version-name', text: versionName(v) }),
        v.probable && h('span', { class: 'badge', text: t('version.probable') }),
        v.label.kind === 'unidentified' && v.idProduct !== null
          ? h('span', {
              class: 'badge',
              text: `#${v.idProduct}`,
              attrs: { 'data-testid': 'product-id' },
            })
          : null,
        v.printings.some((p) => /foil/i.test(p[2])) && v.choices.length === 1
          ? h('span', { class: 'badge foil', text: t('finish.foil') })
          : null,
      );
      const first = v.printings[0];
      const row = h('li', {
        class: `version${isSelected ? ' selected' : ''}${first ? ' has-thumb' : ''}`,
      });
      const body = h('div', { class: 'version-body' }, head);
      if (first) {
        // Miniatura caricata solo a riga aperta; se non si carica (offline, bloccata) si toglie.
        const img = h('img', {
          class: 'thumb',
          attrs: {
            src: thumbnailUrl(first[0], first[1]),
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            width: '56',
            height: '78',
            referrerpolicy: 'no-referrer',
          },
          on: {
            error: () => {
              img.remove();
              row.classList.remove('has-thumb');
            },
          },
        });
        row.append(img);
      }
      row.append(body);
      if (v.idProduct === null) {
        body.append(h('div', { class: 'muted', text: t('price.unavailable') }));
      } else if (v.choices.length > 1) {
        const choices = h('div', { class: 'finishes' });
        for (const f of v.choices) {
          const on = isSelected && selected.finish === f;
          choices.append(
            h('button', {
              class: `chip${on ? ' on' : ''}`,
              text: `${t(f === 'foil' ? 'finish.foil' : 'finish.normal')} · ${priceText(v.quoteFor(f))}`,
              attrs: { type: 'button', 'aria-pressed': String(on) },
              on: { click: () => onPick(v.idProduct as number, f) },
            }),
          );
        }
        body.append(choices);
      } else {
        body.append(
          h('button', {
            class: `chip price${isSelected ? ' on' : ''}${v.quote ? '' : ' none'}`,
            text: priceText(v.quote),
            attrs: { type: 'button', 'aria-pressed': String(isSelected) },
            on: { click: () => onPick(v.idProduct as number, v.finish) },
          }),
        );
      }
      if (v.idProduct !== null) {
        body.append(
          h('a', {
            class: 'link',
            text: t('price.openCardmarket'),
            attrs: {
              href: `${CARDMARKET}${v.idProduct}`,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          }),
        );
      }
      list.append(row);
    }
    return h('div', {}, list, h('p', { class: 'note', text: t('price.note') }));
  }

  /** Titolo nella lingua della carta (se nota), con sotto in piccolo quello inglese del Catalogo (SPEC §3). */
  function cardTitle(key: string, local?: LocalTitle): HTMLElement {
    const card = catalog.card(key);
    const name = local?.name ?? card?.name ?? key;
    const subtitle = local ? local.subtitle : (card?.subtitle ?? null);
    const english = local && card ? [card.name, card.subtitle].filter(Boolean).join(' — ') : null;
    return h(
      'div',
      { class: 'card-title' },
      h('div', { class: 'name', text: name }),
      subtitle && h('div', { class: 'subtitle', text: subtitle }),
      english && h('div', { class: 'english', text: english, attrs: { lang: 'en' } }),
      card && (card.type === 'Leader' || card.type === 'Base')
        ? h('span', {
            class: 'badge type',
            text: t(card.type === 'Leader' ? 'card.leader' : 'card.base'),
          })
        : null,
    );
  }

  // ---------- Scansiona ----------

  async function onPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    state.scanning = 'scan.reading';
    state.scanError = false;
    render();
    try {
      const detected = await scanner.scan(file, (m) => {
        state.scanning = m;
        render();
      });
      const items = detected
        .map((d) => reviewFromDetected(d, catalog, newId))
        .filter((x): x is ReviewItem => x !== null);
      state.review = [...state.review, ...items];
    } catch {
      state.scanError = true;
    }
    state.scanning = null;
    render();
  }

  function photoButtons(compact = false): HTMLElement {
    const take = h('input', {
      attrs: {
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        hidden: '',
        'data-testid': 'photo-camera',
      },
      on: { change: (e) => void onPhoto((e.target as HTMLInputElement).files?.[0]) },
    });
    const pick = h('input', {
      attrs: { type: 'file', accept: 'image/*', hidden: '', 'data-testid': 'photo-gallery' },
      on: { change: (e) => void onPhoto((e.target as HTMLInputElement).files?.[0]) },
    });
    return h(
      'div',
      { class: 'photo-buttons' },
      h('button', {
        class: compact ? 'secondary' : 'primary big',
        text: t('scan.take'),
        attrs: { type: 'button' },
        on: { click: () => take.click() },
      }),
      h('button', {
        class: compact ? 'secondary' : 'secondary big',
        text: t('scan.choose'),
        attrs: { type: 'button' },
        on: { click: () => pick.click() },
      }),
      take,
      pick,
    );
  }

  function reviewRow(item: ReviewItem): HTMLElement {
    const open = state.open === item.id;
    const row = h('li', {
      class: `row${open ? ' open' : ''}`,
      attrs: { 'data-testid': 'review-row' },
    });
    const summary = item.cardKey
      ? catalog.priceOf({ id: item.id, quantity: 1, ...asEntry(item) })
      : null;
    const head = h(
      'button',
      {
        class: 'row-head',
        attrs: { type: 'button', 'aria-expanded': String(open) },
        on: {
          click: () => {
            state.open = open ? null : item.id;
            render();
          },
        },
      },
      h('span', {
        class: `dot ${item.idProduct !== null ? 'green' : 'orange'}`,
        attrs: { 'aria-hidden': 'true' },
      }),
      item.cardKey
        ? h(
            'div',
            { class: 'card-title' },
            cardTitle(item.cardKey, item.locals[item.cardKey]),
            h('div', {
              class: item.idProduct === null ? 'hint-line' : 'muted',
              text: pickedVersionName(item) ?? t('review.chooseVersion'),
            }),
          )
        : h(
            'div',
            { class: 'card-title' },
            h('div', { class: 'name', text: t('review.chooseVersion') }),
          ),
      summary && summary.status === 'chosen'
        ? h('span', {
            class: 'price',
            text: priceText({ cents: summary.cents, kind: summary.kind }),
          })
        : null,
    );
    row.append(head);
    if (open || item.cardKey === null) {
      if (item.cardKey === null) {
        const list = h('ul', { class: 'candidates' });
        for (const key of item.candidates.slice(0, 3)) {
          list.append(
            h(
              'li',
              {},
              h(
                'button',
                {
                  class: 'candidate',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      replaceItem(resolveItem(item, { cardKey: key }));
                      state.open = item.id;
                      render();
                    },
                  },
                },
                cardTitle(key, item.locals[key]),
              ),
            ),
          );
        }
        row.append(list);
      } else {
        row.append(
          versionPicker(item.cardKey, item, (idProduct, finish) => {
            replaceItem(resolveItem(item, { idProduct, finish }));
            render();
          }),
        );
      }
    }
    row.append(
      h('button', {
        class: 'link danger',
        text: t('review.discard'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            offerUndo('undo.discarded', { list: state.list, review: state.review });
            state.review = state.review.filter((r) => r.id !== item.id);
            render();
          },
        },
      }),
    );
    return row;
  }

  function pickedVersionName(item: ReviewItem): string | null {
    if (item.cardKey === null || item.idProduct === null) return null;
    const v = catalog.versionsOf(item.cardKey).find((x) => x.idProduct === item.idProduct);
    return v ? versionName(v) : null;
  }

  const asEntry = (item: ReviewItem): Pick<ListEntry, 'cardKey' | 'idProduct' | 'finish'> => ({
    cardKey: item.cardKey ?? '',
    idProduct: item.idProduct,
    finish: item.finish,
  });

  function replaceItem(next: ReviewItem): void {
    state.review = state.review.map((r) => (r.id === next.id ? next : r));
  }

  function confirmReview(): void {
    const { entries } = toNewEntries(state.review);
    let list = state.list;
    for (const e of entries) list = addEntry(list, e, newId);
    state.list = list;
    persistList();
    // Le carte ancora senza Carta scelta restano da rivedere: nulla sparisce in silenzio.
    state.review = state.review.filter((r) => r.cardKey === null);
    state.open = null;
    state.tab = state.review.length === 0 ? 'list' : 'scan';
    render();
  }

  function scanView(): HTMLElement {
    const view = h('section', { class: 'view', attrs: { 'aria-labelledby': 'scan-title' } });
    if (state.scanning) {
      view.append(h('p', { class: 'status', text: t(state.scanning), attrs: { role: 'status' } }));
      return view;
    }
    if (state.modelLoading) {
      view.append(h('p', { class: 'status', text: t('setup.loading'), attrs: { role: 'status' } }));
      return view;
    }
    if (state.review.length === 0) {
      put(
        view,
        h('h1', { class: 'app-title', text: t('app.title'), attrs: { id: 'scan-title' } }),
        h('p', { class: 'hint', text: t('scan.hint') }),
        photoButtons(),
        installCard(),
        priceNote(),
        state.scanError &&
          h('p', { class: 'error', text: t('error.generic'), attrs: { role: 'alert' } }),
        h('button', {
          class: 'secondary',
          text: t('scan.addCard'),
          attrs: { type: 'button' },
          on: {
            click: () => {
              state.searchOpen = true;
              render();
            },
          },
        }),
      );
      return view;
    }
    const ready = state.review.filter((r) => r.cardKey !== null).length;
    view.append(
      h(
        'div',
        { class: 'section-head' },
        h('h1', { class: 'section-title', text: t('review.title'), attrs: { id: 'scan-title' } }),
        h('span', {
          class: 'count',
          text: t('scan.found', { n: state.review.length }),
          attrs: { 'data-testid': 'found' },
        }),
      ),
      h('ul', { class: 'rows' }, ...state.review.map(reviewRow)),
      photoButtons(true),
      h('button', {
        class: 'secondary',
        text: t('scan.addCard'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            state.searchOpen = true;
            render();
          },
        },
      }),
      h(
        'div',
        { class: 'action-bar' },
        h('button', {
          class: 'primary big',
          text: t('review.confirm', { n: ready }),
          attrs: {
            type: 'button',
            'data-testid': 'confirm',
            ...(ready === 0 ? { disabled: '' } : {}),
          },
          on: { click: confirmReview },
        }),
      ),
    );
    return view;
  }

  // ---------- Lista ----------

  function listView(): HTMLElement {
    const view = h('section', { class: 'view', attrs: { 'aria-labelledby': 'list-title' } });
    const s = summarize(state.list, (e) => catalog.priceOf(e));
    view.append(
      h(
        'div',
        { class: 'totals' },
        h('h1', { class: 'section-title', text: t('list.title'), attrs: { id: 'list-title' } }),
        h('div', {
          class: 'total',
          text: t('list.total', { price: formatEuro(s.totalCents, locale) }),
          attrs: { 'data-testid': 'total' },
        }),
        h(
          'div',
          { class: 'muted' },
          t('list.cards', { n: s.cards }),
          s.toChoose > 0 && ' · ',
          s.toChoose > 0 &&
            h('button', {
              class: 'link inline',
              text: t('list.toChoose', { n: s.toChoose }),
              attrs: {
                type: 'button',
                'aria-expanded': String(state.showRange),
                'data-testid': 'to-choose',
              },
              on: {
                click: () => {
                  state.showRange = !state.showRange;
                  render();
                },
              },
            }),
          s.lowCount > 0 && ` · ${t('list.fromPrices', { n: s.lowCount })}`,
        ),
        s.toChoose > 0 && state.showRange ? rangeNote() : null,
      ),
    );
    if (state.list.length === 0) {
      view.append(h('p', { class: 'hint', text: t('list.empty') }));
    } else {
      view.append(h('ul', { class: 'rows' }, ...state.list.map(listRow)));
    }
    const importInput = h('input', {
      attrs: { type: 'file', accept: '.csv,text/csv', hidden: '' },
      on: { change: (e) => void importCsv((e.target as HTMLInputElement).files?.[0]) },
    });
    put(
      view,
      h(
        'div',
        { class: 'actions' },
        h('button', {
          class: 'secondary',
          text: t('list.exportCsv'),
          attrs: { type: 'button' },
          on: { click: exportCsv },
        }),
        h('button', {
          class: 'secondary',
          text: t('list.share'),
          attrs: {
            type: 'button',
            'data-testid': 'share',
            ...(state.list.length === 0 ? { disabled: '' } : {}),
          },
          on: { click: () => void shareList() },
        }),
        state.list.some((e) => e.shared) &&
          h('button', {
            class: 'secondary',
            text: t('list.updatePrices'),
            attrs: { type: 'button', 'data-testid': 'update-prices' },
            on: { click: () => change(clearSharedPrices(state.list)) },
          }),
        h('button', {
          class: 'secondary',
          text: t('list.importCsv'),
          attrs: { type: 'button' },
          on: { click: () => importInput.click() },
        }),
        state.list.length > 0 &&
          h('button', {
            class: `secondary${state.confirmClear ? ' danger' : ''}`,
            text: state.confirmClear ? `${t('list.clear')}?` : t('list.clear'),
            attrs: { type: 'button' },
            on: {
              click: () => {
                if (state.confirmClear) {
                  offerUndo('undo.cleared', { list: state.list, review: state.review });
                  state.list = [];
                  persistList();
                  state.confirmClear = false;
                } else state.confirmClear = true;
                render();
              },
            },
          }),
        importInput,
      ),
      state.notice && h('p', { class: 'note', text: state.notice, attrs: { role: 'status' } }),
      priceNote(),
    );
    return view;
  }

  /** L'intervallo del totale quando si sceglieranno le versioni (SPEC §4): visibile solo al tocco. */
  function rangeNote(): HTMLElement {
    const r = unresolvedRange(state.list, catalog);
    const base = summarize(state.list, (e) => catalog.priceOf(e)).totalCents;
    return h('p', {
      class: 'note',
      attrs: { 'data-testid': 'range', role: 'status' },
      text:
        t('list.range', {
          min: formatEuro(base + r.minCents, locale),
          max: formatEuro(base + r.maxCents, locale),
        }) + (r.noPrice > 0 ? t('list.rangeNoPrice', { n: r.noPrice }) : ''),
    });
  }

  function listRow(e: ListEntry): HTMLElement {
    const open = state.open === e.id;
    const price = catalog.priceOf(e);
    const version = catalog
      .versionsOf(e.cardKey)
      .find((v) => v.idProduct === e.idProduct && e.idProduct !== null);
    const row = h('li', {
      class: `row${open ? ' open' : ''}`,
      attrs: { 'data-testid': 'list-row' },
    });
    row.append(
      h(
        'button',
        {
          class: 'row-head',
          attrs: { type: 'button', 'aria-expanded': String(open) },
          on: {
            click: () => {
              state.open = open ? null : e.id;
              render();
            },
          },
        },
        h('span', {
          class: `dot ${price.status === 'to-choose' ? 'orange' : 'green'}`,
          attrs: { 'aria-hidden': 'true' },
        }),
        h(
          'div',
          { class: 'card-title' },
          cardTitle(e.cardKey, e.local),
          h('div', {
            class: 'muted',
            text:
              (version ? versionName(version) : t('review.chooseVersion')) +
              (e.shared ? ` · ${t('list.sharedPrice', { date: dateText(e.shared.date) })}` : ''),
          }),
        ),
        price.status === 'chosen'
          ? h('span', {
              class: 'price',
              text: priceText({ cents: price.cents * e.quantity, kind: price.kind }),
            })
          : price.status === 'unavailable'
            ? h('span', { class: 'price muted', text: t('price.unavailable') })
            : null,
      ),
      h(
        'div',
        { class: 'qty' },
        h('button', {
          text: '−',
          class: 'chip',
          attrs: { type: 'button', 'aria-label': `${t('list.quantity')} −` },
          on: { click: () => change(setQuantity(state.list, e.id, e.quantity - 1)) },
        }),
        h('span', {
          class: 'qty-value',
          text: String(e.quantity),
          attrs: { 'aria-label': t('list.quantity') },
        }),
        h('button', {
          text: '+',
          class: 'chip',
          attrs: { type: 'button', 'aria-label': `${t('list.quantity')} +` },
          on: { click: () => change(setQuantity(state.list, e.id, e.quantity + 1)) },
        }),
        h('button', {
          class: 'link danger',
          text: t('list.remove'),
          attrs: { type: 'button' },
          on: {
            click: () => {
              offerUndo('undo.removed', { list: state.list, review: state.review });
              change(removeEntry(state.list, e.id));
            },
          },
        }),
      ),
    );
    if (open) {
      row.append(
        versionPicker(e.cardKey, e, (idProduct, finish) =>
          change(updateEntry(state.list, e.id, { idProduct, finish })),
        ),
      );
    }
    return row;
  }

  function change(list: ListEntry[]): void {
    state.list = list;
    persistList();
    render();
  }

  function exportCsv(): void {
    const csv = toCsv(listToCsvRows(state.list, catalog));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { attrs: { href: url, download: 'swu-scanner-list.csv' } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importCsv(file: File | undefined): Promise<void> {
    if (!file) return;
    const parsed = parseListCsv(await file.text());
    const { entries, unknown } = entriesFromCsv(parsed.rows, catalog);
    let list = state.list;
    for (const e of entries) {
      for (let i = 0; i < e.quantity; i++) list = addEntry(list, e, newId);
    }
    state.list = list;
    persistList();
    state.notice =
      [...parsed.errors, ...unknown.map((u) => `? ${u}`)].slice(0, 5).join(' · ') || null;
    render();
  }

  // ---------- Condivisione ----------

  const dateText = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '?' : d.toLocaleDateString(locale);
  };

  /** Il link della Lista, con i prezzi di ora: si condivide dal telefono o si copia negli appunti. */
  async function shareList(): Promise<void> {
    if (state.list.length === 0) return;
    state.notice = null;
    try {
      const code = await encodeShare(
        toShared(state.list, (e) => catalog.priceOf(e), data.priceDate),
      );
      const url = shareUrl(deps.pageUrl ?? window.location.href, code);
      const s = summarize(state.list, (e) => catalog.priceOf(e));
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: t('app.title'),
            text: t('share.text', { n: s.cards, price: formatEuro(s.totalCents, locale) }),
            url,
          });
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return; // l'utente ha chiuso il foglio
          // altro errore: si ripiega sugli appunti
        }
      }
      await navigator.clipboard.writeText(url);
      state.notice = t('share.copied');
    } catch {
      state.notice = t('share.failed');
    }
    render();
  }

  /** Legge una Lista ricevuta con un link e chiede cosa farne. */
  async function openShared(code: string): Promise<void> {
    deps.clearHash?.();
    try {
      const { entries, unknown } = entriesFromShared(await decodeShare(code), catalog);
      if (entries.length === 0 && unknown === 0) throw new Error('vuota');
      const asList = mergeEntries([], entries, newId).list;
      const s = summarize(asList, (e) => catalog.priceOf(e));
      const dates = entries.flatMap((e) => (e.shared ? [e.shared.date] : []));
      state.shared = {
        error: false,
        entries,
        unknown,
        cards: s.cards,
        totalCents: s.totalCents,
        date:
          dates.length > 0
            ? dates.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b))
            : null,
      };
    } catch {
      state.shared = { error: true, entries: [], unknown: 0, cards: 0, totalCents: 0, date: null };
    }
    render();
  }

  function importShared(mode: 'add' | 'replace'): void {
    const shared = state.shared;
    if (!shared) return;
    offerUndo('undo.shared', { list: state.list, review: state.review });
    const base = mode === 'replace' ? [] : state.list;
    const merged = mergeEntries(base, shared.entries, newId);
    state.list = merged.list;
    persistList();
    state.shared = null;
    state.tab = 'list';
    state.open = null;
    state.notice =
      mode === 'add' && merged.merged > 0 ? t('share.merged', { n: merged.merged }) : null;
    render();
  }

  function sharedDialog(): HTMLElement {
    const shared = state.shared as NonNullable<State['shared']>;
    const canImport = shared.entries.length > 0;
    const already = canImport ? mergeEntries(state.list, shared.entries, newId).merged : 0;
    const close = (): void => {
      state.shared = null;
      render();
    };
    const primary = canImport
      ? h('button', {
          class: 'primary',
          text: t('share.add'),
          attrs: { type: 'button', 'data-testid': 'share-add' },
          on: { click: () => importShared('add') },
        })
      : null;
    if (primary) queueMicrotask(() => primary.focus());
    return h(
      'div',
      {
        class: 'overlay',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('share.title') },
      },
      h(
        'div',
        { class: 'dialog', attrs: { 'data-testid': 'share-dialog' } },
        h('h2', { class: 'section-title', text: t('share.title') }),
        shared.error
          ? h('p', { class: 'error', text: t('share.invalid'), attrs: { role: 'alert' } })
          : null,
        canImport
          ? h('p', {
              class: 'total',
              text: t('share.summary', {
                n: shared.cards,
                price: formatEuro(shared.totalCents, locale),
              }),
              attrs: { 'data-testid': 'share-summary' },
            })
          : null,
        shared.date
          ? h('p', { class: 'note', text: t('price.updated', { date: dateText(shared.date) }) })
          : null,
        already > 0 ? h('p', { class: 'note', text: t('share.merged', { n: already }) }) : null,
        shared.unknown > 0
          ? h('p', {
              class: 'note warn',
              text: t('share.unknown', { n: shared.unknown }),
              attrs: { 'data-testid': 'share-unknown' },
            })
          : null,
        primary,
        canImport && state.list.length > 0
          ? h('button', {
              class: 'secondary',
              text: t('share.replace'),
              attrs: { type: 'button', 'data-testid': 'share-replace' },
              on: { click: () => importShared('replace') },
            })
          : null,
        h('button', {
          class: 'secondary',
          text: canImport ? t('share.cancel') : t('common.close'),
          attrs: { type: 'button', 'data-testid': 'share-cancel' },
          on: { click: close },
        }),
      ),
    );
  }

  // ---------- Impostazioni ----------

  function settingsView(): HTMLElement {
    const select = h(
      'select',
      {
        attrs: { id: 'lang' },
        on: {
          change: (e) => {
            const v = (e.target as HTMLSelectElement).value;
            state.settings = { ...state.settings, locale: LOCALES.find((l) => l === v) ?? null };
            saveSettings(storage, state.settings);
            setLocale();
            render();
          },
        },
      },
      ...LOCALES.map((l) =>
        h('option', {
          text: l.toUpperCase(),
          attrs: { value: l, ...(l === locale ? { selected: '' } : {}) },
        }),
      ),
    );
    const model = (value: ReadingModel, label: MessageKey, hint: MessageKey): HTMLElement =>
      h(
        'label',
        { class: 'radio' },
        h('input', {
          attrs: {
            type: 'radio',
            name: 'model',
            value,
            ...(state.settings.model === value ? { checked: '' } : {}),
            ...(state.modelSwitch ? { disabled: '' } : {}),
          },
          on: { change: () => void switchModel(value) },
        }),
        h(
          'span',
          {},
          ` ${t(label)} · ${t('settings.size', { mb: sizeMb(value) })}`,
          h('span', { class: 'muted', text: ` — ${t(hint)}` }),
        ),
      );
    return h(
      'section',
      { class: 'view', attrs: { 'aria-labelledby': 'settings-title' } },
      h('h1', {
        class: 'section-title',
        text: t('settings.title'),
        attrs: { id: 'settings-title' },
      }),
      h('label', { class: 'field', attrs: { for: 'lang' } }, t('settings.language'), select),
      h(
        'fieldset',
        {},
        h('legend', { text: t('settings.model') }),
        model('light', 'settings.light', 'setup.light'),
        model('precise', 'settings.precise', 'setup.precise'),
      ),
      state.modelSwitch &&
        h('p', {
          class: state.modelSwitch.error ? 'error' : 'note',
          text: state.modelSwitch.error
            ? t('setup.error')
            : t('setup.downloading', { pct: Math.round(state.modelSwitch.progress * 100) }),
          attrs: { role: state.modelSwitch.error ? 'alert' : 'status' },
        }),
      priceNote(),
    );
  }

  // ---------- Ricerca "Aggiungi una carta" ----------

  function searchDialog(): HTMLElement {
    const results = h('ul', { class: 'candidates', attrs: { 'data-testid': 'results' } });
    const fill = (): void => {
      results.replaceChildren();
      const keys = searchCards(data.titles, state.query, 20);
      if (state.query && keys.length === 0)
        results.append(h('li', { class: 'muted', text: t('search.none') }));
      for (const key of keys) {
        results.append(
          h(
            'li',
            {},
            h(
              'button',
              {
                class: 'candidate',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    const item: ReviewItem = {
                      id: newId(),
                      status: 'recognized',
                      cardKey: key,
                      candidates: [key],
                      idProduct: null,
                      finish: null,
                      locals: {},
                    };
                    state.review = [...state.review, item];
                    state.searchOpen = false;
                    state.query = '';
                    state.tab = 'scan';
                    state.open = item.id;
                    render();
                  },
                },
              },
              cardTitle(key),
            ),
          ),
        );
      }
    };
    const input = h('input', {
      attrs: {
        type: 'search',
        placeholder: t('search.placeholder'),
        'aria-label': t('search.title'),
        value: state.query,
        autocomplete: 'off',
      },
      on: {
        input: (e) => {
          state.query = (e.target as HTMLInputElement).value;
          fill();
        },
      },
    });
    fill();
    queueMicrotask(() => input.focus());
    return h(
      'div',
      {
        class: 'overlay',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('search.title') },
      },
      h(
        'div',
        { class: 'dialog' },
        h('h2', { class: 'section-title', text: t('search.title') }),
        input,
        results,
        h('button', {
          class: 'secondary',
          text: t('common.close'),
          attrs: { type: 'button' },
          on: {
            click: () => {
              state.searchOpen = false;
              render();
            },
          },
        }),
      ),
    );
  }

  // ---------- Modelli di lettura ----------

  const sizeMb = (id: ReadingModel): number => deps.models?.sizeMb(id) ?? 0;

  async function activateModel(id: ReadingModel): Promise<void> {
    if (!deps.models) return;
    state.modelLoading = true;
    render();
    try {
      await deps.models.activate(id);
    } finally {
      state.modelLoading = false;
    }
  }

  /** Dalle impostazioni: scarica il nuovo modello mentre resta in uso il precedente. */
  async function switchModel(id: ReadingModel): Promise<void> {
    const models = deps.models;
    if (!models || id === state.settings.model) return;
    state.modelSwitch = { id, progress: 0, error: false };
    render();
    try {
      if (!(await models.isCached(id))) {
        await models.download(id, (f) => {
          if (state.modelSwitch) state.modelSwitch = { ...state.modelSwitch, progress: f };
          render();
        });
      }
      await models.activate(id);
      state.settings = { ...state.settings, model: id };
      saveSettings(storage, state.settings);
      state.modelSwitch = null;
    } catch {
      state.modelSwitch = { id, progress: 0, error: true };
    }
    render();
  }

  async function startSetup(choice: ReadingModel): Promise<void> {
    const models = deps.models;
    if (!models) return;
    state.setup = { choice, phase: 'downloading', progress: 0 };
    render();
    try {
      await models.download(choice, (f) => {
        if (state.setup) state.setup = { ...state.setup, progress: f };
        render();
      });
      state.settings = { ...state.settings, model: choice };
      saveSettings(storage, state.settings);
      state.setup = null;
      await activateModel(choice);
    } catch {
      state.setup = { choice, phase: 'error', progress: 0 };
    }
    render();
  }

  function setupView(setup: NonNullable<State['setup']>): HTMLElement {
    const choose = (value: ReadingModel, label: MessageKey, hint: MessageKey): HTMLElement =>
      h(
        'label',
        { class: 'radio' },
        h('input', {
          attrs: {
            type: 'radio',
            name: 'setup-model',
            value,
            ...(setup.choice === value ? { checked: '' } : {}),
            ...(setup.phase === 'downloading' ? { disabled: '' } : {}),
          },
          on: {
            change: () => {
              state.setup = { ...setup, choice: value };
              render();
            },
          },
        }),
        h(
          'span',
          {},
          ` ${t(label)} · ${t('settings.size', { mb: sizeMb(value) })}`,
          h('span', { class: 'muted', text: ` — ${t(hint)}` }),
        ),
      );
    return h(
      'section',
      { class: 'view setup', attrs: { 'aria-labelledby': 'setup-title' } },
      h('h1', { class: 'section-title', text: t('setup.title'), attrs: { id: 'setup-title' } }),
      h('p', { class: 'hint', text: t('setup.body') }),
      h(
        'fieldset',
        {},
        h('legend', { text: t('settings.model') }),
        choose('light', 'settings.light', 'setup.light'),
        choose('precise', 'settings.precise', 'setup.precise'),
      ),
      setup.phase === 'downloading'
        ? h(
            'div',
            {},
            h('progress', {
              attrs: {
                max: '1',
                value: String(setup.progress),
                'aria-label': t('setup.downloading', { pct: 0 }),
              },
            }),
            h('p', {
              class: 'status',
              text: t('setup.downloading', { pct: Math.round(setup.progress * 100) }),
              attrs: { role: 'status' },
            }),
          )
        : h(
            'div',
            {},
            setup.phase === 'error' &&
              h('p', { class: 'error', text: t('setup.error'), attrs: { role: 'alert' } }),
            h('button', {
              class: 'primary big',
              text: `${setup.phase === 'error' ? t('setup.retry') : t('setup.download')} · ${t('settings.size', { mb: sizeMb(setup.choice) })}`,
              attrs: { type: 'button', 'data-testid': 'setup-download' },
              on: { click: () => void startSetup(setup.choice) },
            }),
          ),
    );
  }

  async function bootstrapModels(): Promise<void> {
    const models = deps.models;
    if (!models) return;
    const id = state.settings.model;
    if (await models.isCached(id)) {
      try {
        await activateModel(id);
      } catch {
        state.setup = { choice: id, phase: 'error', progress: 0 };
      }
    } else {
      state.setup = { choice: id, phase: 'choose', progress: 0 };
    }
    render();
  }

  function toast(): HTMLElement {
    const u = state.undo as NonNullable<State['undo']>;
    return h(
      'div',
      { class: 'toast', attrs: { role: 'status', 'data-testid': 'toast' } },
      h('span', { text: t(u.message) }),
      h('button', {
        class: 'link',
        text: t('undo.action'),
        attrs: { type: 'button', 'data-testid': 'undo' },
        on: { click: undoLast },
      }),
    );
  }

  // ---------- Guscio ----------

  function render(): void {
    const tabButton = (tab: Tab, label: MessageKey, badge?: number): HTMLElement =>
      h(
        'button',
        {
          class: `tab${state.tab === tab ? ' active' : ''}`,
          attrs: {
            type: 'button',
            'aria-current': state.tab === tab ? 'page' : undefined,
            'data-testid': `tab-${tab}`,
          },
          on: {
            click: () => {
              state.tab = tab;
              state.open = null;
              render();
            },
          },
        },
        t(label),
        badge ? h('span', { class: 'tab-badge', text: String(badge) }) : null,
      );
    // Il primo avvio (scelta e scaricamento del modello) riguarda solo la scheda Scansiona: una Lista
    // ricevuta con un link si vede anche prima, e la barra compare appena la Lista ha delle voci.
    const gated = state.setup !== null && state.tab === 'scan';
    const main = gated
      ? setupView(state.setup as NonNullable<State['setup']>)
      : state.tab === 'scan'
        ? scanView()
        : state.tab === 'list'
          ? listView()
          : settingsView();
    const showNav = state.setup === null || state.list.length > 0;
    root.replaceChildren(
      ...[
        h('main', { class: 'app' }, main),
        showNav
          ? h(
              'nav',
              { class: 'tabs', attrs: { 'aria-label': t('app.title') } },
              tabButton('scan', 'nav.scan'),
              tabButton(
                'list',
                'nav.list',
                state.list.reduce((n, e) => n + e.quantity, 0),
              ),
              state.setup === null ? tabButton('settings', 'nav.settings') : null,
            )
          : null,
        state.undo ? toast() : null,
        state.searchOpen && state.setup === null ? searchDialog() : null,
        state.shared ? sharedDialog() : null,
      ].filter((n): n is HTMLElement => n !== null),
    );
  }

  render();
  const sharedCode = deps.sharedHash ? shareCodeFromHash(deps.sharedHash) : null;
  if (sharedCode) void openShared(sharedCode);
  void bootstrapModels();
  return {
    destroy: () => root.replaceChildren(),
    refresh: () => render(),
    openSharedHash: (hash) => {
      const code = shareCodeFromHash(hash);
      if (code) void openShared(code);
    },
  };
}
