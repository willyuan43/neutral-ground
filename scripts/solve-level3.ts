// Level-3 calibration table (called by solve-levels.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlopeModel, runSlope, judgeSlope, SlopePlan, BUDGET3 } from '../src/model/slope';
import { LEVEL3, solveLevel3, planLabel3 } from '../src/levels/slopeLevel';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', 'public', 'data');

export async function main() {
  const w = JSON.parse(fs.readFileSync(path.join(DATA, 'weather-daily.json'), 'utf8'));
  const d = JSON.parse(fs.readFileSync(path.join(DATA, 'site-slope.json'), 'utf8'));
  const m = new SlopeModel(w, d);
  const t0 = performance.now();
  const rows = solveLevel3(m, LEVEL3.targetNative);
  const ms = performance.now() - t0;
  const pass = rows.filter((x) => x.j.pass);
  const lines: string[] = [];
  lines.push(`### Level 3: ${LEVEL3.title} (daily weather 2020-10 → 2023-09)`);
  lines.push(`- Plans tried (bounded search over three autumns): ${rows.length} (${ms.toFixed(0)} ms). Column water balance max error ${Math.max(...[...m.cols.values()].map((c) => Math.abs(c.balanceErrorMm))).toExponential(1)} mm.`);
  lines.push(`- Seedling survival from the daily model (AWC ${120} mm/m): ${[0, 1, 2].map((y) => `WY${2021 + y} watered ${Math.round(100 * (runSlope(m, [y === 0 ? { replantSlope: { areaM2: 100, water: true } } : {}, y === 1 ? { replantSlope: { areaM2: 100, water: true } } : {}, y === 2 ? { replantSlope: { areaM2: 100, water: true } } : {}]).cohorts[0].survival ?? 0))}% / not watered ${Math.round(100 * (runSlope(m, [y === 0 ? { replantSlope: { areaM2: 100, water: false } } : {}, y === 1 ? { replantSlope: { areaM2: 100, water: false } } : {}, y === 2 ? { replantSlope: { areaM2: 100, water: false } } : {}]).cohorts[0].survival ?? 0))}%`).join('; ')}.`);
  lines.push(`- Game target: ≥ **${LEVEL3.targetNative} m²** of replanted native grass established by 2023-09-30; no touched land class in net loss; budgets ${BUDGET3.tokens} tokens, ${BUDGET3.sweatPerYear} h sweat per year, ${BUDGET3.waterPerYearM3} m³ water per year. ★★★ needs ≤ ${LEVEL3.star3Tokens} tokens.`);
  lines.push(`- Plans that pass: **${pass.length}** of ${rows.length}. With ≤ ${LEVEL3.star3Tokens} tokens: ${pass.filter((x) => x.r.tokens <= LEVEL3.star3Tokens).length}. Passing plans that close the trail: ${pass.filter((x) => x.plan.some((a) => a.closeTrail)).length}; that re-seed bare patches later instead: ${pass.filter((x) => !x.plan.some((a) => a.closeTrail)).length}; water the 2020 planting: ${pass.every((x) => x.plan[0].replantSlope?.water) ? 'all' : 'not all'}; plant trees: ${pass.some((x) => x.plan.some((a) => a.trees?.areaM2)) ? 'some' : 'none'}; clear eucalyptus: ${pass.some((x) => x.plan.some((a) => a.clearEuc?.trees)) ? 'some' : 'none'}.`);
  lines.push('- LDN indicators are judged on the final water year (Oct 2022 – Sept 2023) against doing nothing; grassland area relative to the baseline grassland area, creek-corridor area relative to the class area (its willow/eucalyptus split is unknown).');
  lines.push('');
  lines.push('| Plan | Native established (m²) | Grassland LDN | Erosion × | Tokens | Sweat h | Water m³ |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const x of [...pass].sort((a, b) => a.r.tokens - b.r.tokens || b.r.establishedNative - a.r.establishedNative).slice(0, 12))
    lines.push(`| ${planLabel3(x.plan)} | ${Math.round(x.r.establishedNative)} | ${x.r.ldn.grassland.status} | ${x.r.ldn.grassland.erosion.ratio.toFixed(3)} | ${x.r.tokens} | ${x.r.sweat.map(Math.round).join('/')} | ${x.r.water.map(Math.round).join('/')} |`);
  lines.push('');
  lines.push('“Obvious” moves that fail:');
  const obvious: [string, SlopePlan][] = [
    ['Plant more trees (greenest)', [{ trees: { areaM2: 500 }, replantSlope: { areaM2: 1000, water: true }, closeTrail: true }, {}, {}]],
    ['Replant without watering', [{ replantSlope: { areaM2: 1500, water: false }, closeTrail: true }, {}, {}]],
    ['Replant + water, nothing else', [{ replantSlope: { areaM2: 1250, water: true } }, {}, {}]],
    ['Replant + water a little less (1,000 m²) + close trail', [{ replantSlope: { areaM2: 1000, water: true }, closeTrail: true }, {}, {}]],
    ['Clear all eucalyptus too', [{ replantSlope: { areaM2: 1250, water: true }, closeTrail: true, clearEuc: { trees: 10, keepBig: false } }, { replantSlope: { areaM2: 188, water: true } }, {}]],
    ['Wait for a wet year, plant in 2021', [{}, { replantSlope: { areaM2: 2000, water: true }, closeTrail: true }, {}]],
  ];
  for (const [label, plan] of obvious) {
    const r = runSlope(m, plan); const j = judgeSlope(r, LEVEL3.targetNative);
    const why = [!j.goal ? `native ${Math.round(r.establishedNative)} m²` : '', r.ldn.grassland.status === 'net_loss' ? `grassland net loss (area ${Math.round(r.ldn.grassland.area.delta)} m², erosion ×${r.ldn.grassland.erosion.ratio.toFixed(2)})` : '', r.ldn.riparian.status === 'net_loss' ? `creek net loss (erosion ×${r.ldn.riparian.erosion.ratio.toFixed(2)})` : '', !j.budgetOk ? 'over budget' : ''].filter(Boolean).join('; ');
    lines.push(`- ${label}: ${j.pass ? 'PASSES (check!)' : 'fails — ' + why}`);
  }
  const text = lines.join('\n');
  fs.appendFileSync(path.join(here, '..', 'scratch-calibration.md'), '\n' + text + '\n');
  console.log(text);
}
