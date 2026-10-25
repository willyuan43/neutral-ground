// The island is Glen Canyon Park itself: its outline is the real park boundary (DataSF, the inPark grid), opened a little
// so 5 m slivers don't make spikes, grown by ~30 m so the first streets and houses around the park show, and smoothed.
// One island for every view; the camera moves between the east slope and the Rec Center. Display only.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { GameData } from '../data/load';
import type { World } from './world';
import { hash } from './Terrain';
import { terrainMaterial, setTerrainAerial } from './look';

export interface ParkShape {
  /** smoothed inside field per cell (0..1); the island edge is f = 0.5 */ f: Float32Array;
  /** distance (cells) from the island edge, inside */ depthIn: Float32Array;
  inside: (r: number, c: number) => boolean;
  /** the smoothed field at fractional cell coordinates */ fAt: (r: number, c: number) => number;
  bbox: { r0: number; r1: number; c0: number; c1: number };
  /** centre and half sizes (cells), for cameras and backdrops */ cr: number; cc: number; hr: number; hc: number;
}

// ------------------------------------------------------------------ distance transform (squared EDT, Felzenszwalb–Huttenlocher)
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** Euclidean distance (cells) from every cell to the nearest cell where `on` is true. */
export function distanceTo(on: Uint8Array, rows: number, cols: number): Float32Array {
  const INF = 1e12, n = Math.max(rows, cols);
  const g = new Float64Array(rows * cols);
  for (let i = 0; i < g.length; i++) g[i] = on[i] ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let c = 0; c < cols; c++) { for (let r = 0; r < rows; r++) f[r] = g[r * cols + c]; edt1d(f, rows, d, v, z); for (let r = 0; r < rows; r++) g[r * cols + c] = d[r]; }
  for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) f[c] = g[r * cols + c]; edt1d(f, cols, d, v, z); for (let c = 0; c < cols; c++) g[r * cols + c] = d[c]; }
  const out = new Float32Array(rows * cols);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

const cache = new WeakMap<GameData, ParkShape>();
/**
 * The island: the whole data area around Glen Canyon Park (about 1 × 1.4 km) cut out like a museum diorama block with
 * rounded corners, so the park is seen in its neighbourhood — the homes, school, playgrounds and shops right around it
 * (real DataSF footprints, OpenStreetMap places). The park itself is drawn with its real boundary on top.
 */
export function parkShape(d: GameData, opts = { margin: 1.5, corner: 22, soft: 1.6 }): ParkShape {
  const hit = cache.get(d); if (hit) return hit;
  const { rows, cols } = d.grid; const N = rows * cols;
  // signed distance (cells) to a rounded rectangle inset by `margin`; positive inside
  const hx = (cols - 1) / 2 - opts.margin, hy = (rows - 1) / 2 - opts.margin, cx0 = (cols - 1) / 2, cy0 = (rows - 1) / 2, R = opts.corner;
  const sd = (r: number, c: number) => {
    const qx = Math.abs(c - cx0) - (hx - R), qy = Math.abs(r - cy0) - (hy - R);
    const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    return -out;
  };
  const f = new Float32Array(N);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) f[r * cols + c] = Math.min(1, Math.max(0, 0.5 + sd(r, c) / (2 * opts.soft)));
  const isIn = new Uint8Array(N); for (let i = 0; i < N; i++) isIn[i] = f[i] >= 0.5 ? 1 : 0;
  const notIn = new Uint8Array(N); for (let i = 0; i < N; i++) notIn[i] = isIn[i] ? 0 : 1;
  const depthIn = distanceTo(notIn, rows, cols);
  let r0 = rows, r1 = 0, c0 = cols, c1 = 0;
  for (let i = 0; i < N; i++) if (isIn[i]) { const r = (i / cols) | 0, c = i % cols; r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const fAt = (r: number, c: number) => {
    if (r < 0 || c < 0 || r > rows - 1 || c > cols - 1) return 0;
    const ra = Math.floor(r), ca = Math.floor(c), rb = Math.min(rows - 1, ra + 1), cb = Math.min(cols - 1, ca + 1), fr = r - ra, fc = c - ca;
    return f[ra * cols + ca] * (1 - fr) * (1 - fc) + f[ra * cols + cb] * (1 - fr) * fc + f[rb * cols + ca] * fr * (1 - fc) + f[rb * cols + cb] * fr * fc;
  };
  const shape: ParkShape = { f, depthIn, inside: (r, c) => fAt(r, c) >= 0.5, fAt, bbox: { r0, r1, c0, c1 }, cr: (r0 + r1) / 2, cc: (c0 + c1) / 2, hr: (r1 - r0) / 2, hc: (c1 - c0) / 2 };
  cache.set(d, shape);
  return shape;
}

