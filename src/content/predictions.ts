// Predictions (T5): at most one question per autumn, about that autumn's main card, asked after the cards are played and
// before the year runs; skipping costs nothing. Plus one shared question before the New Year's Eve storm.
// The right answer is always a bin of a number the model computes for the player's own plan.
import { A } from '../model/assumptions';
import { survival } from '../model/season';
import type { Autumns, CampaignCtx, CampaignResult } from '../campaign/campaign';

export interface Choice { id: string; label: string }
export interface Question { key: string; year: number; prompt: string; choices: Choice[]; note?: string }

const [sLo, sHi] = A.guessSurvivalBins.value as number[];
const [wLo, wHi] = A.guessWaterGainBins.value as number[];
const [eLo, eHi] = A.guessErosionBins.value as number[];
const [pLo, pHi] = A.guessPeakBins.value as number[];

/** The question for autumn y (only 2020 asks one; 2021 is the light step; 2022 has the storm question instead). */
export function autumnQuestion(autumns: Autumns, y: number): Question | null {
  if (y !== 0) return null;
  const a = autumns[0];
  if ((a.replantSlope?.areaM2 ?? 0) > 0 && !a.replantSlope!.water) return { key: 'y0-survival', year: 0, prompt: 'How much survives its first dry summer?', choices: [{ id: 'most', label: 'Most of it' }, { id: 'half', label: 'About half' }, { id: 'few', label: 'Very little' }] };
  if ((a.replantSlope?.areaM2 ?? 0) > 0) return { key: 'y0-watering', year: 0, prompt: 'How many more seedlings will watering save?', choices: [{ id: 'many', label: 'Many more' }, { id: 'bit', label: 'A few more' }, { id: 'same', label: 'About the same' }] };
  if ((a.trees?.areaM2 ?? 0) > 0) return { key: 'y0-trees', year: 0, prompt: 'By 2023: more or less native grassland than doing nothing?', choices: [{ id: 'more', label: 'More' }, { id: 'same', label: 'About the same' }, { id: 'less', label: 'Less' }] };
  if (a.trail) return { key: 'y0-trail', year: 0, prompt: 'This year’s storms: how much less will the slope wash out?', choices: [{ id: 'lot', label: 'A lot less' }, { id: 'little', label: 'A little less' }, { id: 'none', label: 'No change' }] };
  return null;
}

export const STORM_QUESTION: Question = {
  key: 'storm', year: 2, prompt: 'Worst hour: how much less water reaches the drain?',
  choices: [{ id: 'much', label: 'Much less' }, { id: 'bit', label: 'A bit less' }, { id: 'same', label: 'About the same' }],
};

/** The right bin for a question, from the model run of the player's plan (and the do-nothing run for comparisons). */
export function truthFor(q: Question, ctx: CampaignCtx, r: CampaignResult, base: CampaignResult): { id: string; value: string } {
  if (q.key === 'y0-survival') {
    const c = r.slope.cohorts.find((x) => x.year === 0 && x.cls === 'grassland' && x.kind === 'grass');
    const s = c?.survival ?? 0;
    return { id: s >= sHi ? 'most' : s >= sLo ? 'half' : 'few', value: `${Math.round(s * 100)}% survived` };
  }
  if (q.key === 'y0-watering') {
    const sW = survival(ctx.model.col('seedGrass', 0, true).severeDays[0]), sD = survival(ctx.model.col('seedGrass', 0, false).severeDays[0]);
    const gain = sW - sD;
    return { id: gain >= wHi ? 'many' : gain >= wLo ? 'bit' : 'same', value: `${Math.round(sW * 100)}% watered vs ${Math.round(sD * 100)}% not watered` };
  }
  if (q.key === 'y0-trees') {
    const v = r.slope.ldn.grassland.area.verdict;
    return { id: v === 'better' ? 'more' : v === 'worse' ? 'less' : 'same', value: `${r.slope.ldn.grassland.area.delta >= 0 ? '+' : ''}${Math.round(r.slope.ldn.grassland.area.delta)} m² vs doing nothing` };
  }
  if (q.key === 'y0-trail') {
    const less = 1 - r.slope.ldn.grassland.short.erosionRatio;
    return { id: less >= eHi ? 'lot' : less >= eLo ? 'little' : 'none', value: `erosion index ×${r.slope.ldn.grassland.short.erosionRatio.toFixed(2)} vs doing nothing` };
  }
  // storm
  const less = (base.storm.peakM3 - r.storm.peakM3) / base.storm.peakM3;
  return { id: less >= pHi ? 'much' : less >= pLo ? 'bit' : 'same', value: `${r.storm.peakM3.toFixed(1)} m³ vs ${base.storm.peakM3.toFixed(1)} m³ doing nothing` };
}
