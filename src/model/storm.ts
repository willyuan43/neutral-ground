// Hourly storm model for levels 1–2 (docs/04 C, D, N).
// Site = the Rec Center area cells that drain (D8) to one outlet. Only rain that falls on the site is counted;
// the creek's water from the canyon above is outside this puzzle (stated in the UI).
import { A, HSG, HSG_FROM_CODE } from './assumptions';
import { scsHourly } from './scs';
import { bucketStep } from './bucket';

export const COVER_NAMES = ['none', 'roof', 'paved', 'turf', 'grass', 'scrub', 'tree', 'bare', 'water', 'rock'] as const;
export type CoverName = (typeof COVER_NAMES)[number];

export interface SiteCell { g: number; r: number; c: number; cover: number; hsg: number; down: number; slope: number; parkAcc: number }
export interface StormSite {
  cellM2: number;
  cells: SiteCell[]; // down = local index of the D8 downstream cell, -1 = reaches the outlet
  outlet: { r: number; c: number; lon: number; lat: number };
  roof: number[]; // local indices: Rec Center roof
  lawn: number[]; // local indices: lawn next to the roof
  lawnWest: number[]; // part of that lawn on the west side (its water runs past spot C)
  lawnEast: number[]; // part on the east side
  paving: number[]; // local indices: paved patch that can become permeable
  candidates: { id: string; local: number; label: string }[];
}

export type GardenSize = 'S' | 'M' | 'L';
export const GARDEN_M2: Record<GardenSize, number> = A.gardenM2.value; // design choices (assumptions.ts)
export type TankSize = 'S' | 'L';
export const TANK_M3: Record<TankSize, number> = A.tankM3.value; // design choices (assumptions.ts)
export type TankMode = 'closed' | 'slow';
export type TankStart = Record<TankSize, Record<TankMode, number>>;

/**
 * How full the roof tank is when a storm window starts. Empty on 1 October (assumed: used up by summer watering),
 * then run day by day on the real downtown-SF daily rain up to the day before the storm (each day's rain spread evenly).
 * “closed” (keep for watering) never empties in the rainy season; “slow” lets the set release rate run.
 */
export function tankStartFromDaily(site: StormSite, daily: { dates: string[]; precipMm: number[] }, stormDate: string): TankStart {
  const t = tankHistory(site, daily, stormDate);
  return { S: { closed: t.S.closed.level, slow: t.S.slow.level }, L: { closed: t.L.closed.level, slow: t.L.slow.level } };
}

/** Tank level at the start of the storm day and, when it is full then, the date it last became full (null otherwise). */
export function tankHistory(site: StormSite, daily: { dates: string[]; precipMm: number[] }, stormDate: string) {
  const roofArea = site.roof.length * site.cellM2;
  const y = Number(stormDate.slice(0, 4)), m = Number(stormDate.slice(5, 7));
  const oct1 = `${m >= 10 ? y : y - 1}-10-01`;
  const i0 = daily.dates.indexOf(oct1), i1 = daily.dates.indexOf(stormDate);
  const empty = () => ({ level: 0, fullSince: null as string | null });
  const out = { S: { closed: empty(), slow: empty() }, L: { closed: empty(), slow: empty() } };
  if (i0 < 0 || i1 < 0) return out; // outside the daily record: start empty (stated in the UI)
  for (const size of ['S', 'L'] as TankSize[]) for (const mode of ['closed', 'slow'] as TankMode[]) {
    const cap = TANK_M3[size];
    let st = A.tankEmptyOn1Oct.value ? 0 : cap;
    let fullSince: string | null = st >= cap - 1e-9 ? oct1 : null;
    for (let i = i0; i < i1; i++) {
      const vin = (scsHourly([daily.precipMm[i]], A.cn.roof.value[0], A.iaRatio.value)[0] * roofArea) / 1000;
      st = bucketStep(st, cap, vin, mode === 'slow' ? [A.tankRelease.value] : [], 24).storage;
      if (st >= cap - 1e-9) { if (fullSince === null) fullSince = daily.dates[i]; } else fullSince = null;
    }
    out[size][mode] = { level: st, fullSince };
  }
  return out;
}