/** The real park boundary (DataSF, the inPark grid), smoothed a little, as line segments in cell coordinates. */
export function parkBoundary(d: GameData): [number, number, number, number][] {
  const { rows, cols } = d.grid; const N = rows * cols;
  const m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = d.inPark[i] === 1 ? 1 : 0;
  const g = blur(m, rows, cols, 1.1);
  const segs: [number, number, number, number][] = [];
  const T = 0.5;
  const lerp = (a: number, b: number) => (T - a) / ((b - a) || 1e-9);
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = g[r * cols + c], b = g[r * cols + c + 1], cc = g[(r + 1) * cols + c + 1], dd = g[(r + 1) * cols + c];
    const k = (a >= T ? 1 : 0) | (b >= T ? 2 : 0) | (cc >= T ? 4 : 0) | (dd >= T ? 8 : 0);
    if (k === 0 || k === 15) continue;
    const top: [number, number] = [r, c + lerp(a, b)], right: [number, number] = [r + lerp(b, cc), c + 1], bot: [number, number] = [r + 1, c + lerp(dd, cc)], left: [number, number] = [r + lerp(a, dd), c];
    const add = (p: [number, number], q: [number, number]) => segs.push([p[0], p[1], q[0], q[1]]);
    switch (k) {
      case 1: case 14: add(left, top); break;
      case 2: case 13: add(top, right); break;
      case 3: case 12: add(left, right); break;
      case 4: case 11: add(right, bot); break;
      case 6: case 9: add(top, bot); break;
      case 7: case 8: add(left, bot); break;
      case 5: add(left, top); add(right, bot); break;
      case 10: add(top, right); add(left, bot); break;
    }
  }
  return segs;
}
function blur(src: Float32Array, rows: number, cols: number, sigma: number): Float32Array {
  const rad = Math.ceil(sigma * 3), k: number[] = []; let s = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(rows * cols), out = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let a = 0; for (let i = -rad; i <= rad; i++) { const cc = Math.min(cols - 1, Math.max(0, c + i)); a += src[r * cols + cc] * k[i + rad]; } tmp[r * cols + c] = a; }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let a = 0; for (let i = -rad; i <= rad; i++) { const rr = Math.min(rows - 1, Math.max(0, r + i)); a += tmp[rr * cols + c] * k[i + rad]; } out[r * cols + c] = a; }
  return out;
}

