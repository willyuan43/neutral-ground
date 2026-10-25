import { useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameData } from '../data/load';
import { World, V_EXAG, H_SCALE } from './world';
import { hash } from './Terrain';
import { sway, windowMaterial, setRoofPhoto } from './look';

// Buildings: real DataSF footprints extruded to their lidar median height (display only — the model uses 5 m roof cells).
// City buildings are pale “white-card” massing like an architectural site model; buildings inside the park are accented.
// San Francisco houses come in pastel colours; roofs are mostly flat (tar, gravel) with some tile. A display choice.
const CITY_TONES = ['#fbefd9', '#e4f0f4', '#fbe2cf', '#e2f0da', '#f6e7c6', '#d8e6f2', '#fbeeb8', '#f4dde2', '#fffaf0', '#e9e2d4', '#f2d9bf', '#dbe8f4'];
const CITY_ROOFS = ['#d4765a', '#6f86a0', '#c98a62', '#5f9e9a', '#b8695a', '#8aa0b4', '#e0b27a', '#7b8f6a'];
export function Buildings({ d, w, inside, parkOnly = false }: { d: GameData; w: World; inside?: (r: number, c: number) => boolean; parkOnly?: boolean }) {
  const geo = useMemo(() => {
    const list = d.buildings?.b ?? [];
    const geos: THREE.BufferGeometry[] = [];
    const col = new THREE.Color();
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (parkOnly && !b.p) continue;
      const toV = (arr: number[]) => { const v: THREE.Vector2[] = []; for (let i = 0; i < arr.length; i += 2) v.push(new THREE.Vector2(w.x(arr[i]), -w.z(arr[i + 1]))); return v; };
      if (inside) {
        let cr = 0, cc = 0; const n0 = b.r[0].length / 2;
        for (let i = 0; i < b.r[0].length; i += 2) { cc += b.r[0][i]; cr += b.r[0][i + 1]; }
        if (!inside(cr / n0, cc / n0)) continue;
        // keep the whole footprint on the island
        let all = true; for (let i = 0; i < b.r[0].length; i += 2) if (!inside(b.r[0][i + 1], b.r[0][i])) { all = false; break; }
        if (!all) continue;
      }
      const outer = toV(b.r[0]);
      if (outer.length < 3) continue;
      const shape = new THREE.Shape(outer);
      for (let hIdx = 1; hIdx < b.r.length; hIdx++) shape.holes.push(new THREE.Path(toV(b.r[hIdx])));
      const height = Math.max(0.2, b.h * V_EXAG * H_SCALE);
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1, steps: 1 });
      g.rotateX(-Math.PI / 2);
      // sit on the lowest ground under the footprint so nothing floats on a slope
      let base = Infinity;
      for (let i = 0; i < b.r[0].length; i += 2) base = Math.min(base, w.hAt(b.r[0][i + 1], b.r[0][i]));
      g.translate(0, base - 0.08, 0);
      col.set(b.p ? '#f4ead6' : CITY_TONES[Math.floor(hash(k * 7 + 1) * CITY_TONES.length)]);
      const roof = new THREE.Color(b.p ? '#4f8a7a' : CITY_ROOFS[Math.floor(hash(k * 13 + 2) * CITY_ROOFS.length)]);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const hr = new Float32Array(n), ht = new Float32Array(n);
      const pos = g.attributes.position.array as Float32Array;
      const nrm = g.attributes.normal.array as Float32Array;
      for (let i = 0; i < n; i++) {
        hr[i] = pos[i * 3 + 1] - base; ht[i] = height;
        // roofs get a roof colour; walls darken slightly toward the ground (cheap contact shading)
        const yRel = (pos[i * 3 + 1] - base) / (height + 0.08);
        const isRoof = nrm[i * 3 + 1] > 0.9;
        const src = isRoof ? roof : col;
        const kk = isRoof ? 1 : 0.7 + 0.3 * Math.min(1, Math.max(0, yRel));
        c[i * 3] = src.r * kk; c[i * 3 + 1] = src.g * kk; c[i * 3 + 2] = src.b * kk;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setAttribute('hrel', new THREE.BufferAttribute(hr, 1));
      g.setAttribute('htot', new THREE.BufferAttribute(ht, 1));
      geos.push(g);
    }
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    return merged;
  }, [d, w, inside, parkOnly]);
  const mat = useMemo(() => windowMaterial(), []);
  // toy look: painted roofs (the real aerial photo is a layer of its own)
  useEffect(() => { setRoofPhoto(mat, null, d.grid.cols, d.grid.rows, d.grid.cellM * H_SCALE); }, [mat, d]);
  useEffect(() => () => { geo?.dispose(); }, [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (!geo) return null;
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}

// Trees on the real tree-canopy cells (ESA WorldCover; sampled — display only). Soft "cloud" crowns for broadleaf trees,
// tall blue-green crowns for eucalyptus (the canyon's most common tree), a few conifers. They sway a little in the wind.
function shadeGradient(g: THREE.BufferGeometry, lo: number, hi: number, y0: number, y1: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = (lo + (hi - lo) * Math.pow(t, 0.8)) * (0.95 + 0.1 * hash(i * 13 + seed));
    c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
function blobs(parts: number[][], detail: number) {
  // leafy, lumpy crowns: each part is a sphere pushed in and out a little (smooth normals), like the clay-style art
  const geos = parts.map(([x, y, z, r], pi) => {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
    const p = g.attributes.position as THREE.BufferAttribute; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const n = v.clone().normalize();
      const k = 0.5 * Math.sin(5.1 * n.x + 2.3 * n.y + pi) * Math.cos(4.7 * n.z - 1.9 * n.y) + 0.3 * Math.sin(9 * n.y + 3 * n.x + pi * 2);
      v.addScaledVector(n, r * 0.14 * k); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); g.translate(x, y, z);
    return g;
  });
  const m = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  return m;
}
export function crownGeometry(low: boolean) {
  const g = low ? blobs([[0, 0, 0, 1]], 1) : blobs([[0, 0.05, 0, 0.94], [0.56, -0.18, 0.22, 0.68], [-0.52, -0.14, -0.28, 0.66]], 1);
  shadeGradient(g, 0.55, 1.02, -0.9, 1.0, 3);
  return g;
}
export function eucGeometry(low: boolean) {
  const g = low ? blobs([[0, 0.4, 0, 0.75]], 1) : blobs([[0, 0, 0, 0.7], [0.12, 0.72, 0.08, 0.58], [-0.08, 1.3, -0.05, 0.44], [0.3, 0.25, -0.2, 0.42]], 1);
  shadeGradient(g, 0.56, 1.0, -0.7, 1.7, 7);
  return g;
}
function pineGeometry() {
  const a = new THREE.ConeGeometry(0.75, 1.3, 7); a.translate(0, -0.25, 0);
  const b = new THREE.ConeGeometry(0.55, 1.1, 7); b.translate(0, 0.45, 0);
  [a, b].forEach((g) => g.deleteAttribute('uv'));
  const m = mergeGeometries([a, b], false)!;
  shadeGradient(m, 0.62, 1.05, -0.9, 1.0, 11);
  return m;
}
const PARK_TREE = ['#4aa52e', '#5fb83a', '#3b902a', '#76c443', '#52aa34', '#35852a'];
const EUC_TREE = ['#4f9a68', '#5aa676', '#438a5c', '#6ab07e', '#3f8458'];
const CITY_TREE = ['#86c35e', '#95cc6c', '#78b654'];
const PINE = ['#2f7a4c', '#3a8a58', '#2b6c46'];
export function Trees({ d, w, density = 0.24, tint, skip, inside, low = false }: { d: GameData; w: World; density?: number; tint?: (i: number) => string | null; skip?: Set<number>; inside?: (r: number, c: number) => boolean; low?: boolean }) {
  const crowns = useRef<THREE.InstancedMesh>(null!);
  const eucs = useRef<THREE.InstancedMesh>(null!);
  const pines = useRef<THREE.InstancedMesh>(null!);
  const trunks = useRef<THREE.InstancedMesh>(null!);
  // trees inside the level-1/2 puzzle area are drawn smaller so they don't hide the water paths (display only)
  const siteSet = useMemo(() => new Set<number>((d.site?.cells ?? []).map((x: any) => x.g ?? x.r * d.grid.cols + x.c)), [d]);
  const geos = useMemo(() => ({ crown: crownGeometry(low), euc: eucGeometry(low), pine: pineGeometry() }), [low]);
  useEffect(() => () => { geos.crown.dispose(); geos.euc.dispose(); geos.pine.dispose(); }, [geos]);
  const mats = useMemo(() => ({
    crown: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.035, -1),
    euc: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 0.03, -0.8),
    pine: sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 0.02, -1),
  }), []);
  useEffect(() => () => { mats.crown.dispose(); mats.euc.dispose(); mats.pine.dispose(); }, [mats]);
  const plan = useMemo(() => {
    const out: { i: number; kind: 0 | 1 | 2 }[] = [];
    for (let i = 0; i < d.cover.length; i++) {
      if (d.cover[i] !== 6) continue;
      if (skip?.has(i)) continue;
      if (inside && !inside(Math.floor(i / d.grid.cols), i % d.grid.cols)) continue;
      const park = d.inPark[i] === 1;
      const pr = park ? density : density * 0.45;
      if (hash(i * 7 + 3) >= pr) continue;
      const u = hash(i * 29);
      out.push({ i, kind: park ? (u > 0.9 ? 2 : u > 0.5 ? 1 : 0) : 0 });
    }
    return out;
  }, [d, density, skip, inside]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const { cols } = d.grid;
    let nc = 0, ne = 0, np = 0, nt = 0;
    for (const { i, kind } of plan) {
      const r = Math.floor(i / cols), c = i % cols;
      const jx = (hash(i * 3) - 0.5) * 0.4, jz = (hash(i * 5) - 0.5) * 0.4;
      const small = siteSet.has(i) ? 0.72 : 1;
      const base = w.hAt(r + jz * 2, c + jx * 2);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i * 13) * Math.PI * 2);
      const t = tint?.(i);
      if (kind === 0) {
        const size = (0.42 + hash(i * 11) * 0.34) * small;
        const trunkH = 0.3 * size + 0.14;
        p.set(w.x(c) + jx, base + trunkH + size * 0.7, w.z(r) + jz); s.set(size, size * (0.92 + hash(i * 17) * 0.2), size);
        m.compose(p, q, s); crowns.current.setMatrixAt(nc, m);
        const pal = d.inPark[i] ? PARK_TREE : CITY_TREE;
        col.set(t ?? pal[Math.floor(hash(i * 19) * pal.length)]); crowns.current.setColorAt(nc, col); nc++;
        p.set(w.x(c) + jx, base + trunkH / 2, w.z(r) + jz); s.set(0.07, trunkH + 0.1, 0.07); m.compose(p, q, s);
        trunks.current.setMatrixAt(nt, m); col.set('#7a5c43'); trunks.current.setColorAt(nt, col); nt++;
      } else if (kind === 1) {
        const size = (0.5 + hash(i * 11) * 0.3) * small;
        const trunkH = 0.55 * size + 0.3;
        p.set(w.x(c) + jx, base + trunkH + size * 0.55, w.z(r) + jz); s.set(size, size * (1.05 + hash(i * 17) * 0.35), size);
        m.compose(p, q, s); eucs.current.setMatrixAt(ne, m);
        col.set(t ?? EUC_TREE[Math.floor(hash(i * 19) * EUC_TREE.length)]); eucs.current.setColorAt(ne, col); ne++;
        p.set(w.x(c) + jx, base + trunkH / 2, w.z(r) + jz); s.set(0.06, trunkH + 0.2, 0.06); m.compose(p, q, s);
        trunks.current.setMatrixAt(nt, m); col.set('#cbbba2'); trunks.current.setColorAt(nt, col); nt++;
      } else {
        const size = (0.45 + hash(i * 11) * 0.25) * small;
        p.set(w.x(c) + jx, base + 0.15 + size * 0.95, w.z(r) + jz); s.set(size, size * 1.2, size);
        m.compose(p, q, s); pines.current.setMatrixAt(np, m);
        col.set(t ?? PINE[Math.floor(hash(i * 31) * PINE.length)]); pines.current.setColorAt(np, col); np++;
        p.set(w.x(c) + jx, base + 0.12, w.z(r) + jz); s.set(0.07, 0.3, 0.07); m.compose(p, q, s);
        trunks.current.setMatrixAt(nt, m); col.set('#6b4f3a'); trunks.current.setColorAt(nt, col); nt++;
      }
    }
    const fin = (im: THREE.InstancedMesh, n: number) => { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); };
    fin(crowns.current, nc); fin(eucs.current, ne); fin(pines.current, np); fin(trunks.current, nt);
  }, [plan, d, w, tint, siteSet]);
  const N = Math.max(1, plan.length);
  return (
    <group>
      <instancedMesh ref={crowns} args={[geos.crown, mats.crown, N]} castShadow receiveShadow />
      <instancedMesh ref={eucs} args={[geos.euc, mats.euc, N]} castShadow receiveShadow />
      <instancedMesh ref={pines} args={[geos.pine, mats.pine, N]} castShadow receiveShadow />
      <instancedMesh ref={trunks} args={[undefined, undefined, N]} castShadow>
        <cylinderGeometry args={[0.55, 1, 1, 6]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  );
}

