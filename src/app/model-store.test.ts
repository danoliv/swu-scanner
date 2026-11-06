import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../lib/hash.ts';
import {
  downloadModel,
  isModelCached,
  loadCachedModel,
  modelBytes,
  type CacheLike,
  type Manifest,
} from './model-store.ts';

const enc = new TextEncoder();

class FakeCache implements CacheLike {
  store = new Map<string, Uint8Array>();
  match(url: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined> {
    const v = this.store.get(url);
    return Promise.resolve(
      v ? { arrayBuffer: () => Promise.resolve(v.slice().buffer as ArrayBuffer) } : undefined,
    );
  }
  async put(url: string, response: Response): Promise<void> {
    this.store.set(url, new Uint8Array(await response.arrayBuffer()));
  }
  delete(url: string): Promise<boolean> {
    return Promise.resolve(this.store.delete(url));
  }
}

async function setup(corrupt = false): Promise<{
  manifest: Manifest;
  fetchFn: typeof fetch;
  calls: string[];
}> {
  const det = enc.encode('contenuto del rilevatore '.repeat(100));
  const rec = enc.encode('contenuto del lettore '.repeat(300));
  const manifest: Manifest = {
    light: {
      label: 'tiny',
      files: [
        { name: 'det.onnx', sha256: await sha256Hex(det), bytes: det.length },
        { name: 'rec.onnx', sha256: await sha256Hex(rec), bytes: rec.length },
      ],
    },
  };
  const calls: string[] = [];
  const fetchFn = ((url: string) => {
    calls.push(url);
    const data = url.endsWith('det.onnx') ? det : corrupt ? enc.encode('alterato') : rec;
    // il contenuto arriva a pezzi, come in rete
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < data.length; i += 700) controller.enqueue(data.slice(i, i + 700));
        controller.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: 200 }));
  }) as unknown as typeof fetch;
  return { manifest, fetchFn, calls };
}

describe('modelBytes', () => {
  it('somma i byte dei file del modello', async () => {
    const { manifest } = await setup();
    const total = manifest.light?.files.reduce((n, f) => n + f.bytes, 0);
    expect(modelBytes(manifest, 'light')).toBe(total);
    expect(modelBytes(manifest, 'precise')).toBe(0);
  });
});

describe('downloadModel', () => {
  it('scarica, verifica e mette in cache ogni file, con avanzamento crescente fino a 1', async () => {
    const { manifest, fetchFn, calls } = await setup();
    const cache = new FakeCache();
    const seen: number[] = [];
    await downloadModel({
      base: '/swu/',
      id: 'light',
      manifest,
      cache,
      fetchFn,
      onProgress: (f) => seen.push(f),
    });
    expect(calls).toEqual(['/swu/models/det.onnx', '/swu/models/rec.onnx']);
    expect(cache.store.size).toBe(2);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((v, i) => i === 0 || v >= (seen[i - 1] as number))).toBe(true);
    expect(seen.length).toBeGreaterThan(2);
  });

  it('rifiuta un file alterato e non lo mette in cache', async () => {
    const { manifest, fetchFn } = await setup(true);
    const cache = new FakeCache();
    await expect(
      downloadModel({
        base: '/',
        id: 'light',
        manifest,
        cache,
        fetchFn,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(/rec\.onnx/);
    expect(cache.store.has('/models/rec.onnx')).toBe(false);
  });

  it('non riscarica i file già in cache e validi', async () => {
    const { manifest, fetchFn, calls } = await setup();
    const cache = new FakeCache();
    const run = (): Promise<void> =>
      downloadModel({
        base: '/',
        id: 'light',
        manifest,
        cache,
        fetchFn,
        onProgress: () => undefined,
      });
    await run();
    calls.length = 0;
    await run();
    expect(calls).toEqual([]);
  });

  it('segnala un errore di rete o un modello sconosciuto', async () => {
    const { manifest } = await setup();
    const failing = (() =>
      Promise.resolve(new Response('no', { status: 404 }))) as unknown as typeof fetch;
    await expect(
      downloadModel({
        base: '/',
        id: 'light',
        manifest,
        cache: new FakeCache(),
        fetchFn: failing,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(/404/);
    await expect(
      downloadModel({
        base: '/',
        id: 'precise',
        manifest,
        cache: new FakeCache(),
        fetchFn: failing,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(/precise/);
  });
});

describe('loadCachedModel / isModelCached', () => {
  it('restituisce i byte dei due file se ci sono tutti e sono validi', async () => {
    const { manifest, fetchFn } = await setup();
    const cache = new FakeCache();
    expect(await isModelCached({ base: '/', id: 'light', manifest, cache })).toBe(false);
    await downloadModel({
      base: '/',
      id: 'light',
      manifest,
      cache,
      fetchFn,
      onProgress: () => undefined,
    });
    expect(await isModelCached({ base: '/', id: 'light', manifest, cache })).toBe(true);
    const m = await loadCachedModel({ base: '/', id: 'light', manifest, cache });
    expect(m?.det.length).toBe(manifest.light?.files[0]?.bytes);
    expect(m?.rec.length).toBe(manifest.light?.files[1]?.bytes);
  });

  it('restituisce null se manca un file o è alterato', async () => {
    const { manifest, fetchFn } = await setup();
    const cache = new FakeCache();
    await downloadModel({
      base: '/',
      id: 'light',
      manifest,
      cache,
      fetchFn,
      onProgress: () => undefined,
    });
    cache.store.set('/models/rec.onnx', enc.encode('danneggiato'));
    expect(await loadCachedModel({ base: '/', id: 'light', manifest, cache })).toBeNull();
    cache.store.delete('/models/det.onnx');
    expect(await isModelCached({ base: '/', id: 'light', manifest, cache })).toBe(false);
  });
});