export interface StormPlan {
  gardens: { cand: string; size: GardenSize }[];
  tank?: { size: TankSize; release: 'closed' | 'slow' } | null;
  disconnect?: false | 'west' | 'east';
  paving?: boolean;
}

export interface FacilityTrace {
  kind: 'garden' | 'tank' | 'paving';
  id: string;
  local: number; // host cell (garden) or -1
  areaM2: number;
  capM3: number;
  storage: number[]; // end-of-hour storage
  inflow: number[];
  overflow: number[];
  infiltrated: number[];
  delayed: number[]; // underdrain / slow release (goes to the drain later = in that hour)
  bypass: number[];
  fullAt: number | null; // hours from start (fractional) when first full
  underdrain: boolean;
  kSoil: number;
  startM3?: number;
}

export interface StormResult {
  hours: number; // simulated hours (rain window + drain-down)
  rainHours: number;
  rain: number[]; // mm per hour
  outletNow: number[]; // m³ per hour reaching the drain immediately (surface, overflow, bypass, piped roof)
  outletLater: number[]; // m³ per hour reaching the drain through pipes later (underdrain, tank release)
  outletTotal: number[];
  peakHour: number; // index of max outletTotal
  peakM3: number; // max hourly volume into the drain (m³/h)
  peakRainHour: number;
  drainTotal: number; // all water that reaches the drain (now + later), m³
  delayedTotal: number;
  soakedGround: number; // rain soaked into the site's soil (pervious cells, lawn incl. roof water)
  soakedFacilities: number; // infiltrated through garden / paving bottoms
  heldForWatering: number; // in a closed tank at the end
  stillStored: number; // left in facilities when the simulation stops
  rainTotal: number; // rain on the whole site (m³)
  balanceError: number;
  facilities: FacilityTrace[];
  flowThrough: Float32Array[]; // per hour, per local cell: m³ passing through (for animation)
  siteAreaM2: number;
  hsgUnknownAs: HSG;
}

const cnFor = (cover: number, hsg: HSG): number => {
  const name = COVER_NAMES[cover] as keyof typeof A.cn;
  const row = (A.cn as Record<string, { value: number[] }>)[name] ?? A.cn.turf;
  return row.value['ABCD'.indexOf(hsg)];
};
export const cellHsg = (code: number, unknownAs: HSG): HSG => HSG_FROM_CODE[code] ?? unknownAs;

