// Level 3 model: restoration through the real 2020-10 → 2023-09 weather (docs/04 A, E, F, S, W — prototype version).
// Areas (m²) are tracked per water year; every change happens on 1 October. Unit-area daily columns (season.ts)
// give survival, watering and infiltration; erosion is a relative, storm-weighted RUSLE-style index (no tonnes).
import { A } from './assumptions';
import { runColumn, specFor, survival, wyIndex, DailyWeather, ColumnResult, Kind } from './season';

export interface SlopeClassData { areaM2: number; grass: { areaM2: number; ls: number }; tree: { areaM2: number; ls: number }; rock: { areaM2: number }; water: { areaM2: number }; paved: { areaM2: number } }
export interface SlopeData { classes: { grassland: SlopeClassData; riparian: SlopeClassData }; trail: { areaM2: number; ls: number; lengthM: number } | null }

export interface YearActions {
  /** waterFrom: day index (weather arrays) on which watering starts, when it was not planned from 1 October (“Water now”) */
  replantSlope?: { areaM2: number; water: boolean; waterFrom?: number } | null;
  replantCreek?: { areaM2: number; water: boolean } | null;
  trees?: { areaM2: number } | null; // planted trees are always watered their first year
  clearEuc?: { trees: number; keepBig: boolean } | null;
  closeTrail?: boolean;
  check?: boolean;
}
export type SlopePlan = YearActions[]; // index 0 = decisions on 2020-10-01, 1 = 2021-10-01, 2 = 2022-10-01

export const COSTS3 = {
  ...(A.slopeCost.value as { tokensPer250m2Replant: number; tokensPer100m2Trees: number; tokensPerTreeRemoved: number; tokensCloseTrail: number; sweatPer100m2Plant: number; sweatPer100m2Water: number; sweatPerTreeRemoved: number; sweatCloseTrail: number; sweatTrailPatrol: number; sweatCheck: number }),
  crownM2: A.treeCrownM2.value, maxEuc: A.planEucalyptusMax.value, keepBigTrees: A.keepBigTrees.value,
};
export const BUDGET3 = A.budgetL3.value as { tokens: number; sweatPerYear: number; waterPerYearM3: number };

export interface Cohort { cls: 'grassland' | 'riparian'; kind: 'grass' | 'tree' | 'willow'; year: number; areaM2: number; watered: boolean; waterFrom?: number; severeDays?: number; survival?: number; irrigationM3?: number; reseed: boolean }
export interface ClassYear {
  // areas during the water year (after the 1 October changes)
  grass: number; trail: number; closedTrail: number; tree: number; bare: number; seedlings: number; establishing: number; established: number; staticArea: number;
  matching: number; erosion: number; infil: number; rain: number;
}
export type Indicator = 'better' | 'same' | 'worse' | 'insufficient';
export interface LdnClass {
  touched: boolean; status: 'net_gain' | 'neutral' | 'net_loss' | 'not_touched';
  area: { plan: number; base: number; delta: number; verdict: Indicator };
  water: { plan: number; base: number; verdict: Indicator };
  erosion: { ratio: number; verdict: Indicator };
  bareEnd: { plan: number; base: number };
  short: { matchingDelta: number; erosionRatio: number; bare: number };
}
export type Face = 'closer' | 'same' | 'further' | 'insufficient';
export interface SlopeResult {
  years: { grassland: ClassYear; riparian: ClassYear }[];
  cohorts: Cohort[];
  establishedNative: number; // m² of planted native grass established on the east slope by 2023-09-30 (× progress)
  willowEstablished: number;
  ldn: { grassland: LdnClass; riparian: LdnClass };
  faces: { butterfly: Face; damselfly: Face; hawk: Face; hawkRows: { bigTrees: Face; forage: Face }; removed: number; keptBig: number };
  tokens: number; sweat: number[]; water: number[]; overBudget: { tokens: boolean; sweat: boolean[]; water: boolean[] };
  stormWeights: number[]; diagnostics: { code: string; text: string }[];
  balanceErrorMm: number;
}

