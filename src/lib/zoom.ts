// Rilettura ingrandita (SPEC §5): quando il sottotitolo non è univoco si rilegge un ritaglio
// ingrandito attorno al titolo. Qui si calcola il ritaglio; la lettura la fa il motore OCR.
import { fromUpright, upright, type Box, type Rotation } from './geometry.ts';

/** Ritaglio nella foto: la zona del titolo e le righe sotto, in cui sta il sottotitolo. */
export function zoomCrop(
  titleBox: Box,
  rotation: Rotation,
  image: { width: number; height: number },
): Box {
  const t = upright(titleBox, rotation);
  const region: Box = {
    x: t.x - 0.5 * t.width,
    y: t.y - 0.5 * t.height,
    width: 2 * t.width,
    height: 6.5 * t.height,
  };
  const b = fromUpright(region, rotation);
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return {
    x,
    y,
    width: Math.min(image.width, b.x + b.width) - x,
    height: Math.min(image.height, b.y + b.height) - y,
  };
}