export function runStorm(site: StormSite, rainIn: number[], plan: StormPlan, opts: { unknownAs?: HSG; drainHours?: number; tankStart?: TankStart } = {}): StormResult {
  const unknownAs = opts.unknownAs ?? A.unknownHsgCentral.value;
  const drainHours = opts.drainHours ?? 48;
  const rainHours = rainIn.length;
  const H = rainHours + drainHours;
  const rain = [...rainIn, ...new Array(drainHours).fill(0)];
  const n = site.cells.length;
  const cm2 = site.cellM2;
  const roofSet = new Set(site.roof);
  const lawnCells = plan.disconnect === 'west' ? site.lawnWest : plan.disconnect === 'east' ? site.lawnEast : [];
  const lawnSet = new Set(lawnCells);
  const pavingSet = new Set(plan.paving ? site.paving : []);
  const candById = new Map(site.candidates.map((c) => [c.id, c]));

  // gardens (host cells)
  const gardens = plan.gardens
    .map((g, k) => ({ ...g, k, local: candById.get(g.cand)?.local ?? -1 }))
    .filter((g) => g.local >= 0);
  const gardenAt = new Map<number, number>(); // local cell → garden index
  gardens.forEach((g, gi) => gardenAt.set(g.local, gi));

  // destination of water leaving each cell (walk D8 downstream until a garden host or the outlet)
  const dest = new Int32Array(n).fill(-2);
  const destOf = (i: number): number => {
    const path: number[] = [];
    let j = site.cells[i].down;
    while (j >= 0 && !gardenAt.has(j) && dest[j] === -2) { path.push(j); j = site.cells[j].down; }
    let d: number;
    if (j < 0) d = -1;
    else if (gardenAt.has(j)) d = gardenAt.get(j)!;
    else d = dest[j];
    for (const p of path) dest[p] = d;
    return d;
  };
  const destFrom = new Int32Array(n); // where a cell's own runoff goes
  for (let i = 0; i < n; i++) destFrom[i] = destOf(i);

  // ---- hourly runoff depth per (cover, hsg) class
  const cache = new Map<string, number[]>();
  const depthSeries = (cover: number, hsg: HSG) => {
    const key = `${cover}${hsg}`;
    if (!cache.has(key)) cache.set(key, scsHourly(rain, cnFor(cover, hsg), A.iaRatio.value));
    return cache.get(key)!;
  };

  // ---- roof (and tank)
  const roofArea = site.roof.length * cm2;
  const roofDepth = scsHourly(rain, A.cn.roof.value[0], A.iaRatio.value);
  const roofVol = roofDepth.map((d) => (d * roofArea) / 1000);
  const roofSoak = rain.reduce((s, r) => s + (r * roofArea) / 1000, 0) - roofVol.reduce((s, v) => s + v, 0); // initial abstraction on the roof (evaporates)
  let toLawn = new Array(H).fill(0); // m³ per hour spread on the lawn
  const roofToPipe = new Array(H).fill(0);
  const facilities: FacilityTrace[] = [];
  let heldForWatering = 0;
  const outletNow = new Array(H).fill(0);
  const outletLater = new Array(H).fill(0);
  if (plan.tank) {
    const cap = TANK_M3[plan.tank.size];
    const rates = plan.tank.release === 'slow' ? [A.tankRelease.value] : [];
    const s0 = opts.tankStart ? opts.tankStart[plan.tank.size][plan.tank.release] : 0;
    const tr: FacilityTrace = { kind: 'tank', id: 'tank', local: -1, areaM2: 0, capM3: cap, storage: [], inflow: [], overflow: [], infiltrated: [], delayed: [], bypass: [], fullAt: s0 >= cap - 1e-9 ? 0 : null, underdrain: false, kSoil: 0, startM3: s0 } as FacilityTrace;
    let s = s0;
    for (let h = 0; h < H; h++) {
      const st = bucketStep(s, cap, roofVol[h], rates);
      s = st.storage;
      if (tr.fullAt === null && st.fullAt !== null) tr.fullAt = h + st.fullAt;
      tr.storage.push(s); tr.inflow.push(roofVol[h]); tr.overflow.push(st.overflow); tr.infiltrated.push(0); tr.bypass.push(0);
      tr.delayed.push(st.out[0] ?? 0);
      outletLater[h] += st.out[0] ?? 0;
      if (plan.disconnect) toLawn[h] += st.overflow; else roofToPipe[h] += st.overflow;
    }
    heldForWatering = plan.tank.release === 'closed' ? s : 0; // includes water that was already there (balanced by tankStart0)
    facilities.push(tr);
  } else {
    for (let h = 0; h < H; h++) { if (plan.disconnect) toLawn[h] += roofVol[h]; else roofToPipe[h] += roofVol[h]; }
  }
  if (plan.disconnect && lawnCells.length === 0) { for (let h = 0; h < H; h++) roofToPipe[h] += toLawn[h]; toLawn = new Array(H).fill(0); }
  for (let h = 0; h < H; h++) outletNow[h] += roofToPipe[h];

  // ---- per-cell runoff volumes (m³/h) and soaked volume
  const cellVol: Float64Array[] = []; // [h][i]
  for (let h = 0; h < H; h++) cellVol.push(new Float64Array(n));
  let soakedGround = 0;
  const lawnArea = lawnCells.length * cm2;
  const lawnRunon = toLawn.map((v) => (lawnArea > 0 ? (v / lawnArea) * 1000 : 0)); // mm/h
  for (let i = 0; i < n; i++) {
    const c = site.cells[i];
    if (roofSet.has(i) || gardenAt.has(i) || pavingSet.has(i)) continue;
    const hsg = cellHsg(c.hsg, unknownAs);
    let depth: number[];
    let inMm: number[];
    if (lawnSet.has(i)) {
      inMm = rain.map((r, h) => r + lawnRunon[h]);
      depth = scsHourly(inMm, cnFor(c.cover, hsg), A.iaRatio.value);
    } else {
      inMm = rain;
      depth = depthSeries(c.cover, hsg);
    }
    let pIn = 0, q = 0;
    for (let h = 0; h < H; h++) { cellVol[h][i] = (depth[h] * cm2) / 1000; pIn += inMm[h]; q += depth[h]; }
    soakedGround += ((pIn - q) * cm2) / 1000;
  }

  // ---- permeable paving (treated as one bucket for its own rain)
  if (plan.paving && site.paving.length) {
    const area = site.paving.length * cm2;
    const cap = area * A.ppThicknessM.value * A.ppPorosity.value;
    const hsgs = site.paving.map((i) => cellHsg(site.cells[i].hsg, unknownAs));
    const k = Math.min(...hsgs.map((g) => A.ksatByHsg.value[g]));
    const ud = k < A.underdrainThreshold.value;
    const rates = [(k * area) / 1000, ud ? (A.underdrainRate.value * area) / 1000 : 0];
    const tr: FacilityTrace = { kind: 'paving', id: 'paving', local: site.paving[0], areaM2: area, capM3: cap, storage: [], inflow: [], overflow: [], infiltrated: [], delayed: [], bypass: [], fullAt: null, underdrain: ud, kSoil: k };
    let s = 0;
    for (let h = 0; h < H; h++) {
      const vin = (rain[h] * area) / 1000;
      const st = bucketStep(s, cap, vin, rates);
      s = st.storage;
      if (tr.fullAt === null && st.fullAt !== null) tr.fullAt = h + st.fullAt;
      tr.storage.push(s); tr.inflow.push(vin); tr.overflow.push(st.overflow); tr.infiltrated.push(st.out[0]); tr.delayed.push(st.out[1]); tr.bypass.push(0);
      outletLater[h] += st.out[1];
      // overflow leaves as surface runoff from the paving cells (spread evenly)
      for (const i of site.paving) cellVol[h][i] += st.overflow / site.paving.length;
    }
    facilities.push(tr);
  }

  // ---- gardens, processed upstream → downstream each hour
  const gOrder = gardens.map((_, gi) => gi);
  // topological order: a garden whose outflow destination is another garden goes first
  const gDest = gardens.map((g) => destFrom[g.local]);
  gOrder.sort((a, b) => depthToOutlet(a) - depthToOutlet(b));
  function depthToOutlet(gi: number): number { let d = 0, x = gi; while (x >= 0 && d < 20) { x = gDest[x]; d++; } return -d; }
  const gTraces: FacilityTrace[] = gardens.map((g) => {
    const area = GARDEN_M2[g.size];
    const cell = site.cells[g.local];
    const hsg = cellHsg(cell.hsg, unknownAs);
    const k = A.ksatByHsg.value[hsg];
    const ud = k < A.underdrainThreshold.value;
    return { kind: 'garden', id: g.cand, local: g.local, areaM2: area, capM3: area * (A.rgPondingM.value + A.rgMediaM.value * A.rgPorosity.value),
      storage: [], inflow: [], overflow: [], infiltrated: [], delayed: [], bypass: [], fullAt: null, underdrain: ud, kSoil: k } as FacilityTrace;
  });
  const gStore = gardens.map(() => 0);
  const flowThrough: Float32Array[] = [];
  for (let h = 0; h < H; h++) {
    const vol = cellVol[h];
    // rain on the host cell (a larger garden's extra footprint is lawn already counted next door);
    // a garden sitting on the lawn that takes the roof water also catches that cell's share of it
    const gIn = gardens.map((g) => ((rain[h] + (lawnSet.has(g.local) ? lawnRunon[h] : 0)) * cm2) / 1000);
    const ft = new Float32Array(n);
    // route cell runoff
    for (let i = 0; i < n; i++) {
      const v = vol[i];
      if (v <= 0) continue;
      // animation: accumulate along the path until destination
      let j = i;
      while (j >= 0) { ft[j] += v; if (j !== i && gardenAt.has(j)) break; j = site.cells[j].down; }
      const d = destFrom[i];
      if (d >= 0) gIn[d] += v; else outletNow[h] += v;
    }
    for (const gi of gOrder) {
      const tr = gTraces[gi];
      const inflow = gIn[gi];
      const eff = A.rgInletEff.value;
      const bypass = inflow * (1 - eff);
      const rates = [(tr.kSoil * tr.areaM2) / 1000, tr.underdrain ? (A.underdrainRate.value * tr.areaM2) / 1000 : 0];
      const st = bucketStep(gStore[gi], tr.capM3, inflow * eff, rates);
      gStore[gi] = st.storage;
      if (tr.fullAt === null && st.fullAt !== null) tr.fullAt = h + st.fullAt;
      tr.storage.push(st.storage); tr.inflow.push(inflow); tr.overflow.push(st.overflow); tr.infiltrated.push(st.out[0]); tr.delayed.push(st.out[1]); tr.bypass.push(bypass);
      outletLater[h] += st.out[1];
      const pass = st.overflow + bypass;
      const d = gDest[gi];
      if (pass > 0) {
        let j = site.cells[gardens[gi].local].down;
        while (j >= 0) { ft[j] += pass; if (gardenAt.has(j)) break; j = site.cells[j].down; }
      }
      if (d >= 0) gIn[d] += pass; else outletNow[h] += pass;
    }
    flowThrough.push(ft);
  }
  facilities.push(...gTraces);

  // ---- totals and balance
  const outletTotal = outletNow.map((v, h) => v + outletLater[h]);
  let peakHour = 0;
  for (let h = 1; h < H; h++) if (outletTotal[h] > outletTotal[peakHour] + 1e-12) peakHour = h;
  let peakRainHour = 0;
  for (let h = 1; h < rainHours; h++) if (rain[h] > rain[peakRainHour]) peakRainHour = h;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const soakedFacilities = facilities.reduce((s, f) => s + sum(f.infiltrated), 0);
  const stillStored = gStore.reduce((s, v) => s + v, 0) + facilities.filter((f) => f.kind === 'paving').reduce((s, f) => s + (f.storage[H - 1] ?? 0), 0) +
    (plan.tank && plan.tank.release === 'slow' ? facilities.find((f) => f.kind === 'tank')!.storage[H - 1] : 0);
  const siteAreaM2 = n * cm2;
  const rainTotal = (sum(rain) * siteAreaM2) / 1000;
  const drainTotal = sum(outletTotal);
  const delayedTotal = sum(outletLater);
  const tankStart0 = facilities.find((f) => f.kind === 'tank')?.startM3 ?? 0;
  // water already in the tank before the storm counts on the input side; “held for watering” only counts this storm’s water
  const balanceError = rainTotal + tankStart0 - (drainTotal + soakedGround + soakedFacilities + heldForWatering + stillStored + roofSoak);
  return { hours: H, rainHours, rain, outletNow, outletLater, outletTotal, peakHour, peakM3: outletTotal[peakHour], peakRainHour, drainTotal, delayedTotal,
    soakedGround: soakedGround + roofSoak, soakedFacilities, heldForWatering, stillStored, rainTotal, balanceError, facilities, flowThrough, siteAreaM2, hsgUnknownAs: unknownAs };
}