// ------------------------------------------------------------------ the top surface, clipped along the smooth edge
export interface ParkMesh { geo: THREE.BufferGeometry; vr: Float32Array; vc: Float32Array; loops: number[][]; minY: number }
export function buildParkMesh(d: GameData, w: World, shape: ParkShape): ParkMesh {
  const { rows, cols } = d.grid; const f = shape.f; const T = 0.5;
  const { r0, r1, c0, c1 } = shape.bbox;
  const R0 = Math.max(0, r0 - 2), R1 = Math.min(rows - 1, r1 + 2), C0 = Math.max(0, c0 - 2), C1 = Math.min(cols - 1, c1 + 2);
  const vr: number[] = [], vc: number[] = [], idx: number[] = [];
  const gridId = new Map<number, number>(); const edgeId = new Map<string, number>();
  const gv = (r: number, c: number) => { const key = r * cols + c; let id = gridId.get(key); if (id === undefined) { id = vr.length; vr.push(r); vc.push(c); gridId.set(key, id); } return id; };
  const ev = (ra: number, ca: number, rb: number, cb: number) => {
    const ka = ra * cols + ca, kb = rb * cols + cb; const key = ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`;
    let id = edgeId.get(key);
    if (id === undefined) { const fa = f[ka], fb = f[kb]; const t = (T - fa) / (fb - fa || 1e-9); id = vr.length; vr.push(ra + (rb - ra) * t); vc.push(ca + (cb - ca) * t); edgeId.set(key, id); }
    return id;
  };
  const segs: [number, number][] = [];
  const tri = (p: [number, number][]) => {
    const ins = p.map(([r, c]) => f[r * cols + c] >= T);
    const n = ins.filter(Boolean).length;
    if (n === 0) return;
    if (n === 3) { idx.push(gv(...p[0]), gv(...p[1]), gv(...p[2])); return; }
    // rotate so that the odd vertex is first
    let k = 0; for (let i = 0; i < 3; i++) if ((n === 1 && ins[i]) || (n === 2 && !ins[i])) k = i;
    const a = p[k], b = p[(k + 1) % 3], c = p[(k + 2) % 3];
    const eab = ev(a[0], a[1], b[0], b[1]), eac = ev(a[0], a[1], c[0], c[1]);
    if (n === 1) { idx.push(gv(...a), eab, eac); segs.push([eab, eac]); }
    else { const gb = gv(...b), gc = gv(...c); idx.push(eab, gb, gc, eab, gc, eac); segs.push([eac, eab]); }
  };
  for (let r = R0; r < R1; r++) for (let c = C0; c < C1; c++) {
    const A: [number, number] = [r, c], B: [number, number] = [r, c + 1], Cc: [number, number] = [r + 1, c], D: [number, number] = [r + 1, c + 1];
    if ((r + c) % 2 === 0) { tri([A, Cc, B]); tri([B, Cc, D]); } else { tri([A, Cc, D]); tri([A, D, B]); }
  }
  // chain the edge segments into loops (each edge vertex is shared by two segments)
  const next = new Map<number, number>(); for (const [a, b] of segs) next.set(a, b);
  const seen = new Set<number>(); const loops: number[][] = [];
  for (const [a] of segs) {
    if (seen.has(a)) continue;
    const loop: number[] = []; let x: number | undefined = a;
    while (x !== undefined && !seen.has(x)) { seen.add(x); loop.push(x); x = next.get(x); }
    if (loop.length > 8) loops.push(loop);
  }
  const nv = vr.length;
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const cellW = d.grid.cellM * 0.1;
  let minY = Infinity;
  for (let k = 0; k < nv; k++) {
    const r = vr[k], c = vc[k], y = w.hAt(r, c);
    pos[k * 3] = w.x(c); pos[k * 3 + 1] = y; pos[k * 3 + 2] = w.z(r); minY = Math.min(minY, y);
    const hx = (w.hAt(r, c + 1) - w.hAt(r, c - 1)) / (2 * cellW), hz = (w.hAt(r + 1, c) - w.hAt(r - 1, c)) / (2 * cellW);
    const l = Math.hypot(hx, 1, hz); nrm[k * 3] = -hx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -hz / l;
    uv[k * 2] = (c + 0.5) / cols; uv[k * 2 + 1] = (r + 0.5) / rows;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  g.setAttribute('detailW', new THREE.BufferAttribute(new Float32Array(nv), 1));
  g.setAttribute('cityW', new THREE.BufferAttribute(new Float32Array(nv), 1));
  g.setAttribute('stateW', new THREE.BufferAttribute(new Float32Array(nv), 1));
  g.setIndex(idx);
  return { geo: g, vr: Float32Array.from(vr), vc: Float32Array.from(vc), loops, minY };
}

// ------------------------------------------------------------------ walls and underside (soil and rock bands, like the card art)
export function wallMaterial(): THREE.MeshStandardMaterial {
  // the island's cut sides, like a toy diorama block: a green turf lip, dark topsoil, layered clay and a rocky base
  // (decoration, not a survey of the canyon's soils)
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float topY;\nattribute float along;\nvarying float vTopY;\nvarying float vAlong;\nvarying vec3 vWorldP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vTopY = topY; vAlong = along; vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying float vTopY;\nvarying float vAlong;\nvarying vec3 vWorldP;\n'
      + 'float wH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n'
      + 'float wV(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 q = f * f * (3.0 - 2.0 * f); return mix(mix(wH(i), wH(i + vec2(1.0, 0.0)), q.x), mix(wH(i + vec2(0.0, 1.0)), wH(i + vec2(1.0, 1.0)), q.x), q.y); }\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float dTop = max(0.0, vTopY - vWorldP.y);
      float wob = (wV(vec2(vAlong * 0.55, 1.3)) - 0.5) * 0.5 + (wV(vec2(vAlong * 2.1, 4.7)) - 0.5) * 0.18;
      float dd = dTop + wob;
      vec3 turf = vec3(0.17, 0.36, 0.08), topsoil = vec3(0.17, 0.09, 0.045), clay = vec3(0.42, 0.21, 0.09), clay2 = vec3(0.55, 0.3, 0.13), rock = vec3(0.3, 0.27, 0.27);
      vec3 col = turf;
      col = mix(col, topsoil, smoothstep(0.18, 0.3, dd));
      // clay with darker strata lines
      float strata = 0.5 + 0.5 * sin(dd * 5.2 + wV(vec2(vAlong * 0.3, dd)) * 2.0);
      vec3 clayC = mix(clay, clay2, strata * 0.7);
      col = mix(col, clayC, smoothstep(1.05, 1.35, dd));
      // the rocky base: chunky blocks
      vec2 blk = vec2(vAlong * 0.9, vWorldP.y * 1.2);
      float rb = wV(floor(blk)) ;
      vec3 rockC = rock * (0.8 + 0.45 * rb);
      col = mix(col, rockC, smoothstep(3.4, 3.8, dd));
      // pebbles in the soil
      float peb = step(0.93, wH(floor(vec2(vAlong * 4.0, vWorldP.y * 4.0))));
      col = mix(col, vec3(0.5, 0.42, 0.36), peb * smoothstep(0.4, 0.8, dd) * (1.0 - smoothstep(3.3, 3.6, dd)) * 0.7);
      col *= 0.8 + 0.2 * smoothstep(-2.0, 6.0, vWorldP.y - (vTopY - 12.0));
      diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'ng-wall-toy-v1';
  return m;
}
/** Underside of the island: dark rock, darker towards the keel. */
export function undersideMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: 0.3, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWorldP2;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vWorldP2;\nfloat uH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float rk = uH(floor(vWorldP2.xz / 2.5 + vec2(vWorldP2.y * 0.3)));
      diffuseColor.rgb = vec3(0.3, 0.26, 0.25) * (0.7 + 0.4 * rk) * (0.55 + 0.9 * diffuseColor.r);`);
  };
  m.customProgramCacheKey = () => 'ng-under-toy-v1';
  return m;
}