// ------------------------------------------------------------------ columns (cached per weather + AWC)
type ColKey = string;
export class SlopeModel {
  w: DailyWeather; d: SlopeData; awc: number;
  cols = new Map<ColKey, ColumnResult>();
  stormW: number[]; // storm weight per water year: Σ max(0, P − erosive threshold) (teaching erosivity proxy)
  idx: ReturnType<typeof wyIndex>;
  constructor(w: DailyWeather, d: SlopeData, awc = A.awcMissing.value) {
    this.w = w; this.d = d; this.awc = awc; this.idx = wyIndex(w);
    this.stormW = [0, 1, 2].map((y) => { let s = 0; for (let i = this.idx.start[y]; i <= this.idx.end[y]; i++) s += Math.max(0, w.precipMm[i] - A.erosiveRainMm.value); return s; });
  }
  /** `from`: watering starts on this day index instead of 1 October (only for a watered planting in its first year). */
  col(kind: Kind, plantYear = -1, watered = false, from?: number): ColumnResult {
    const f = watered && plantYear >= 0 && from != null && from > this.idx.start[plantYear] ? Math.min(from, this.idx.end[plantYear]) : undefined;
    const key = `${kind}|${plantYear}|${watered}${f != null ? `|${f}` : ''}`;
    if (!this.cols.has(key)) {
      const { start, end } = this.idx;
      let phases;
      if (plantYear < 0) phases = [{ from: 0, spec: specFor(kind, this.awc) }];
      else {
        const before: Kind = kind === 'seedWillow' ? 'bare' : 'grass';
        const after: Kind = kind === 'seedGrass' ? 'grass' : 'tree';
        phases = [{ from: 0, spec: specFor(before, this.awc) },
          { from: start[plantYear], spec: specFor(kind, this.awc), irrigateFrom: watered ? (f ?? start[plantYear]) : undefined, irrigateTo: watered ? end[plantYear] : undefined }];
        if (plantYear < 2) phases.push({ from: start[plantYear + 1], spec: specFor(after, this.awc) });
      }
      this.cols.set(key, runColumn(this.w, phases));
    }
    return this.cols.get(key)!;
  }
  infilFrac(c: ColumnResult, y: number) { return c.rainMm[y] > 0 ? c.infilMm[y] / c.rainMm[y] : 1; }
}

const C = () => A.cFactor.value;
export const EST_YEARS = A.estYears.value;

export function emptyPlan(): SlopePlan { return [{}, {}, {}]; }

