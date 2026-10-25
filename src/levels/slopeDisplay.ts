// Display mapping for level 3: turns the model's AREAS into which 5 m cells look like what.
// This is a display choice (the model has no positions inside a zone); documented in NOTES.md.
import type { SlopePlan, SlopeResult } from '../model/slope';
import { hash } from '../stage/Terrain';

export type CellLook = 'grass' | 'seedling' | 'establishing' | 'native' | 'bare' | 'youngTree' | 'trail' | 'closedTrail' | 'euc' | 'removed' | 'willowSeed' | 'willow';

export interface SlopeCells { g: number; r: number; c: number; cover: number; ls: number; zone: string }

/** Assign looks to cells for water year `y` (0..2) and phase ('during' the year or 'after' the 30 Sept settlement). */
export function cellLooks(grassCells: SlopeCells[], ripCells: SlopeCells[], trailCells: number[], plan: SlopePlan, r: SlopeResult | null, y: number, after: boolean,
  /** where the player planted (cells): the beds grow outwards from these spots */ center?: { r: number; c: number } | { r: number; c: number }[] | null) {
  const looks = new Map<number, CellLook>();
  const trailSet = new Set(trailCells);
  // grassland: candidate cells = grass cover, not on the trail; stable pseudo-random order
  // planting order: grow one patch outwards from the spot the player picked — by default the middle of MA-1e, then MA-1b
  // (a display choice: the model only tracks areas, so where the beds are drawn does not change any number)
  const e = grassCells.filter((x) => x.zone === 'MA-1e' && x.cover === 4);
  const er = e.reduce((s, x) => s + x.r, 0) / Math.max(1, e.length), ec = e.reduce((s, x) => s + x.c, 0) / Math.max(1, e.length);
  const cs = Array.isArray(center) ? center : center ? [center] : [];
  const dist = cs.length ? (x: SlopeCells) => Math.min(...cs.map((p) => Math.hypot(x.r - p.r, x.c - p.c))) + hash(x.g) * 0.8
    : (x: SlopeCells) => (x.zone === 'MA-1e' ? 0 : 1000) + Math.hypot(x.r - er, x.c - ec) + hash(x.g) * 0.8;
  const gl = grassCells.filter((x) => x.cover === 4 && !trailSet.has(x.g)).map((x) => ({ x, d: dist(x) })).sort((a, b) => a.d - b.d).map((o) => o.x);
  for (const x of gl) looks.set(x.g, 'grass');
  for (const t of trailCells) looks.set(t, 'trail');
  const rip = ripCells.filter((x) => x.cover === 6).sort((a, b) => hash(a.g * 11 + 3) - hash(b.g * 11 + 3));
  if (!r) return looks;
  let next = 0; // next fresh grass cell
  const bareQueue: number[] = []; // grassland cells that are bare (dead seedlings)
  const ripBare: number[] = [];
  let ripNext = 0;
  const toCells = (m2: number) => Math.max(0, Math.round(m2 / 25));
  for (let yy = 0; yy <= y; yy++) {
    const a = plan[yy] ?? {};
    if (a.closeTrail) for (const t of trailCells) looks.set(t, 'closedTrail');
    // creek: removed eucalyptus → bare, replanted → willow seedlings
    if (a.clearEuc?.trees) {
      const n = toCells(a.clearEuc.trees * 50);
      for (let k = 0; k < n && ripNext < rip.length; k++) { const g = rip[ripNext++].g; looks.set(g, 'removed'); ripBare.push(g); }
    }
    const cohortsThisYear = r.cohorts.filter((c) => c.year === yy);
    for (const co of cohortsThisYear) {
      const n = toCells(co.areaM2);
      const cells: number[] = [];
      if (co.cls === 'riparian') { while (cells.length < n && ripBare.length) cells.push(ripBare.shift()!); }
      else if (co.kind === 'grass') {
        while (cells.length < n && bareQueue.length) cells.push(bareQueue.shift()!);
        while (cells.length < n && next < gl.length) cells.push(gl[next++].g);
      } else { while (cells.length < n && next < gl.length) cells.push(gl[next++].g); }
      const seedLook: CellLook = co.cls === 'riparian' ? 'willowSeed' : co.kind === 'tree' ? 'youngTree' : 'seedling';
      for (const g of cells) looks.set(g, seedLook);
      // after the settlement of this cohort's year, dead cells turn bare, the rest establish
      const settled = yy < y || (yy === y && after);
      if (settled && co.survival != null) {
        const dead = Math.round(cells.length * (1 - co.survival));
        cells.forEach((g, k) => {
          if (k < dead) { looks.set(g, co.cls === 'riparian' ? 'removed' : 'bare'); if (co.cls === 'riparian') ripBare.push(g); else bareQueue.push(g); }
          else {
            const yearsSince = y - yy + (after && yy === y ? 0 : 0);
            const est = co.kind === 'tree' ? 'youngTree' : co.cls === 'riparian' ? (yearsSince >= 2 ? 'willow' : 'willowSeed') : (yearsSince >= 2 ? 'native' : 'establishing');
            looks.set(g, est as CellLook);
          }
        });
      }
    }
  }
  return looks;
}
