import { describe, expect, it } from 'vitest';
import type { EntryPrice, ListEntry } from './list.ts';
import {
  decodeShare,
  encodeShare,
  fromShared,
  shareCodeFromHash,
  shareUrl,
  toShared,
} from './share.ts';

const entry = (over: Partial<ListEntry>): ListEntry => ({
  id: 'x',
  cardKey: 'darth vader|dark lord of the sith',
  idProduct: 100,
  finish: 'normal',
  quantity: 2,
  ...over,
});

const priceOf = (e: ListEntry): EntryPrice =>
  e.idProduct === null
    ? { status: 'to-choose' }
    : { status: 'chosen', cents: e.idProduct * 10, kind: e.finish === 'foil' ? 'low' : 'trend' };

describe('toShared / fromShared', () => {
  const list = [
    entry({}),
    entry({ idProduct: 200, finish: 'foil', quantity: 1 }),
    entry({ idProduct: null, finish: null, cardKey: 'luke skywalker|jedi knight', quantity: 3 }),
  ];

  it('porta quantità, versione, finitura e prezzo di ogni voce', () => {
    const out = fromShared(toShared(list, priceOf, '2026-11-07T00:00:00+0100'));
    expect(out).toEqual([
      {
        quantity: 2,
        idProduct: 100,
        finish: 'normal',
        cardKey: null,
        price: { cents: 1000, kind: 'trend', date: '2026-11-07T00:00:00+0100' },
      },
      {
        quantity: 1,
        idProduct: 200,
        finish: 'foil',
        cardKey: null,
        price: { cents: 2000, kind: 'low', date: '2026-11-07T00:00:00+0100' },
      },
      {
        quantity: 3,
        idProduct: null,
        finish: null,
        cardKey: 'luke skywalker|jedi knight',
        price: null,
      },
    ]);
  });

  it('una voce con prezzo ricevuto mantiene la sua data', () => {
    const old = entry({ shared: { cents: 500, kind: 'trend', date: '2026-10-01T00:00:00+0200' } });
    const out = fromShared(
      toShared([old, entry({ idProduct: 5 })], priceOf, '2026-11-07T00:00:00Z'),
    );
    expect(out?.[0]?.price?.date).toBe('2026-10-01T00:00:00+0200');
    expect(out?.[1]?.price?.date).toBe('2026-11-07T00:00:00Z');
  });

  it('scarta le voci non valide e rifiuta ciò che non è una Lista', () => {
    expect(fromShared(null)).toBeNull();
    expect(fromShared({ v: 2, d: [], i: [] })).toBeNull();
    expect(
      fromShared({
        v: 1,
        d: ['2026-11-07'],
        i: [
          [0, 1, 0, 100, 0, 0],
          [1, null, 0, 1, 0, 0],
        ],
      }),
    ).toEqual([]);
    const odd = fromShared({
      v: 1,
      d: ['non una data'],
      i: [
        [1, 5, 0, -3, 0, 0],
        [1, 5, 2, 10, 0, 0],
        [1, 5, 1, 10, 0, 0],
      ],
    });
    // la finitura 2 non esiste (voce scartata); data o prezzo non validi lasciano la voce senza prezzo
    expect(odd).toEqual([
      { quantity: 1, idProduct: 5, finish: 'normal', cardKey: null, price: null },
      { quantity: 1, idProduct: 5, finish: 'foil', cardKey: null, price: null },
    ]);
  });
});

describe('encodeShare / decodeShare', () => {
  it('fa il giro completo, compresso', async () => {
    const list = Array.from({ length: 100 }, (_, i) => entry({ idProduct: 1000 + i, quantity: 1 }));
    const payload = toShared(list, priceOf, '2026-11-07T00:00:00Z');
    const code = await encodeShare(payload);
    expect(code).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(JSON.stringify(payload).length);
    const back = await decodeShare(code);
    expect(back).toHaveLength(100);
    expect(back[7]?.idProduct).toBe(1007);
    expect(back[7]?.price?.cents).toBe(10_070);
  });

  it('legge anche il formato senza compressione', async () => {
    const json = JSON.stringify(toShared([entry({})], priceOf, '2026-11-07T00:00:00Z'));
    const code = `0.${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    expect(await decodeShare(code)).toHaveLength(1);
  });

  it.each(['', 'abc', '2.AAAA', '1.***', '1.AAAA', '0.AAAA'])(
    'rifiuta il testo rovinato %j',
    async (code) => {
      await expect(decodeShare(code)).rejects.toThrow();
    },
  );

  it('i caratteri speciali nelle chiavi sopravvivono', async () => {
    const e = entry({ idProduct: null, finish: null, cardKey: 'œil de sion|vers péridéa' });
    const [back] = await decodeShare(await encodeShare(toShared([e], priceOf, '2026-11-07')));
    expect(back?.cardKey).toBe('œil de sion|vers péridéa');
  });
});

describe('indirizzo', () => {
  it('costruisce il link e lo rilegge dal frammento', () => {
    const url = shareUrl('https://danoliv.github.io/swu-scanner/?x=1#vecchio', '1.abc');
    expect(url).toBe('https://danoliv.github.io/swu-scanner/?x=1#list=1.abc');
    expect(shareCodeFromHash('#list=1.abc')).toBe('1.abc');
    expect(shareCodeFromHash('#altro')).toBeNull();
    expect(shareCodeFromHash('')).toBeNull();
  });
});