export function buildParkCliffs(d: GameData, w: World, shape: ParkShape, mesh: ParkMesh) {
  const { rows, cols } = d.grid;
  const baseY = mesh.minY - 3.2;
  const depthMax = 7;
  // walls: from the terrain edge straight down to baseY
  const wp: number[] = [], wt: number[] = [], wa: number[] = [], wi: number[] = [];
  const pos = mesh.geo.attributes.position as THREE.BufferAttribute;
  for (const loop of mesh.loops) {
    const n = loop.length; const base = wp.length / 3;
    const RINGS = [0, 0.3, 0.55, 1.2, 2.4, 4.2, -1]; // world units below the top; -1 = baseY
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const k = loop[i]; const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      if (i > 0) { const kp = loop[i - 1]; acc += Math.hypot(x - pos.getX(kp), z - pos.getZ(kp)); }
      // outward normal from the edge field
      const r = mesh.vr[k], c = mesh.vc[k];
      const fx = sampleF(shape, r, c + 1) - sampleF(shape, r, c - 1), fz = sampleF(shape, r + 1, c) - sampleF(shape, r - 1, c);
      const l = Math.hypot(fx, fz) || 1; const ox = -fx / l, oz = -fz / l;
      for (const dd of RINGS) {
        const yy = dd < 0 ? baseY + (hash(k * 3 + 1) - 0.5) * 0.4 : y - dd;
        const bul = dd > 0 && dd < 0.6 ? 0.14 : 0; // the turf lip overhangs a little
        wp.push(x + ox * bul, Math.max(yy, baseY), z + oz * bul); wt.push(y); wa.push(acc);
      }
    }
    const S = RINGS.length;
    for (let i = 0; i < n; i++) {
      const a = base + i * S, b = base + ((i + 1) % n) * S;
      for (let j = 0; j < S - 1; j++) wi.push(a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1);
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wp), 3));
  wall.setAttribute('topY', new THREE.BufferAttribute(new Float32Array(wt), 1));
  wall.setAttribute('along', new THREE.BufferAttribute(new Float32Array(wa), 1));
  wall.setIndex(wi); wall.computeVertexNormals();
  // underside: the same outline, hanging down deeper towards the middle (a rock keel), facing down.
  // Its rim is welded to the bottom of the wall (same heights), so no gaps or teeth show along the bottom edge.
  const under = mesh.geo.clone();
  under.deleteAttribute('detailW'); under.deleteAttribute('cityW'); under.deleteAttribute('uv');
  const up = under.attributes.position as THREE.BufferAttribute;
  const uc = new Float32Array(up.count * 3);
  for (let k = 0; k < up.count; k++) {
    const r = mesh.vr[k], c = mesh.vc[k];
    const onEdge = r !== Math.round(r) || c !== Math.round(c); // edge vertices sit between grid points
    let dep = 0;
    if (onEdge) up.setY(k, baseY + (hash(k * 3 + 1) - 0.5) * 0.4);
    else {
      const di = Math.max(0.6, sampleDepthSmooth(shape, r, c, rows, cols) - 0.5);
      dep = depthMax * Math.pow(Math.min(1, di / 45), 0.7) * (0.85 + 0.3 * hash(Math.round(r) * 7 + Math.round(c) * 13));
      up.setY(k, baseY - dep);
    }
    const v = 0.55 + 0.12 * hash(k * 5 + 2) - 0.15 * Math.min(1, dep / depthMax);
    uc[k * 3] = 0.42 * v + 0.05; uc[k * 3 + 1] = 0.32 * v + 0.03; uc[k * 3 + 2] = 0.27 * v + 0.03;
  }
  under.setAttribute('color', new THREE.BufferAttribute(uc, 3));
  const ix = under.getIndex()!; const arr = ix.array as Uint32Array | Uint16Array;
  for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; } // face down
  ix.needsUpdate = true;
  under.computeVertexNormals();
  return { wall, under, baseY };
}
function sampleF(shape: ParkShape, r: number, c: number) { return shape.fAt(r, c); }
function sampleDepthSmooth(shape: ParkShape, r: number, c: number, rows: number, cols: number) {
  const ra = Math.max(0, Math.min(rows - 1, Math.floor(r))), ca = Math.max(0, Math.min(cols - 1, Math.floor(c)));
  const rb = Math.min(rows - 1, ra + 1), cb = Math.min(cols - 1, ca + 1), fr = Math.min(1, Math.max(0, r - ra)), fc = Math.min(1, Math.max(0, c - ca));
  const D = shape.depthIn;
  return D[ra * cols + ca] * (1 - fr) * (1 - fc) + D[ra * cols + cb] * (1 - fr) * fc + D[rb * cols + ca] * fr * (1 - fc) + D[rb * cols + cb] * fr * fc;
}

