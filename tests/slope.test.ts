// Level-3 model checks (docs/04 A, E, F, W): water balance, survival bounds, area changes on 1 October only, LDN rules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runColumn, specFor, survival, wyIndex } from '../src/model/season';
import { SlopeModel, runSlope, judgeSlope, SlopePlan } from '../src/model/slope';
import { LEVEL3, solveLevel3 } from '../src/levels/slopeLevel';
import { A } from '../src/model/assumptions';

const root = path.resolve(__dirname, '..');
const w = JSON.parse(fs.readFileSync(path.join(root, 'public/data/weather-daily.json'), 'utf8'));
const d = JSON.parse(fs.readFileSync(path.join(root, 'public/data/site-slope.json'), 'utf8'));
const m = new SlopeModel(w, d);

describe('daily soil-water columns', () => {
  it('close their water balance (< 0.01 mm) for every kind of ground, watered or not', () => {
    const { start, end } = wyIndex(w);
    for (const k of ['grass', 'tree', 'bare'] as const) expect(Math.abs(runColumn(w, [{ from: 0, spec: specFor(k) }]).balanceErrorMm)).toBeLessThan(0.01);
    for (let y = 0; y < 3; y++) for (const water of [false, true]) {
      const r = runColumn(w, [{ from: 0, spec: specFor('grass') }, { from: start[y], spec: specFor('seedGrass'), irrigateFrom: water ? start[y] : undefined, irrigateTo: water ? end[y] : undefined }]);
      expect(Math.abs(r.balanceErrorMm)).toBeLessThan(0.01);
    }
  });
  it('zero rain makes no runoff and the weather window is complete', () => {
    expect(w.precipMm.every((v: number) => v != null)).toBe(true);
    const dry = { ...w, precipMm: w.precipMm.map(() => 0) };
    const r = runColumn(dry, [{ from: 0, spec: specFor('bare') }]);
    expect(r.runoffMm.every((v) => v === 0)).toBe(true);
  });
});

describe('survival rule (docs/04 E)', () => {
  it('stays within sMin..sMax and falls with more severe-stress days', () => {
    for (const n of [0, 10, 50, 100, 300]) { expect(survival(n)).toBeGreaterThanOrEqual(A.sMin.value); expect(survival(n)).toBeLessThanOrEqual(A.sMax.value); }
    expect(survival(10)).toBeGreaterThan(survival(50));
  });
  it('is settled once, at the end of the first water year', () => {
    const r = runSlope(m, [{ replantSlope: { areaM2: 500, water: false } }, {}, {}]);
    expect(r.cohorts.length).toBe(1);
    expect(r.cohorts[0].survival).toBeDefined();
    // during the planting year the area is seedlings; the dead share turns bare only from the next 1 October
    expect(r.years[0].grassland.bare).toBe(0);
    expect(r.years[1].grassland.bare).toBeCloseTo(500 * (1 - (r.cohorts[0].survival ?? 0)), 6);
  });
});

describe('LDN check (docs/04 W) and faces (S)', () => {
  it('doing nothing touches nothing', () => {
    const r = runSlope(m, [{}, {}, {}]);
    expect(r.ldn.grassland.status).toBe('not_touched');
    expect(r.ldn.riparian.status).toBe('not_touched');
  });
  it('any indicator worse → net loss; no cross-class offsetting', () => {
    const r = runSlope(m, [{ replantSlope: { areaM2: 1250, water: true }, closeTrail: true, clearEuc: { trees: 10, keepBig: false } }, { replantSlope: { areaM2: 188, water: true } }, {}]);
    expect(r.ldn.riparian.erosion.verdict).toBe('worse');
    expect(r.ldn.riparian.status).toBe('net_loss'); // a slope gain cannot balance the creek
    expect(r.ldn.grassland.status).not.toBe('net_loss');
  });
  it('trees on grassland shrink the grassland target area; cutting every big tree turns the hawk face "further"', () => {
    const r = runSlope(m, [{ trees: { areaM2: 500 } }, {}, {}]);
    expect(r.ldn.grassland.area.delta).toBeLessThan(0);
    expect(r.faces.butterfly).toBe('further');
    const e = runSlope(m, [{ clearEuc: { trees: 4, keepBig: false } }, {}, {}]);
    expect(e.faces.hawk).toBe('further');
    const k = runSlope(m, [{ clearEuc: { trees: 4, keepBig: true } }, {}, {}]);
    expect(k.faces.hawk).toBe('insufficient'); // MA-3b foraging grassland boundary not mapped
  });
  it('is deterministic', () => {
    const p: SlopePlan = [{ replantSlope: { areaM2: 1000, water: true } }, { closeTrail: true }, {}];
    expect(runSlope(m, p).establishedNative).toBe(runSlope(m, p).establishedNative);
  });
});

