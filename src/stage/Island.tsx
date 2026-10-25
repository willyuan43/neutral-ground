// Island helpers kept from the first stage: the Outline type (the park island provides one), the creek ribbon and the
// boulder geometry. The island itself is the real park outline now (ParkIsland.tsx). Display only.
import { useEffect, useMemo } from 'react';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { GameData } from '../data/load';
import type { World } from './world';

export type IslandView = 'overview' | 'site' | 'slope';
export interface IslandShape { cr: number; cc: number; hr: number; hc: number; n: number; amp: number; step: number; depth: number }
export interface Outline { shape: IslandShape; rho: (th: number) => number; project: (r: number, c: number) => [number, number]; inside: (r: number, c: number) => boolean }

/** Mossy boulders: on the real rock cells (WorldCover "bare / sparse", the canyon's chert outcrops) and a few round
 *  the rim (decorative). */
export function rockGeometry() {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.16 * Math.sin(v.x * 3.1 + v.z * 1.7) * Math.cos(v.y * 2.3 - v.x * 1.1) + 0.08 * Math.sin(v.y * 7 + v.z * 5);
    v.multiplyScalar(n); v.y *= 0.72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const c = new Float32Array(p.count * 3);
  const stone = new THREE.Color('#a39889'), moss = new THREE.Color('#6fae47'), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const up = nrm.getY(i);
    const k = Math.min(1, Math.max(0, (up - 0.45) / 0.35));
    tmp.copy(stone).lerp(moss, k * 0.9);
    const sh = 0.8 + 0.25 * Math.min(1, Math.max(0, (p.getY(i) + 0.7) / 1.4));
    c[i * 3] = tmp.r * sh; c[i * 3 + 1] = tmp.g * sh; c[i * 3 + 2] = tmp.b * sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
/** Islais Creek where OpenStreetMap shows it open (culverted parts are not drawn). Gentle flowing highlight. */
export function Creek({ d, w, outline }: { d: GameData; w: World; outline: Outline }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color('#3fb0ea') }, uB: { value: new THREE.Color('#bfeeff') } },
    vertexShader: 'attribute float along; varying float vA; varying float vS; void main(){ vA = along; vS = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying float vA; varying float vS;
      void main(){ float edge = smoothstep(0.0, 0.3, vS) * smoothstep(1.0, 0.7, vS);
        float s = smoothstep(0.8, 1.0, fract(vA * 0.35 - uTime * 0.6));
        gl_FragColor = vec4(mix(uA, uB, s * 0.6 * edge), 0.92 * (0.4 + 0.6 * edge));
        #include <colorspace_fragment>
      }`,
  }), []);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.getElapsedTime(); });
  const geo = useMemo(() => {
    const lines = (d as any).creek?.lines ?? [];
    const pos: number[] = [], uv: number[] = [], along: number[] = [], idx: number[] = [];
    let base = 0;
    for (const ln of lines) {
      if (ln.culvert) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < ln.p.length; i += 2) {
        const c = ln.p[i], r = ln.p[i + 1];
        if (!outline.inside(r, c)) { if (pts.length > 1) break; else { pts.length = 0; continue; } }
        pts.push(new THREE.Vector3(w.x(c), w.hAt(r, c) + 0.08, w.z(r)));
      }
      if (pts.length < 2) continue;
      // densify so the ribbon follows the ground
      const dense: THREE.Vector3[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const n = Math.max(1, Math.ceil(pts[i].distanceTo(pts[i + 1]) / 0.5));
        for (let k = 0; k < n; k++) dense.push(new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], k / n));
      }
      dense.push(pts[pts.length - 1]);
      let acc = 0;
      for (let i = 0; i < dense.length; i++) {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
        const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.34);
        if (i > 0) acc += dense[i].distanceTo(dense[i - 1]);
        for (const sgn of [-1, 1]) {
          const p = dense[i].clone().addScaledVector(side, sgn);
          pos.push(p.x, p.y, p.z); uv.push(0, sgn < 0 ? 0 : 1); along.push(acc);
        }
        if (i > 0) { const o = base + (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      }
      base += dense.length * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('along', new THREE.BufferAttribute(new Float32Array(along), 1));
    g.setIndex(idx);
    return g;
  }, [d, w, outline]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  return <mesh geometry={geo} material={mat} renderOrder={2} />;
}

/** Grid cells within ~1 cell of the open creek line (display only: trees are not drawn on them so the water shows). */
export function creekCells(d: GameData): Set<number> {
  const out = new Set<number>();
  const { rows, cols } = d.grid;
  for (const ln of (d as any).creek?.lines ?? []) {
    if (ln.culvert) continue;
    for (let i = 0; i + 3 < ln.p.length; i += 2) {
      const c0 = ln.p[i], r0 = ln.p[i + 1], c1 = ln.p[i + 2], r1 = ln.p[i + 3];
      const n = Math.max(1, Math.ceil(Math.hypot(c1 - c0, r1 - r0) * 2));
      for (let k = 0; k <= n; k++) {
        const c = c0 + ((c1 - c0) * k) / n, r = r0 + ((r1 - r0) * k) / n;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = Math.round(r) + dr, cc = Math.round(c) + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.add(rr * cols + cc);
        }
      }
    }
  }
  return out;
}
