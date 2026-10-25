// Content rules (T4, T5, T7, T8): predictions are judged by the model, skipping costs nothing, quest rings follow the
// projection, evidence and consequence numbers equal the model output, and the proposal keeps the player's words as typed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeCtx, evaluate, Autumns, newCampaign, setAutumn, commitAutumn, predict } from '../src/campaign/campaign';
import { autumnQuestion, STORM_QUESTION, truthFor } from '../src/content/predictions';
import { questStates, pauseLines, allyLines } from '../src/content/npcs';
import { evidenceCards, proposalText, proposalRows, consequenceRows, NEXT_STEPS } from '../src/content/evidence';
import { survival } from '../src/model/season';
import { A } from '../src/model/assumptions';

const root = path.resolve(__dirname, '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const w = read('weather-daily.json'), d = read('site-slope.json'), site = read('site-storm.json'), storms = read('storms.json');
const ctx = makeCtx(w, d, site, { id: 'OAK', rainMm: storms.OAK.rainMm, startLocal: storms.OAK.startLocal });
const base = evaluate(ctx, [{}, {}, {}]);
const facts = { wy2021Mm: w.waterYears[0].rainMm, nyeDowntownMm: storms.downtownDaily20221231Mm, oakTotalMm: storms.OAK.totalMm, oakMaxHourMm: storms.OAK.maxHourMm };
const ALL4: Autumns = [{ replantSlope: { areaM2: 1250, water: true }, trail: 'reroute' }, { shadeTrees: 6 }, { storm: { gardens: [{ cand: 'C', size: 'M' }], tank: { size: 'L' } } }];

describe('predictions (T5)', () => {
  it('ask about the main card of autumn 2020 only; the right bin comes from the model run', () => {
    expect(autumnQuestion([{}, {}, {}], 0)).toBeNull();
    expect(autumnQuestion([{}, { shadeTrees: 6 }, {}], 1)).toBeNull();
    const dry: Autumns = [{ replantSlope: { areaM2: 1000, water: false } }, {}, {}];
    const q = autumnQuestion(dry, 0)!;
    expect(q.key).toBe('y0-survival');
    const r = evaluate(ctx, dry);
    const s = r.slope.cohorts[0].survival!;
    const [lo, hi] = A.guessSurvivalBins.value as number[];
    expect(truthFor(q, ctx, r, base).id).toBe(s >= hi ? 'most' : s >= lo ? 'half' : 'few');
    const wet: Autumns = [{ replantSlope: { areaM2: 1000, water: true } }, {}, {}];
    const qw = autumnQuestion(wet, 0)!;
    const gain = survival(ctx.model.col('seedGrass', 0, true).severeDays[0]) - survival(ctx.model.col('seedGrass', 0, false).severeDays[0]);
    expect(truthFor(qw, ctx, evaluate(ctx, wet), base).id).toBe(gain >= 0.3 ? 'many' : gain >= 0.1 ? 'bit' : 'same');
    const trees: Autumns = [{ trees: { areaM2: 500 } }, {}, {}];
    expect(truthFor(autumnQuestion(trees, 0)!, ctx, evaluate(ctx, trees), base).id).toBe('less');
    const trail: Autumns = [{ trail: 'close' }, {}, {}];
    const tr = evaluate(ctx, trail);
    const less = 1 - tr.slope.ldn.grassland.short.erosionRatio;
    expect(truthFor(autumnQuestion(trail, 0)!, ctx, tr, base).id).toBe(less >= 0.15 ? 'lot' : less >= 0.02 ? 'little' : 'none');
  });
  it('the storm question is judged on the biggest hour vs doing nothing', () => {
    const r = evaluate(ctx, ALL4);
    const drop = (base.storm.peakM3 - r.storm.peakM3) / base.storm.peakM3;
    expect(truthFor(STORM_QUESTION, ctx, r, base).id).toBe(drop >= 0.15 ? 'much' : drop >= 0.03 ? 'bit' : 'same');
  });
  it('skipping costs nothing: no score, and the plan and budget are unchanged', () => {
    let s = newCampaign();
    s = setAutumn(s, 0, { replantSlope: { areaM2: 1250, water: true } });
    s = commitAutumn(s, ctx);
    const before = evaluate(ctx, s.autumns);
    const skipped = predict(s, { key: 'y0-watering', year: 0, answer: null, truth: 'many', correct: null });
    expect(skipped.predictions[0].correct).toBeNull();
    expect(evaluate(ctx, skipped.autumns).tokens.total).toBe(before.tokens.total);
    expect(skipped.autumns).toEqual(s.autumns);
  });
});

describe('quest rings and lines (T4)', () => {
  it('open → on track / at risk while planning; done / not done only after their moment', () => {
    let s = newCampaign();
    const r0 = evaluate(ctx, s.autumns);
    expect(Object.values(questStates(s, r0, { stormDone: false, dayIso: null, ended: false }))).toEqual(['open', 'open', 'open', 'open']);
    s = setAutumn(s, 0, { replantSlope: { areaM2: 1250, water: true }, trail: 'close' });
    const r1 = evaluate(ctx, s.autumns);
    const q1 = questStates(s, r1, { stormDone: false, dayIso: null, ended: false });
    expect(q1.maya).toBe('onTrack');
    expect(q1.leo).toBe('atRisk'); // the campers’ way down is cut
    const rAll = evaluate(ctx, ALL4);
    const sAll = { ...s, autumns: ALL4, ran: 3 };
    expect(questStates(sAll, rAll, { stormDone: true, dayIso: '2023-01-02', ended: false }).chen).toBe('done');
    expect(questStates(sAll, rAll, { stormDone: true, dayIso: '2023-04-30', ended: false }).coach).toBe('onTrack');
    expect(questStates(sAll, rAll, { stormDone: true, dayIso: '2023-05-01', ended: false }).coach).toBe('done');
    expect(questStates(sAll, rAll, { stormDone: true, dayIso: '2023-09-30', ended: true }).maya).toBe('done');
  });
  it('Leo speaks after the shortcut is closed and offers the reroute; allies are announced when they start', () => {
    const p: Autumns = [{ replantSlope: { areaM2: 1250, water: true }, trail: 'close' }, {}, {}];
    const r = evaluate(ctx, p);
    const lines = pauseLines(0, p, r);
    const leo = lines.find((l) => l.npc === 'leo')!;
    expect(leo.options?.map((o) => o.id)).toEqual(['adjust', 'explain', 'ignore']);
    expect(leo.options?.[0].tokens).toBe(A.rerouteExtraTokens.value);
    expect(allyLines(0, r).map((l) => l.npc)).toEqual(['maya']);
    expect(pauseLines(0, [{ trees: { areaM2: 500 } }, {}, {}], evaluate(ctx, [{ trees: { areaM2: 500 } }, {}, {}])).some((l) => l.npc === 'maya')).toBe(true);
  });
});

describe('consequences and evidence (T7, T8)', () => {
  it('rows show the model numbers; doing nothing changes nothing', () => {
    expect(consequenceRows(base, base).filter((x) => x.dir !== 'same')).toEqual([]);
    const r = evaluate(ctx, ALL4);
    const rows = consequenceRows(r, base);
    expect(rows.find((x) => x.k === 'peak')!.plan).toBe(`${r.storm.peakM3.toFixed(1)} m³`);
    expect(rows.find((x) => x.k === 'peak')!.base).toBe(`${base.storm.peakM3.toFixed(1)} m³`);
    expect(rows.find((x) => x.k === 'native')!.plan).toBe(`${Math.round(r.slope.establishedNative).toLocaleString('en-US')} m²`);
    expect(rows.find((x) => x.k === 'tank')!.plan).toBe(`${r.tankMay1!.toFixed(1)} m³`);
  });
  it('evidence cards carry the model and observed numbers with their source tags', () => {
    const r = evaluate(ctx, ALL4);
    const ev = evidenceCards(r, base, facts);
    const peak = ev.find((e) => e.id === 'peak')!;
    expect(peak.value).toContain(r.storm.peakM3.toFixed(1)); expect(peak.value).toContain(base.storm.peakM3.toFixed(1)); expect(peak.tier).toBe('model');
    expect(ev.find((e) => e.id === 'rain2021')!.tier).toBe('observed');
    expect(ev.find((e) => e.id === 'rain2021')!.value).toBe(`${w.waterYears[0].rainMm} mm`);
    expect(ev.find((e) => e.id === 'shade')!.value).toContain(`${r.shadeAlive} of 6`);
  });
  it('the shortcut card compares two model runs: the same plan with the shortcut closed and left open', () => {
    const p: Autumns = [{ replantSlope: { areaM2: 1250, water: true }, trail: 'close' }, {}, {}];
    const r = evaluate(ctx, p), open = evaluate(ctx, [{ replantSlope: { areaM2: 1250, water: true } }, {}, {}]);
    const card = evidenceCards(r, base, facts, open).find((e) => e.id === 'trail')!;
    expect(card.value).toContain(`×${(r.slope.years[2].grassland.erosion / open.slope.years[2].grassland.erosion).toFixed(2)}`);
    expect(r.slope.years[2].grassland.erosion).toBeLessThan(open.slope.years[2].grassland.erosion);
  });
  it('the proposal keeps the player’s sentence exactly, asks for no name, and carries the labels', () => {
    const s = { ...newCampaign(), autumns: ALL4, ran: 3 };
    const r = evaluate(ctx, ALL4);
    const sentence = '  the shade matters for 6-year-olds in July — and 16 tokens is OK!  ';
    const ev = evidenceCards(r, base, facts).slice(0, 3);
    const t = proposalText(s, r, base, sentence, ev, NEXT_STEPS[2]);
    expect(t).toContain(`I’d accept this cost because ${sentence}`);
    expect(t.split('\n').filter((l) => l.startsWith('Evidence:')).length).toBe(2); // at most two cards
    expect(t).toContain('Prototype model · teaching assumptions');
    expect(t).toContain('None of the organisations named here has endorsed this game.');
    expect(t).not.toMatch(/\bname:/i);
    expect(proposalRows(s, r, base).find((x) => x.k === 'economic')!.text).toContain(`${r.tokens.total} of ${r.tokens.budget} tokens`);
  });
});
