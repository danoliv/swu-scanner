// Scarica i modelli PP-OCRv6 in public/models/ verificando l'impronta SHA-256 di ogni file, e scrive
// il manifest che il sito usa per scaricarli e metterli in cache. I modelli non stanno nel repo.
// Uso: node scripts/fetch-models.ts [cartella-locale-con-i-file]
//   Con la cartella locale (es. la cache di RapidOCR) non si scarica nulla dalla rete.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from '../src/lib/hash.ts';

interface ModelFile {
  name: string;
  path: string;
  sha256: string;
  bytes: number;
}
const config = JSON.parse(
  await readFile(new URL('./data/models.json', import.meta.url), 'utf8'),
) as { source: string; models: Record<string, { label: string; files: ModelFile[] }> };

const localDir = process.argv[2];
const outDir = 'public/models';
await mkdir(outDir, { recursive: true });

for (const [id, model] of Object.entries(config.models)) {
  for (const f of model.files) {
    const target = join(outDir, f.name);
    let bytes: Uint8Array | null = null;
    if (existsSync(target)) bytes = new Uint8Array(await readFile(target));
    if (bytes && (await sha256Hex(bytes)) !== f.sha256) bytes = null;
    if (!bytes && localDir && existsSync(join(localDir, f.name))) {
      bytes = new Uint8Array(await readFile(join(localDir, f.name)));
    }
    if (!bytes) {
      const res = await fetch(`${config.source}/${f.path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} per ${f.name}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    const actual = await sha256Hex(bytes);
    if (actual !== f.sha256) throw new Error(`Impronta sbagliata per ${f.name}: ${actual}`);
    if (bytes.length !== f.bytes)
      throw new Error(`Dimensione sbagliata per ${f.name}: ${bytes.length}`);
    await writeFile(target, bytes);
    console.log(`${id}: ${f.name} ok (${(bytes.length / 1e6).toFixed(1)} MB)`);
  }
}

const manifest = Object.fromEntries(
  Object.entries(config.models).map(([id, m]) => [
    id,
    { label: m.label, files: m.files.map(({ name, sha256, bytes }) => ({ name, sha256, bytes })) },
  ]),
);
await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest));
console.log('manifest.json scritto');
