// Riquadri nel riferimento "dritto" della carta, per le righe lette con rotazione 90°, 180°, 270°.
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Il riquadro nel riferimento dritto della carta (senza traslazione: valgono solo i confronti tra
 * righe lette con la stessa rotazione). Con rotazione 90° il "sotto" della carta è a sinistra nella foto.
 */
export function upright(b: Box, rotation: Rotation): Box {
  switch (rotation) {
    case 90:
      return { x: b.y, y: -(b.x + b.width), width: b.height, height: b.width };
    case 180:
      return { x: -(b.x + b.width), y: -(b.y + b.height), width: b.width, height: b.height };
    case 270:
      return { x: -(b.y + b.height), y: b.x, width: b.height, height: b.width };
    default:
      return b;
  }
}

/** L'inverso di `upright`: dal riquadro dritto a quello nella foto. */
export function fromUpright(u: Box, rotation: Rotation): Box {
  switch (rotation) {
    case 90:
      return { x: -(u.y + u.height), y: u.x, width: u.height, height: u.width };
    case 180:
      return { x: -(u.x + u.width), y: -(u.y + u.height), width: u.width, height: u.height };
    case 270:
      return { x: u.y, y: -(u.x + u.width), width: u.height, height: u.width };
    default:
      return u;
  }
}
