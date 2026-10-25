// prep-data.mjs — convert the project's real inputs (read-only) into small files for the prototype.
// Run from prototype/:  node scripts/prep-data.mjs
// Reads  ../data/sf-glen-canyon/... and ../content/cover-generic-values.json (never writes there).
// Writes public/data/*  (grid layers, level geometry, weather, storms, satellite subset, NAIP JPEG, manifest.json)
//
// Everything here is deterministic. Derived values are labelled with how they were derived.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
import { fromArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..'); // project root (neutral-ground/)
const IN = path.join(ROOT, 'data', 'sf-glen-canyon', 'inputs-v3');
const RV3 = path.join(ROOT, 'data', 'sf-glen-canyon', 'research-v3');
const OUT = path.resolve(__dirname, '..', 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[prep]', ...a);
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const sha = async (buf) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(buf).digest('hex');
};

// ---------------------------------------------------------------- grid
const gridMeta = readJSON(path.join(IN, 'aligned_5m', 'elevation_m.json'));
const ROWS = gridMeta.rows, COLS = gridMeta.cols, CELL = gridMeta.cellSizeM;
const X0 = gridMeta.originX, Y0 = gridMeta.originY; // upper-left corner, north-to-south rows
const N = ROWS * COLS;
const readF32 = (name) => {
  const b = fs.readFileSync(path.join(IN, 'aligned_5m', name));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const elev = readF32('elevation_m.f32');
const inParkF = readF32('in_park.f32');
const mukeyF = readF32('soil_mukey.f32');
const inPark = new Uint8Array(N);
for (let i = 0; i < N; i++) inPark[i] = inParkF[i] === 1 ? 1 : 0;
let nanElev = 0;
for (let i = 0; i < N; i++) if (Number.isNaN(elev[i])) nanElev++;
log('grid', ROWS, 'x', COLS, 'cell', CELL, 'm; NaN elevation cells', nanElev);

const cx = (c) => X0 + (c + 0.5) * CELL; // cell-centre easting
const cy = (r) => Y0 - (r + 0.5) * CELL; // cell-centre northing
const idx = (r, c) => r * COLS + c;

proj4.defs('EPSG:32610', '+proj=utm +zone=10 +datum=WGS84 +units=m +no_defs');
const toUTM = proj4('EPSG:4326', 'EPSG:32610');
const fromUTM = proj4('EPSG:32610', 'EPSG:4326');
const ll2xy = ([lon, lat]) => toUTM.forward([lon, lat]);

// ---------------------------------------------------------------- vector helpers
function ringsOf(geom) {
  // returns list of polygons; each polygon = list of rings in UTM
  const conv = (ring) => ring.map((p) => (Math.abs(p[0]) <= 180 ? ll2xy(p) : p));
  if (geom.type === 'Polygon') return [geom.coordinates.map(conv)];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((poly) => poly.map(conv));
  return [];
}
function linesOf(geom) {
  const conv = (line) => line.map((p) => (Math.abs(p[0]) <= 180 ? ll2xy(p) : p));
  if (geom.type === 'LineString') return [conv(geom.coordinates)];
  if (geom.type === 'MultiLineString') return geom.coordinates.map(conv);
  return [];
}
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function rasterizePolygons(polys, cb) {
  for (const poly of polys) {
    const outer = poly[0];
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of outer) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    const c0 = Math.max(0, Math.floor((minx - X0) / CELL)), c1 = Math.min(COLS - 1, Math.floor((maxx - X0) / CELL));
    const r0 = Math.max(0, Math.floor((Y0 - maxy) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((Y0 - miny) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = cx(c), y = cy(r);
      if (!pointInRing(x, y, outer)) continue;
      let hole = false;
      for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h])) { hole = true; break; }
      if (!hole) cb(idx(r, c));
    }
  }
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}
function rasterizeLines(lines, halfWidth, cb) {
  let length = 0;
  for (const line of lines) for (let k = 0; k + 1 < line.length; k++) {
    const [ax, ay] = line[k], [bx, by] = line[k + 1];
    length += Math.hypot(bx - ax, by - ay);
    const minx = Math.min(ax, bx) - halfWidth - CELL, maxx = Math.max(ax, bx) + halfWidth + CELL;
    const miny = Math.min(ay, by) - halfWidth - CELL, maxy = Math.max(ay, by) + halfWidth + CELL;
    const c0 = Math.max(0, Math.floor((minx - X0) / CELL)), c1 = Math.min(COLS - 1, Math.floor((maxx - X0) / CELL));
    const r0 = Math.max(0, Math.floor((Y0 - maxy) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((Y0 - miny) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (segDist(cx(c), cy(r), ax, ay, bx, by) <= halfWidth) cb(idx(r, c));
    }
  }
  return length;
}

// ---------------------------------------------------------------- cover classes
// Cover codes used by the prototype model (cell-centre rasterisation; 5 m cells).
export const COVER = {
  0: 'none', 1: 'roof', 2: 'paved', 3: 'turf', 4: 'grass', 5: 'scrub', 6: 'tree', 7: 'bare', 8: 'water', 9: 'rock',
};
const cover = new Uint8Array(N);
const coverSrc = new Uint8Array(N); // 1 WorldCover, 2 OSM, 3 DataSF building

// WorldCover 2021 (EPSG:4326, 1/12000 deg). Nearest pixel at each cell centre.
const wcBuf = fs.readFileSync(path.join(IN, 'worldcover_2021_aoi.tif'));
const wcTiff = await fromArrayBuffer(wcBuf.buffer.slice(wcBuf.byteOffset, wcBuf.byteOffset + wcBuf.byteLength));
const wcImg = await wcTiff.getImage();
const [wcData] = await wcImg.readRasters();
const wcW = wcImg.getWidth(), wcH = wcImg.getHeight();
const [wcX0, wcRes0, , wcY0, , wcRes1] = (() => {
  const o = wcImg.getOrigin(), r = wcImg.getResolution();
  return [o[0], r[0], 0, o[1], 0, r[1]];
})();
const worldcover = new Uint8Array(N);
const WC_MAP = { 10: 6, 20: 5, 30: 4, 40: 4, 50: 2, 60: 7, 80: 8, 90: 8, 95: 6, 100: 4 };
let wcMissing = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const [lon, lat] = fromUTM.forward([cx(c), cy(r)]);
  const px = Math.floor((lon - wcX0) / wcRes0), py = Math.floor((lat - wcY0) / wcRes1);
  const i = idx(r, c);
  if (px < 0 || py < 0 || px >= wcW || py >= wcH) { wcMissing++; continue; }
  const v = wcData[py * wcW + px];
  worldcover[i] = v;
  if (v && WC_MAP[v] !== undefined) { cover[i] = WC_MAP[v]; coverSrc[i] = 1; }
}
log('WorldCover sampled; cells outside raster', wcMissing);

// OSM features (ODbL) and DataSF building footprints (PDDL)
const osm = readJSON(path.join(IN, 'osm_features.geojson'));
const bld = readJSON(path.join(IN, 'buildings.geojson'));
const isPavedSurface = (s) => ['asphalt', 'concrete', 'paved', 'paving_stones', 'concrete:plates', 'rubber', 'tartan'].includes(s);
let trailLines = [];
const osmCounts = {};
const mark = (code, src) => (i) => { cover[i] = code; coverSrc[i] = src; };
// pass 1: natural polygons (override WorldCover where hand-mapped)
for (const f of osm.features) {
  const t = f.properties.tags || {};
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
  if (t.natural === 'bare_rock') rasterizePolygons(ringsOf(g), mark(9, 2));
  else if (t.natural === 'wetland') rasterizePolygons(ringsOf(g), mark(8, 2));
}
// pass 2: lawns and pitches
for (const f of osm.features) {
  const t = f.properties.tags || {};
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
  const grassy = t.landuse === 'grass' || (t.leisure === 'pitch' && (t.surface === 'grass' || /baseball|soccer|american_football/.test(t.sport || '') && !isPavedSurface(t.surface)));
  if (grassy) { rasterizePolygons(ringsOf(g), mark(3, 2)); osmCounts.turf = (osmCounts.turf || 0) + 1; }
}
// pass 3: paved polygons
for (const f of osm.features) {
  const t = f.properties.tags || {};
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
  const paved = t.amenity === 'parking' || (t.leisure === 'pitch' && /tennis|basketball/.test(t.sport || '')) ||
    (t.leisure === 'playground' && (isPavedSurface(t.surface) || !t.surface)) || (t.landuse === 'recreation_ground' && /tennis|basketball/.test(t.sport || ''));
  if (paved) { rasterizePolygons(ringsOf(g), mark(2, 2)); osmCounts.paved = (osmCounts.paved || 0) + 1; }
}
// pass 4: paved lines (service roads ~5 m wide; paved footways ~2 m)
for (const f of osm.features) {
  const t = f.properties.tags || {};
  const g = f.geometry;
  if (!g || (g.type !== 'LineString' && g.type !== 'MultiLineString')) continue;
  if (t.highway === 'service' && t.surface !== 'compacted' && t.surface !== 'dirt' && t.surface !== 'gravel') rasterizeLines(linesOf(g), 2.5, mark(2, 2));
  else if ((t.highway === 'footway' || t.highway === 'steps' || t.highway === 'path') && isPavedSurface(t.surface) && t.footway !== 'sidewalk') rasterizeLines(linesOf(g), 1.0, mark(2, 2));
  if ((t.highway === 'footway' || t.highway === 'path' || t.highway === 'steps' || t.highway === 'service') && !isPavedSurface(t.surface)) {
    trailLines.push({ id: f.properties.osm_id, name: t.name || null, surface: t.surface || null, highway: t.highway, lines: linesOf(g) });
  }
}
// pass 5: buildings (DataSF footprints + OSM buildings)
// DataSF footprints with a median height under 2 m are not buildings (e.g. the tennis courts footprint is 0.21 m high)
let lowSkipped = 0;
for (const f of bld.features) {
  if (!f.geometry) continue;
  const h = Number(f.properties.hgt_mediancm);
  if (Number.isFinite(h) && h < 200) { lowSkipped++; continue; }
  rasterizePolygons(ringsOf(f.geometry), mark(1, 3));
}
log('DataSF footprints skipped as < 2 m tall', lowSkipped);
for (const f of osm.features) {
  const t = f.properties.tags || {};
  if (t.building && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) rasterizePolygons(ringsOf(f.geometry), mark(1, 2));
}
log('OSM polygons used', osmCounts, '; unpaved trail lines', trailLines.length);

// ---------------------------------------------------------------- soils → hydrologic soil group per map unit
const soilComp = readJSON(path.join(IN, 'soil_components.json'));
const HSG_CODE = { A: 1, B: 2, C: 3, D: 4 };
const soilUnits = [];
const mukeyHsg = {};
for (const u of soilComp.soilUnits) {
  const byHsg = {};
  let unknownPct = 0, knownPct = 0;
  for (const comp of u.components) {
    if (comp.hsg) { byHsg[comp.hsg] = (byHsg[comp.hsg] || 0) + (comp.pct || 0); knownPct += comp.pct || 0; }
    else unknownPct += comp.pct || 0;
  }
  let dominant = null, best = -1;
  for (const [g, p] of Object.entries(byHsg)) if (p > best) { best = p; dominant = g; }
  const totalPct = u.components.reduce((s, c) => s + (c.pct || 0), 0);
  mukeyHsg[u.mukey] = dominant; // null = no component with a known group
  soilUnits.push({ mukey: u.mukey, name: u.name, knownByHsg: byHsg, knownPct, unknownPct, unreportedPct: Math.max(0, 100 - totalPct),
    dominantKnownHsg: dominant, rule: dominant ? 'dominant known hydrologic group (prototype simplification)' : 'no known group: model uses C, range B–D (teaching assumption)' });
}
const hsg = new Uint8Array(N); // 1..4 = A..D known-dominant; 9 = unknown (use C, range B–D)
for (let i = 0; i < N; i++) {
  const m = mukeyF[i];
  if (Number.isNaN(m)) { hsg[i] = 0; continue; }
  const g = mukeyHsg[String(Math.round(m))];
  hsg[i] = g ? HSG_CODE[g] : 9;
}
log('soil units', soilUnits.map((s) => `${s.mukey}:${s.dominantKnownHsg ?? 'unknown'}`).join(' '));

// ---------------------------------------------------------------- management areas (G7, WGS84, partial)
const mgmt = readJSON(path.join(IN, 'mgmt_areas.geojson'));
const zone = new Uint8Array(N);
const zones = [{ index: 0, code: null, label: 'No 2006 zone mapped here' }];
mgmt.features.forEach((f, k) => {
  const p = f.properties;
  const z = { index: k + 1, code: p.mgmtArea, mgmtClass: Number(p.mgmtClass), referenceEcosystem: p.referenceEcosystem,
    boundaryQuality: p.boundaryQuality, sourceAreaM2: Number(p.areaM2), description: p.locationDescriptionZh, cells: 0 };
  rasterizePolygons(ringsOf(f.geometry), (i) => { if (inPark[i]) { zone[i] = z.index; } });
  zones.push(z);
});
for (let i = 0; i < N; i++) if (zone[i]) zones[zone[i]].cells++;
log('zones', zones.slice(1).map((z) => `${z.code}:${z.cells}`).join(' '));

// ---------------------------------------------------------------- terrain: priority-flood fill, D8, accumulation, slope, LS
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } }
  pop() { const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) { k[0] = lk; v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r; if (m === i) break;
      [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } }
    return top; }
  get size() { return this.k.length; }
}
const DR = [-1, -1, 0, 1, 1, 1, 0, -1];
const DC = [0, 1, 1, 1, 0, -1, -1, -1];
const DD = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2].map((d) => d * CELL);
const filled = new Float64Array(N);
const seen = new Uint8Array(N);
const heap = new MinHeap();
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) { const i = idx(r, c); filled[i] = elev[i]; seen[i] = 1; heap.push(elev[i], i); }
}
const EPS = 1e-4;
let raised = 0;
while (heap.size) {
  const i = heap.pop(); const r = (i / COLS) | 0, c = i % COLS;
  for (let d = 0; d < 8; d++) {
    const rr = r + DR[d], cc = c + DC[d];
    if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
    const j = idx(rr, cc); if (seen[j]) continue; seen[j] = 1;
    const z = Math.max(elev[j], filled[i] + EPS);
    if (z > elev[j]) raised++;
    filled[j] = z; heap.push(z, j);
  }
}
const flowdir = new Uint8Array(N).fill(255); // 0..7 neighbour, 254 = leaves the grid edge
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const i = idx(r, c);
  let best = -1, bestSlope = 0;
  for (let d = 0; d < 8; d++) {
    const rr = r + DR[d], cc = c + DC[d];
    if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
    const s = (filled[i] - filled[idx(rr, cc)]) / DD[d];
    if (s > bestSlope) { bestSlope = s; best = d; }
  }
  flowdir[i] = best >= 0 ? best : 254;
}
const downstream = (i) => { const d = flowdir[i]; if (d > 7) return -1; const r = (i / COLS) | 0, c = i % COLS; return idx(r + DR[d], c + DC[d]); };
// accumulation of IN-PARK cells only (rain on streets outside the park goes to street drains, not into the park)
const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => filled[b] - filled[a]);
const accPark = new Float64Array(N);
for (const i of order) { if (inPark[i]) accPark[i] += 1; const j = downstream(i); if (j >= 0) accPark[j] += accPark[i]; }
// slope (Horn) on the original DEM, percent
const slopePct = new Float32Array(N);
const zAt = (r, c) => elev[idx(Math.min(ROWS - 1, Math.max(0, r)), Math.min(COLS - 1, Math.max(0, c)))];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const a = zAt(r - 1, c - 1), b = zAt(r - 1, c), cc = zAt(r - 1, c + 1), d = zAt(r, c - 1), f = zAt(r, c + 1), g = zAt(r + 1, c - 1), h = zAt(r + 1, c), ii = zAt(r + 1, c + 1);
  const dzdx = ((cc + 2 * f + ii) - (a + 2 * d + g)) / (8 * CELL);
  const dzdy = ((g + 2 * h + ii) - (a + 2 * b + cc)) / (8 * CELL);
  slopePct[idx(r, c)] = 100 * Math.hypot(dzdx, dzdy);
}
// LS factor (docs/04 F): (As/22.13)^0.4 * (sin θ / 0.0896)^1.3 ; As = contributing area per unit width, capped at 300 m slope length
const accAll = new Float64Array(N);
for (const i of order) { accAll[i] += 1; const j = downstream(i); if (j >= 0) accAll[j] += accAll[i]; }
const LS = new Float32Array(N);
const MAXLEN = 300;
for (let i = 0; i < N; i++) {
  const As = Math.min(accAll[i] * CELL, MAXLEN); // (cells*25 m²)/5 m width = cells*5 m
  const theta = Math.atan(slopePct[i] / 100);
  LS[i] = Math.pow(As / 22.13, 0.4) * Math.pow(Math.sin(theta) / 0.0896, 1.3);
}
log('fill raised cells', raised);

