// Canyon season (trial version, T1/T2): three autumn decisions on the east slope (daily model, slope.ts) and the
// New Year's Eve 2022 storm at the Rec Center (hourly model, storm.ts), joined into one timeline.
// The two places are different parts of the same park: no water flows between them in the model. They share only the
// budget — one pool of tokens, and each water year's sweat and water. Nothing in this file changes the model's physics:
// it maps cards to the existing model inputs, adds up the costs, and reads quests, allies and endings off the model outputs.
import { A } from '../model/assumptions';
import { SlopeModel, runSlope, SlopePlan, SlopeResult, COSTS3 } from '../model/slope';
import { survival } from '../model/season';
import { runStorm, StormPlan, StormResult, StormSite, GardenSize, TankSize, TankStart, tankHistory, tankStartFromDaily } from '../model/storm';
import { planCost } from '../levels/stormLevels';

export type NpcId = 'maya' | 'leo' | 'coach' | 'chen';
export const NPC_IDS: NpcId[] = ['maya', 'leo', 'coach', 'chen'];
export const YEARS = [2020, 2021, 2022] as const; // autumn of each decision; water year = autumn + 1

export interface StormPrep {
  gardens: { cand: string; size: GardenSize }[];
  tank: { size: TankSize } | null; // main line: kept for watering (“closed”); releasing is only the what-if experiment
  disconnect?: false | 'west' | 'east'; // unlocked on a replay
  paving?: boolean; // unlocked on a replay
}
export type TrailChoice = 'close' | 'reroute';
export interface AutumnChoice {
  replantSlope?: { areaM2: number; water: boolean; waterFrom?: number } | null; // native grass on the east slope (re-seeds bare patches first); waterFrom = “Water now” during the replay (day index)
  trees?: { areaM2: number } | null; // young trees planted ON the east-slope grassland (autumn 2020 card)
  trail?: TrailChoice | null; // the unofficial shortcut: “reroute” = the old line closes exactly as with “close”, and a new way down stays open
  check?: boolean;
  shadeTrees?: number; // shade trees by the Rec Center lawn (count; one planting, autumn 2021 or 2022)
  storm?: StormPrep | null; // autumn 2022 only
}
export type Autumns = [AutumnChoice, AutumnChoice, AutumnChoice];
export const emptyAutumns = (): Autumns => [{}, {}, {}];

export const BUDGET_C = A.campaignBudget.value as { tokens: number; sweatPerYear: number; waterPerYearM3: number };
export const SHADE_COUNTS = A.shadeTreeCounts.value as number[];

// ------------------------------------------------------------------ context (model objects shared by every evaluation)
export interface StormInput { id: 'OAK' | 'SFO'; rainMm: number[]; startLocal: string }
export interface CampaignCtx {
  model: SlopeModel;
  site: StormSite;
  daily: { dates: string[]; precipMm: number[]; et0Mm: number[] };
  storm: StormInput;
  tankStart: TankStart; // level when the storm starts (empty on 1 Oct 2022, then the real downtown daily rain)
  cache: Map<string, StormResult>;
  budgetTokens?: number; // replay option: tight / normal / generous (default BUDGET_C.tokens)
}
/** Same models and caches, another token pool (P1 budget tiers). */
export const withBudget = (ctx: CampaignCtx, tokens: number): CampaignCtx => ({ ...ctx, budgetTokens: tokens });
export function makeCtx(weather: { dates: string[]; precipMm: number[]; et0Mm: number[] }, slopeData: any, site: StormSite, storm: StormInput, model?: SlopeModel): CampaignCtx {
  const m = model ?? new SlopeModel(weather, slopeData);
  return { model: m, site, daily: weather, storm, tankStart: tankStartFromDaily(site, weather, storm.startLocal.slice(0, 10)), cache: new Map() };
}
/** Same context with another storm (P1 “swap the storm”): its own tank level from the daily rain before that storm. */
export function withStorm(ctx: CampaignCtx, storm: StormInput): CampaignCtx {
  return { ...ctx, storm, tankStart: tankStartFromDaily(ctx.site, ctx.daily, storm.startLocal.slice(0, 10)), cache: new Map() };
}

