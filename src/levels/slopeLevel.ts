// Level 3 definition and the bounded search used to calibrate it.
import { SlopeModel, runSlope, SlopePlan, judgeSlope, YearActions, BUDGET3 } from '../model/slope';
import { survival } from '../model/season';
import { A } from '../model/assumptions';

export const LEVEL3 = {
  id: 3, title: 'Neutral Ground',
  targetNative: A.targetL3Native.value, // m² of planted native grass established on the east slope by 2023-09-30 (game target)
  star3Tokens: A.star3L3Tokens.value,
  budget: BUDGET3,
};

/** Dead area that will be bare at the start of year y (for “re-seed the bare patches”). */
export function bareAt(m: SlopeModel, plan: SlopePlan, y: number, cls: 'grassland' | 'riparian') {
  if (y === 0) return 0;
  const r = runSlope(m, plan.slice(0, y).concat(new Array(3 - y).fill({})) as SlopePlan);
  return r.years[y - 1][cls].bare + r.cohorts.filter((c) => c.cls === cls && c.year === y - 1).reduce((s, c) => s + c.areaM2 * (1 - (c.survival ?? 0)), 0)
    - 0; // area already re-seeded earlier is excluded by the model's bookkeeping
}

export function planLabel3(p: SlopePlan) {
  const yrs = ['2020', '2021', '2022'];
  return p.map((a, y) => {
    const parts: string[] = [];
    if (a.replantSlope?.areaM2) parts.push(`replant ${Math.round(a.replantSlope.areaM2)} m²${a.replantSlope.water ? ' +water' : ''}`);
    if (a.trees?.areaM2) parts.push(`trees ${a.trees.areaM2} m²`);
    if (a.clearEuc?.trees) parts.push(`clear ${a.clearEuc.trees} eucalyptus${a.clearEuc.keepBig ? ' (keep 2 big)' : ''}`);
    if (a.replantCreek?.areaM2) parts.push(`creek natives ${Math.round(a.replantCreek.areaM2)} m²${a.replantCreek.water ? ' +water' : ''}`);
    if (a.closeTrail) parts.push('close trail');
    return parts.length ? `${yrs[y]}: ${parts.join(', ')}` : '';
  }).filter(Boolean).join(' · ') || 'Leave it as is';
}

export function enumerateLevel3(m: SlopeModel) {
  const sGrassW = (y: number) => survival(m.col('seedGrass', y, true).severeDays[y]);
  const sGrassD = (y: number) => survival(m.col('seedGrass', y, false).severeDays[y]);
  const sWillowW = (y: number) => survival(m.col('seedWillow', y, true).severeDays[y]);
  const sWillowD = (y: number) => survival(m.col('seedWillow', y, false).severeDays[y]);
  const plans: SlopePlan[] = [];
  const areas = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
  for (const a0 of areas) for (const w0 of a0 ? [false, true] : [false]) for (const t0 of [0, 250, 500]) for (const euc of [0, 4, 8, 10]) for (const creek of euc ? ['none', 'water', 'dry'] : ['none'])
    for (const trail0 of [false, true]) {
      const y0: YearActions = { replantSlope: a0 ? { areaM2: a0, water: w0 } : null, trees: t0 ? { areaM2: t0 } : null,
        clearEuc: euc ? { trees: euc, keepBig: euc === 8 } : null, replantCreek: euc && creek !== 'none' ? { areaM2: euc * 50, water: creek === 'water' } : null, closeTrail: trail0 };
      const dead0Slope = a0 * (1 - (w0 ? sGrassW(0) : sGrassD(0)));
      const removedArea = euc * 50;
      const dead0Creek = creek === 'none' ? removedArea : removedArea * (1 - (creek === 'water' ? sWillowW(0) : sWillowD(0)));
      for (const reseed1 of ['none', 'water']) for (const extra1 of [0, 500, 1000]) for (const creek1 of dead0Creek > 0 ? ['none', 'water'] : ['none']) for (const trail1 of trail0 ? [false] : [false, true]) {
        const area1 = (reseed1 === 'water' ? dead0Slope : 0) + extra1;
        const y1: YearActions = { replantSlope: area1 > 0 ? { areaM2: area1, water: true } : null, replantCreek: creek1 === 'water' ? { areaM2: dead0Creek, water: true } : null, closeTrail: trail1 };
        const dead1Slope = (reseed1 === 'water' ? dead0Slope : 0) * (1 - sGrassW(1)) + extra1 * (1 - sGrassW(1)) + (reseed1 === 'none' ? 0 : 0);
        for (const reseed2 of ['none', 'water']) {
          const bare2 = (reseed1 === 'none' ? dead0Slope : 0) + dead1Slope;
          const y2: YearActions = { replantSlope: reseed2 === 'water' && bare2 > 0 ? { areaM2: bare2, water: true } : null };
          plans.push([y0, y1, y2]);
        }
      }
    }
  return plans;
}

export function solveLevel3(m: SlopeModel, target = LEVEL3.targetNative) {
  const plans = enumerateLevel3(m);
  const rows = plans.map((plan) => { const r = runSlope(m, plan); const j = judgeSlope(r, target); return { plan, r, j }; });
  return rows;
}
