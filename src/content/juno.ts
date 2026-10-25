// Juno, the scripted guide (P0 basic lines; T13 preset questions come later). Hints are picked from diagnostic codes
// computed from the model run — the sentence templates only fill in model numbers, never make them up.
import { A } from '../model/assumptions';
import { EST_YEARS } from '../model/slope';
import { evaluate, stormRun, withStorm } from '../campaign/campaign';
import type { CampaignResult, Autumns, CampaignCtx, StormInput, StormPrep } from '../campaign/campaign';

export interface Hint { code: string; text: string }

/** Diagnostic codes for the slope after water year y (most useful first). */
export function slopeHints(y: number, autumns: Autumns, r: CampaignResult, bareNext: number): Hint[] {
  const out: Hint[] = [];
  const g = r.slope.cohorts.filter((c) => c.year <= y && c.cls === 'grassland' && c.kind === 'grass');
  const dry = g.find((c) => !c.watered);
  if (dry) out.push({ code: 'UNWATERED_LOW_SURVIVAL', text: `Unwatered seedlings: ${Math.round((dry.survival ?? 0) * 100)}% survived the ${2021 + dry.year} dry season (${dry.severeDays} days of severe thirst in the model).` });
  if (bareNext > 1) out.push({ code: 'BARE_PATCHES', text: `${Math.round(bareNext)} m² of the slope is bare where seedlings died. Bare soil takes the storms hardest — re-sowing fills bare patches first.` });
  const trailOpen = !autumns.slice(0, y + 1).some((a) => !!a.trail);
  if (trailOpen && r.slope.ldn.grassland.erosion.verdict === 'worse') out.push({ code: 'TRAIL_OPEN', text: 'In the model the slope washes out more than doing nothing. Check the shortcut and the bare ground.' });
  const trees = r.slope.cohorts.filter((c) => c.kind === 'tree').reduce((s, c) => s + c.areaM2, 0);
  if (trees > 0) out.push({ code: 'TREES_ON_GRASSLAND', text: `Young trees now cover ${Math.round(trees)} m² of the grassland the slope is being restored for.` });
  if (y >= 1 && autumns[y].replantSlope?.areaM2) out.push({ code: 'ESTABLISH_TIME', text: `Grass counts as established ${EST_YEARS.grass} years after it survives its first dry season — later sowings count for less by Sept 2023.` });
  return out;
}

export function overBudgetText(r: CampaignResult, y: number): string | null {
  if (r.over.tokens) return `Over the token budget: ${r.tokens.total} of ${r.tokens.budget}.`;
  if (r.over.water[y]) return `Too much water for water year ${2021 + y}: ${Math.round(r.water[y])} of ${r.waterBudget[y]} m³.`;
  if (r.over.sweat[y]) return `Too much sweat for water year ${2021 + y}: ${Math.round(r.sweat[y])} of ${r.sweatBudget[y]} h.`;
  return null;
}

export const JUNO_STORM = 'New Year’s Eve 2022. The rain gauge at Oakland airport logged it hour by hour — we replay those hours on the Rec Center. The light follows that day’s clock: sunrise 07:25, sunset 17:00.';
export const JUNO_TANK_NOTE = `A tank kept for watering fills with the autumn rain and stays full until it is used — the model starts it empty on 1 Oct and fills it with the real downtown daily rain.`;
export const erosiveNote = () => `Storm days ≥ ${A.stormDayMm.value} mm are marked on the timeline.`;

// ------------------------------------------------------------------ T13: three preset questions — each one really runs the model

export interface Answer { title: string; lines: string[]; ok: boolean }
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const clone = (a: Autumns): Autumns => JSON.parse(JSON.stringify(a));
export const PRESETS = [
  { id: 'water', q: 'What if I had watered the 2020 seedlings?' },
  { id: 'trail', q: 'What if I hadn’t touched the shortcut?' },
  { id: 'tank', q: 'What if the tank had been empty before the storm?' },
] as const;

