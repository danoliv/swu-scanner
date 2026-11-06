// La foto vista dalla scansione: l'immagine di lavoro ridotta e i ritagli ingranditi dalla foto a piena
// risoluzione. Nel browser la foto non si tiene mai intera in RGBA (una foto da 12 megapixel pesa 48 MB):
// si disegnano solo le parti che servono.
import { cropImage, resizeImage, type RawImage, type Rect } from './image.ts';

export interface PhotoSource {
  readonly width: number;
  readonly height: number;
  /** La foto ridotta in modo che il lato lungo non superi `maxSide` (invariata se è già più piccola). */
  work(maxSide: number): RawImage | Promise<RawImage>;
  /** Un rettangolo della foto a piena risoluzione (coordinate della foto), portato a `width × height`. */
  crop(rect: Rect, width: number, height: number): RawImage | Promise<RawImage>;
}

export const isRawImage = (x: RawImage | PhotoSource): x is RawImage => 'data' in x;

/** Una sorgente su un'immagine già in memoria (script, test). */
export function rawPhotoSource(img: RawImage): PhotoSource {
  return {
    width: img.width,
    height: img.height,
    work(maxSide) {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      return k < 1 ? resizeImage(img, Math.round(img.width * k), Math.round(img.height * k)) : img;
    },
    crop(rect, width, height) {
      return resizeImage(cropImage(img, rect), Math.max(1, width), Math.max(1, height));
    },
  };
}
