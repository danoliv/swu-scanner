// Modelli di lettura sul telefono (SPEC §8): scaricamento a flusso con barra di avanzamento, verifica
// dell'impronta SHA-256 e Cache API; si tiene in cache solo il modello scelto. Dipendenze iniettate.
import { sha256Hex } from '../lib/hash.ts';

export interface ManifestFile {
  name: string;
  sha256: string;
  bytes: number;
}
export type Manifest = Record<string, { label: string; files: ManifestFile[] }>;

/** Il minimo della Cache API che serve qui. */
export interface CacheLike {
  match(url: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

interface Ctx {
  base: string;
  id: string;
  manifest: Manifest;
  cache: CacheLike;
}

const urlOf = (base: string, f: ManifestFile): string => `${base}models/${f.name}`;

export const modelBytes = (manifest: Manifest, id: string): number =>
  manifest[id]?.files.reduce((n, f) => n + f.bytes, 0) ?? 0;

async function readCached(
  cache: CacheLike,
  base: string,
  f: ManifestFile,
): Promise<Uint8Array | null> {
  const hit = await cache.match(urlOf(base, f));
  if (!hit) return null;
  const bytes = new Uint8Array(await hit.arrayBuffer());
  return bytes.length === f.bytes && (await sha256Hex(bytes)) === f.sha256 ? bytes : null;
}

export async function loadCachedModel(
  ctx: Ctx,
): Promise<{ det: Uint8Array; rec: Uint8Array } | null> {
  const files = ctx.manifest[ctx.id]?.files;
  if (!files || files.length !== 2) return null;
  const det = await readCached(ctx.cache, ctx.base, files[0] as ManifestFile);
  const rec = await readCached(ctx.cache, ctx.base, files[1] as ManifestFile);
  return det && rec ? { det, rec } : null;
}

export async function isModelCached(ctx: Ctx): Promise<boolean> {
  return (await loadCachedModel(ctx)) !== null;
}

export async function downloadModel(
  ctx: Ctx & { fetchFn?: typeof fetch; onProgress: (fraction: number) => void },
): Promise<void> {
  const files = ctx.manifest[ctx.id]?.files;
  if (!files) throw new Error(`Modello sconosciuto: ${ctx.id}`);
  const fetchFn = ctx.fetchFn ?? fetch;
  const total = modelBytes(ctx.manifest, ctx.id);
  let done = 0;
  ctx.onProgress(0);
  for (const f of files) {
    if (await readCached(ctx.cache, ctx.base, f)) {
      done += f.bytes;
      ctx.onProgress(done / total);
      continue;
    }
    const res = await fetchFn(urlOf(ctx.base, f));
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} per ${f.name}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      chunks.push(value);
      got += value.length;
      ctx.onProgress(Math.min(1, (done + Math.min(got, f.bytes)) / total));
    }
    const bytes = new Uint8Array(got);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    if (bytes.length !== f.bytes || (await sha256Hex(bytes)) !== f.sha256) {
      throw new Error(`File ${f.name} alterato o incompleto: non lo uso`);
    }
    await ctx.cache.put(urlOf(ctx.base, f), new Response(bytes as BufferSource));
    done += f.bytes;
    ctx.onProgress(done / total);
  }
  ctx.onProgress(1);
}