describe('level-3 calibration', () => {
  it('has solutions, and the obvious moves fail', () => {
    const rows = solveLevel3(m, LEVEL3.targetNative);
    expect(rows.some((x) => x.j.pass)).toBe(true);
    const fails = (p: SlopePlan) => !judgeSlope(runSlope(m, p), LEVEL3.targetNative).pass;
    expect(fails([{ trees: { areaM2: 500 }, replantSlope: { areaM2: 1000, water: true }, closeTrail: true }, {}, {}])).toBe(true);
    expect(fails([{ replantSlope: { areaM2: 1500, water: false }, closeTrail: true }, {}, {}])).toBe(true);
    expect(fails([{ replantSlope: { areaM2: 1250, water: true } }, {}, {}])).toBe(true); // no like-for-like offset for the dead patches
    expect(fails([{ replantSlope: { areaM2: 1000, water: true }, closeTrail: true }, {}, {}])).toBe(true); // not enough established by 2023
  }, 30000);
});

describe('watering started partway through the first year (“Water now” during the replay)', () => {
  const { start, end } = wyIndex(w);
  const plan = (waterFrom?: number, water = false): SlopePlan => [{ replantSlope: { areaM2: 1000, water, waterFrom } }, {}, {}];
  // the first severe-stress day of an unwatered planting (when the game asks)
  const flags = m.col('seedGrass', 0, false).stressDayFlags;
  // the planting is sown into soil still dry from the summer (thirsty from 1 October); the next thirsty spell is in spring
  let first = -1; for (let i = start[0] + 1; i <= end[0]; i++) if (flags[i] && !flags[i - 1]) { first = i; break; }
  it('the unwatered 2020 planting is thirsty at sowing and again in a later spell', () => { expect(flags[start[0]]).toBe(1); expect(first).toBeGreaterThan(start[0]); });
  it('“Water now” on 1 October is the same as watering from the start', () => {
    const a = runSlope(m, plan(start[0])), b = runSlope(m, plan(undefined, true));
    expect(a.cohorts[0].survival).toBe(b.cohorts[0].survival);
    expect(a.water[0]).toBeCloseTo(b.water[0], 9);
    expect(a.sweat[0]).toBeCloseTo(b.sweat[0], 9);
  });
  it('survives between not watering and watering from 1 October, and uses less water than a full year', () => {
    const dry = runSlope(m, plan()), late = runSlope(m, plan(first)), full = runSlope(m, plan(undefined, true));
    const s = (r: ReturnType<typeof runSlope>) => r.cohorts[0].survival ?? 0;
    expect(s(late)).toBeGreaterThanOrEqual(s(dry));
    expect(s(late)).toBeLessThanOrEqual(s(full) + 1e-9);
    expect(late.water[0]).toBeGreaterThan(0);
    expect(late.water[0]).toBeLessThanOrEqual(full.water[0] + 1e-9);
    expect(late.sweat[0]).toBeLessThanOrEqual(full.sweat[0] + 1e-9);
    expect(late.cohorts[0].watered).toBe(true);
  });
  it('changes nothing before the day watering starts (same stress days up to then)', () => {
    const lateFlags = m.col('seedGrass', 0, true, first).stressDayFlags;
    for (let i = start[0]; i < first; i++) expect(lateFlags[i]).toBe(flags[i]);
  });
  it('ignores a start day outside the first water year', () => {
    const a = runSlope(m, plan(end[0] + 10)), b = runSlope(m, plan());
    expect(a.cohorts[0].survival).toBe(b.cohorts[0].survival);
    expect(a.cohorts[0].watered).toBe(false);
  });
});
