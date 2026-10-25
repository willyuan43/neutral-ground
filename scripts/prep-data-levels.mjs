// prep-data-levels.mjs — level geometry for the prototype (imported by prep-data.mjs; shares its state).
// Level 1–2 site: the Rec Center area. Level 3: east-slope grassland zones (MA-1b, MA-1e), creek corridor (MA-2a), one unofficial trail.
import fs from 'node:fs';
import path from 'node:path';

const P = globalThis.__prep;
const { ROWS, COLS, N, cover, inPark, zone, zones, idx, downstream, slopePct, accPark, fromUTM, cx, cy, OUT, log } = P;
const rcOf = (i) => [Math.floor(i / COLS), i % COLS];
const lonlat = (i) => { const [r, c] = rcOf(i); const [lon, lat] = fromUTM.forward([cx(c), cy(r)]); return [+lon.toFixed(6), +lat.toFixed(6)]; };

// ---------------------------------------------------------------- level 1–2 site
// Recreation zone = park cells with no 2006 natural-area zone, in the south end of Glen Canyon (rows ≥ 195, cols ≥ 140).
const zoneMask = new Uint8Array(N);
const BOX = (process.env.SITE_BOX || '195,280,140,211').split(',').map(Number); // r0,r1,c0,c1
for (let r = BOX[0]; r < Math.min(ROWS, BOX[1]); r++) for (let c = BOX[2]; c < Math.min(COLS, BOX[3]); c++) { const i = idx(r, c); if (inPark[i] && zone[i] === 0) zoneMask[i] = 1; }
// exit point of each zone cell (first step that leaves the zone)
const exitOf = new Int32Array(N).fill(-2);
const findExit = (i) => {
  const path = [];
  let j = i;
  while (exitOf[j] === -2) { path.push(j); const d = downstream(j); if (d < 0 || !zoneMask[d]) { exitOf[j] = j; break; } j = d; }
  const e = exitOf[j];
  for (const p of path) exitOf[p] = e;
  return e;
};
const exitCount = new Map();
for (let i = 0; i < N; i++) if (zoneMask[i]) { const e = findExit(i); exitCount.set(e, (exitCount.get(e) || 0) + 1); }
const [outletIdx, outletCells] = [...exitCount.entries()].sort((a, b) => b[1] - a[1])[0];
const siteGlobal = [];
for (let i = 0; i < N; i++) if (zoneMask[i] && exitOf[i] === outletIdx) siteGlobal.push(i);
const localOf = new Map(siteGlobal.map((g, k) => [g, k]));
log('L1/L2 outlet', rcOf(outletIdx), lonlat(outletIdx), 'site cells', siteGlobal.length, '(', siteGlobal.length * 25, 'm² )');

