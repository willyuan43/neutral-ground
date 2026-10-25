import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import type { GameData } from '../data/load';
import { dataImageUrl } from '../data/load';
import { COVER_RGB, CONTEXT_RGB, World, V_EXAG, H_SCALE } from './world';

// deterministic hash for per-cell variation
export const hash = (i: number) => {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 13; x = Math.imul(x, 1274126177); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

export type CellPaint = (i: number, rgb: [number, number, number]) => [number, number, number];

/** One texel per 5 m cell, sampled with linear filtering so cover classes blend softly instead of showing square pixels.
 *  `paint` lets a level recolour cells (level 3 paints its slope states here, so they follow the ground smoothly). */
export function fillCover(data: Uint8Array, d: GameData, paint?: CellPaint, focus?: (i: number) => number) {
  const { rows, cols } = d.grid;
  for (let i = 0; i < rows * cols; i++) {
    let rgb = COVER_RGB[d.cover[i]] ?? COVER_RGB[0];
    if (paint) rgb = paint(i, rgb);
    let out: [number, number, number];
    if (d.inPark[i] === 1) out = rgb;
    else {
      // city context: pale and nearly neutral, keeping just a hint of the cover hue
      const k = 0.18;
      out = [CONTEXT_RGB[0] * (1 - k) + rgb[0] * k, CONTEXT_RGB[1] * (1 - k) + rgb[1] * k, CONTEXT_RGB[2] * (1 - k) + rgb[2] * k];
    }
    const f = focus ? focus(i) : 1;
    const o = i * 4;
    data[o] = Math.min(255, out[0] * f); data[o + 1] = Math.min(255, out[1] * f); data[o + 2] = Math.min(255, out[2] * f); data[o + 3] = 255;
  }
}
export function buildCoverTexture(d: GameData, paint?: CellPaint, focus?: (i: number) => number) {
  const { rows, cols } = d.grid;
  const data = new Uint8Array(cols * rows * 4);
  fillCover(data, d, paint, focus);
  const tex = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function useTerrainGeometry(d: GameData, w: World) {
  return useMemo(() => {
    const { rows, cols } = d.grid;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pos[i * 3] = w.x(c); pos[i * 3 + 1] = w.y(d.elev[i]); pos[i * 3 + 2] = w.z(r);
      uv[i * 2] = (c + 0.5) / cols; uv[i * 2 + 1] = (r + 0.5) / rows;
    }
    const index: number[] = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, cc = a + cols, dd = cc + 1;
      index.push(a, cc, b, b, cc, dd);
    }
    geo.setIndex(index);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  }, [d, w]);
}

/** Terrain surface: smooth lidar shading, soft cover colours with a little surface grain, and contour lines
 *  (thin every 2 m, stronger every 10 m) computed from the real elevation — the “site model” look. */