export function ParkCliffs({ d, w, shape, mesh }: { d: GameData; w: World; shape: ParkShape; mesh: ParkMesh }) {
  const built = useMemo(() => buildParkCliffs(d, w, shape, mesh), [d, w, shape, mesh]);
  const wallMat = useMemo(() => wallMaterial(), []);
  const underMat = useMemo(() => undersideMaterial(), []);
  useEffect(() => () => { built.wall.dispose(); built.under.dispose(); wallMat.dispose(); underMat.dispose(); }, [built, wallMat, underMat]);
  return (
    <group>
      <mesh geometry={built.wall} material={wallMat} castShadow receiveShadow />
      <mesh geometry={built.under} material={underMat} />
    </group>
  );
}


// ------------------------------------------------------------------ top surface component
// colours: one per 5 m cell (land cover, or a model state the level paints), smoothly interpolated between cells;
// park cells get the aerial photo's fine detail (see look.ts); the city around stays in clean pale tones.
const PARK_RGB: Record<number, [number, number, number]> = {
  0: [146, 190, 96], 1: [222, 212, 196], 2: [224, 208, 172], 3: [118, 196, 78], 4: [224, 196, 104], 5: [150, 178, 86], 6: [74, 138, 62], 7: [208, 150, 98], 8: [64, 178, 206], 9: [178, 142, 120],
};
const TOWN_RGB: Record<number, [number, number, number]> = {
  0: [206, 222, 190], 1: [232, 226, 214], 2: [186, 190, 200], 3: [160, 212, 128], 4: [198, 216, 148], 5: [184, 208, 146], 6: [142, 196, 114], 7: [224, 208, 174], 8: [110, 196, 226], 9: [206, 198, 186],
};
export type CellPaintFn = (i: number, rgb: [number, number, number]) => [number, number, number];