const zoneCells = siteGlobal.map((g) => {
  const [r, c] = rcOf(g);
  const d = downstream(g);
  return { g, r, c, cover: cover[g], hsg: P.hsg[g], down: g === outletIdx ? -1 : (localOf.has(d) ? localOf.get(d) : -1), slope: +slopePct[g].toFixed(1), parkAcc: accPark[g] };
});
// The puzzle block: the largest sub-catchment of the Rec Center area that holds no roof cells and at most MAXBLOCK cells
// (the courts, playground, paths, lawn and slope east of the building). Its last cell is the drain point.
const MAXBLOCK = Number(process.env.MAXBLOCK || 200);
const upZ = zoneCells.map(() => []);
zoneCells.forEach((c, k) => { if (c.down >= 0) upZ[c.down].push(k); });
const catchZ = (k) => { const out = []; const st = [k]; while (st.length) { const x = st.pop(); out.push(x); for (const y of upZ[x]) st.push(y); } return out; };
let bestK = -1, bestN = 0;
zoneCells.forEach((z, k) => { const cat = catchZ(k); if (cat.length <= MAXBLOCK && cat.length > bestN && !cat.some((x) => zoneCells[x].cover === 1)) { bestN = cat.length; bestK = k; } });
const blockZ = catchZ(bestK).sort((a, b) => a - b);
const roofZ = zoneCells.map((z, k) => (z.cover === 1 ? k : -1)).filter((k) => k >= 0);
// lawn next to the roof (where a disconnected downspout would spill): lawn/grass zone cells within 2 cells of the roof
const nearZ = (a, b, d) => Math.abs(a.r - b.r) <= d && Math.abs(a.c - b.c) <= d;
const LAWN_D = Number(process.env.LAWN_D || 3);
const lawnZ = zoneCells.map((z, k) => ((z.cover === 3 || z.cover === 4) && roofZ.some((q) => nearZ(z, zoneCells[q], LAWN_D)) ? k : -1)).filter((k) => k >= 0);
// D8 paths from that lawn to the outlet (so a garden can sit downhill of it)
const pathZ = new Set();
for (const k of lawnZ) { let j = zoneCells[k].down; while (j >= 0) { pathZ.add(j); j = zoneCells[j].down; } }
const keepSet = new Set([...blockZ, ...roofZ, ...lawnZ, ...pathZ]);
const keepZ = [...keepSet].sort((a, b) => a - b);
const newLocal = new Map(keepZ.map((k, n) => [k, n]));
// downstream pointer inside the puzzle area: walk D8 through cells outside it (their own rain is not counted) until a kept cell or the outlet
const nextKept = (k) => { let j = zoneCells[k].down; while (j >= 0 && !keepSet.has(j)) j = zoneCells[j].down; return j; };
const siteCells = keepZ.map((k) => {
  const z = zoneCells[k];
  const j = z.cover === 1 ? -1 : nextKept(k); // roof: piped straight to the drain
  return { ...z, down: j >= 0 ? newLocal.get(j) : -1 };
});
const outletIdx2 = outletIdx;
log('puzzle area', keepZ.length, 'cells (courts block', blockZ.length, '+ roof', roofZ.length, '+ lawn by building', lawnZ.length, '+ flow path', pathZ.size, '); drain', rcOf(outletIdx2), lonlat(outletIdx2));
const roof = siteCells.map((s, k) => (s.cover === 1 ? k : -1)).filter((k) => k >= 0);
const near = (a, b, d) => Math.abs(a.r - b.r) <= d && Math.abs(a.c - b.c) <= d;
const lawn = lawnZ.map((k) => newLocal.get(k));
// paved patch: the largest 8-connected group of paved cells in the site, capped at the 16 cells nearest the roof
const pavedIdx = siteCells.map((s, k) => (s.cover === 2 ? k : -1)).filter((k) => k >= 0);
const pavedSet = new Set(pavedIdx);
const seenP = new Set();
const comps = [];
for (const k of pavedIdx) {
  if (seenP.has(k)) continue;
  const comp = []; const stack = [k]; seenP.add(k);
  while (stack.length) {
    const x = stack.pop(); comp.push(x);
    for (const y of pavedIdx) if (!seenP.has(y) && near(siteCells[x], siteCells[y], 1)) { seenP.add(y); stack.push(y); }
  }
  comps.push(comp);
}
comps.sort((a, b) => b.length - a.length);
const roofC = roof.reduce((a, k) => [a[0] + siteCells[k].r / roof.length, a[1] + siteCells[k].c / roof.length], [0, 0]);
const paving = (comps[0] || []).slice().sort((a, b) => Math.hypot(siteCells[a].r - roofC[0], siteCells[a].c - roofC[1]) - Math.hypot(siteCells[b].r - roofC[0], siteCells[b].c - roofC[1])).slice(0, 16);

// open (not culverted) stream cells from OSM: no gardens in the creek
const openStream = new Set();
for (const f of P.osmFeatures) { const t = f.properties.tags || {}; if (t.waterway === 'stream' && t.tunnel !== 'culvert' && f.geometry) P.rasterizeLines(P.linesOf(f.geometry), 5, (i) => openStream.add(i)); }
// candidate garden cells: pervious lawn/grass, no natural zone, slope ≤ 10 %, not the creek channel, not touching the roof
const upCount = new Float64Array(siteCells.length); // runoff-weighted upstream count (paved 1, pervious 0.15; roof piped → 0)
const orderL = siteCells.map((_, k) => k).sort((a, b) => P.filled[siteCells[b].g] - P.filled[siteCells[a].g]);
for (const k of orderL) {
  const s = siteCells[k];
  upCount[k] += s.cover === 2 ? 1 : s.cover === 1 ? 0 : 0.15;
  if (s.down >= 0) upCount[s.down] += upCount[k];
}
const okCand = siteCells.map((s, k) => ({ s, k })).filter(({ s }) =>
  (s.cover === 3 || s.cover === 4) && s.slope <= 10 && !openStream.has(s.g) && !roof.some((q) => near(s, siteCells[q], 1)));
