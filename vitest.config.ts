import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/ocr/**/*.ts', 'src/app/**/*.ts'],
      // Solo collegamento con onnxruntime-web: si verifica con scripts/ocr-compare.ts sui modelli veri.
      exclude: [
        'src/ocr/ppocr-engine.ts',
        // Solo DOM: si verifica con i test e2e su viewport telefono (Playwright).
        'src/app/app.ts',
        'src/app/dom.ts',
        'src/app/data.ts',
        'src/app/worker-scanner.ts',
        'src/ocr/worker.ts',
        'src/ocr/bitmap-photo.ts',
        'src/**/*.d.ts',
      ],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
