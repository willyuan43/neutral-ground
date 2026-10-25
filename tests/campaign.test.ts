// Canyon season (T1/T2/T6 acceptance): one timeline, one budget, the storm unchanged from level 2, revisions that never
// charge twice, and every ending reachable. These tests show the code follows the written rules — not that the model matches the park.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeCtx, evaluate, Autumns, newCampaign, setAutumn, commitAutumn, redo, canRedo, award, respond, stormRun, tankLevelOn, endingOf, ENDING_IDS, EndingId,
  SlopeOutcome, StormOutcome, alliesFor, bareAtStart, BUDGET_C, withBudget,
} from '../src/campaign/campaign';
import { runStorm } from '../src/model/storm';
import { tankStartFor } from '../src/levels/stormLevels';
import { A } from '../src/model/assumptions';

const root = path.resolve(__dirname, '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const w = read('weather-daily.json'), d = read('site-slope.json'), site = read('site-storm.json'), storms = read('storms.json');
const ctx = makeCtx(w, d, site, { id: 'OAK', rainMm: storms.OAK.rainMm, startLocal: storms.OAK.startLocal });
const oakTank = tankStartFor(site, w, storms.OAK.startLocal);

const MAYA: Autumns[0] = { replantSlope: { areaM2: 1250, water: true }, trail: 'close' };
const CHEN = { gardens: [{ cand: 'C', size: 'M' as const }], tank: null };
const CHEN_COACH = { gardens: [{ cand: 'C', size: 'M' as const }], tank: { size: 'L' as const } };

describe('the storm inside the timeline is level 2’s storm', () => {
  it('same facilities → exactly the same hourly result as level 2 (tank level from the real daily rain)', () => {
    for (const prep of [CHEN, CHEN_COACH, { gardens: [{ cand: 'E', size: 'L' as const }], tank: { size: 'S' as const } }]) {
      const r = evaluate(ctx, [{}, {}, { storm: prep }]).storm;
      const l2 = runStorm(site, storms.OAK.rainMm, { gardens: prep.gardens, tank: prep.tank ? { size: prep.tank.size, release: 'closed' } : null, disconnect: false, paving: false }, { tankStart: oakTank });
      expect(r.outletTotal).toEqual(l2.outletTotal);
      expect(r.peakM3).toBe(l2.peakM3);
    }
    expect(evaluate(ctx, [{}, {}, {}]).storm.peakM3).toBeCloseTo(107.3, 1);
    expect(evaluate(ctx, [{}, {}, { storm: CHEN }]).storm.peakM3).toBeCloseTo(98.0, 1);
  });
  it('“what if the tank had been empty?” = the release-mode run; in this storm the biggest hour does not change', () => {
    for (const prep of [{ gardens: [], tank: { size: 'L' as const } }, CHEN_COACH]) {
      const kept = stormRun(ctx, prep, 'closed'), empty = stormRun(ctx, prep, 'slow');
      const direct = runStorm(site, storms.OAK.rainMm, { gardens: prep.gardens, tank: { size: 'L', release: 'slow' }, disconnect: false, paving: false }, { tankStart: oakTank });
      expect(empty.outletTotal).toEqual(direct.outletTotal);
      expect(Math.abs(empty.peakM3 - kept.peakM3)).toBeLessThan(0.05);
      const t = empty.facilities.find((f) => f.kind === 'tank')!;
      expect(t.startM3).toBe(0);
      expect(t.fullAt).not.toBeNull();
      expect(t.fullAt!).toBeLessThan(empty.peakHour); // full again before the biggest hour
      expect(t.fullAt!).toBeGreaterThan(4); expect(t.fullAt!).toBeLessThan(5.5); // about 4.7 h into the storm
    }
  });
  it('Coach’s check uses the daily rule: the large kept tank holds 15 m³ on 1 May 2023; released or small falls short', () => {
    expect(tankLevelOn(ctx, 'L', 'closed', '2023-05-01')).toBeCloseTo(15, 6);
    expect(tankLevelOn(ctx, 'S', 'closed', '2023-05-01')).toBeCloseTo(7.5, 6);
    expect(tankLevelOn(ctx, 'L', 'slow', '2023-05-01')).toBeLessThan(A.questCoachTankM3.value);
    expect(evaluate(ctx, [{}, {}, { storm: CHEN_COACH }]).quests.coach).toBe(true);
    expect(evaluate(ctx, [{}, {}, { storm: { gardens: [], tank: { size: 'S' } } }]).quests.coach).toBe(false);
  });
});

describe('one budget for both places', () => {
  it('slope and Rec Center spend the same token pool; the large tank gets the team’s token', () => {
    const slopeOnly = evaluate(ctx, [MAYA, {}, {}]);
    const both = evaluate(ctx, [MAYA, {}, { storm: CHEN_COACH }]);
    expect(both.tokens.slope).toBe(slopeOnly.tokens.slope);
    expect(both.tokens.storm).toBe(6); // garden M 3 + tank L 3
    expect(both.tokens.allies).toBe(-A.allyCoachTokens.value);
    expect(both.tokens.total).toBe(slopeOnly.tokens.total + 6 - 1);
    expect(both.tokens.budget).toBe(BUDGET_C.tokens);
    const tooMuch = evaluate(ctx, [{ replantSlope: { areaM2: 1250, water: true }, trail: 'reroute', trees: { areaM2: 500 } }, { shadeTrees: 8 }, { storm: { gardens: [{ cand: 'C', size: 'L' }], tank: { size: 'L' } } }]);
    expect(tooMuch.over.tokens).toBe(true);
  });
  it('water and sweat are per water year; the 2020 water budget caps watered planting', () => {
    expect(evaluate(ctx, [{ replantSlope: { areaM2: 1250, water: true } }, {}, {}]).over.water[0]).toBe(false);
    expect(evaluate(ctx, [{ replantSlope: { areaM2: 1500, water: true } }, {}, {}]).over.water[0]).toBe(true);
  });
  it('rerouting costs 2 tokens more than closing and has the same effect on the slope', () => {
    const c = evaluate(ctx, [MAYA, {}, {}]), r = evaluate(ctx, [{ ...MAYA, trail: 'reroute' }, {}, {}]);
    expect(r.tokens.total - c.tokens.total).toBe(A.rerouteExtraTokens.value);
    expect(r.slope.establishedNative).toBe(c.slope.establishedNative);
    expect(r.slope.ldn.grassland.erosion.ratio).toBe(c.slope.ldn.grassland.erosion.ratio);
    expect(c.trail).toBe('closed'); expect(r.trail).toBe('rerouted');
  });
});

describe('budget tiers (replay option)', () => {
  it('tight 14: the cheapest all-four plan no longer fits; normal 16: it does', () => {
    const reseed: Autumns = [{ replantSlope: { areaM2: 1250, water: true } }, { replantSlope: { areaM2: 188, water: true } }, { replantSlope: { areaM2: 28, water: true }, shadeTrees: 6, storm: CHEN_COACH }];
    const tiers = A.budgetTiers.value as Record<string, number>;
    expect(evaluate(withBudget(ctx, tiers.normal), reseed).over.any).toBe(false);
    expect(evaluate(withBudget(ctx, tiers.normal), reseed).questCount).toBe(4);
    expect(evaluate(withBudget(ctx, tiers.tight), reseed).over.tokens).toBe(true);
  });
});

describe('revise once and re-run (snapshots)', () => {
  it('never charges twice, recomputes allies from the new plan, and never issues an achievement twice', () => {
    let s = newCampaign(['maya', 'leo']);
    s = setAutumn(s, 0, MAYA);
    s = commitAutumn(s, ctx);
    expect(s.ran).toBe(1);
    const before = evaluate(ctx, s.autumns, 0).tokens.total;
    expect(alliesFor(s.autumns).maya[1]).toBe(true); // closed shortcut, no trees on the grassland → Maya’s volunteers from 2021
    let a = award(s, ['watered-through']); s = a.state; expect(a.fresh).toEqual(['watered-through']);
    expect(canRedo(s, 0)).toBe(true);
    s = redo(s, 0);
    expect(s.ran).toBe(0);
    expect(s.autumns[0]).toEqual(MAYA); // the abandoned choice is the starting point
    s = setAutumn(s, 0, { replantSlope: { areaM2: 1250, water: true } }); // revise: leave the shortcut open
    expect(alliesFor(s.autumns).maya[1]).toBe(false);
    s = commitAutumn(s, ctx);
    expect(evaluate(ctx, s.autumns, 0).tokens.total).toBe(before - 1); // one token less (no closing), not charged twice
    a = award(s, ['watered-through']); expect(a.fresh).toEqual([]); expect(a.state.achievements.filter((x) => x === 'watered-through').length).toBe(1);
    expect(canRedo(s, 0)).toBe(false); // once per autumn
    expect(s.log.filter((e) => e.kind === 'decision').length).toBe(1); // the abandoned decision left the log; the revision is noted
    expect(s.log.some((e) => e.kind === 'redo')).toBe(true);
  });
  it('commits nothing over budget; the 2021 light step keeps one card', () => {
    let s = newCampaign();
    s = setAutumn(s, 0, { replantSlope: { areaM2: 1500, water: true } });
    expect(commitAutumn(s, ctx).ran).toBe(0); // 2021 water over budget → not committed
    s = setAutumn(s, 0, MAYA); s = commitAutumn(s, ctx);
    s = setAutumn(s, 1, { replantSlope: { areaM2: 250, water: true }, shadeTrees: 6 }, 'shadeTrees');
    expect(s.autumns[1]).toEqual({ shadeTrees: 6 });
  });
  it('“Reroute it” answered to Leo after a closed shortcut reroutes it in the autumn being planned', () => {
    let s = newCampaign();
    s = setAutumn(s, 0, MAYA); s = commitAutumn(s, ctx);
    s = respond(s, { npc: 'leo', year: 0, choice: 'adjust' });
    expect(s.autumns[1].trail).toBe('reroute');
    const r = evaluate(ctx, s.autumns);
    expect(r.trail).toBe('rerouted');
    expect(r.tokens.reroute).toBe(A.rerouteExtraTokens.value);
    // the slope is the same as with the line simply closed in 2020
    expect(r.slope.establishedNative).toBe(evaluate(ctx, [MAYA, {}, {}]).slope.establishedNative);
  });
});

describe('neighbours’ quests (model conditions)', () => {
  it('four scripted plans give the expected quests and allies', () => {
    const all4 = evaluate(ctx, [{ replantSlope: { areaM2: 1250, water: true }, trail: 'reroute' }, { shadeTrees: 6 }, { storm: CHEN_COACH }]);
    expect(all4.quests).toEqual({ maya: true, leo: true, coach: true, chen: true });
    expect(all4.over.any).toBe(false);
    expect(all4.allies.maya).toEqual([false, true, true]);
    expect(all4.allies.leo).toEqual([false, false, true]);
    expect(all4.sweatBudget).toEqual([60, 70, 75]);
    const closed = evaluate(ctx, [MAYA, { shadeTrees: 6 }, {}]);
    expect(closed.quests.leo).toBe(false); // trees alive, but the campers’ way down is cut
    const fourTrees = evaluate(ctx, [{}, { shadeTrees: 4 }, {}]);
    expect(fourTrees.shadeAlive).toBe(Math.floor(4 * fourTrees.shade[0].survival + 1e-9));
    expect(fourTrees.quests.leo).toBe(fourTrees.shadeAlive >= A.questLeoTrees.value);
    const treesOnSlope = evaluate(ctx, [{ ...MAYA, trees: { areaM2: 250 } }, {}, {}]);
    expect(treesOnSlope.allies.maya).toEqual([false, false, false]); // trees on the grassland: no volunteers
  });
  it('re-seeding the bare patches instead of closing the shortcut also brings the grassland back', () => {
    const a0 = { replantSlope: { areaM2: 1250, water: true } };
    const b1 = Math.round(bareAtStart(ctx, [a0, {}, {}], 1));
    const b2 = Math.round(bareAtStart(ctx, [a0, { replantSlope: { areaM2: b1, water: true } }, {}], 2));
    const r = evaluate(ctx, [a0, { replantSlope: { areaM2: b1, water: true } }, { replantSlope: { areaM2: b2, water: true } }]);
    expect(r.quests.maya).toBe(true);
    expect(r.trail).toBe('open');
  });
});

describe('endings (slope × storm × neighbours)', () => {
  it('every combination maps to exactly the ending in the plan’s table', () => {
    const slopes: SlopeOutcome[] = ['back', 'greener', 'longDry', 'little'], stormsO: StormOutcome[] = ['met', 'missed', 'none'];
    for (const s of slopes) for (const st of stormsO) for (let q = 0; q <= 4; q++) for (const cards of [0, 1]) {
      const e = endingOf(s, st, q, cards);
      expect(ENDING_IDS).toContain(e);
      const want: EndingId = cards === 0 ? 'quiet'
        : s === 'back' ? (st === 'met' ? (q >= 3 ? 'neutral' : 'tradeoffs') : 'grassland')
        : s === 'greener' ? 'greener' : s === 'longDry' ? 'longDry'
        : st === 'met' ? 'stormReady' : st === 'missed' ? 'peakThrough' : 'tradeoffs';
      expect(e).toBe(want);
    }
  });
  it('each of the 8 endings has a plan within budget that reaches it', () => {
    const cases: [EndingId, Autumns][] = [
      ['quiet', [{}, {}, {}]],
      ['neutral', [MAYA, {}, { storm: CHEN_COACH }]],
      ['grassland', [MAYA, {}, {}]],
      ['greener', [{ trees: { areaM2: 500 } }, {}, {}]],
      ['longDry', [{ replantSlope: { areaM2: 1500, water: false } }, {}, {}]],
      ['stormReady', [{}, {}, { storm: CHEN }]],
      ['peakThrough', [{}, {}, { storm: { gardens: [{ cand: 'E', size: 'S' }], tank: null } }]],
      ['tradeoffs', [MAYA, {}, { storm: CHEN }]],
    ];
    const seen = new Set<EndingId>();
    for (const [want, plan] of cases) {
      const r = evaluate(ctx, plan);
      expect(r.over.any).toBe(false);
      expect(r.ending).toBe(want);
      seen.add(r.ending);
    }
    expect(seen.size).toBe(8);
  });
  it('is deterministic', () => {
    const p: Autumns = [MAYA, { shadeTrees: 6 }, { storm: CHEN_COACH }];
    expect(JSON.stringify(evaluate(ctx, p).quests)).toBe(JSON.stringify(evaluate(ctx, p).quests));
    expect(evaluate(ctx, p).ending).toBe(evaluate(ctx, p).ending);
  });
});