export function runSlope(m: SlopeModel, plan: SlopePlan): SlopeResult {
  const d = m.d;
  const g0 = d.classes.grassland, r0 = d.classes.riparian;
  const trailArea = d.trail?.areaM2 ?? 0;
  // starting state
  const st = {
    grassland: { grass: g0.grass.areaM2 - trailArea, trail: trailArea, closedTrail: 0, tree: g0.tree.areaM2, bare: 0, staticArea: g0.rock.areaM2 + g0.paved.areaM2 + g0.water.areaM2 },
    riparian: { grass: 0, trail: 0, closedTrail: 0, tree: r0.tree.areaM2, bare: 0, staticArea: r0.rock.areaM2 + r0.water.areaM2 + r0.paved.areaM2 },
  };
  const cohorts: Cohort[] = [];
  const years: SlopeResult['years'] = [];
  const sweat = [0, 0, 0], water = [0, 0, 0];
  let tokens = 0, removed = 0, keptBig = 0;
  const diag: { code: string; text: string }[] = [];
  const cf = C();
  for (let y = 0; y < 3; y++) {
    const a = plan[y] ?? {};
    // ---- 1 October changes
    if (a.closeTrail && st.grassland.trail > 0) {
      st.grassland.closedTrail += st.grassland.trail; st.grassland.trail = 0;
      tokens += COSTS3.tokensCloseTrail; sweat[y] += COSTS3.sweatCloseTrail;
    }
    if (a.clearEuc && a.clearEuc.trees > 0) {
      // “keep some big trees” is decided at the first removal (later years can't un-cut a tree)
      if (removed === 0 && a.clearEuc.keepBig) keptBig = COSTS3.keepBigTrees;
      const cap = COSTS3.maxEuc - keptBig - removed;
      const n = Math.max(0, Math.min(a.clearEuc.trees, cap));
      removed += n;
      const area = n * COSTS3.crownM2;
      st.riparian.tree -= area; st.riparian.bare += area;
      tokens += n * COSTS3.tokensPerTreeRemoved; sweat[y] += n * COSTS3.sweatPerTreeRemoved;
    }
    if (a.replantCreek && a.replantCreek.areaM2 > 0) {
      const area = Math.min(a.replantCreek.areaM2, st.riparian.bare);
      if (area > 0) {
        st.riparian.bare -= area;
        cohorts.push({ cls: 'riparian', kind: 'willow', year: y, areaM2: area, watered: a.replantCreek.water, reseed: y > 0 });
        tokens += Math.ceil(area / 250) * COSTS3.tokensPer250m2Replant; sweat[y] += (area / 100) * COSTS3.sweatPer100m2Plant;
      }
    }
    if (a.replantSlope && a.replantSlope.areaM2 > 0) {
      let area = a.replantSlope.areaM2;
      const fromBare = Math.min(area, st.grassland.bare); st.grassland.bare -= fromBare;
      const fromGrass = Math.min(area - fromBare, st.grassland.grass); st.grassland.grass -= fromGrass;
      area = fromBare + fromGrass;
      if (area > 0) {
        // “Water now” on the first day is the same as watering from 1 October; after the year it changes nothing
        const raw = a.replantSlope.waterFrom;
        const full = a.replantSlope.water || (raw != null && raw <= m.idx.start[y]);
        const wf = !full && raw != null && raw <= m.idx.end[y] ? raw : undefined;
        cohorts.push({ cls: 'grassland', kind: 'grass', year: y, areaM2: area, watered: full || wf != null, waterFrom: wf, reseed: fromBare > 0 });
        tokens += Math.ceil(area / 250) * COSTS3.tokensPer250m2Replant; sweat[y] += (area / 100) * COSTS3.sweatPer100m2Plant;
      }
    }
    if (a.trees && a.trees.areaM2 > 0) {
      const area = Math.min(a.trees.areaM2, st.grassland.grass);
      st.grassland.grass -= area;
      cohorts.push({ cls: 'grassland', kind: 'tree', year: y, areaM2: area, watered: true, reseed: false });
      tokens += Math.ceil(area / 100) * COSTS3.tokensPer100m2Trees; sweat[y] += (area / 100) * COSTS3.sweatPer100m2Plant;
    }
    if (a.check) sweat[y] += COSTS3.sweatCheck;
    if (st.grassland.closedTrail > 0 && !a.closeTrail) sweat[y] += COSTS3.sweatTrailPatrol;
    // ---- during the water year
    const yr = {} as { grassland: ClassYear; riparian: ClassYear };
    for (const cls of ['grassland', 'riparian'] as const) {
      const s = st[cls];
      const lsG = cls === 'grassland' ? g0.grass.ls : r0.tree.ls;
      const lsT = cls === 'grassland' ? g0.tree.ls : r0.tree.ls;
      const lsTrail = d.trail?.ls ?? lsG;
      const colGrass = m.col('grass'), colTree = m.col('tree'), colBare = m.col('bare');
      let ero = 0, infil = 0, rain = 0, seedlings = 0, establishing = 0, established = 0, matching = 0;
      const add = (area: number, c: ColumnResult, cfac: number, ls: number) => {
        ero += area * cfac * ls; infil += area * c.infilMm[y]; rain += area * c.rainMm[y];
      };
      add(s.grass, colGrass, cf.grass, lsG);
      add(s.closedTrail, colGrass, cf.grass, lsTrail);
      add(s.trail, colBare, cf.bare, lsTrail);
      add(s.tree, colTree, cf.tree, lsT);
      add(s.bare, colBare, cf.bare, cls === 'grassland' ? lsG : lsT);
      rain += s.staticArea * colGrass.rainMm[y]; infil += 0; // rock/water/paving: no infiltration counted (static, same in every plan)
      if (cls === 'grassland') matching += s.grass + s.closedTrail;
      for (const co of cohorts.filter((c) => c.cls === cls)) {
        const kindCol: Kind = co.kind === 'grass' ? 'seedGrass' : co.kind === 'tree' ? 'seedTree' : 'seedWillow';
        const ls = co.cls === 'grassland' ? (co.kind === 'tree' ? lsG : lsG) : lsT;
        const targetC = co.kind === 'grass' ? cf.grass : cf.tree;
        if (co.year === y) {
          const c = m.col(kindCol, y, co.watered, co.waterFrom);
          add(co.areaM2, c, cf.seedling, ls);
          seedlings += co.areaM2;
        } else if (co.year < y) {
          const surv = co.areaM2 * (co.survival ?? 0);
          const dead = co.areaM2 - surv;
          const p = Math.min(1, (y - co.year) / EST_YEARS[co.kind]);
          const c = co.kind === 'grass' ? colGrass : colTree;
          add(surv, c, cf.seedling + (targetC - cf.seedling) * p, ls);
          if (p >= 1) established += surv; else establishing += surv;
          if (co.kind === 'grass' && cls === 'grassland') matching += surv * p;
          if (co.kind === 'willow') matching += surv * p;
          // dead part is bare — but it may have been re-seeded: re-seeding moves area out of `bare` (tracked in s.bare)
          void dead;
        }
      }
      yr[cls] = { grass: s.grass, trail: s.trail, closedTrail: s.closedTrail, tree: s.tree, bare: s.bare, seedlings, establishing, established, staticArea: s.staticArea,
        matching, erosion: ero * m.stormW[y], infil, rain };
    }
    years.push(yr);
    // ---- 30 September: settle the cohorts planted this year; dead area becomes bare on 1 October
    for (const co of cohorts.filter((c) => c.year === y)) {
      const kindCol: Kind = co.kind === 'grass' ? 'seedGrass' : co.kind === 'tree' ? 'seedTree' : 'seedWillow';
      const c = m.col(kindCol, y, co.watered, co.waterFrom);
      co.severeDays = c.severeDays[y];
      co.survival = survival(co.severeDays);
      co.irrigationM3 = co.watered ? (c.irrigationMm[y] * co.areaM2) / 1000 : 0;
      water[y] += co.irrigationM3;
      // watering started late (A.lateWaterSweat): hours scale with the water carried, against a full year of watering
      const share = co.waterFrom == null ? 1 : (() => { const full = m.col(kindCol, y, true).irrigationMm[y]; return full > 0 ? Math.min(1, c.irrigationMm[y] / full) : 0; })();
      if (co.watered) sweat[y] += (co.areaM2 / 100) * COSTS3.sweatPer100m2Water * share;
      const dead = co.areaM2 * (1 - co.survival);
      st[co.cls].bare += dead;
    }
  }
  // ---- end-of-scenario numbers
  const pEnd = (co: Cohort) => Math.min(1, (2 - co.year) / EST_YEARS[co.kind]);
  const establishedNative = cohorts.filter((c) => c.cls === 'grassland' && c.kind === 'grass').reduce((s, c) => s + c.areaM2 * (c.survival ?? 0) * pEnd(c), 0);
  const willowEstablished = cohorts.filter((c) => c.kind === 'willow').reduce((s, c) => s + c.areaM2 * (c.survival ?? 0) * pEnd(c), 0);
  const touched = {
    grassland: plan.some((a) => a?.closeTrail || (a?.replantSlope?.areaM2 ?? 0) > 0 || (a?.trees?.areaM2 ?? 0) > 0),
    riparian: plan.some((a) => (a?.clearEuc?.trees ?? 0) > 0 || (a?.replantCreek?.areaM2 ?? 0) > 0),
  };
  const result: SlopeResult = { years, cohorts, establishedNative, willowEstablished, ldn: null as any, faces: null as any, tokens, sweat, water,
    overBudget: { tokens: tokens > BUDGET3.tokens, sweat: sweat.map((v) => v > BUDGET3.sweatPerYear + 1e-9), water: water.map((v) => v > BUDGET3.waterPerYearM3 + 1e-9) },
    stormWeights: m.stormW, diagnostics: diag, balanceErrorMm: Math.max(...[...m.cols.values()].map((c) => Math.abs(c.balanceErrorMm))) };
  return { ...result, ...finish(m, plan, result, touched, removed, keptBig) };
}

