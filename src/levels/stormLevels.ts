// Level 1–2 definitions and the exhaustive search used to calibrate them (scripts/solve-levels.mjs).
// Targets are GAME targets picked from the model's own result distribution — not real-world standards.
import { runStorm, StormPlan, StormResult, StormSite, GardenSize, TankSize, TankStart, tankStartFromDaily } from '../model/storm';
import { A } from '../model/assumptions';

export interface StormLevelDef {
  id: 1 | 2;
  storm: 'SFO' | 'OAK';
  title: string;
  budget: number | null; // build tokens; null = no budget (level 1)
  sizes: GardenSize[];
  maxGardens: number;
  tools: { tank: boolean; disconnect: boolean; paving: boolean };
  targetPeak: number; // m³ in the biggest hour reaching the drain (≤)
  targetKept: number | null; // m³ kept out of the drain vs doing nothing (≥)
  star3Budget?: number; // level 2: ★★ = spend ≤ this many tokens (name kept for compatibility)
}

export const COST = A.stormCost.value as { gardenS: number; gardenM: number; gardenL: number; tankS: number; tankL: number; disconnect: number; paving: number };

export const LEVEL1: StormLevelDef = {
  id: 1, storm: 'SFO', title: 'Where does the water go?', budget: null, sizes: ['M', 'S'], maxGardens: 1,
  tools: { tank: false, disconnect: false, paving: false }, targetPeak: A.targetL1Peak.value, targetKept: null,
};
export const LEVEL2: StormLevelDef = {
  id: 2, storm: 'OAK', title: 'The Long Storm', budget: A.budgetL2.value, sizes: ['S', 'M', 'L'], maxGardens: 2,
  tools: { tank: true, disconnect: true, paving: true }, targetPeak: A.targetL2Peak.value, targetKept: A.targetL2Kept.value, star3Budget: A.star2L2Tokens.value,
};

export function planCost(p: StormPlan): number {
  let c = 0;
  for (const g of p.gardens) c += g.size === 'S' ? COST.gardenS : g.size === 'M' ? COST.gardenM : COST.gardenL;
  if (p.tank) c += p.tank.size === 'S' ? COST.tankS : COST.tankL;
  if (p.disconnect) c += COST.disconnect;
  if (p.paving) c += COST.paving;
  return c;
}

export interface Judged { peak: number; kept: number; cost: number; passPeak: boolean; passKept: boolean; pass: boolean; overBudget: boolean }
export function judge(level: StormLevelDef, base: StormResult, r: StormResult, plan: StormPlan): Judged {
  const peak = r.peakM3;
  const kept = base.drainTotal - r.drainTotal;
  const cost = planCost(plan);
  const passPeak = peak <= level.targetPeak + 1e-9;
  const passKept = level.targetKept == null ? true : kept >= level.targetKept - 1e-9;
  const overBudget = level.budget != null && cost > level.budget;
  return { peak, kept, cost, passPeak, passKept, overBudget, pass: passPeak && passKept && !overBudget };
}

export function enumeratePlans(level: StormLevelDef, site: StormSite): StormPlan[] {
  const ids = site.candidates.map((c) => c.id);
  const gs: { cand: string; size: GardenSize }[][] = [[]];
  for (const a of ids) for (const s of level.sizes) gs.push([{ cand: a, size: s }]);
  if (level.maxGardens >= 2)
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (const sa of level.sizes) for (const sb of level.sizes)
      gs.push([{ cand: ids[i], size: sa }, { cand: ids[j], size: sb }]);
  const tanks: (null | { size: TankSize; release: 'closed' | 'slow' })[] = level.tools.tank
    ? [null, { size: 'S', release: 'closed' }, { size: 'S', release: 'slow' }, { size: 'L', release: 'closed' }, { size: 'L', release: 'slow' }] : [null];
  const discs: (false | 'west' | 'east')[] = level.tools.disconnect ? [false, 'west', 'east'] : [false];
  const pavs = level.tools.paving ? [false, true] : [false];
  const out: StormPlan[] = [];
  for (const g of gs) for (const t of tanks) for (const d of discs) for (const p of pavs) out.push({ gardens: g, tank: t, disconnect: d, paving: p });
  return out;
}

export const planLabel = (p: StormPlan) =>
  [p.gardens.map((g) => `Garden ${g.size}@${g.cand}`).join(' + '), p.tank ? `Tank ${p.tank.size} (${p.tank.release})` : '', p.disconnect ? `Disconnect roof → ${p.disconnect} lawn` : '', p.paving ? 'Permeable paving' : '']
    .filter(Boolean).join(' + ') || 'Leave it as is';

export function solveStormLevel(level: StormLevelDef, site: StormSite, rain: number[], tankStart?: TankStart) {
  const base = runStorm(site, rain, { gardens: [] }, { tankStart });
  const plans = enumeratePlans(level, site);
  const rows = plans.map((plan) => { const r = runStorm(site, rain, plan, { tankStart }); return { plan, label: planLabel(plan), ...judge(level, base, r, plan), balance: r.balanceError }; });
  return { base, rows };
}

/** Calendar date of a storm window (the day of its first hourly interval's end), e.g. 2022-12-31. */
export const stormDate = (startLocal: string) => startLocal.slice(0, 10);
export function tankStartFor(site: StormSite, daily: { dates: string[]; precipMm: number[] }, startLocal: string): TankStart {
  return tankStartFromDaily(site, daily, stormDate(startLocal));
}

// ---------------------------------------------------------------- guesses (three bins; truth comes from the model run)
/** The guess asked before a run: three bins on the level's main number (level 1: biggest hour; level 2: kept out). */
export function guessChoices(level: 1 | 2, L: StormLevelDef) {
  const lo = A.guessL1LowM3.value, w = A.guessL2BinM3.value;
  if (level === 1) return [{ id: 'low', label: `Under ${lo} m³` }, { id: 'mid', label: `${lo}–${L.targetPeak} m³` }, { id: 'high', label: `Over ${L.targetPeak} m³` }];
  const y = L.targetKept ?? 0;
  return [{ id: 'low', label: `Under ${y} m³` }, { id: 'mid', label: `${y}–${y + w} m³` }, { id: 'high', label: `Over ${y + w} m³` }];
}
export function guessTruth(level: 1 | 2, L: StormLevelDef, j: { peak: number; kept: number }) {
  // same 1e-9 tolerance as judge(), so a plan that just passes is never put in the failing bin
  if (level === 1) return j.peak < A.guessL1LowM3.value - 1e-9 ? 'low' : j.peak <= L.targetPeak + 1e-9 ? 'mid' : 'high';
  const y = L.targetKept ?? 0;
  return j.kept < y - 1e-9 ? 'low' : j.kept <= y + A.guessL2BinM3.value + 1e-9 ? 'mid' : 'high';
}
