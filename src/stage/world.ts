// Display coordinates. 1 world unit = 10 m horizontally. Vertical exaggeration 1.5× (display only — never used in the model).
import type { GameData } from '../data/load';

export const H_SCALE = 1 / 10;
export const V_EXAG = 1.5;

export function makeWorld(d: GameData) {
  const { rows, cols, cellM, elevMin } = d.grid;
  const x = (c: number) => (c + 0.5 - cols / 2) * cellM * H_SCALE;
  const z = (r: number) => (r + 0.5 - rows / 2) * cellM * H_SCALE;
  const y = (e: number) => (e - elevMin) * V_EXAG * H_SCALE;
  const h = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows - 1, Math.round(r)));
    const cc = Math.max(0, Math.min(cols - 1, Math.round(c)));
    return y(d.elev[rr * cols + cc]);
  };
  // bilinear height at fractional cell coordinates
  const hAt = (r: number, c: number) => {
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(r))), c0 = Math.max(0, Math.min(cols - 1, Math.floor(c)));
    const r1 = Math.min(rows - 1, r0 + 1), c1 = Math.min(cols - 1, c0 + 1);
    const fr = Math.min(1, Math.max(0, r - r0)), fc = Math.min(1, Math.max(0, c - c0));
    const e = (rr: number, cc: number) => d.elev[rr * cols + cc];
    const v = e(r0, c0) * (1 - fr) * (1 - fc) + e(r0, c1) * (1 - fr) * fc + e(r1, c0) * fr * (1 - fc) + e(r1, c1) * fr * fc;
    return y(v);
  };
  const pos = (r: number, c: number, lift = 0): [number, number, number] => [x(c), h(r, c) + lift, z(r)];
  return { x, z, y, h, hAt, pos, rows, cols, cellM, width: cols * cellM * H_SCALE, depth: rows * cellM * H_SCALE };
}
export type World = ReturnType<typeof makeWorld>;

// Palette for the site-model look: natural, slightly muted park colours; the city around the park is shown pale
// (white-card context, like an architectural site model) so the eye goes to the park. Display only.
export const COVER_RGB: Record<number, [number, number, number]> = {
  0: [150, 158, 140],
  1: [206, 200, 188], // ground under buildings (the massing sits on top)
  2: [214, 208, 196], // paved
  3: [142, 196, 104], // turf
  4: [214, 194, 120], // grassland (golden)
  5: [156, 166, 104], // scrub
  6: [84, 122, 78], // under tree canopy
  7: [186, 142, 100], // bare
  8: [92, 166, 212], // water
  9: [170, 165, 154], // rock
};
export const CONTEXT_RGB: [number, number, number] = [226, 222, 212]; // city context base tone
