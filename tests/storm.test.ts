// Check values and invariants for the storm model (docs/10 §4, docs/04 M). Never edit expected values to make a test pass.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scsRunoff, scsHourly } from '../src/model/scs';
import { bucketStep, bucketSeries } from '../src/model/bucket';
import { runStorm, StormPlan, cellHsg, TANK_M3, tankHistory } from '../src/model/storm';
import { A } from '../src/model/assumptions';
import { LEVEL1, LEVEL2, solveStormLevel, tankStartFor, guessTruth, judge } from '../src/levels/stormLevels';

const root = path.resolve(__dirname, '..');
const storms = JSON.parse(fs.readFileSync(path.join(root, 'public/data/storms.json'), 'utf8'));
const site = JSON.parse(fs.readFileSync(path.join(root, 'public/data/site-storm.json'), 'utf8'));
const OAK: number[] = storms.OAK.rainMm, SFO: number[] = storms.SFO.rainMm;
const daily = JSON.parse(fs.readFileSync(path.join(root, 'public/data/weather-daily.json'), 'utf8'));
const oakTank = tankStartFor(site, daily, storms.OAK.startLocal);

describe('curve number (docs/04 B check values)', () => {
  it('P = 63 mm, CN 98/61/74/80 → 57.18/4.829/15.169/22.233 mm', () => {
    expect(scsRunoff(63, 98)).toBeCloseTo(57.18, 2);
    expect(Math.abs(scsRunoff(63, 61) - 4.829)).toBeLessThan(0.01);
    expect(Math.abs(scsRunoff(63, 74) - 15.169)).toBeLessThan(0.01);
    expect(Math.abs(scsRunoff(63, 80) - 22.233)).toBeLessThan(0.01);
  });
  it('zero rain gives zero runoff; runoff never exceeds rain; bigger CN gives more runoff', () => {
    expect(scsRunoff(0, 80)).toBe(0);
    for (const P of [5, 20, 63, 150]) for (const cn of [40, 61, 74, 80, 98]) expect(scsRunoff(P, cn)).toBeLessThanOrEqual(P);
    expect(scsRunoff(63, 80)).toBeGreaterThan(scsRunoff(63, 74));
  });
  it('hourly runoff adds up to the event runoff', () => {
    const h = scsHourly(OAK, 80);
    const total = OAK.reduce((a, b) => a + b, 0);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(scsRunoff(total, 80), 9);
  });
});

// GPT storage experiment: 1,000 m², runoff coefficient 1 → 1 mm of rain = 1 m³ into the tank
const tankRun = (rain: number[], cap: number, fill: number, outlet: number) => {
  const steps = bucketSeries(cap * fill, cap, rain, outlet > 0 ? [outlet] : []);
  const downstream = steps.map((s) => s.overflow + (s.out[0] ?? 0));
  return { downstream: downstream.reduce((a, b) => a + b, 0), end: steps[steps.length - 1].storage, max1h: Math.max(...downstream) };
};

