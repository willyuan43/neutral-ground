// T9 calibration for the canyon season: run every allowed set of decisions through the same `evaluate` the game uses.
// Run from prototype/:  npx tsx scripts/solve-campaign.ts [tokens...]
// Prints: each quest alone, every pair/triple, all four together (cheapest plans), plans per ending, dominated options.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx, evaluate, Autumns, AutumnChoice, StormPrep, bareAtStart, NPC_IDS, NpcId, ENDING_IDS, CampaignResult, describeAutumn, BUDGET_C, stormRun, withStorm } from '../src/campaign/campaign';
import type { GardenSize } from '../src/model/storm';
import { SlopeModel } from '../src/model/slope';
import { survival } from '../src/model/season';
import { A } from '../src/model/assumptions';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', 'public', 'data');
const readJSON = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

export function buildCtx() {
  const w = readJSON('weather-daily.json'), d = readJSON('site-slope.json'), site = readJSON('site-storm.json'), storms = readJSON('storms.json');
  return makeCtx(w, d, site, { id: 'OAK', rainMm: storms.OAK.rainMm, startLocal: storms.OAK.startLocal });
}

/** Every allowed plan (main line: one rain garden, tank kept for watering; replay-only cards excluded). */
export function enumerateCampaign(ctx: ReturnType<typeof buildCtx>, opts: { shadeCounts?: number[] } = {}) {
  const shadeCounts = opts.shadeCounts ?? [4, 6, 8];
  const y0s: AutumnChoice[] = [];
  for (const area of [0, 750, 1000, 1250, 1500]) for (const water of area ? [false, true] : [false]) for (const trees of [0, 250, 500]) for (const trail of [null, 'close', 'reroute'] as const)
    y0s.push({ replantSlope: area ? { areaM2: area, water } : null, trees: trees ? { areaM2: trees } : null, trail });
  const storms: (StormPrep | null)[] = [null];
  const spots = ctx.site.candidates.map((c) => c.id);
  for (const g of [null, ...spots.flatMap((c) => (['S', 'M', 'L'] as GardenSize[]).map((size) => ({ cand: c, size })))]) for (const tank of [null, 'S', 'L'] as const) {
    if (!g && !tank) continue;
    storms.push({ gardens: g ? [g] : [], tank: tank ? { size: tank } : null });
  }
  const plans: Autumns[] = [];
  for (const a0 of y0s) {
    const bare1 = Math.round(bareAtStart(ctx, [a0, {}, {}], 1));
    const y1s: AutumnChoice[] = [{}];
    for (const extra of [0, 250, 500]) { const area = bare1 + extra; if (area > 0) y1s.push({ replantSlope: { areaM2: area, water: true } }); }
    for (const n of shadeCounts) y1s.push({ shadeTrees: n });
    if (a0.trail === 'close') y1s.push({ trail: 'reroute' }); // Leo's “reroute it” answered after 2020
    for (const a1 of y1s) {
      const bare2 = Math.round(bareAtStart(ctx, [a0, a1, {}], 2));
      const slope2: AutumnChoice[] = [{}];
      if (bare2 > 0) slope2.push({ replantSlope: { areaM2: bare2, water: true } });
      const shade2 = (a1.shadeTrees ?? 0) > 0 ? [0] : [0, ...shadeCounts];
      for (const s2 of slope2) for (const n of shade2) for (const st of storms) plans.push([a0, a1, { ...s2, ...(n ? { shadeTrees: n } : {}), ...(st ? { storm: st } : {}) }]);
    }
  }
  return plans;
}

const label = (p: Autumns) => p.map((a, y) => `${2020 + y}: ${describeAutumn(a)}`).join(' | ');