// baseline cache per model
const baseCache = new WeakMap<SlopeModel, SlopeResult>();
export function baseline(m: SlopeModel): SlopeResult {
  if (!baseCache.has(m)) baseCache.set(m, runSlopeRaw(m));
  return baseCache.get(m)!;
}
function runSlopeRaw(m: SlopeModel): SlopeResult {
  // same as runSlope with an empty plan, without LDN (avoids recursion)
  const r = runSlopeNoFinish(m);
  return r;
}
function runSlopeNoFinish(m: SlopeModel): SlopeResult {
  const plan = emptyPlan();
  const saved = finishEnabled; finishEnabled = false;
  try { return runSlope(m, plan); } finally { finishEnabled = saved; }
}
let finishEnabled = true;

function verdictUp(delta: number, band: number): Indicator { return delta > band ? 'better' : delta < -band ? 'worse' : 'same'; }

function finish(m: SlopeModel, plan: SlopePlan, r: SlopeResult, touched: { grassland: boolean; riparian: boolean }, removed: number, keptBig: number) {
  if (!finishEnabled) return { ldn: null as any, faces: null as any };
  const b = baseline(m);
  const band = A.ldnBand.value;
  const ldnFor = (cls: 'grassland' | 'riparian'): LdnClass => {
    const areaCls = m.d.classes[cls].areaM2;
    // matching area at the end of the scenario (cohort progress as of 30 Sept 2023)
    const matchEnd = (res: SlopeResult) => {
      const y2 = res.years[2][cls];
      const pEnd = (co: Cohort) => Math.min(1, (2 - co.year) / EST_YEARS[co.kind]);
      const fromCohorts = res.cohorts.filter((c) => c.cls === cls && (c.kind === 'grass' || c.kind === 'willow')).reduce((s, c) => s + c.areaM2 * (c.survival ?? 0) * pEnd(c), 0);
      return (cls === 'grassland' ? y2.grass + y2.closedTrail : 0) + fromCohorts;
    };
    const aP = matchEnd(r), aB = matchEnd(b);
    // docs/04 W: compare with doing nothing (2% band). Grassland: relative to the baseline matching area.
    // Creek corridor: today's tree cover mixes willow and eucalyptus (not separable), so its baseline matching area is
    // unknown; changes there are judged relative to the class area instead (stated in the UI).
    const areaDen = cls === 'grassland' ? Math.max(1, aB) : areaCls;
    const areaVerdict = verdictUp((aP - aB) / areaDen, band);
    // water and erosion: the final water year (Oct 2022 – Sept 2023) vs doing nothing
    const yP = r.years[2][cls], yB = b.years[2][cls];
    const wP = yP.infil / Math.max(1e-9, yP.rain), wB = yB.infil / Math.max(1e-9, yB.rain);
    const waterVerdict = verdictUp(wP / wB - 1, band);
    const ratio = yB.erosion > 0 ? yP.erosion / yB.erosion : 1;
    const eroVerdict: Indicator = ratio > 1 + band ? 'worse' : ratio < 1 - band ? 'better' : 'same';
    const vs = [areaVerdict, waterVerdict, eroVerdict];
    const status = !touched[cls] ? 'not_touched' : vs.includes('worse') ? 'net_loss' : vs.includes('better') ? 'net_gain' : 'neutral';
    const s0 = r.years[0][cls], sb0 = b.years[0][cls];
    return {
      touched: touched[cls], status,
      area: { plan: aP, base: aB, delta: aP - aB, verdict: areaVerdict },
      water: { plan: wP, base: wB, verdict: waterVerdict },
      erosion: { ratio, verdict: eroVerdict },
      bareEnd: { plan: bareAtEnd(r, cls), base: bareAtEnd(b, cls) },
      short: { matchingDelta: s0.matching - sb0.matching, erosionRatio: sb0.erosion > 0 ? s0.erosion / sb0.erosion : 1, bare: s0.bare + s0.trail },
    };
  };
  const ldn = { grassland: ldnFor('grassland'), riparian: ldnFor('riparian') };
  // faces (docs/04 S; band face.sameBand)
  const fb = A.faceBand.value;
  const gl = ldn.grassland;
  const butterfly: Face = gl.area.base > 0 ? ((gl.area.delta / gl.area.base) > fb ? 'closer' : (gl.area.delta / gl.area.base) < -fb ? 'further' : 'same') : 'insufficient';
  const bigTrees: Face = removed > 0 && keptBig === 0 ? 'further' : 'same';
  const forage: Face = 'insufficient'; // MA-3b boundary not mapped (BOUNDARY_NOT_MAPPED)
  const hawk: Face = bigTrees === 'further' ? 'further' : 'insufficient';
  const damselfly: Face = 'same'; // no channel maintenance in this level
  return { ldn, faces: { butterfly, damselfly, hawk, hawkRows: { bigTrees, forage }, removed, keptBig } };
}

function bareAtEnd(r: SlopeResult, cls: 'grassland' | 'riparian') {
  // bare during the last year + area that died at the last settlement (it turns bare on 1 Oct 2023)
  const y2 = r.years[2][cls];
  const diedLast = r.cohorts.filter((c) => c.cls === cls && c.year === 2).reduce((s, c) => s + c.areaM2 * (1 - (c.survival ?? 0)), 0);
  return y2.bare + y2.trail + diedLast;
}

export function judgeSlope(r: SlopeResult, targetNative: number) {
  const noLoss = r.ldn.grassland.status !== 'net_loss' && r.ldn.riparian.status !== 'net_loss';
  const budgetOk = !r.overBudget.tokens && !r.overBudget.sweat.some(Boolean) && !r.overBudget.water.some(Boolean);
  const goal = r.establishedNative >= targetNative - 1e-9;
  return { goal, noLoss, budgetOk, pass: goal && noLoss && budgetOk };
}