// ------------------------------------------------------------------ mapping cards → model inputs
const trailActedBefore = (autumns: Autumns, y: number) => autumns.slice(0, y).some((a) => !!a.trail);
/** The slope model's plan. Autumns after `through` are left empty (“if you add nothing more”). */
export function slopePlanOf(autumns: Autumns, through = 2): SlopePlan {
  return autumns.map((a, y) => (y > through ? {} : {
    replantSlope: a.replantSlope && a.replantSlope.areaM2 > 0 ? a.replantSlope : null,
    trees: a.trees && a.trees.areaM2 > 0 ? a.trees : null,
    // the model closes the old line once; a later reroute of an already-closed line changes nothing on the slope
    closeTrail: !!a.trail && !trailActedBefore(autumns, y),
    check: !!a.check,
  })) as SlopePlan;
}
export function stormBuilt(prep: StormPrep | null | undefined) {
  return !!prep && (prep.gardens.length > 0 || !!prep.tank || !!prep.disconnect || !!prep.paving);
}
export function stormPlanOf(prep: StormPrep | null | undefined, release: 'closed' | 'slow' = 'closed'): StormPlan {
  return { gardens: prep?.gardens ?? [], tank: prep?.tank ? { size: prep.tank.size, release } : null, disconnect: prep?.disconnect ?? false, paving: !!prep?.paving };
}
/** Hourly storm run for a storm prep (memoised per context). `release: 'slow'` = the “what if the tank had been emptied?” experiment. */
export function stormRun(ctx: CampaignCtx, prep: StormPrep | null | undefined, release: 'closed' | 'slow' = 'closed'): StormResult {
  const plan = stormPlanOf(prep, release);
  const key = JSON.stringify(plan);
  let r = ctx.cache.get(key);
  if (!r) { r = runStorm(ctx.site, ctx.storm.rainMm, plan, { tankStart: ctx.tankStart }); ctx.cache.set(key, r); }
  return r;
}
export const stormBase = (ctx: CampaignCtx) => stormRun(ctx, null);

// ------------------------------------------------------------------ shade trees (bookkeeping on the model's young-tree column)
export interface ShadeCohort { year: number; planted: number; areaM2: number; severeDays: number; survival: number; alive: number; irrigationM3: number; sweatH: number; tokens: number }
export function shadeCohort(m: SlopeModel, y: number, n: number): ShadeCohort {
  const area = n * COSTS3.crownM2;
  const c = m.col('seedTree', y, true); // young trees are watered through their first water year (same rule as trees on the slope)
  const sd = c.severeDays[y];
  const s = survival(sd);
  return {
    year: y, planted: n, areaM2: area, severeDays: sd, survival: s, alive: Math.floor(n * s + 1e-9),
    irrigationM3: (c.irrigationMm[y] * area) / 1000,
    sweatH: (area / 100) * (COSTS3.sweatPer100m2Plant + COSTS3.sweatPer100m2Water),
    tokens: Math.ceil(area / 100) * COSTS3.tokensPer100m2Trees,
  };
}

/** Roof-tank level at the start of a day, from the daily rule the prototype already uses (empty on 1 Oct, real downtown rain). */
export function tankLevelOn(ctx: CampaignCtx, size: TankSize, release: 'closed' | 'slow', isoDay: string) {
  return tankHistory(ctx.site, ctx.daily, isoDay)[size][release].level;
}

// ------------------------------------------------------------------ allies (game rules; values are teaching assumptions)
/** Allies helping during water year y, from decisions made in earlier autumns. */
export function alliesFor(autumns: Autumns, through = 2) {
  const maya = [0, 1, 2].map((y) => y <= through && autumns.slice(0, y).some((a) => !!a.trail) && !autumns.slice(0, y).some((a) => (a.trees?.areaM2 ?? 0) > 0));
  const leo = [0, 1, 2].map((y) => y <= through && autumns.slice(0, y).some((a) => (a.shadeTrees ?? 0) > 0));
  const coach = through >= 2 && autumns[2].storm?.tank?.size === 'L';
  return { maya, leo, coach };
}

// ------------------------------------------------------------------ evaluation
export type SlopeOutcome = 'back' | 'greener' | 'longDry' | 'little';
export type StormOutcome = 'met' | 'missed' | 'none';
export type EndingId = 'quiet' | 'neutral' | 'grassland' | 'greener' | 'longDry' | 'stormReady' | 'peakThrough' | 'tradeoffs';
export const ENDING_IDS: EndingId[] = ['quiet', 'neutral', 'grassland', 'greener', 'longDry', 'stormReady', 'peakThrough', 'tradeoffs'];