export function ParkTerrain({ d, w, mesh, paint, quiet, aerialMap, paintMix = 0, onGround }: { d: GameData; w: World; mesh: ParkMesh; paint?: CellPaintFn; quiet?: (i: number) => boolean; aerialMap?: THREE.Texture | null;
  /** a tap on the ground (cell coordinates), not a drag */ onGround?: (r: number, c: number) => void;
  /** how much of the painted colour shows on cells that do not carry a model state (lenses use ~1; normally 0 = the photo) */ paintMix?: number }) {
  // the toy look: painted land cover (the real aerial photo is a layer of its own, see AerialIsland)
  const mat = useMemo(() => terrainMaterial(), []);
  useEffect(() => { setTerrainAerial(mat, null); }, [mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  void w;
  // shade under the tree canopy and in hollows (cheap baked ambient occlusion)
  const ao = useMemo(() => {
    const { rows, cols } = d.grid; const a = new Float32Array(rows * cols);
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c; const e = d.elev;
      const lap = (e[i - 1] + e[i + 1] + e[i - cols] + e[i + cols]) / 4 - e[i]; // > 0 in hollows
      let t = 0; for (const j of [i - 1, i + 1, i - cols, i + cols, i]) if (d.cover[j] === 6) t++;
      a[i] = Math.max(0.72, Math.min(1.04, 1 - 0.035 * Math.max(0, lap) + 0.02 * Math.max(0, -lap) - 0.035 * t));
    }
    return a;
  }, [d]);
  useEffect(() => {
    const { rows, cols } = d.grid; const N = rows * cols;
    const cell = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const cv = d.cover[i]; const park = d.inPark[i] === 1;
      let rgb = park ? (PARK_RGB[cv] ?? PARK_RGB[0]) : (TOWN_RGB[cv] ?? TOWN_RGB[0]);
      if (paint) rgb = paint(i, rgb);
      const j = (0.97 + 0.06 * hash(i * 7 + 3)) * ao[i];
      cell[i * 3] = Math.pow((rgb[0] / 255) * j, 2.2); cell[i * 3 + 1] = Math.pow((rgb[1] / 255) * j, 2.2); cell[i * 3 + 2] = Math.pow((rgb[2] / 255) * j, 2.2);
    }
    const col = mesh.geo.attributes.color as THREE.BufferAttribute; const arr = col.array as Float32Array;
    const dw = (mesh.geo.attributes.detailW as THREE.BufferAttribute).array as Float32Array;
    const cw = (mesh.geo.attributes.cityW as THREE.BufferAttribute).array as Float32Array;
    const sw = (mesh.geo.attributes.stateW as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < mesh.vr.length; k++) {
      const r = Math.max(0, Math.min(rows - 1, mesh.vr[k])), c = Math.max(0, Math.min(cols - 1, mesh.vc[k]));
      const ra = Math.floor(r), ca = Math.floor(c), rb = Math.min(rows - 1, ra + 1), cb = Math.min(cols - 1, ca + 1), fr = r - ra, fc = c - ca;
      const w00 = (1 - fr) * (1 - fc), w01 = (1 - fr) * fc, w10 = fr * (1 - fc), w11 = fr * fc;
      const i00 = ra * cols + ca, i01 = ra * cols + cb, i10 = rb * cols + ca, i11 = rb * cols + cb;
      for (let ch = 0; ch < 3; ch++) arr[k * 3 + ch] = cell[i00 * 3 + ch] * w00 + cell[i01 * 3 + ch] * w01 + cell[i10 * 3 + ch] * w10 + cell[i11 * 3 + ch] * w11;
      const i = Math.round(r) * cols + Math.round(c);
      const park = d.inPark[i] === 1;
      const q = !!quiet?.(i);
      // grass that greens up with the soil wetness (not on cells that show a model state)
      const cvk = d.cover[i];
      dw[k] = !q && (cvk === 4 || cvk === 5) ? (park ? 1 : 0.6) : 0.0;
      cw[k] = park ? 0 : 1;
      sw[k] = q ? 0.8 : paintMix;
    }
    col.needsUpdate = true;
    (mesh.geo.attributes.detailW as THREE.BufferAttribute).needsUpdate = true;
    (mesh.geo.attributes.cityW as THREE.BufferAttribute).needsUpdate = true;
    (mesh.geo.attributes.stateW as THREE.BufferAttribute).needsUpdate = true;
  }, [mesh, d, paint, quiet, ao, paintMix]);
  const cellW = d.grid.cellM * 0.1;
  const tap = onGround ? (e: any) => { if (e.delta > 8) return; e.stopPropagation(); onGround(e.point.z / cellW + d.grid.rows / 2 - 0.5, e.point.x / cellW + d.grid.cols / 2 - 0.5); } : undefined;
  if (aerialMap) return <mesh geometry={mesh.geo} receiveShadow onClick={tap}><meshStandardMaterial map={aerialMap} roughness={0.95} /></mesh>;
  return <mesh geometry={mesh.geo} material={mat} receiveShadow onClick={tap} />;
}
