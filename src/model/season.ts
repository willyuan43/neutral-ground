// Daily water balance for level 3 (docs/04 A, simplified) + survival (E) + relative erosion (F).
// Unit-area "columns" (one per kind of ground and planting year) run day by day on the real downtown-SF rain
// and ERA5 reference evapotranspiration. Plans are then evaluated by adding up areas × column results,
// so every number on the level-3 screen comes from these columns. All area changes happen on 1 October.
import { A } from './assumptions';

export interface DailyWeather { dates: string[]; precipMm: number[]; et0Mm: number[] }

export interface ColumnSpec {
  kc: number; rootM: number; cn: number; // curve number for HSG D
  awcMmPerM: number;
  dr0Frac: number; // starting depletion as a fraction of TAW
}
export interface ColumnPhase { from: number; spec: ColumnSpec; irrigateFrom?: number; irrigateTo?: number }
export interface ColumnResult {
  severeDays: number[]; // per water year (index 0 = WY2021 …)
  irrigationMm: number[]; // per water year
  rainMm: number[]; runoffMm: number[]; infilMm: number[]; etMm: number[]; deepMm: number[];
  balanceErrorMm: number; // closure over the whole run
  stressDayFlags: Uint8Array; // 1 = severe stress (Ks < 0.5) that day
  dr: Float32Array; // depletion (mm) each day, for the stage colours
}

export const WY_START = ['2020-10-01', '2021-10-01', '2022-10-01'];
export const WY_END = ['2021-09-30', '2022-09-30', '2023-09-30'];

/** Index of each water-year start in the weather arrays. */
export function wyIndex(w: DailyWeather) {
  return { start: WY_START.map((d) => w.dates.indexOf(d)), end: WY_END.map((d) => w.dates.indexOf(d)) };
}

/**
 * Run one unit-area column through the weather. Phases switch parameters on given day indices.
 * Root-zone depletion Dr (FAO-56); curve-number runoff with S varying with Dr (docs/04 A); ET = Kc·Ks·ET0.
 * Watering (“water it the first year”): inside the window, whenever depletion passes RAW, refill to field capacity (et_based). Water used is counted.
 */
export function runColumn(w: DailyWeather, phases: ColumnPhase[]): ColumnResult {
  const n = w.dates.length;
  const { start, end } = wyIndex(w);
  const wyOf = (i: number) => (i >= start[2] ? 2 : i >= start[1] ? 1 : i >= start[0] ? 0 : -1);
  const res: ColumnResult = { severeDays: [0, 0, 0], irrigationMm: [0, 0, 0], rainMm: [0, 0, 0], runoffMm: [0, 0, 0], infilMm: [0, 0, 0], etMm: [0, 0, 0], deepMm: [0, 0, 0], balanceErrorMm: 0,
    stressDayFlags: new Uint8Array(n), dr: new Float32Array(n) };
  let ph = 0;
  let spec = phases[0].spec;
  let taw = spec.awcMmPerM * spec.rootM;
  let dr = spec.dr0Frac * taw;
  let storage0 = taw - dr;
  let inSum = 0, outSum = 0, storageAdj = 0;
  for (let i = 0; i < n; i++) {
    while (ph + 1 < phases.length && i >= phases[ph + 1].from) {
      // parameter change (only on 1 October): keep the relative wetness, account the storage jump separately
      ph++;
      const frac = taw > 0 ? dr / taw : 1;
      const before = taw - dr;
      spec = phases[ph].spec;
      taw = spec.awcMmPerM * spec.rootM;
      dr = frac * taw;
      storageAdj += (taw - dr) - before;
    }
    const P = w.precipMm[i], et0 = w.et0Mm[i];
    const raw = A.p.value * taw;
    // irrigation
    let irr = 0;
    const cur = phases[ph];
    // first-year watering (docs/04 A/E, 'et_based'): whenever depletion passes the easily-available level (RAW), refill to field capacity
    if (cur.irrigateFrom != null && cur.irrigateTo != null && i >= cur.irrigateFrom && i <= cur.irrigateTo && dr > raw) { irr = dr; dr = 0; }
    // runoff (curve number with soil-dryness dependent S)
    const cn = spec.cn;
    const cnI = cn / (2.281 - 0.01281 * cn), cnIII = cn / (0.427 + 0.00573 * cn);
    const sI = 25400 / cnI - 254, sIII = 25400 / cnIII - 254;
    const S = taw > 0 ? sIII + (sI - sIII) * Math.min(1, Math.max(0, dr / taw)) : sIII;
    const Q = P > 0.2 * S ? ((P - 0.2 * S) ** 2) / (P + 0.8 * S) : 0;
    const I = P - Q;
    // ET with stress
    const ks = dr <= raw ? 1 : taw > raw ? Math.max(0, (taw - dr) / (taw - raw)) : 0;
    let et = spec.kc * ks * et0;
    dr = dr - I + et;
    let deep = 0;
    if (dr < 0) { deep = -dr; dr = 0; }
    if (dr > taw) { et -= dr - taw; dr = taw; }
    const y = wyOf(i);
    if (y >= 0) {
      res.rainMm[y] += P; res.runoffMm[y] += Q; res.infilMm[y] += I; res.etMm[y] += et; res.deepMm[y] += deep; res.irrigationMm[y] += irr;
      if (ks < A.severeKs.value) { res.severeDays[y]++; res.stressDayFlags[i] = 1; }
    }
    res.dr[i] = dr;
    inSum += P + irr; outSum += Q + et + deep;
  }
  const storage1 = taw - dr;
  res.balanceErrorMm = inSum - outSum - (storage1 - storage0 - storageAdj);
  return res;
}

export const survival = (severeDays: number) =>
  Math.min(A.sMax.value, Math.max(A.sMin.value, A.sMax.value - A.kPerSevereDay.value * severeDays));

// ---------------------------------------------------------------- column kinds
export type Kind = 'grass' | 'tree' | 'bare' | 'trail' | 'seedGrass' | 'seedWillow' | 'seedTree';
export function specFor(kind: Kind, awc = A.awcMissing.value): ColumnSpec {
  const D = 3; // index of soil group D in the CN rows (all level-3 cells are group D in the soil survey, except 12 unknown cells run as D)
  const dr0 = A.dryStart.value;
  switch (kind) {
    case 'grass': return { kc: A.grassKc.value, rootM: A.grassRootM.value, cn: A.cn.grass.value[D], awcMmPerM: awc, dr0Frac: dr0 };
    case 'tree': return { kc: A.treeKc.value, rootM: A.treeRootM.value, cn: A.cn.tree.value[D], awcMmPerM: awc, dr0Frac: dr0 };
    case 'bare': case 'trail': return { kc: A.bareKc.value, rootM: A.bareRootM.value, cn: A.cn.bare.value[D], awcMmPerM: awc, dr0Frac: dr0 };
    case 'seedGrass': return { kc: A.seedlingKc.value, rootM: A.seedlingRootM.value, cn: A.cn.grass.value[D], awcMmPerM: awc, dr0Frac: dr0 };
    case 'seedWillow': case 'seedTree': return { kc: A.seedlingKc.value, rootM: A.seedlingRootM.value, cn: A.cn.youngTrees.value[D], awcMmPerM: awc, dr0Frac: dr0 };
  }
}