function useTerrainMaterial(d: GameData, map: THREE.Texture, contour: number) {
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uElevMin = { value: d.grid.elevMin };
      sh.uniforms.uInvV = { value: 1 / (V_EXAG * H_SCALE) };
      sh.uniforms.uContour = { value: contour };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uElevMin; uniform float uInvV; varying float vElevM; varying vec2 vXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvElevM = position.y * uInvV + uElevMin; vXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uContour; varying float vElevM; varying vec2 vXZ;
float ngHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float ngNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ngHash(i), ngHash(i + vec2(1.0, 0.0)), u.x), mix(ngHash(i + vec2(0.0, 1.0)), ngHash(i + vec2(1.0, 1.0)), u.x), u.y); }
float ngLine(float v, float px) { float w = fwidth(v); return (1.0 - smoothstep(0.0, px, abs(fract(v - 0.5) - 0.5) / max(w, 1e-5))) * (1.0 - smoothstep(0.12, 0.35, w)); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float grain = 0.6 * ngNoise(vXZ * 1.3) + 0.4 * ngNoise(vXZ * 5.0);
diffuseColor.rgb *= 0.93 + 0.14 * grain;
float cMinor = ngLine(vElevM / 2.0, 1.0) * 0.12;
float cMajor = ngLine(vElevM / 10.0, 1.3) * 0.30;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.15), max(cMinor, cMajor) * uContour);`);
      (m as any).userData.shader = sh;
    };
    m.customProgramCacheKey = () => 'ng-terrain';
    return m;
  }, [d, map]);
  useEffect(() => { const sh = (mat as any).userData.shader; if (sh) sh.uniforms.uContour.value = contour; }, [mat, contour]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

export function Terrain({ d, w, texture, aerial }: { d: GameData; w: World; texture: THREE.Texture; aerial: boolean }) {
  const geo = useTerrainGeometry(d, w);
  const naip = useLoader(THREE.TextureLoader, dataImageUrl('naip.jpg'));
  useEffect(() => { naip.colorSpace = THREE.SRGBColorSpace; naip.flipY = false; naip.anisotropy = 4; naip.needsUpdate = true; }, [naip]);
  const matModel = useTerrainMaterial(d, texture, 1);
  const matAerial = useTerrainMaterial(d, naip, 0.45);
  return (
    <group>
      <mesh geometry={geo} material={aerial ? matAerial : matModel} receiveShadow castShadow={false} />
      <Base d={d} w={w} />
    </group>
  );
}

/** The cut edge of the model: soil strata on the sides (decorative bands, not measured depths) and a dark plinth
 *  with a label plate, so the park reads as a physical site model rather than an endless world. */
const STRATA: [number, string][] = [[0, '#4a3b2d'], [0.22, '#4a3b2d'], [0.26, '#8a6c50'], [1.25, '#9a7d5e'], [1.3, '#b7a78d'], [99, '#a89a82']];
const BASE_Y = -4.2;
function Base({ d, w }: { d: GameData; w: World }) {
  const geo = useMemo(() => {
    const { rows, cols } = d.grid;
    const edge: [number, number][] = [];
    for (let c = 0; c < cols; c++) edge.push([0, c]);
    for (let r = 0; r < rows; r++) edge.push([r, cols - 1]);
    for (let c = cols - 1; c >= 0; c--) edge.push([rows - 1, c]);
    for (let r = rows - 1; r >= 0; r--) edge.push([r, 0]);
    const pos: number[] = [], col: number[] = [];
    const cc = new THREE.Color();
    const level = (top: number, k: number) => (k === STRATA.length - 1 ? BASE_Y : Math.max(BASE_Y, top - STRATA[k][0]));
    for (let e = 0; e < edge.length - 1; e++) {
      const [r0, c0] = edge[e], [r1, c1] = edge[e + 1];
      const x0 = w.x(c0), z0 = w.z(r0), t0 = w.h(r0, c0), x1 = w.x(c1), z1 = w.z(r1), t1 = w.h(r1, c1);
      for (let k = 0; k < STRATA.length - 1; k++) {
        const a0 = level(t0, k), b0 = level(t0, k + 1), a1 = level(t1, k), b1 = level(t1, k + 1);
        const ca = cc.set(STRATA[k][1]).clone(), cb = cc.set(STRATA[k + 1][1]).clone();
        const quad = [[x0, a0, z0, ca], [x0, b0, z0, cb], [x1, a1, z1, ca], [x1, a1, z1, ca], [x0, b0, z0, cb], [x1, b1, z1, cb]] as const;
        for (const [x, y, z, c] of quad) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.computeVertexNormals();
    return g;
  }, [d, w]);
  const label = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#1f2a31'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#e9e2d0';
    ctx.font = '600 52px Inter, system-ui, sans-serif';
    const ctr = d.storms?.center;
    const t = `GLEN CANYON PARK  ·  SAN FRANCISCO${ctr ? `  ·  ${ctr.lat.toFixed(3)}° N  ${Math.abs(ctr.lon).toFixed(3)}° W` : ''}`;
    ctx.fillText(t, 40, 62);
    ctx.font = '400 34px Inter, system-ui, sans-serif'; ctx.fillStyle = '#b9b2a2';
    ctx.fillText('Terrain: USGS 3DEP lidar, 5 m grid · heights ×1.5 · prototype model', 40, 110);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }, [d]);
  useEffect(() => () => { geo.dispose(); label.dispose(); }, [geo, label]);
  const W = w.width, D = w.depth;
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={1} />
      </mesh>
      {/* plinth */}
      <mesh position={[0, BASE_Y - 0.9, 0]} receiveShadow>
        <boxGeometry args={[W + 3, 1.8, D + 3]} />
        <meshStandardMaterial color="#26323a" roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh position={[0, BASE_Y - 0.9, D / 2 + 1.51]}>
        <planeGeometry args={[Math.min(W * 0.8, 64), 4]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  );
}