// Rain: thin streaks falling inside a box; intensity 0..1 (from the hour's real rain depth)
export function Rain({ center, size = 40, intensity, reduceMotion, max = 1400, height = 26 }: { center: [number, number, number]; size?: number; intensity: number; reduceMotion: boolean; max?: number; height?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const MAX = max;
  const seeds = useMemo(() => Array.from({ length: MAX }, (_, k) => [hash(k * 3 + 1), hash(k * 5 + 2), hash(k * 7 + 3)]), [MAX]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(0.025, 0.7, 0.025), p: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const n = Math.round(MAX * Math.min(1, intensity));
    const t = clock.getElapsedTime();
    const H = height;
    for (let k = 0; k < MAX; k++) {
      const [a, b, c] = seeds[k];
      if (k >= n) { tmp.s.set(0, 0, 0); } else { tmp.s.set(0.03, reduceMotion ? 0.25 : 0.8, 0.03); }
      const fall = reduceMotion ? 0 : (t * (18 + c * 6) + c * H) % H;
      tmp.p.set(center[0] + (a - 0.5) * size, center[1] + H - fall, center[2] + (b - 0.5) * size);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      ref.current.setMatrixAt(k, tmp.m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#cfe8ff" transparent opacity={0.55} />
    </instancedMesh>
  );
}
