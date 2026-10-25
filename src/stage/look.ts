// Shared "game look" helpers (display only — nothing here feeds the model).
// - The real NAIP 2024 aerial photo (0.7 m pixels) is used as surface DETAIL under the stylised colours:
//   only its fine light/dark pattern (tree crowns, paths, field lines) shows through, not its colours.
// - Vegetation sways a little in the wind (off with Reduce motion).
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { dataImageUrl } from '../data/load';

let naipTex: THREE.Texture | null = null;
let naipPromise: Promise<THREE.Texture> | null = null;
export function loadNaip(): Promise<THREE.Texture> {
  if (naipTex) return Promise.resolve(naipTex);
  if (!naipPromise) {
    naipPromise = new Promise((res, rej) => new THREE.TextureLoader().load(dataImageUrl('naip.jpg'), (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true; naipTex = t; res(t);
    }, undefined, rej));
  }
  return naipPromise;
}
/** The aerial photo texture, or null until it has loaded (the island draws without it first). */
export function useNaip(): THREE.Texture | null {
  const [t, setT] = useState<THREE.Texture | null>(naipTex);
  useEffect(() => { let on = true; if (!naipTex) loadNaip().then((x) => { if (on) setT(x); }).catch(() => {}); return () => { on = false; }; }, []);
  return t;
}

// ------------------------------------------------------------------ wind
export const wind = { uTime: { value: 0 }, uWind: { value: 1 } };
/** Today's soil wetness on the grass (0 dry … 1 wet), eased; the meadow tufts and the toy ground both follow it. */
export const groundWet = { value: 0.5 };
/** Advances the shared wind clock (one per canvas). `still` = Reduce motion: no sway. */
export function WindClock({ still }: { still: boolean }) {
  useFrame((_, dt) => { if (!still) wind.uTime.value += Math.min(dt, 0.1); wind.uWind.value = still ? 0 : 1; });
  return null;
}
/** Sway the upper part of a (usually instanced) vegetation mesh. `amp` = sideways offset per unit of local height. */
export function sway<T extends THREE.Material>(m: T, amp = 0.06, base = 0): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uWind = wind.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swIp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 swIp = vec3(0.0);
      #endif
      float swH = max(0.0, position.y - (${base.toFixed(3)}));
      float swPh = swIp.x * 0.37 + swIp.z * 0.23;
      transformed.x += uWind * ${amp.toFixed(4)} * swH * (sin(uTime * 1.3 + swPh) + 0.35 * sin(uTime * 2.9 + swPh * 1.7));
      transformed.z += uWind * ${(amp * 0.6).toFixed(4)} * swH * sin(uTime * 1.05 + swPh * 1.3);`);
  };
  m.customProgramCacheKey = () => `sway-${amp}-${base}`;
  return m;
}

// ------------------------------------------------------------------ terrain material
/**
 * Island surface: per-face land-cover colours (set by the level, often from model states) with the aerial photo's
 * fine detail multiplied in. Attribute `detailW` (0..1) sets how much detail a face gets (low on cells whose colour
 * shows a model state, so the photo never competes with the model). Attribute `cityW` (0..1) marks the city around the
 * park, which gets a soft, pale version of the photo itself so real streets and blocks read at a glance.
 */
export function terrainMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.55 });
  const u = { uNaip: { value: null as THREE.Texture | null }, uHas: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNaip = u.uNaip; sh.uniforms.uHas = u.uHas; sh.uniforms.uWet = groundWet;
    sh.vertexShader = 'attribute float detailW;\nattribute float cityW;\nattribute float stateW;\nvarying float vDetailW;\nvarying float vCityW;\nvarying float vStateW;\nvarying vec2 vAUv;\nvarying vec3 vNgP;\nvarying vec3 vNgN;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDetailW = detailW; vCityW = cityW; vStateW = stateW; vAUv = uv; vNgP = position; vNgN = normal;');
    sh.fragmentShader = 'uniform sampler2D uNaip;\nuniform float uHas;\nuniform float uWet;\nvarying float vDetailW;\nvarying float vCityW;\nvarying float vStateW;\nvarying vec2 vAUv;\nvarying vec3 vNgP;\nvarying vec3 vNgN;\n'
      + 'float ngH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n'
      + 'float ngV(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 q = f * f * (3.0 - 2.0 * f); return mix(mix(ngH(i), ngH(i + vec2(1.0, 0.0)), q.x), mix(ngH(i + vec2(0.0, 1.0)), ngH(i + vec2(1.0, 1.0)), q.x), q.y); }\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (uHas > 0.5) {
          vec3 aer = texture2D(uNaip, vAUv).rgb;
          diffuseColor.rgb = mix(aer, diffuseColor.rgb, vStateW);
        } else {
          // the toy look: the real land cover painted in clean colours, with a soft hand-painted mottle
          vec2 wp = vNgP.xz;
          float n1 = ngV(wp * 0.32), n2 = ngV(wp * 1.4 + 7.3), n3 = ngV(wp * 4.1 + 3.1);
          // grass cells (detailW) green up in the wet season (the model's soil wetness, same as the tufts)
          float wetK = vDetailW * smoothstep(0.22, 0.8, uWet) * (0.55 + 0.45 * n1);
          vec3 wetG = vec3(0.16, 0.36, 0.07) * (0.86 + 0.28 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, wetG, wetK * 0.8);
          diffuseColor.rgb *= 0.9 + 0.12 * n1 + 0.05 * n2 + 0.03 * n3;
          // steep ground shows a little warm earth (real lidar slope)
          float steep = 1.0 - clamp(vNgN.y, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, 0.9, 0.78), smoothstep(0.25, 0.6, steep) * 0.45 * (1.0 - vCityW));
        }`);
  };
  m.customProgramCacheKey = () => 'ng-terrain-toy-v1';
  return m;
}
export function setTerrainAerial(m: THREE.MeshStandardMaterial, t: THREE.Texture | null) {
  const u = m.userData.u as { uNaip: { value: THREE.Texture | null }; uHas: { value: number } };
  u.uNaip.value = t; u.uHas.value = t ? 1 : 0;
}