okCand.sort((a, b) => upCount[b.k] - upCount[a.k]);
const chosen = [];
const farFrom = (s, d) => chosen.every((c) => !near(s, siteCells[c.k], d));
// two strongest (on the main flow lines), then spread the rest across the lawn
for (const c of okCand) { if (chosen.length >= 2) break; if (farFrom(c.s, 3)) chosen.push(c); }
const rest = okCand.filter((c) => !chosen.includes(c));
// pick 4 more, maximising spread, among cells with lower flow
for (let t = 0; t < 4; t++) {
  let best = null, bestD = -1;
  for (const c of rest) {
    if (chosen.includes(c)) continue;
    const dmin = Math.min(...chosen.map((x) => Math.hypot(x.s.r - c.s.r, x.s.c - c.s.c)));
    if (dmin > bestD) { bestD = dmin; best = c; }
  }
  if (best) chosen.push(best);
}
chosen.sort((a, b) => a.s.r - b.s.r || a.s.c - b.s.c);
const candidates = chosen.map((c, n) => ({ id: 'ABCDEFGH'[n], local: c.k, label: `Spot ${'ABCDEFGH'[n]}`, upWeight: +upCount[c.k].toFixed(1), slope: c.s.slope, r: c.s.r, c: c.s.c }));
log('candidates', candidates.map((c) => `${c.id}@(${c.r},${c.c}) up=${c.upWeight} slope=${c.slope}`).join(' | '));
log('roof cells', roof.length, 'lawn cells', lawn.length, 'paving cells', paving.length, 'paved comps', comps.slice(0, 3).map((c) => c.length));
const coverCount = {}; siteCells.forEach((s) => (coverCount[s.cover] = (coverCount[s.cover] || 0) + 1));
const hsgCount = {}; siteCells.forEach((s) => (hsgCount[s.hsg] = (hsgCount[s.hsg] || 0) + 1));

// split the lawn by where its water runs: past spot C (west side) or not (east side)
const candC = candidates.find((c) => c.id === 'C');
const passesC = (k) => { let j = k; while (j >= 0) { if (candC && j === candC.local) return true; j = siteCells[j].down; } return false; };
const lawnWest = lawn.filter((k) => passesC(k)), lawnEast = lawn.filter((k) => !passesC(k));
const meanCol = (a) => a.reduce((s, k) => s + siteCells[k].c, 0) / Math.max(1, a.length);
log('lawn split: west', lawnWest.length, 'cells (mean col', meanCol(lawnWest).toFixed(1), ') east', lawnEast.length, '(mean col', meanCol(lawnEast).toFixed(1), ')');
const stormSite = {
  cellM2: 25,
  cells: siteCells.map(({ g, r, c, cover: cv, hsg, down, slope, parkAcc }) => ({ g, r, c, cover: cv, hsg, down, slope, parkAcc })),
  outlet: { r: rcOf(outletIdx2)[0], c: rcOf(outletIdx2)[1], lon: lonlat(outletIdx2)[0], lat: lonlat(outletIdx2)[1] },
  zoneOutlet: { r: rcOf(outletIdx)[0], c: rcOf(outletIdx)[1], lon: lonlat(outletIdx)[0], lat: lonlat(outletIdx)[1], zoneCells: siteGlobal.length },
  roof, lawn, lawnWest, lawnEast, paving, candidates,
  stats: { cells: siteCells.length, areaM2: siteCells.length * 25, coverCount, hsgCount, outletZoneCells: outletCells,
    blockCells: blockZ.length, roofCells: roofZ.length, lawnCells: lawnZ.length, pathCells: pathZ.size,
    rule: 'Puzzle area = (1) the largest D8 sub-catchment of the Rec Center recreation zone with no roof cells and ≤ 200 cells (courts, playground, paths, lawn strip), (2) the Rec Center roof (assumed piped to the drain), (3) lawn within 3 cells of the roof, (4) the D8 paths from that lawn to the outlet. Cells outside it are pass-through: water crossing them continues downhill, their own rain is not counted. Recreation zone = park cells with no 2006 natural-area zone, rows ≥ 195, cols ≥ 140. Drain = where the zone\'s surface water leaves it by D8.' },
};
fs.writeFileSync(path.join(OUT, 'site-storm.json'), JSON.stringify(stormSite));
globalThis.__prepLevels = { stormSite };

