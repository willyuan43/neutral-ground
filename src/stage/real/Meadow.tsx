// Grass tufts on the real grassland cells (ESA WorldCover "grass"), and on the east-slope cells the level paints with
// a model state (native grass, establishing grass, the existing grass). Each tuft is two crossed cards with a
// real-looking bunchgrass picture; it turns from golden (dry) to green (wet) with the soil wetness of that day, which
// comes from the model's grass column (`wet`, 0..1). Bare soil, the open shortcut and new seedling beds get no tufts.
// Display only.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameData } from '../../data/load';
import type { World } from '../world';
import { hash } from '../Terrain';
import { wind, groundWet } from '../look';
import { artTex, cutoutDepth } from './tex';

/** What to draw on one cell: number of tufts, height (world units), and how green it is in the wet season
 *  (0 = ordinary annual grass, 1 = native bunchgrass that stays greener longer). */
export interface TuftSpec { n: number; h: number; native: number; /** planted in rows (a new planting bed) */ rows?: boolean }
export type TuftFn = (i: number) => TuftSpec | null;

const ALPHA = 0.38;

/** Toy tuft: a fan of six solid grass blades (base at y = 0, tips at y ≈ 1), coloured in the shader. */
function bladeGeometry() {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const B = 7;
  for (let k = 0; k < B; k++) {
    const a = (k / B) * Math.PI * 2 + hash(k * 7) * 0.6;
    const lean = 0.18 + hash(k * 3) * 0.22, w0 = 0.09, h = 0.72 + hash(k * 11) * 0.38;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const b = pos.length / 3;
    pos.push(-px * w0 + dx * 0.05, 0, -pz * w0 + dz * 0.05, px * w0 + dx * 0.05, 0, pz * w0 + dz * 0.05, dx * lean, h, dz * lean);
    for (let j = 0; j < 3; j++) nrm.push(dx * 0.35, 0.94, dz * 0.35);
    idx.push(b, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
function toyMeadowMaterial() {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = meadowWet; sh.uniforms.uTime = wind.uTime; sh.uniforms.uWind = wind.uWind;
    sh.vertexShader = 'attribute float aNative;\nattribute float aSeed;\nuniform float uTime;\nuniform float uWind;\nvarying float vNative;\nvarying float vSeed;\nvarying float vH;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vNative = aNative; vSeed = aSeed; vH = position.y;
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.9 + ip.z * 0.7;
        float bend = position.y * position.y;
        transformed.x += uWind * 0.1 * bend * (sin(uTime * 1.7 + ph) + 0.4 * sin(uTime * 3.3 + ph * 1.3));
        transformed.z += uWind * 0.06 * bend * sin(uTime * 1.3 + ph * 0.8);`);
    sh.fragmentShader = 'uniform float uWet;\nvarying float vNative;\nvarying float vSeed;\nvarying float vH;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          // each tuft turns green at its own wetness (a patchy change across the meadow); native grass stays greener
          float g = smoothstep(vSeed * 0.55 + 0.18 - vNative * 0.22, vSeed * 0.55 + 0.42 - vNative * 0.22, uWet);
          float force = clamp(vNative - 1.0, 0.0, 1.0);
          g = max(g, force);
          vec3 dry = mix(vec3(0.62, 0.42, 0.12), vec3(0.86, 0.66, 0.24), vSeed);
          vec3 green = mix(vec3(0.16, 0.42, 0.06), vec3(0.3, 0.6, 0.1), vSeed);
          green = mix(green, vec3(0.2, 0.56, 0.08), force * 0.6);
          vec3 c = mix(dry, green, g);
          c *= 0.5 + 0.62 * vH; // darker near the ground (ambient occlusion)
          diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'ng-meadow-toy-v1';
  return m;
}

function tuftGeometry() {
  // two crossed vertical cards, base at y = 0; normals lean up so the backs are not black
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const a = (k / 2) * Math.PI + 0.3; const dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    for (let j = 0; j < 4; j++) nrm.push(0, 1, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Shared uniform: today's soil wetness (0 dry … 1 wet), eased so colours change smoothly during a replay. */
export const meadowWet = groundWet;

function meadowMaterial() {
  const dry = artTex('tex-grass-dry.webp'), green = artTex('tex-grass-green.webp');
  const m = new THREE.MeshStandardMaterial({ map: dry, alphaTest: ALPHA, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGreen = { value: green }; sh.uniforms.uWet = meadowWet; sh.uniforms.uTime = wind.uTime; sh.uniforms.uWind = wind.uWind;
    sh.vertexShader = 'attribute float aNative;\nattribute float aSeed;\nuniform float uTime;\nuniform float uWind;\nvarying float vNative;\nvarying float vSeed;\nvarying float vH;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vNative = aNative; vSeed = aSeed; vH = position.y;
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.9 + ip.z * 0.7;
        float bend = position.y * position.y;
        transformed.x += uWind * 0.09 * bend * (sin(uTime * 1.7 + ph) + 0.4 * sin(uTime * 3.3 + ph * 1.3));
        transformed.z += uWind * 0.05 * bend * sin(uTime * 1.3 + ph * 0.8);`);
    sh.fragmentShader = 'uniform sampler2D uGreen;\nuniform float uWet;\nvarying float vNative;\nvarying float vSeed;\nvarying float vH;\n'
      + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec4 tDry = texture2D(map, vMapUv);
          vec4 tGreen = texture2D(uGreen, vMapUv);
          // a less candy green: pull the wet-season grass a little toward olive (real winter grass on the canyon)
          tGreen.rgb = mix(tGreen.rgb, vec3(dot(tGreen.rgb, vec3(0.33))) * vec3(0.96, 1.04, 0.86), 0.28);
          // each tuft turns green at its own wetness (a patchy change across the meadow); native grass stays greener
          float g = smoothstep(vSeed * 0.55 + 0.18 - vNative * 0.22, vSeed * 0.55 + 0.42 - vNative * 0.22, uWet);
          // native above 1 = living young plants that stay green whatever the weather (sprouts, establishing grass)
          float force = clamp(vNative - 1.0, 0.0, 1.0);
          g = max(g, force);
          vec4 t = mix(tDry, tGreen, g);
          t.rgb *= mix(vec3(1.0), vec3(0.93, 1.12, 0.8), force * 0.6);
          diffuseColor *= t;
          diffuseColor.rgb *= 0.62 + 0.45 * vH; // darker near the ground (ambient occlusion)
        `);
  };
  m.customProgramCacheKey = () => 'ng-meadow-v3';
  return { m, depth: cutoutDepth(dry, ALPHA) };
}

export function Meadow({ d, w, tufts, low = false, inside, version }: { d: GameData; w: World; tufts: TuftFn; low?: boolean; inside?: (r: number, c: number) => boolean; version?: string | number }) {
  const geo = useMemo(() => bladeGeometry(), []);
  const mat = useMemo(() => ({ m: toyMeadowMaterial(), depth: undefined as THREE.Material | undefined }), []);
  useEffect(() => () => { geo.dispose(); mat.m.dispose(); }, [geo, mat]);
  const ref = useRef<THREE.InstancedMesh>(null!);
  const list = useMemo(() => {
    const out: { x: number; y: number; z: number; h: number; wd: number; rot: number; native: number; seed: number }[] = [];
    const { cols } = d.grid;
    const k = low ? 0.4 : 1;
    for (let i = 0; i < d.cover.length; i++) {
      const sp = tufts(i); if (!sp || sp.n <= 0) continue;
      const r = Math.floor(i / cols), c = i % cols;
      if (inside && !inside(r, c)) continue;
      const n = Math.max(1, Math.round(sp.n * k));
      const side = Math.max(1, Math.round(Math.sqrt(n)));
      for (let j = 0; j < n; j++) {
        const u = hash(i * 13 + j * 7 + 1), v = hash(i * 17 + j * 11 + 2);
        // planting beds: neat rows (with a little wobble); everything else: scattered
        const rr = sp.rows ? r - 0.4 + ((Math.floor(j / side) + 0.5) / side) * 0.8 + (u - 0.5) * 0.06 : r + (u - 0.5) * 0.95;
        const cc = sp.rows ? c - 0.4 + (((j % side) + 0.5) / side) * 0.8 + (v - 0.5) * 0.06 : c + (v - 0.5) * 0.95;
        const h = sp.h * (0.75 + hash(i * 19 + j * 3) * 0.5);
        out.push({ x: w.x(cc), y: w.hAt(rr, cc) - 0.02, z: w.z(rr), h, wd: h * (0.8 + hash(i * 23 + j) * 0.35), rot: hash(i * 29 + j * 5) * Math.PI, native: sp.native, seed: hash(i * 31 + j * 13) });
      }
    }
    return out;
  }, [d, w, tufts, low, inside, version]);
  const attrs = useMemo(() => ({ native: new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, list.length)), 1), seed: new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, list.length)), 1) }), [list]);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((t, k) => { q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y, t.z); s.set(t.wd, t.h, t.wd); m.compose(p, q, s); im.setMatrixAt(k, m); attrs.native.array[k] = t.native; attrs.seed.array[k] = t.seed; });
    im.geometry.setAttribute('aNative', attrs.native); im.geometry.setAttribute('aSeed', attrs.seed);
    attrs.native.needsUpdate = true; attrs.seed.needsUpdate = true;
    im.count = list.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  }, [list, attrs]);
  if (!list.length) return null;
  return <instancedMesh key={list.length} ref={ref} args={[geo, mat.m, list.length]} castShadow={false} receiveShadow frustumCulled={false} />;
}