export { };
// (continued below)
globalThis.__prep = { ROWS, COLS, CELL, X0, Y0, N, elev, inPark, cover, coverSrc, worldcover, hsg, zone, zones, flowdir, accPark, slopePct, LS, filled, downstream, idx, cx, cy, fromUTM, toUTM, trailLines, soilUnits, osmFeatures: osm.features, IN, RV3, OUT, readJSON, log, sha, rasterizeLines, rasterizePolygons, ringsOf, linesOf };
await import("./prep-data-levels.mjs");
if (process.env.PREP_EXTRA) await import(process.env.PREP_EXTRA);

// ---------------------------------------------------------------- weather (daily) 2020-09-01 … 2023-09-30
{
  const csv = fs.readFileSync(path.join(IN, 'weather_daily.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = csv[0].split(',');
  const col = (n) => head.indexOf(n);
  const rows = csv.slice(1).map((l) => l.split(','));
  const sel = rows.filter((r) => r[col('date')] >= '2020-09-01' && r[col('date')] <= '2023-09-30');
  const weather = {
    start: sel[0][col('date')], end: sel[sel.length - 1][col('date')], days: sel.length,
    dates: sel.map((r) => r[col('date')]),
    precipMm: sel.map((r) => (r[col('precip_mm')] === '' ? null : Number(r[col('precip_mm')]))),
    et0Mm: sel.map((r) => (r[col('et0_mm')] === '' ? null : Number(r[col('et0_mm')]))),
    precipSource: [...new Set(sel.map((r) => r[col('precip_source')]))],
    precipFlags: [...new Set(sel.map((r) => r[col('precip_flag')]).filter(Boolean))],
  };
  const wm = readJSON(path.join(IN, 'weather_metadata.json')).station;
  weather.station = { id: wm.id, name: wm.name, distanceKm: +wm.distance_to_aoi_center_km.toFixed(1) };
  weather.label = `Rain: NOAA downtown San Francisco station ${wm.id} (observed, ~${weather.station.distanceKm} km from the study area). ET0: Open-Meteo ERA5, FAO-56 Penman–Monteith (model output, not measured).`;
  const nullP = weather.precipMm.filter((v) => v === null).length, nullE = weather.et0Mm.filter((v) => v === null).length;
  if (nullP || nullE) throw new Error(`weather has nulls in the game window: precip ${nullP}, et0 ${nullE}`);
  const wySum = (a, b) => weather.dates.reduce((s, d, k) => (d >= a && d <= b ? s + weather.precipMm[k] : s), 0);
  weather.waterYears = [
    { wy: 2021, start: '2020-10-01', end: '2021-09-30', rainMm: +wySum('2020-10-01', '2021-09-30').toFixed(1) },
    { wy: 2022, start: '2021-10-01', end: '2022-09-30', rainMm: +wySum('2021-10-01', '2022-09-30').toFixed(1) },
    { wy: 2023, start: '2022-10-01', end: '2023-09-30', rainMm: +wySum('2022-10-01', '2023-09-30').toFixed(1) },
  ];
  fs.writeFileSync(path.join(OUT, 'weather-daily.json'), JSON.stringify(weather));
  log('weather', weather.days, 'days', weather.waterYears.map((w) => `WY${w.wy} ${w.rainMm} mm`).join(', '));
}

// ---------------------------------------------------------------- hourly storms (airport stations)
{
  const center = fromUTM.forward([X0 + (COLS * CELL) / 2, Y0 - (ROWS * CELL) / 2]);
  const hav = (lon1, lat1, lon2, lat2) => {
    const R = 6371.0088, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };
  const readStorm = (file, stationFile, id, name) => {
    const lines = fs.readFileSync(path.join(RV3, 'weather', file), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const head = lines[0].split(',');
    const rows = lines.slice(1).map((l) => l.split(','));
    const k = head.indexOf('rainfall_depth_mm');
    const st = readJSON(path.join(RV3, 'weather', stationFile)).station;
    const distKm = hav(center[0], center[1], Number(st.LONGITUDE), Number(st.LATITUDE));
    const rain = rows.map((r) => Number(r[k]));
    return { id, name, station: st.NAME, stationId: st.STATION, lat: Number(st.LATITUDE), lon: Number(st.LONGITUDE),
      distanceKm: +distKm.toFixed(1), file: `data/sf-glen-canyon/research-v3/weather/${file}`,
      startLocal: rows[0][head.indexOf('interval_end_pst')], rainMm: rain, totalMm: +rain.reduce((a, b) => a + b, 0).toFixed(1), maxHourMm: Math.max(...rain),
      hourLabels: rows.map((r) => r[head.indexOf('interval_end_pst')].slice(11, 16)) };
  };
  const storms = {
    center: { lon: +center[0].toFixed(5), lat: +center[1].toFixed(5), meaning: 'centre of the 5 m grid (computed)' },
    SFO: readStorm('sfo_strict_event_20230104.csv', 'station.json', 'SFO', 'Short storm, 2023-01-04'),
    OAK: readStorm('oak_strict_event_20221231.csv', 'oak_station.json', 'OAK', 'The Long Storm, 2022-12-31'),
  };
  {
    // downtown daily rain on the long storm's date, read from the same daily file the game uses
    const csv = fs.readFileSync(path.join(IN, 'weather_daily.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const head = csv[0].split(',');
    const row = csv.slice(1).map((l) => l.split(',')).find((r) => r[head.indexOf('date')] === '2022-12-31');
    storms.downtownDaily20221231Mm = Number(row[head.indexOf('precip_mm')]);
  }
  fs.writeFileSync(path.join(OUT, 'storms.json'), JSON.stringify(storms));
  log('storms', `SFO ${storms.SFO.totalMm} mm max ${storms.SFO.maxHourMm} @${storms.SFO.distanceKm} km;`, `OAK ${storms.OAK.totalMm} mm max ${storms.OAK.maxHourMm} @${storms.OAK.distanceKm} km`);
}

// ---------------------------------------------------------------- building footprints for the stage (display only)
// DataSF footprints as polygons in grid-cell coordinates (cell centres are integers), extruded in the browser to their
// lidar median height. Same < 2 m rule as the cover raster. Douglas–Peucker simplified to 0.25 m.
{
  const dp = (pts, tol) => {
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let best = -1, bestD = tol;
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const L = Math.hypot(bx - ax, by - ay) || 1e-9;
      for (let k = a + 1; k < b; k++) {
        const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L;
        if (d > bestD) { bestD = d; best = k; }
      }
      if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    return pts.filter((_, k) => keep[k]);
  };
  const toCell = ([x, y]) => [(x - X0) / CELL - 0.5, (Y0 - y) / CELL - 0.5];
  const out = [];
  let dropped = 0, low = 0;
  for (const f of bld.features) {
    if (!f.geometry) continue;
    const hcm = Number(f.properties.hgt_mediancm);
    if (!Number.isFinite(hcm) || hcm < 200) { low++; continue; }
    for (const poly of ringsOf(f.geometry)) {
      const rings = poly.map((ring) => {
        const pts = ring.map(toCell);
        // drop the closing duplicate point, then simplify the closed ring as two open halves
        if (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-9 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-9) pts.pop();
        if (pts.length < 4) return pts;
        let m = 1, md = -1;
        for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]); if (d > md) { md = d; m = k; } }
        const tol = 0.25 / CELL;
        const a = dp(pts.slice(0, m + 1), tol), b = dp(pts.slice(m).concat([pts[0]]), tol);
        return a.concat(b.slice(1, -1));
      }).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      const outer = rings[0];
      const inside = outer.every(([c, r]) => c >= -0.5 && c <= COLS - 0.5 && r >= -0.5 && r <= ROWS - 0.5);
      if (!inside) { dropped++; continue; }
      const cc = outer.reduce((s, p) => s + p[0], 0) / outer.length, rr = outer.reduce((s, p) => s + p[1], 0) / outer.length;
      const ci = Math.max(0, Math.min(ROWS - 1, Math.round(rr))) * COLS + Math.max(0, Math.min(COLS - 1, Math.round(cc)));
      out.push({ h: +(hcm / 100).toFixed(1), p: inPark[ci] ? 1 : 0, r: rings.map((ring) => ring.flatMap(([c, r]) => [+c.toFixed(2), +r.toFixed(2)])) });
    }
  }
  fs.writeFileSync(path.join(OUT, 'buildings.json'), JSON.stringify({
    note: 'DataSF building footprints (PDDL), heights = lidar median height above ground (hgt_mediancm). Display only; the model uses the 5 m roof cells.',
    count: out.length, b: out,
  }));
  log('building footprints', out.length, 'kept;', low, 'under 2 m;', dropped, 'crossing the grid edge');
}

// ---------------------------------------------------------------- creek lines for the stage (display only)
// OpenStreetMap waterway=stream lines in grid-cell coordinates; culverted parts are flagged (drawn hidden / dashed).
{
  const toCell = ([x, y]) => [(x - X0) / CELL - 0.5, (Y0 - y) / CELL - 0.5];
  const lines = [];
  for (const f of osm.features) {
    const t = f.properties.tags || {};
    if (t.waterway !== 'stream' && t.waterway !== 'river' && t.waterway !== 'brook') continue;
    for (const line of linesOf(f.geometry)) {
      const pts = line.map(toCell);
      lines.push({ name: t.name || null, culvert: t.tunnel === 'culvert' || Number(t.layer) < 0, osmId: f.properties.osm_id ?? null,
        p: pts.flatMap(([c, r]) => [+c.toFixed(2), +r.toFixed(2)]) });
    }
  }
  fs.writeFileSync(path.join(OUT, 'creek.json'), JSON.stringify({ note: 'OpenStreetMap waterway=stream lines (ODbL). culvert = underground (tunnel=culvert or layer<0). Display only.', lines }));
  log('creek lines', lines.length, 'open', lines.filter((l) => !l.culvert).length);
}

// ---------------------------------------------------------------- grid layers for the stage
{
  const wr = (name, arr) => fs.writeFileSync(path.join(OUT, name), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  wr('elev.f32', elev);
  wr('cover.u8', cover);
  wr('inpark.u8', inPark);
  wr('zone.u8', zone);
  wr('hsg.u8', hsg);
  const flowAcc = new Float32Array(N); for (let i = 0; i < N; i++) flowAcc[i] = accPark[i];
  wr('acc.f32', flowAcc);
  wr('down.i32', Int32Array.from({ length: N }, (_, i) => downstream(i)));
  let emin = Infinity, emax = -Infinity; for (const v of elev) { if (v < emin) emin = v; if (v > emax) emax = v; }
  const coverCounts = {}; for (let i = 0; i < N; i++) if (inPark[i]) coverCounts[cover[i]] = (coverCounts[cover[i]] || 0) + 1;
  const grid = { rows: ROWS, cols: COLS, cellM: CELL, originX: X0, originY: Y0, crs: 'EPSG:32610', rowOrder: 'north-to-south', elevMin: emin, elevMax: emax,
    parkCells: inPark.reduce((a, b) => a + b, 0), coverCodes: { 0: 'none', 1: 'roof', 2: 'paved', 3: 'turf', 4: 'grass', 5: 'scrub', 6: 'tree', 7: 'bare', 8: 'water', 9: 'rock' },
    coverCountsInPark: coverCounts, hsgCodes: { 0: 'none', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 9: 'unknown (C used, range B–D)' },
    layers: { elev: 'elev.f32', cover: 'cover.u8', inPark: 'inpark.u8', zone: 'zone.u8', hsg: 'hsg.u8', acc: 'acc.f32', down: 'down.i32' } };
  fs.writeFileSync(path.join(OUT, 'grid.json'), JSON.stringify(grid));
  // how many soil components have no full-profile water-holding value (AWC) — level 3 shows this as its biggest unknown
  const comps = soilComp.soilUnits.flatMap((u) => u.components ?? []);
  const awcCoverage = { components: comps.length, withoutAwc: comps.filter((c) => c.awcMmPerM == null).length };
  fs.writeFileSync(path.join(OUT, 'zones.json'), JSON.stringify({ zones, soilUnits, awcCoverage, note: '2006 management plan zones, approximate digitised boundaries (G7), partial coverage; historical plan, not a current approval. MA-3b boundary not mapped.' }));
  log('grid layers written; park cover counts', JSON.stringify(coverCounts));
}

// ---------------------------------------------------------------- NAIP basemap → JPEG ≤ 2048 px
{
  const png = PNG.sync.read(fs.readFileSync(path.join(IN, 'basemap_naip.png')));
  const scale = Math.min(1, 2048 / Math.max(png.width, png.height));
  const W = Math.round(png.width * scale), H = Math.round(png.height * scale);
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y / scale), y1 = Math.min(png.height, Math.floor((y + 1) / scale));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x / scale), x1 = Math.min(png.width, Math.floor((x + 1) / scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < Math.max(y1, y0 + 1); yy++) for (let xx = x0; xx < Math.max(x1, x0 + 1); xx++) {
        const o = (yy * png.width + xx) * 4; r += png.data[o]; g += png.data[o + 1]; b += png.data[o + 2]; n++;
      }
      const o = (y * W + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  const jpg = jpeg.encode({ data: out, width: W, height: H }, 82);
  fs.writeFileSync(path.join(OUT, 'naip.jpg'), jpg.data);
  log('NAIP', png.width, 'x', png.height, '→', W, 'x', H, 'JPEG', (jpg.data.length / 1024).toFixed(0), 'KB');
}

// ---------------------------------------------------------------- manifest: sources, licences, attribution, input hashes
{
  const { createHash } = await import('node:crypto');
  const h = (p) => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; } };
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
  const inputs = [
    path.join(IN, 'aligned_5m', 'elevation_m.f32'), path.join(IN, 'aligned_5m', 'in_park.f32'), path.join(IN, 'aligned_5m', 'soil_mukey.f32'),
    path.join(IN, 'soil_components.json'), path.join(IN, 'mgmt_areas.geojson'), path.join(IN, 'osm_features.geojson'), path.join(IN, 'buildings.geojson'),
    path.join(IN, 'worldcover_2021_aoi.tif'), path.join(IN, 'basemap_naip.png'), path.join(IN, 'weather_daily.csv'),
    path.join(RV3, 'weather', 'oak_strict_event_20221231.csv'), path.join(RV3, 'weather', 'sfo_strict_event_20230104.csv'),
  ];
  const manifest = {
    generatedBy: 'prototype/scripts/prep-data.mjs',
    note: 'Prototype data, not the production data pack. Every number in the game is computed by prototype/src/model from these files.',
    inputs: inputs.map((p) => ({ file: rel(p), sha256: h(p) })),
    sources: [
      { id: 'S07/S08/S09/G1G-03', what: 'Terrain: USGS 3DEP lidar bare-earth DEM, 2023 San Francisco project (5 m grid, 2023-04-20)', licence: 'USGS public domain', attribution: 'U.S. Geological Survey, 3D Elevation Program' },
      { id: 'G6-NAIP', what: 'Aerial photo: USDA NAIP 2024 (May 2024 tiles), resampled to 2048 px', licence: 'Public domain', attribution: 'USDA Farm Production and Conservation Business Center, NAIP' },
      { id: 'G7L-01', what: 'Land cover: ESA WorldCover 2021 v200 (10 m)', licence: 'CC BY 4.0', attribution: '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium' },
      { id: 'G1G-02', what: 'Paths, courts, lawns, trails, culvert: OpenStreetMap via Overpass', licence: 'ODbL 1.0', attribution: '© OpenStreetMap contributors' },
      { id: 'G1G-01, G02', what: 'Building footprints and park boundary: DataSF', licence: 'Open Data Commons PDDL 1.0', attribution: 'City and County of San Francisco, DataSF' },
      { id: 'S10', what: 'Soils: USDA NRCS Soil Data Access (SSURGO map units and components)', licence: 'USDA public data', attribution: 'Soil Survey Staff, NRCS, USDA' },
      { id: 'S41', what: 'Daily rain: NOAA NCEI GHCN-Daily, San Francisco Downtown USW00023272', licence: 'US government data', attribution: 'NOAA National Centers for Environmental Information' },
      { id: 'S42', what: 'Reference evapotranspiration ET0: Open-Meteo Historical Weather API (ERA5, FAO-56 Penman–Monteith) — model output', licence: 'CC BY 4.0 (API data); free tier is non-commercial', attribution: 'Weather data by Open-Meteo.com (ERA5, Copernicus Climate Change Service)' },
      { id: 'research-v3/weather', what: 'Hourly rain: NOAA ISD/LCD at Oakland (OAK, 72493023230) and San Francisco (SFO, 72494023234) airports', licence: 'US government data', attribution: 'NOAA National Centers for Environmental Information' },
      { id: 'research-v3/storage', what: 'Check values: GPT storage-timing experiment (36 scenarios) — used in tests only', licence: 'project research file', attribution: 'Neutral Ground team (GPT G-series research)' },
      { id: 'G7M-01 / ECO01', what: '2006 management-area zones (approximate partial digitisation of the SNRAMP Glen Canyon map) — historical plan, not a current approval; MA-3b not mapped', licence: 'Redistribution licence of the underlying plan map unresolved (see G7 delivery) — keep this prototype private until checked', attribution: 'San Francisco Recreation and Park Department, Significant Natural Resource Areas Management Plan (2006); digitisation by the project team' },
      { id: 'G7 cover-generic-values', what: 'Generic parameter tables (TR-55 curve numbers, FAO-56 Kc, USLE C factors) mapped to local covers by the project (mapping is an assumption)', licence: 'facts from FAO/USDA publications, paraphrased', attribution: 'FAO-56; USDA NRCS TR-55; USDA AH537' },
      { id: 'G9', what: 'Sentinel-2 monthly NDVI (display only, never used in the model)', licence: 'Copernicus Sentinel data, free and open (see G9 sources.json)', attribution: 'Contains modified Copernicus Sentinel data, processed by the Neutral Ground team (G9)' },
    ],
    derived: {
      grid: { rows: ROWS, cols: COLS, cellM: CELL, originUTM10N: [X0, Y0], parkCells: inPark.reduce((a, b) => a + b, 0) },
      stormSite: globalThis.__prepLevels?.stormSite?.stats,
      outlet: globalThis.__prepLevels?.stormSite?.outlet,
    },
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log('manifest written');
}