// ---------------------------------------------------------------- level 3: east slope (MA-1b, MA-1e), creek corridor (MA-2a), one unofficial trail
{
  const codeIdx = (c) => zones.find((z) => z.code === c)?.index;
  const classCells = (codes) => {
    const ids = codes.map(codeIdx);
    const out = [];
    for (let i = 0; i < N; i++) if (ids.includes(zone[i])) { const [r, c] = rcOf(i); out.push({ g: i, r, c, cover: cover[i], ls: +P.LS[i].toFixed(3), zone: zones[zone[i]].code }); }
    return out;
  };
  const summarize = (cells) => {
    const by = {}; for (const x of cells) { by[x.cover] ||= { n: 0, ls: 0 }; by[x.cover].n++; by[x.cover].ls += x.ls; }
    const m = (cv) => (by[cv] ? { cells: by[cv].n, areaM2: by[cv].n * 25, ls: +(by[cv].ls / by[cv].n).toFixed(3) } : { cells: 0, areaM2: 0, ls: 0 });
    return { areaM2: cells.length * 25, grass: m(4), tree: m(6), rock: m(9), water: m(8), paved: m(2) };
  };
  const grassCells = classCells(['MA-1b', 'MA-1e']);
  const ripCells = classCells(['MA-2a']);
  // the unofficial shortcut: unnamed OSM dirt footway that runs straight down MA-1b (way 1545296412)
  const TRAIL_ID = 1545296412;
  const t = P.trailLines.find((x) => x.id === TRAIL_ID);
  let trail = null;
  if (t) {
    let len = 0; for (const l of t.lines) for (let k = 0; k + 1 < l.length; k++) len += Math.hypot(l[k + 1][0] - l[k][0], l[k + 1][1] - l[k][1]);
    const cells = new Set(); P.rasterizeLines(t.lines, 1.5, (i) => cells.add(i));
    const arr = [...cells];
    const ls = arr.reduce((s, i) => s + P.LS[i], 0) / arr.length;
    const path = t.lines[0].map(([x, y]) => [(P.Y0 - y) / P.CELL - 0.5, (x - P.X0) / P.CELL - 0.5]); // fractional (r, c)
    trail = { osmId: TRAIL_ID, osmTags: { highway: t.highway, surface: t.surface, name: t.name }, lengthM: +len.toFixed(1), widthM: 1.5, areaM2: +(len * 1.5).toFixed(1), ls: +ls.toFixed(3),
      cells: arr, path, zone: 'MA-1b', label: 'Unnamed dirt path straight down the east slope (OpenStreetMap way 1545296412). Treated as an unofficial shortcut for this game — approximate, not verified.' };
  }
  const all = [...grassCells, ...ripCells];
  const focus = { r: Math.round(grassCells.reduce((s, x) => s + x.r, 0) / grassCells.length), c: Math.round(grassCells.reduce((s, x) => s + x.c, 0) / grassCells.length) };
  const centroid = (cells, code) => { const cs = cells.filter((x) => x.zone === code); return { r: cs.reduce((s, x) => s + x.r, 0) / cs.length, c: cs.reduce((s, x) => s + x.c, 0) / cs.length }; };
  const labels = [
    { text: 'East slope · MA-1b', ...centroid(grassCells, 'MA-1b') },
    { text: 'East slope · MA-1e', ...centroid(grassCells, 'MA-1e') },
    { text: 'Creek corridor · MA-2a', ...centroid(ripCells, 'MA-2a') },
  ];
  // satellite greenness (G9, display only)
  let ndvi = null;
  try {
    const csv = fs.readFileSync(path.join(P.IN, 'satellite', 'ndvi_s2_monthly.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const head = csv[0].split(',');
    const col = (r, n) => r[head.indexOf(n)];
    const units = { 'MA-1b': 'East-slope grassland patch MA-1b', 'MA-1e': 'East-slope grassland patches MA-1e', 'WC2021-TREE': 'Tree-cover pixels (WorldCover 2021)', 'OSM-375333793': 'Grass ball field by the Rec Center' };
    const series = {};
    for (const line of csv.slice(1)) {
      const r = line.split(',');
      const u = col(r, 'unit_id'), m = col(r, 'month');
      if (!units[u] || m < '2020-10' || m > '2023-09') continue;
      (series[u] ||= []).push({ month: m, median: col(r, 'median') === 'null' ? null : Number(col(r, 'median')), obsDays: col(r, 'observation_days') === 'null' ? null : Number(col(r, 'observation_days')), flags: col(r, 'flags') || '' });
    }
    ndvi = { units, series, source: 'G9: Sentinel-2 monthly NDVI (data/sf-glen-canyon/inputs-v3/satellite/ndvi_s2_monthly.csv). Observed by satellite; display only — never used in the model. No interpolation; null months stay empty.',
      note: 'This chart shows satellite greenness. Interpreting it requires the season, vegetation type, local knowledge, and restoration goal.' };
  } catch (e) { log('no satellite data (skipped)', e.message); }
  const slope = {
    classes: {
      grassland: { label: 'East-slope native grassland', zones: ['MA-1b', 'MA-1e'], referenceEcosystem: 'native_grassland', ...summarize(grassCells), cells: grassCells },
      riparian: { label: 'Creek corridor (willow riparian)', zones: ['MA-2a'], referenceEcosystem: 'willow_riparian', ...summarize(ripCells), cells: ripCells },
    },
    trail, focus, labels, ndvi,
    hsgNote: 'All level-3 cells are soil group D in the soil survey (Barnabe–Candlestick complex), except 12 cells with no known group (run as D here).',
  };
  fs.writeFileSync(path.join(OUT, 'site-slope.json'), JSON.stringify(slope));
  log('L3 slope: grassland', slope.classes.grassland.areaM2, 'm² (grass', slope.classes.grassland.grass.areaM2, ', tree', slope.classes.grassland.tree.areaM2, ') riparian', slope.classes.riparian.areaM2, 'm²; trail', trail?.lengthM, 'm ×', trail?.widthM, 'm; ndvi units', ndvi ? Object.keys(ndvi.series).join(',') : 'none');
}