describe('roof tank check values (docs/10 §4)', () => {
  it('OAK, 30 m³, outlet closed → 97.7 / 30.0 / 17.8', () => {
    const r = tankRun(OAK, 30, 0, 0);
    expect(Math.abs(r.downstream - 97.7)).toBeLessThan(0.1); expect(Math.abs(r.end - 30.0)).toBeLessThan(0.1); expect(Math.abs(r.max1h - 17.8)).toBeLessThan(0.1);
  });
  it('OAK, empty, outlet 1 m³/h → 103.9 / 23.8 / 17.8', () => {
    const r = tankRun(OAK, 30, 0, 1);
    expect(Math.abs(r.downstream - 103.9)).toBeLessThan(0.1); expect(Math.abs(r.end - 23.8)).toBeLessThan(0.1); expect(Math.abs(r.max1h - 17.8)).toBeLessThan(0.1);
  });
  it('OAK, half full, outlet 1 m³/h → 118.9 / 23.8 / 17.8', () => {
    const r = tankRun(OAK, 30, 0.5, 1);
    expect(Math.abs(r.downstream - 118.9)).toBeLessThan(0.1); expect(Math.abs(r.end - 23.8)).toBeLessThan(0.1); expect(Math.abs(r.max1h - 17.8)).toBeLessThan(0.1);
  });
  it('SFO, empty, outlet 1 m³/h → inflow 42.0 / end 24.5 / max hour 1.0', () => {
    const r = tankRun(SFO, 30, 0, 1);
    expect(Math.abs(SFO.reduce((a, b) => a + b, 0) - 42.0)).toBeLessThan(0.1);
    expect(Math.abs(r.end - 24.5)).toBeLessThan(0.1); expect(Math.abs(r.max1h - 1.0)).toBeLessThan(0.1);
  });
  const csv = path.resolve(root, '..', 'data', 'sf-glen-canyon', 'research-v3', 'storage', 'scenario_summary.csv');
  const has = fs.existsSync(csv);
  (has ? it : it.skip)('all 36 GPT scenarios match within 0.1 m³', () => {
    const lines = fs.readFileSync(csv, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const head = lines[0].split(',');
    const col = (r: string[], n: string) => Number(r[head.indexOf(n)]);
    let n = 0;
    for (const l of lines.slice(1)) {
      const r = l.split(',');
      const pattern = r[0];
      const rain = pattern.startsWith('OAK') ? OAK : new Array(24).fill(OAK.reduce((a, b) => a + b, 0) / 24);
      const res = tankRun(rain, col(r, 'capacity_m3'), col(r, 'initial_fill_fraction'), col(r, 'requested_outlet_m3_per_hour'));
      expect(Math.abs(res.downstream - col(r, 'event_downstream_volume_m3'))).toBeLessThan(0.1);
      expect(Math.abs(res.end - col(r, 'event_end_storage_m3'))).toBeLessThan(0.1);
      expect(Math.abs(res.max1h - col(r, 'max_1h_mean_downstream_m3_per_hour'))).toBeLessThan(0.1);
      n++;
    }
    expect(n).toBe(36);
  });
});

describe('bucket solver invariants', () => {
  it('storage stays within 0..capacity and volumes balance', () => {
    let s = 0;
    for (let k = 0; k < 200; k++) {
      const vin = (Math.sin(k) + 1) * 7, cap = 12, rates = [0.5, 2.5];
      const st = bucketStep(s, cap, vin, rates);
      expect(st.storage).toBeGreaterThanOrEqual(-1e-12); expect(st.storage).toBeLessThanOrEqual(cap + 1e-12);
      const out = st.out.reduce((a, b) => a + b, 0) + st.overflow;
      expect(Math.abs(s + vin - out - st.storage)).toBeLessThan(1e-9);
      s = st.storage;
    }
  });
});

describe('site storm model', () => {
  const plans: StormPlan[] = [
    { gardens: [] },
    { gardens: [{ cand: 'E', size: 'M' }] },
    { gardens: [{ cand: 'C', size: 'M' }, { cand: 'F', size: 'L' }], tank: { size: 'L', release: 'slow' }, disconnect: 'west', paving: true },
    { gardens: [{ cand: 'B', size: 'S' }, { cand: 'D', size: 'S' }], tank: { size: 'S', release: 'closed' }, disconnect: 'east' },
  ];
  it('whole-site water balance closes (< 0.001 m³) and each facility closes', () => {
    for (const rain of [OAK, SFO]) for (const p of plans) {
      const r = runStorm(site, rain, p);
      expect(Math.abs(r.balanceError)).toBeLessThan(0.001);
      for (const f of r.facilities) {
        const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
        const inflow = f.kind === 'garden' ? sum(f.inflow) - sum(f.bypass) : sum(f.inflow);
        const out = sum(f.overflow) + sum(f.infiltrated) + sum(f.delayed);
        expect(Math.abs(inflow - out - f.storage[f.storage.length - 1])).toBeLessThan(0.001);
        for (const s of f.storage) { expect(s).toBeGreaterThanOrEqual(-1e-9); expect(s).toBeLessThanOrEqual(f.capM3 + 1e-9); }
      }
    }
  });
  it('is deterministic', () => {
    const a = runStorm(site, OAK, plans[2]), b = runStorm(site, OAK, plans[2]);
    expect(a.outletTotal).toEqual(b.outletTotal);
  });
  it('an underdrain is added whenever the bottom soaks slower than 12.7 mm/h', () => {
    const r = runStorm(site, OAK, plans[2]);
    for (const f of r.facilities.filter((x) => x.kind !== 'tank')) expect(f.underdrain).toBe(f.kSoil < 12.7);
  });
  it('delayed water is counted in the drain total, never as kept out', () => {
    const base = runStorm(site, OAK, { gardens: [] });
    const r = runStorm(site, OAK, { gardens: [], tank: { size: 'L', release: 'slow' } });
    expect(r.delayedTotal).toBeGreaterThan(0);
    expect(Math.abs(base.drainTotal - r.drainTotal)).toBeLessThan(1e-6); // slow release: everything still reaches the drain
  });
  it('unknown soil runs as C for the main number (range B–D), never as A', () => {
    expect(A.unknownHsgCentral.value).toBe('C');
    expect(cellHsg(9, A.unknownHsgCentral.value)).toBe('C');
    expect(cellHsg(4, 'B')).toBe('D'); // known groups never change with the scenario
    const b = runStorm(site, OAK, { gardens: [] }, { unknownAs: 'B' }), d = runStorm(site, OAK, { gardens: [] }, { unknownAs: 'D' });
    expect(b.drainTotal).toBeLessThanOrEqual(d.drainTotal);
  });
});

describe('level calibration (solver)', () => {
  it('level 1 has solutions; spots off the main flow lines all fail', () => {
    const { rows } = solveStormLevel(LEVEL1, site, SFO);
    expect(rows.some((r) => r.pass)).toBe(true);
    expect(rows.filter((r) => r.pass).every((r) => ['E', 'F'].includes(r.plan.gardens[0]?.cand ?? ''))).toBe(true);
  });
  it('level 2 has solutions and level 1’s answer fails it', () => {
    const { rows } = solveStormLevel(LEVEL2, site, OAK);
    const pass = rows.filter((r) => r.pass);
    expect(pass.length).toBeGreaterThan(0);
    const obvious = rows.filter((r) => r.plan.gardens.length === 1 && ['E', 'F'].includes(r.plan.gardens[0].cand) && !r.plan.tank && !r.plan.disconnect && !r.plan.paving);
    expect(obvious.every((r) => !r.pass)).toBe(true);
  }, 30000);
});

describe('roof tank level at the start of a storm (daily rain since 1 Oct, empty on 1 Oct)', () => {
  it('a kept tank is already full when the New Year’s Eve 2022 storm starts — full since 8 Nov 2022', () => {
    expect(oakTank.S.closed).toBeCloseTo(TANK_M3.S, 6);
    expect(oakTank.L.closed).toBeCloseTo(TANK_M3.L, 6);
    const h = tankHistory(site, daily, '2022-12-31');
    expect(h.L.closed.fullSince).toBe('2022-11-08');
    expect(h.S.closed.fullSince).toBe('2022-11-08');
    expect(h.L.slow.fullSince).toBeNull();
  });
  it('levels stay within 0..capacity, and a slow-release tank is never fuller than a closed one', () => {
    for (const z of ['S', 'L'] as const) {
      for (const m of ['closed', 'slow'] as const) { expect(oakTank[z][m]).toBeGreaterThanOrEqual(0); expect(oakTank[z][m]).toBeLessThanOrEqual(TANK_M3[z] + 1e-9); }
      expect(oakTank[z].slow).toBeLessThanOrEqual(oakTank[z].closed + 1e-9);
    }
  });
  it('a full kept tank catches nothing new: same drain total as no tank', () => {
    const base = runStorm(site, OAK, { gardens: [] }, { tankStart: oakTank });
    const r = runStorm(site, OAK, { gardens: [], tank: { size: 'L', release: 'closed' } }, { tankStart: oakTank });
    expect(Math.abs(base.drainTotal - r.drainTotal)).toBeLessThan(1e-6);
    expect(Math.abs(r.balanceError)).toBeLessThan(0.001);
  });
});

describe('guess bins agree with the pass rule', () => {
  it('a passing plan is never put in the “over the goal” bin (level 1) or the “under the goal” bin (level 2)', () => {
    const l1 = solveStormLevel(LEVEL1, site, SFO).rows.filter((r) => r.pass);
    expect(l1.every((r) => guessTruth(1, LEVEL1, r) !== 'high')).toBe(true);
    const l2 = solveStormLevel(LEVEL2, site, OAK, oakTank).rows.filter((r) => r.pass);
    expect(l2.length).toBeGreaterThan(0);
    expect(l2.every((r) => guessTruth(2, LEVEL2, r) !== 'low')).toBe(true);
  }, 30000);
  it('level 2 star 2 (≤ the token goal) is reachable with the tank level computed from real rain', () => {
    const l2 = solveStormLevel(LEVEL2, site, OAK, oakTank).rows.filter((r) => r.pass);
    expect(Math.min(...l2.map((r) => r.cost))).toBeLessThanOrEqual(LEVEL2.star3Budget!);
    void judge;
  }, 30000);
});