export interface CampaignResult {
  through: number;
  slope: SlopeResult;
  shade: ShadeCohort[];
  shadeAlive: number; // trees alive on 30 Sept 2023 (each planting settles on 30 Sept of its first water year)
  trail: 'open' | 'closed' | 'rerouted';
  stormPrep: StormPrep | null;
  storm: StormResult; // with the autumn-2022 prep (no prep = doing nothing)
  stormBase: StormResult;
  tankMay1: number | null; // m³ in the roof tank at the start of the Coach check day; null = no tank
  tokens: { slope: number; reroute: number; shade: number; storm: number; allies: number; total: number; budget: number };
  sweat: number[]; sweatBudget: number[]; water: number[]; waterBudget: number[];
  over: { tokens: boolean; sweat: boolean[]; water: boolean[]; any: boolean };
  allies: ReturnType<typeof alliesFor>;
  quests: Record<NpcId, boolean>;
  questCount: number;
  slopeOutcome: SlopeOutcome;
  stormOutcome: StormOutcome;
  ending: EndingId;
  cardsPlayed: number;
}

export function cardsIn(a: AutumnChoice) {
  let n = 0;
  if ((a.replantSlope?.areaM2 ?? 0) > 0) n++;
  if ((a.trees?.areaM2 ?? 0) > 0) n++;
  if (a.trail) n++;
  if (a.check) n++;
  if ((a.shadeTrees ?? 0) > 0) n++;
  if (a.storm) n += a.storm.gardens.length + (a.storm.tank ? 1 : 0) + (a.storm.disconnect ? 1 : 0) + (a.storm.paving ? 1 : 0);
  return n;
}

/**
 * Everything the game shows for a set of decisions. Autumns after `through` count as empty, so with through < 2 this is
 * the projection “Sept 2023 if you add nothing more” (used for quest status while planning). Pure and deterministic.
 */
export function evaluate(ctx: CampaignCtx, autumns: Autumns, through = 2): CampaignResult {
  const m = ctx.model;
  const slope = runSlope(m, slopePlanOf(autumns, through));
  const used = autumns.map((a, y) => (y <= through ? a : ({} as AutumnChoice)));
  // shade trees
  const shade: ShadeCohort[] = [];
  used.forEach((a, y) => { if ((a.shadeTrees ?? 0) > 0) shade.push(shadeCohort(m, y, a.shadeTrees!)); });
  const shadeAlive = shade.reduce((s, c) => s + c.alive, 0);
  // trail
  const acted = used.filter((a) => !!a.trail);
  const trail = acted.some((a) => a.trail === 'reroute') ? 'rerouted' : acted.length ? 'closed' : 'open';
  // storm (autumn 2022)
  const prep = through >= 2 && stormBuilt(used[2].storm) ? used[2].storm! : null;
  const storm = stormRun(ctx, prep), base = stormBase(ctx);
  const tankMay1 = prep?.tank ? tankLevelOn(ctx, prep.tank.size, 'closed', A.questCoachDate.value) : null;
  // allies and budgets
  const allies = alliesFor(autumns, through);
  const tokens = {
    slope: slope.tokens,
    reroute: used.some((a) => a.trail === 'reroute') ? A.rerouteExtraTokens.value : 0,
    shade: shade.reduce((s, c) => s + c.tokens, 0),
    storm: prep ? planCost(stormPlanOf(prep)) : 0,
    allies: allies.coach ? -A.allyCoachTokens.value : 0,
    total: 0, budget: ctx.budgetTokens ?? BUDGET_C.tokens,
  };
  tokens.total = tokens.slope + tokens.reroute + tokens.shade + tokens.storm + tokens.allies;
  const sweat = [0, 1, 2].map((y) => slope.sweat[y] + shade.filter((c) => c.year === y).reduce((s, c) => s + c.sweatH, 0));
  const water = [0, 1, 2].map((y) => slope.water[y] + shade.filter((c) => c.year === y).reduce((s, c) => s + c.irrigationM3, 0));
  const sweatBudget = [0, 1, 2].map((y) => BUDGET_C.sweatPerYear + (allies.maya[y] ? A.allyMayaSweat.value : 0) + (allies.leo[y] ? A.allyLeoSweat.value : 0));
  const waterBudget = [0, 1, 2].map(() => BUDGET_C.waterPerYearM3);
  const over = {
    tokens: tokens.total > tokens.budget,
    sweat: sweat.map((v, y) => v > sweatBudget[y] + 1e-9),
    water: water.map((v, y) => v > waterBudget[y] + 1e-9),
    any: false,
  };
  over.any = over.tokens || over.sweat.some(Boolean) || over.water.some(Boolean);
  // quests (conditions read off the model; projections when through < 2)
  const quests: Record<NpcId, boolean> = {
    maya: slope.establishedNative >= A.questMayaNative.value - 1e-9 && slope.ldn.grassland.status !== 'net_loss',
    leo: shadeAlive >= A.questLeoTrees.value && trail !== 'closed',
    coach: tankMay1 != null && tankMay1 >= A.questCoachTankM3.value - 1e-9,
    chen: storm.peakM3 <= A.questChenPeak.value + 1e-9,
  };
  const questCount = NPC_IDS.filter((k) => quests[k]).length;
  // ending: slope × storm × neighbours (deterministic; no random numbers)
  const g2020 = slope.cohorts.find((c) => c.year === 0 && c.cls === 'grassland' && c.kind === 'grass');
  const resown = used.slice(1).some((a) => (a.replantSlope?.areaM2 ?? 0) > 0);
  const slopeOutcome: SlopeOutcome = quests.maya ? 'back'
    : used.some((a) => (a.trees?.areaM2 ?? 0) > 0) && slope.ldn.grassland.status === 'net_loss' ? 'greener'
    : g2020 && (g2020.survival ?? 1) < A.longDrySurvival.value && !resown ? 'longDry'
    : 'little';
  const stormOutcome: StormOutcome = !prep ? 'none' : quests.chen ? 'met' : 'missed';
  const cardsPlayed = used.reduce((s, a) => s + cardsIn(a), 0);
  return { through, slope, shade, shadeAlive, trail, stormPrep: prep, storm, stormBase: base, tankMay1, tokens, sweat, sweatBudget, water, waterBudget, over, allies, quests, questCount,
    slopeOutcome, stormOutcome, ending: endingOf(slopeOutcome, stormOutcome, questCount, cardsPlayed), cardsPlayed };
}

