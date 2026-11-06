// Guscio convesso e rettangolo di area minima (rotating calipers), per i riquadri inclinati del testo.
export type Point = [x: number, y: number];

export interface RotatedRect {
  center: Point;
  /** Dimensioni dei lati: `width` lungo l'asse del rettangolo, `height` ortogonale. */
  width: number;
  height: number;
  /** Alto-sinistra, alto-destra, basso-destra, basso-sinistra (nel riferimento con y verso il basso). */
  corners: [Point, Point, Point, Point];
}

const cross = (o: Point, a: Point, b: Point): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Guscio convesso (algoritmo di Andrew), senza punti allineati sui lati. */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = pts.filter(
    (p, i) => i === 0 || p[0] !== pts[i - 1]?.[0] || p[1] !== pts[i - 1]?.[1],
  );
  if (unique.length <= 2) return unique;
  const half = (input: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of input) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(unique), ...half([...unique].reverse())];
}

/** Ordina quattro angoli come alto-sinistra, alto-destra, basso-destra, basso-sinistra. */
function orderCorners(c: Point[]): [Point, Point, Point, Point] {
  const byX = [...c].sort((a, b) => a[0] - b[0]);
  const left = byX.slice(0, 2).sort((a, b) => a[1] - b[1]);
  const right = byX.slice(2).sort((a, b) => a[1] - b[1]);
  return [left[0] as Point, right[0] as Point, right[1] as Point, left[1] as Point];
}

export function minAreaRect(points: readonly Point[]): RotatedRect {
  const hull = convexHull(points);
  const first = hull[0];
  if (!first)
    return {
      center: [0, 0],
      width: 0,
      height: 0,
      corners: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    };
  if (hull.length === 1) {
    return { center: first, width: 0, height: 0, corners: [first, first, first, first] };
  }

  let best = { area: Infinity, ux: 1, uy: 0, minU: 0, maxU: 0, minV: 0, maxV: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as Point;
    const b = hull[(i + 1) % hull.length] as Point;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uy;
      const v = -p[0] * uy + p[1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) best = { area, ux, uy, minU, maxU, minV, maxV };
  }

  const { ux, uy, minU, maxU, minV, maxV } = best;
  const at = (u: number, v: number): Point => [u * ux - v * uy, u * uy + v * ux];
  const corners = orderCorners([at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)]);
  const center = at((minU + maxU) / 2, (minV + maxV) / 2);
  return { center, width: maxU - minU, height: maxV - minV, corners };
}