// ------------------------------------------------------------------ night (the storm replay follows the real clock)
export const night = { value: 0 };
/** Walls of houses get simple window rows; at night some windows glow warm (decorative). */
export function windowMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.6 });
  // roofs show the real 2024 aerial photo of each roof (projected from above); walls get window rows
  const u = { uNaip: { value: null as THREE.Texture | null }, uHas: { value: 0 }, uMap: { value: new THREE.Vector4(1, 1, 0, 0) } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night; sh.uniforms.uNaip = u.uNaip; sh.uniforms.uHas = u.uHas; sh.uniforms.uMap = u.uMap;
    sh.vertexShader = 'attribute float hrel;\nattribute float htot;\nvarying float vHrel;\nvarying float vHtot;\nvarying vec3 vWp;\nvarying vec3 vWn;\n'
      + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vHrel = hrel; vHtot = htot; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform float uNight;\nuniform sampler2D uNaip;\nuniform float uHas;\nuniform vec4 uMap;\nvarying float vHrel;\nvarying float vHtot;\nvarying vec3 vWp;\nvarying vec3 vWn;\nfloat ngWin = 0.0; float ngLit = 0.0;\n'
      + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vWn.y > 0.8 && uHas > 0.5) {
            vec2 ruv = vec2(vWp.x * uMap.x + uMap.z, vWp.z * uMap.y + uMap.w);
            vec3 roof = texture2D(uNaip, ruv).rgb;
            float rl = dot(roof, vec3(0.2126, 0.7152, 0.0722));
            roof = mix(vec3(rl), roof, 1.15) * 1.08;
            diffuseColor.rgb = mix(diffuseColor.rgb, roof, 0.88);
          }
          if (abs(vWn.y) < 0.5 && vHrel > 0.22 && vHrel < vHtot - 0.14) {
            float u = abs(vWn.x) > abs(vWn.z) ? vWp.z : vWp.x;
            float cu = floor(u * 2.0), cv = floor((vHrel - 0.22) * 1.7);
            float fu = fract(u * 2.0), fv = fract((vHrel - 0.22) * 1.7);
            ngWin = step(0.28, fu) * step(fu, 0.72) * step(0.3, fv) * step(fv, 0.78);
            ngLit = step(0.45, fract(sin(cu * 12.9898 + cv * 78.233 + floor(vWp.y) * 3.1) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.40, 0.50), ngWin * 0.8);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.74, 0.40) * ngWin * ngLit * uNight * 1.6;');
  };
  m.customProgramCacheKey = () => 'ng-windows-v2';
  return m;
}
/** Give a building material the aerial photo for its roofs. `cols`, `rows`, `cellW` (world units per cell) map world x/z to photo uv. */
export function setRoofPhoto(m: THREE.MeshStandardMaterial, t: THREE.Texture | null, cols: number, rows: number, cellW: number) {
  const u = m.userData.u as { uNaip: { value: THREE.Texture | null }; uHas: { value: number }; uMap: { value: THREE.Vector4 } };
  u.uNaip.value = t; u.uHas.value = t ? 1 : 0;
  // world x = (c + 0.5 - cols/2) * cellW  →  u = (c + 0.5) / cols = (x / cellW + cols / 2) / cols
  u.uMap.value.set(1 / (cellW * cols), 1 / (cellW * rows), 0.5, 0.5);
}
