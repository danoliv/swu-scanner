// La foto come ImageBitmap (nel browser): si disegnano solo le parti che servono, così non si tiene mai
// in memoria l'intera foto in RGBA (una foto da 12 megapixel pesa 48 MB).
import type { RawImage, Rect } from './image.ts';
import type { PhotoSource } from './photo-source.ts';

function draw(bitmap: ImageBitmap, source: Rect, width: number, height: number): RawImage {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D non disponibile');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: data.data, width: data.width, height: data.height };
}

export function bitmapPhotoSource(bitmap: ImageBitmap): PhotoSource {
  const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  return {
    width: bitmap.width,
    height: bitmap.height,
    work(maxSide) {
      const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      return draw(bitmap, full, Math.round(bitmap.width * k), Math.round(bitmap.height * k));
    },
    crop(rect, width, height) {
      const x = Math.max(0, Math.min(bitmap.width - 1, rect.x));
      const y = Math.max(0, Math.min(bitmap.height - 1, rect.y));
      const w = Math.max(1, Math.min(bitmap.width - x, rect.width));
      const h = Math.max(1, Math.min(bitmap.height - y, rect.height));
      return draw(bitmap, { x, y, width: w, height: h }, width, height);
    },
  };
}
