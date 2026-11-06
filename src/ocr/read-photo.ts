import type { OcrEngine, TextLine } from './engine.ts';
import { rotateImage, unrotateBox, type RawImage } from './image.ts';

/**
 * Legge una foto in tutte le orientazioni (0°, 90°, 180°, 270°) e riporta i riquadri alla foto
 * di partenza, con la rotazione con cui ogni riga è stata letta (SPEC §5).
 */
export async function readPhoto(
  engine: OcrEngine,
  image: RawImage,
  rotations: readonly (0 | 90 | 180 | 270)[] = [0, 90, 180, 270],
): Promise<TextLine[]> {
  if (engine.recognizeAllOrientations && rotations.length === 4) {
    return engine.recognizeAllOrientations(image);
  }
  const all: TextLine[] = [];
  for (const rotation of rotations) {
    const lines = await engine.recognize(rotateImage(image, rotation));
    for (const l of lines) {
      all.push({ ...l, box: unrotateBox(l.box, rotation, image.width, image.height), rotation });
    }
  }
  return all;
}