export function endingOf(s: SlopeOutcome, st: StormOutcome, quests: number, cards: number): EndingId {
  if (cards === 0) return 'quiet';
  if (s === 'back') return st === 'met' ? (quests >= A.neutralGroundQuests.value ? 'neutral' : 'tradeoffs') : 'grassland';
  if (s === 'greener') return 'greener';
  if (s === 'longDry') return 'longDry';
  if (st === 'met') return 'stormReady';
  if (st === 'missed') return 'peakThrough';
  return 'tradeoffs';
}

/** Bare patches on the east slope at the start of autumn y (seedlings that died at the last 30 Sept settlement + older bare). */
export function bareAtStart(ctx: CampaignCtx, autumns: Autumns, y: number) {
  if (y === 0) return 0;
  const r = runSlope(ctx.model, slopePlanOf(autumns, y - 1));
  return r.years[y - 1].grassland.bare + r.cohorts.filter((c) => c.cls === 'grassland' && c.year === y - 1).reduce((s, c) => s + c.areaM2 * (1 - (c.survival ?? 0)), 0);
}

// ------------------------------------------------------------------ which cards each autumn offers (plan: “Choices and consequences”)
export interface Offer { replant: boolean; trees: boolean; trail: boolean; check: boolean; shade: boolean; storm: boolean; oneCard: boolean }
export function offerFor(autumns: Autumns, y: number): Offer {
  const shadeBefore = autumns.slice(0, y).some((a) => (a.shadeTrees ?? 0) > 0);
  if (y === 0) return { replant: true, trees: true, trail: true, check: true, shade: false, storm: false, oneCard: false };
  if (y === 1) return { replant: true, trees: false, trail: false, check: false, shade: true, storm: false, oneCard: true };
  return { replant: true, trees: false, trail: false, check: false, shade: !shadeBefore, storm: true, oneCard: false };
}
/** Keeps a choice inside what that autumn offers (2021 is the light step: one card). A reroute answered to Leo is allowed any autumn. */
export function sanitize(autumns: Autumns, y: number, c: AutumnChoice, last?: keyof AutumnChoice): AutumnChoice {
  const o = offerFor(autumns, y);
  const out: AutumnChoice = {};
  if (o.replant && (c.replantSlope?.areaM2 ?? 0) > 0) out.replantSlope = c.replantSlope;
  if (o.trees && (c.trees?.areaM2 ?? 0) > 0) out.trees = c.trees;
  if (c.trail === 'reroute' || (o.trail && c.trail)) out.trail = c.trail;
  if (o.check && c.check) out.check = true;
  if (o.shade && (c.shadeTrees ?? 0) > 0) out.shadeTrees = c.shadeTrees;
  if (o.storm && c.storm) out.storm = c.storm;
  if (o.oneCard && out.replantSlope && out.shadeTrees) {
    // the light step: one card — keep the one just played
    if (last === 'shadeTrees') delete out.replantSlope; else delete out.shadeTrees;
  }
  // a reroute of a line closed in an earlier autumn: only when it was closed (not already rerouted)
  if (out.trail === 'reroute' && y > 0 && !autumns.slice(0, y).some((a) => a.trail === 'close')) delete out.trail;
  if (out.trail === 'close' && y > 0) delete out.trail;
  return out;
}