export function main(budgets: number[]) {
  const ctx = buildCtx();
  const t0 = performance.now();
  const plans = enumerateCampaign(ctx);
  const rows = plans.map((p) => ({ p, r: evaluate(ctx, p) }));
  const ms = performance.now() - t0;
  const out: string[] = [];
  out.push(`Plans tried: ${rows.length} (${ms.toFixed(0)} ms). Sweat ${BUDGET_C.sweatPerYear} h + allies per year, water ${BUDGET_C.waterPerYearM3} m³ per year.`);
  // within sweat/water limits, ignoring tokens → cheapest token cost for each quest set
  const okSW = rows.filter((x) => !x.r.over.sweat.some(Boolean) && !x.r.over.water.some(Boolean));
  const has = (r: CampaignResult, set: NpcId[]) => set.every((k) => r.quests[k]);
  const subsets: NpcId[][] = [];
  for (let mask = 1; mask < 16; mask++) subsets.push(NPC_IDS.filter((_, i) => mask & (1 << i)));
  out.push('', '| Quests | Cheapest tokens | Example plan |', '|---|---|---|');
  for (const s of subsets) {
    const c = okSW.filter((x) => has(x.r, s)).sort((a, b) => a.r.tokens.total - b.r.tokens.total)[0];
    out.push(`| ${s.join(' + ')} | ${c ? c.r.tokens.total : 'impossible'} | ${c ? label(c.p) : '—'} |`);
  }
  for (const T of budgets) {
    const ok = okSW.filter((x) => x.r.tokens.total <= T);
    out.push('', `### Token budget ${T}: ${ok.length} plans within all budgets`);
    out.push(`- Each quest alone: ${NPC_IDS.map((k) => `${k} ${ok.some((x) => x.r.quests[k]) ? 'yes' : 'NO'}`).join(', ')}; all four together: ${ok.some((x) => x.r.questCount === 4) ? 'yes' : 'no'} (${ok.filter((x) => x.r.questCount === 4).length} plans); three or more: ${ok.filter((x) => x.r.questCount >= 3).length} plans.`);
    out.push(`- Endings reachable: ${ENDING_IDS.map((e) => `${e} ${ok.filter((x) => x.r.ending === e).length}`).join(', ')}`);
    const neutral = ok.filter((x) => x.r.ending === 'neutral').sort((a, b) => a.r.tokens.total - b.r.tokens.total).slice(0, 3);
    for (const x of neutral) out.push(`  - neutral: ${x.r.tokens.total} tokens — ${label(x.p)} — quests ${NPC_IDS.filter((k) => x.r.quests[k]).join(',')}`);
    for (const x of ok.filter((x) => x.r.questCount === 4).slice(0, 8)) out.push(`  - all four: ${x.r.tokens.total} tokens, sweat ${x.r.sweat.map(Math.round).join('/')} of ${x.r.sweatBudget.join('/')} h, water ${x.r.water.map(Math.round).join('/')} m³ — ${label(x.p)}`);
  }
  // single-garden storm results (for dominated options)
  out.push('', 'Single rain garden at the Rec Center, NYE 2022 (OAK), biggest hour (m³), doing nothing ' + rows[0].r.stormBase.peakM3.toFixed(1) + ':');
  const seen = new Map<string, number>();
  for (const x of rows) { const g = x.r.stormPrep?.gardens[0]; if (g && !x.r.stormPrep?.tank) seen.set(`${g.size}@${g.cand}`, x.r.storm.peakM3); }
  out.push([...seen.entries()].sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '));
  const text = out.join('\n');
  console.log(text);
  return text;
}

if (process.argv[1] && process.argv[1].endsWith('solve-campaign.ts')) {
  if (process.argv.includes('--report')) report();
  else { const args = process.argv.slice(2).map(Number).filter((n) => n > 0); main(args.length ? args : [12, 13, 14, 15, 16]); }
}

/** Compact summary of one plan (keeps memory small over ~185k plans). */
function summ(ctx: ReturnType<typeof buildCtx>, p: Autumns) {
  const r = evaluate(ctx, p);
  return { p, tokens: r.tokens.total, sweat: r.sweat.reduce((s, v) => s + v, 0), water: r.water.reduce((s, v) => s + v, 0), quests: { ...r.quests }, questCount: r.questCount, ending: r.ending, trail: r.trail, over: r.over.any };
}
type Summ = ReturnType<typeof summ>;

/** T9 report: the four calibration criteria, in markdown (for NOTES.md). */
export function report(T = BUDGET_C.tokens) {
  const out: string[] = [];
  const w = readJSON('weather-daily.json'), d = readJSON('site-slope.json'), site = readJSON('site-storm.json'), storms = readJSON('storms.json');
  const ctxFor = (awc?: number) => makeCtx(w, d, site, { id: 'OAK', rainMm: storms.OAK.rainMm, startLocal: storms.OAK.startLocal }, awc ? new SlopeModel(w, d, awc) : undefined);
  const ctx = ctxFor();
  const all = enumerateCampaign(ctx);
  const ok: Summ[] = [];
  for (const p of all) { const x = summ(ctx, p); if (!x.over && x.tokens <= T) ok.push(x); }
  out.push(`### T9 report (budget ${T} tokens; ${all.length} plans, ${ok.length} within budget)`);
  out.push('', '**1. Different reasonable plans, each with its own strength** (cheapest of each kind):', '', '| Plan kind | Tokens | Sweat h (3 yrs) | Water m³ (3 yrs) | Quests | Ending | Plan |', '|---|---|---|---|---|---|---|');
  const kinds: [string, (x: Summ) => boolean][] = [
    ['All four — reroute the shortcut', (x) => x.questCount === 4 && x.trail === 'rerouted'],
    ['All four — shortcut open, re-sow the dead patches', (x) => x.questCount === 4 && x.trail === 'open'],
    ['Neutral Ground without Leo (close the shortcut)', (x) => x.ending === 'neutral' && !x.quests.leo],
    ['Neutral Ground without Coach', (x) => x.ending === 'neutral' && !x.quests.coach],
    ['Grassland only (Maya)', (x) => x.quests.maya && x.questCount === 1],
    ['Rec Center only (Ms. Chen + Coach)', (x) => x.quests.chen && x.quests.coach && !x.quests.maya],
  ];
  for (const [name, f] of kinds) {
    const c = ok.filter(f).sort((a, b) => a.tokens - b.tokens || a.sweat - b.sweat)[0];
    out.push(c ? `| ${name} | ${c.tokens} | ${Math.round(c.sweat)} | ${Math.round(c.water)} | ${NPC_IDS.filter((k) => c.quests[k]).join(', ')} | ${c.ending} | ${label(c.p)} |` : `| ${name} | — | — | — | impossible | — | — |`);
  }
  const peak = (g: string, sz: GardenSize) => evaluate(ctx, [{}, {}, { storm: { gardens: [{ cand: g, size: sz }], tank: null } }]).storm.peakM3;
  const ud = (g: string, sz: GardenSize) => { const r = evaluate(ctx, [{}, {}, { storm: { gardens: [{ cand: g, size: sz }], tank: null } }]).storm; return r.facilities.find((f) => f.kind === 'garden')!.delayed[r.peakHour]; };
  const small = evaluate(ctx, [{}, {}, { storm: { gardens: [], tank: { size: 'S' } } }]);
  const four = evaluate(ctx, [{}, { shadeTrees: 4 }, {}]);
  out.push('', '**2. Options another option beats outright, and where the result says why:**');
  out.push(`- Large garden at C (4 tokens): ${peak('C', 'L').toFixed(1)} m³ vs medium ${peak('C', 'M').toFixed(1)} m³ (3 tokens). The storm result card computes it live: the large garden’s underdrain lets out ${ud('C', 'L').toFixed(2)} m³ in the biggest hour vs ${ud('C', 'M').toFixed(2)} m³.`);
  out.push(`- Small roof tank (2 tokens): ${small.tankMay1?.toFixed(1)} m³ on 1 May 2023, under Coach’s ${A.questCoachTankM3.value} m³. The tank card shows its size; Coach’s ending line gives the number. It still holds water for the field (a choice, not a hidden trap).`);
  out.push(`- 4 shade trees: ${four.shadeAlive} alive (survival ${Math.round(four.shade[0].survival * 100)}%) → Leo’s quest fails; 6 trees → ${evaluate(ctx, [{}, { shadeTrees: 6 }, {}]).shadeAlive}. The pause card and Leo’s line give the count; Try next names the survival rate.`);
  out.push(`- A roof tank does not lower this storm’s biggest hour (kept: ${evaluate(ctx, [{}, {}, { storm: { gardens: [], tank: { size: 'L' } } }]).storm.peakM3.toFixed(1)} m³; emptied first: ${stormRun(ctx, { gardens: [], tank: { size: 'L' } }, 'slow').peakM3.toFixed(1)} m³). It is offered for watering, not as a storm tool; the what-if experiment on the storm card shows why.`);
  out.push('- Trees on the slope and unwatered planting lose to watered native planting by design (the lessons of level 3); Maya’s lines and the endings Greener, Not Better / The Long Dry say why with model numbers.');
  out.push('', '**3. What is best changes with the weather and the resources:**', '', '| Soil water capacity (the Check First unknown) | Survival 2020 watered / not | Water for 1,250 m² watered in 2020 | Cheapest Maya | Cheapest all four |', '|---|---|---|---|---|');
  for (const awc of [80, 120, 160]) {
    const c2 = ctxFor(awc);
    let m: Summ | null = null, f: Summ | null = null;
    for (const p of enumerateCampaign(c2)) {
      const x = summ(c2, p); if (x.over || x.tokens > T) continue;
      if (x.quests.maya && (!m || x.tokens < m.tokens)) m = x;
      if (x.questCount === 4 && (!f || x.tokens < f.tokens)) f = x;
    }
    const sw = survival(c2.model.col('seedGrass', 0, true).severeDays[0]), sd = survival(c2.model.col('seedGrass', 0, false).severeDays[0]);
    const water = evaluate(c2, [{ replantSlope: { areaM2: 1250, water: true } }, {}, {}]).water[0];
    out.push(`| ${awc} mm/m${awc === A.awcMissing.value ? ' (used)' : ''} | ${Math.round(sw * 100)}% / ${Math.round(sd * 100)}% | ${Math.round(water)} of ${BUDGET_C.waterPerYearM3} m³ | ${m ? m.tokens + ' — ' + label(m.p) : 'impossible'} | ${f ? f.tokens : 'impossible'} |`);
  }
  // the storm side under another real storm (P1 swap): which single garden is best flips
  const sfo = withStorm(ctx, { id: 'SFO', rainMm: storms.SFO.rainMm, startLocal: storms.SFO.startLocal });
  const spots = ['C', 'E', 'F'].flatMap((g) => (['S', 'M'] as GardenSize[]).map((sz) => ({ g, sz })));
  const rank = (c: typeof ctx) => spots.map((x) => ({ k: `${x.sz}@${x.g}`, v: evaluate(c, [{}, {}, { storm: { gardens: [{ cand: x.g, size: x.sz }], tank: null } }]).storm.peakM3 })).sort((a, b) => a.v - b.v);
  out.push('', `Storms differ: the best single garden in the long NYE 2022 storm is ${rank(ctx).slice(0, 2).map((x) => `${x.k} ${x.v.toFixed(1)}`).join(', ')} m³ (E and F fill before its biggest hour); in the short SFO 2023-01-04 storm it is ${rank(sfo).slice(0, 2).map((x) => `${x.k} ${x.v.toFixed(1)}`).join(', ')} m³ (doing nothing ${evaluate(sfo, [{}, {}, {}]).storm.peakM3.toFixed(1)}). Tokens decide the route to all four quests: at 15 only “re-sow the patches” works, at 16 the reroute route works too.`);
  out.push('', `Within one run: water year 2021 had ${w.waterYears[0].rainMm} mm downtown, so only watered seedlings survive; the 2020 water budget (${BUDGET_C.waterPerYearM3} m³) caps watered planting at 1,250 m²; allies change the sweat budget of later years; the storm’s best spot (C) comes from where water still runs in the biggest hour, not from where most water runs (E and F fill up hours before it).`);
  const cheapestQ = (k: NpcId) => ok.filter((x) => x.quests[k]).sort((a, b) => a.tokens - b.tokens)[0];
  out.push('', `**4. Every quest alone is possible:** ${NPC_IDS.map((k) => { const c = cheapestQ(k); return `${k} ${c ? c.tokens + ' tokens' : 'NO'}`; }).join(', ')}. All four together: ${ok.some((x) => x.questCount === 4) ? `yes (${ok.filter((x) => x.questCount === 4).length} plans)` : 'no'}. Endings reachable within budget: ${ENDING_IDS.map((e) => `${e} ${ok.filter((x) => x.ending === e).length}`).join(', ')}.`);
  const text = out.join('\n');
  console.log(text);
  return text;
}

if (process.argv[1] && process.argv[1].endsWith('solve-campaign.ts')) {
  if (process.argv.includes('--report')) report();
  else { const args = process.argv.slice(2).map(Number).filter((n) => n > 0); main(args.length ? args : [12, 13, 14, 15, 16]); }
}