export function askJuno(id: (typeof PRESETS)[number]['id'], ctx: CampaignCtx, autumns: Autumns, r: CampaignResult): Answer {
  if (id === 'water') {
    const a = clone(autumns);
    const rp = a[0].replantSlope;
    if (!rp?.areaM2) return { title: PRESETS[0].q, ok: false, lines: ['You did not sow anything in autumn 2020, so there were no seedlings to water. Try a season that starts with the Replant card.'] };
    const watered = !!rp.water;
    a[0] = { ...a[0], replantSlope: { ...rp, water: !watered } }; // the other choice, everything else the same
    const x = evaluate(ctx, a);
    const c0 = r.slope.cohorts.find((c) => c.year === 0 && c.kind === 'grass'), c1 = x.slope.cohorts.find((c) => c.year === 0 && c.kind === 'grass');
    const late = !watered && rp.waterFrom != null;
    return { title: watered ? 'You did water them. What if you hadn’t?' : late ? 'You started watering late. What if from the start?' : PRESETS[0].q, ok: true, lines: [
      `Survival through the 2021 dry season: ${Math.round((c1?.survival ?? 0) * 100)}% ${watered ? 'without watering' : 'watered'} instead of ${Math.round((c0?.survival ?? 0) * 100)}%.`,
      `Native grass established by Sept 2023: ${n0(x.slope.establishedNative)} m² instead of ${n0(r.slope.establishedNative)} m².`,
      `Water in water year 2021: ${n0(x.water[0])} instead of ${n0(r.water[0])} of ${x.waterBudget[0]} m³; sweat ${n0(x.sweat[0])} instead of ${n0(r.sweat[0])} h${x.over.any ? ' — more than this season’s budget allows' : ''}.`,
      `Grassland check: ${x.slope.ldn.grassland.status.replace('_', ' ')} (yours: ${r.slope.ldn.grassland.status.replace('_', ' ')}).`,
    ] };
  }
  if (id === 'trail') {
    if (r.trail === 'open') return { title: PRESETS[1].q, ok: false, lines: ['You didn’t touch it — the shortcut stayed open all season.'] };
    const a = clone(autumns).map((x) => ({ ...x, trail: null })) as Autumns;
    const x = evaluate(ctx, a);
    const ratio = r.slope.years[2].grassland.erosion / x.slope.years[2].grassland.erosion;
    return { title: PRESETS[1].q, ok: true, lines: [
      `East-slope erosion index in water year 2023: yours is ×${ratio.toFixed(2)} of the open-shortcut run (same plantings).`,
      `Grassland check with the shortcut open: ${x.slope.ldn.grassland.status.replace('_', ' ')} (yours: ${r.slope.ldn.grassland.status.replace('_', ' ')}); native grass established ${n0(x.slope.establishedNative)} m².`,
      `Leo: with the shortcut open his campers keep their way down; his quest would be ${x.quests.leo ? 'done' : 'not done'} (${x.shadeAlive} shade trees alive). Tokens: ${x.tokens.total} instead of ${r.tokens.total}.`,
    ] };
  }
  // tank
  const prep: StormPrep = r.stormPrep?.tank ? r.stormPrep : { ...(r.stormPrep ?? { gardens: [] }), tank: { size: 'L' } };
  const kept = stormRun(ctx, prep, 'closed'), empty = stormRun(ctx, prep, 'slow');
  const t = empty.facilities.find((f) => f.kind === 'tank')!;
  return { title: PRESETS[2].q, ok: true, lines: [
    `${r.stormPrep?.tank ? 'Your' : 'A large'} tank emptied before the rain (release 1 m³/h) is full again ${t.fullAt != null ? `${t.fullAt.toFixed(1)} h into the storm, ${Math.max(0, empty.peakHour - t.fullAt).toFixed(1)} h before the biggest hour` : 'never'}.`,
    `Biggest hour into the drain: ${empty.peakM3.toFixed(1)} m³ emptied vs ${kept.peakM3.toFixed(1)} m³ kept full.`,
    `In the biggest hour the roof sends ${t.inflow[empty.peakHour].toFixed(1)} m³ into a ${t.capM3} m³ tank. Kept for watering, it is about summer water, not this peak.`,
  ] };
}

// ------------------------------------------------------------------ T15: the same plan in another real storm
export function swapStorm(ctx: CampaignCtx, storm: StormInput, prep: StormPrep | null) {
  const c2 = withStorm(ctx, storm);
  const mine = stormRun(c2, prep), nothing = stormRun(c2, null);
  const opts = ['C', 'E', 'F'].flatMap((g) => (['S', 'M'] as const).map((size) => ({ k: `${size === 'M' ? 'medium' : 'small'} garden at ${g}`, p: { gardens: [{ cand: g, size }], tank: null } as StormPrep })));
  const best = opts.map((o) => ({ k: o.k, v: stormRun(c2, o.p).peakM3 })).sort((a, b) => a.v - b.v)[0];
  return { mine, nothing, best };
}