// ------------------------------------------------------------------ campaign state: snapshots, “revise once and re-run”, log
export type LogKind = 'decision' | 'weather' | 'prediction' | 'response' | 'result' | 'redo' | 'ally' | 'quest' | 'storm' | 'experiment';
export interface LogEntry { date: string; kind: LogKind; text: string; data?: unknown }
export interface PredictionRecord { key: string; year: number; answer: string | null; truth: string; correct: boolean | null }
export type ResponseChoice = 'adjust' | 'explain' | 'ignore';
export interface ResponseRecord { npc: NpcId; year: number; choice: ResponseChoice; evidence?: string }
interface Snapshot { autumns: Autumns; ran: number; predictions: number; responses: number; log: number }
export interface CampaignState {
  autumns: Autumns;
  ran: number; // water years whose decisions are committed (0..3); the autumn being planned is `ran` while ran < 3
  stormDone: boolean;
  ended: boolean;
  focus: NpcId[];
  predictions: PredictionRecord[];
  responses: ResponseRecord[];
  achievements: string[]; // unique; kept through a revision (never issued twice)
  log: LogEntry[];
  snapshots: (Snapshot | null)[]; // taken when each autumn's planning starts
  redoUsed: [boolean, boolean, boolean];
  experiments: string[];
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const snap = (s: CampaignState): Snapshot => ({ autumns: clone(s.autumns), ran: s.ran, predictions: s.predictions.length, responses: s.responses.length, log: s.log.length });

export function newCampaign(focus: NpcId[] = []): CampaignState {
  const s: CampaignState = { autumns: emptyAutumns(), ran: 0, stormDone: false, ended: false, focus: focus.slice(0, 2), predictions: [], responses: [], achievements: [], log: [],
    snapshots: [null, null, null], redoUsed: [false, false, false], experiments: [] };
  s.snapshots[0] = snap(s);
  return s;
}
export function setFocus(s: CampaignState, focus: NpcId[]): CampaignState { return { ...s, focus: focus.slice(0, 2) }; }

/** Edit the autumn being planned (only that one). */
export function setAutumn(s: CampaignState, y: number, c: AutumnChoice, last?: keyof AutumnChoice): CampaignState {
  if (s.ended || y !== s.ran || y > 2) return s;
  const autumns = clone(s.autumns);
  autumns[y] = sanitize(s.autumns, y, c, last);
  return { ...s, autumns };
}

export function describeAutumn(a: AutumnChoice): string {
  const parts: string[] = [];
  if (a.replantSlope?.areaM2) parts.push(`Replant ${Math.round(a.replantSlope.areaM2).toLocaleString('en-US')} m² native grass${a.replantSlope.water ? ' + water' : a.replantSlope.waterFrom != null ? ' + water from mid-year' : ''}`);
  if (a.trees?.areaM2) parts.push(`Trees on the slope ${a.trees.areaM2} m²`);
  if (a.trail === 'close') parts.push('Close the shortcut');
  if (a.trail === 'reroute') parts.push('Reroute the shortcut');
  if (a.check) parts.push('Check first');
  if (a.shadeTrees) parts.push(`${a.shadeTrees} shade trees by the lawn`);
  if (a.storm) {
    for (const g of a.storm.gardens) parts.push(`Rain garden ${g.size} at ${g.cand}`);
    if (a.storm.tank) parts.push(`Roof tank ${a.storm.tank.size === 'L' ? 'large' : 'small'} (kept for watering)`);
    if (a.storm.disconnect) parts.push(`Disconnect the roof → ${a.storm.disconnect} lawn`);
    if (a.storm.paving) parts.push('Permeable paving');
  }
  return parts.length ? parts.join(' · ') : 'Leave it';
}

/** Commit the autumn being planned (the player pressed Run). The replay itself is display only. */
export function commitAutumn(s: CampaignState, ctx: CampaignCtx): CampaignState {
  if (s.ended || s.ran > 2) return s;
  const y = s.ran;
  const r = evaluate(ctx, s.autumns, y);
  if (r.over.any) return s; // over budget: nothing is committed
  const log = [...s.log, { date: `${YEARS[y]}-10-01`, kind: 'decision' as LogKind, text: `Autumn ${YEARS[y]}: ${describeAutumn(s.autumns[y])} — ${r.tokens.total} of ${r.tokens.budget} tokens used so far`, data: { year: y, autumn: clone(s.autumns[y]) } }];
  const next: CampaignState = { ...s, ran: y + 1, log };
  if (y + 1 <= 2) { next.snapshots = s.snapshots.slice(); next.snapshots[y + 1] = snap(next); }
  return next;
}

/** “Revise once and re-run”: back to the start of autumn y with that autumn's cards pre-filled. Costs are re-derived from the plan, so nothing is charged twice. */
export function canRedo(s: CampaignState, y: number) { return !s.ended && !s.redoUsed[y] && s.ran === y + 1 && !!s.snapshots[y]; }
export function redo(s: CampaignState, y: number): CampaignState {
  if (!canRedo(s, y)) return s;
  const sn = s.snapshots[y]!;
  const autumns = clone(sn.autumns);
  autumns[y] = clone(s.autumns[y]); // keep the abandoned choice as the starting point for the revision
  const redoUsed = s.redoUsed.slice() as [boolean, boolean, boolean];
  redoUsed[y] = true;
  const log = [...s.log.slice(0, sn.log), { date: `${YEARS[y]}-10-01`, kind: 'redo' as LogKind, text: `Revised autumn ${YEARS[y]} (was: ${describeAutumn(s.autumns[y])})` }];
  return { ...s, autumns, ran: sn.ran, stormDone: y === 2 ? false : s.stormDone, predictions: s.predictions.slice(0, sn.predictions), responses: s.responses.slice(0, sn.responses), log, redoUsed,
    snapshots: s.snapshots.map((x, k) => (k <= y ? x : null)) };
}

export function addLog(s: CampaignState, e: LogEntry): CampaignState { return { ...s, log: [...s.log, e] }; }
export function award(s: CampaignState, ids: string[]): { state: CampaignState; fresh: string[] } {
  const fresh = [...new Set(ids)].filter((id) => !s.achievements.includes(id));
  return fresh.length ? { state: { ...s, achievements: [...s.achievements, ...fresh] }, fresh } : { state: s, fresh };
}
export function predict(s: CampaignState, rec: PredictionRecord): CampaignState {
  return { ...s, predictions: [...s.predictions.filter((p) => p.key !== rec.key), rec] };
}
/**
 * A response to a neighbour. “Adjust” for Leo after a closed shortcut = reroute it in the autumn being planned (+2 tokens; the slope
 * model is unchanged because the old line stays closed). Responses are logged for the proposal card.
 */
export function respond(s: CampaignState, rec: ResponseRecord): CampaignState {
  let next: CampaignState = { ...s, responses: [...s.responses, rec] };
  if (rec.npc === 'leo' && rec.choice === 'adjust' && s.ran <= 2 && s.autumns.slice(0, s.ran).some((a) => a.trail === 'close')) {
    const autumns = clone(s.autumns);
    autumns[s.ran] = { ...autumns[s.ran], trail: 'reroute' };
    next = { ...next, autumns };
  }
  return next;
}
export function finishCampaign(s: CampaignState): CampaignState { return { ...s, ended: true }; }
