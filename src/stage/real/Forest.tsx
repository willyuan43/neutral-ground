// Realistic miniature trees on the real tree-canopy cells (ESA WorldCover; sampled — display only).
// Each crown is a cluster of leaf "cards" textured with a real-looking foliage picture (eucalyptus, coast live oak,
// Monterey cypress), lit with soft rounded normals so the crown reads as a volume; trunks are tapered cylinders.
// Glen Canyon's canopy is mostly tall blue-gum eucalyptus with oaks and some conifers — the mix below follows that
// (a display choice; the model never uses these trees). They sway a little in the wind (off with Reduce motion).
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameData } from '../../data/load';
import type { World } from '../world';
import { hash } from '../Terrain';
import { sway } from '../look';
import { artTex, cutoutDepth } from './tex';

type Clump = [number, number, number, number]; // x, y, z, radius — world units, trunk base at the origin
interface Kind { tex: string; clumps: Clump[]; center: [number, number, number]; trunkH: number; trunkR: number; bark: string; amp: number; swayBase: number }

const OAK: Kind = {
  tex: 'tex-oak.webp', center: [0, 0.85, 0], trunkH: 0.62, trunkR: 0.075, bark: '#5e4a3a', amp: 0.018, swayBase: 0.45,
  clumps: [[0, 0.86, 0, 0.46], [0.46, 0.76, 0.14, 0.36], [-0.43, 0.79, -0.12, 0.36], [0.1, 0.8, 0.46, 0.34], [-0.12, 0.76, -0.46, 0.34], [0, 1.12, 0, 0.32], [0.3, 1.0, -0.3, 0.29], [-0.28, 1.02, 0.29, 0.29]],
};
const EUC: Kind = {
  tex: 'tex-euc.webp', center: [0, 1.9, 0], trunkH: 1.6, trunkR: 0.045, bark: '#7d7466', amp: 0.014, swayBase: 1.0,
  clumps: [[0.06, 1.42, 0, 0.32], [-0.18, 1.68, 0.1, 0.35], [0.2, 1.9, -0.08, 0.33], [-0.05, 2.16, 0.05, 0.31], [0.12, 2.42, 0.04, 0.25], [-0.26, 1.96, -0.21, 0.27], [0.28, 1.6, 0.21, 0.26]],
};
const CYP: Kind = {
  tex: 'tex-cypress.webp', center: [0, 0.92, 0], trunkH: 0.45, trunkR: 0.06, bark: '#4d3c2f', amp: 0.012, swayBase: 0.4,
  clumps: [[0, 0.62, 0, 0.5], [0, 0.98, 0, 0.45], [0.26, 0.82, 0.2, 0.33], [-0.26, 0.86, -0.2, 0.33], [0, 1.34, 0, 0.32]],
};
const KINDS = [OAK, EUC, CYP];

/** Merge leaf cards for one crown shape. `cards` per clump; `seed` varies the card angles between variants. */
function crownCards(kind: Kind, cards: number, seed: number): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), off = new THREE.Vector3();
  const C = new THREE.Vector3(...kind.center);
  let base = 0;
  kind.clumps.forEach(([cx, cy, cz, r], ci) => {
    for (let k = 0; k < cards; k++) {
      const h = (j: number) => hash(seed * 977 + ci * 131 + k * 17 + j * 3);
      const yaw = (k / cards) * Math.PI + h(1) * 0.7;
      const pitch = (h(2) - 0.5) * 1.0;
      e.set(pitch, yaw, (h(3) - 0.5) * 0.6); q.setFromEuler(e);
      const s = r * (0.92 + h(4) * 0.4);
      off.set(cx + (h(5) - 0.5) * r * 0.5, cy + (h(6) - 0.5) * r * 0.35, cz + (h(7) - 0.5) * r * 0.5);
      const flip = h(8) > 0.5;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.set(a * s, b * s, 0).applyQuaternion(q).add(off);
        pos.push(v.x, v.y, v.z);
        n.copy(v).sub(C); n.y *= 0.75; if (n.lengthSq() < 1e-6) n.set(0, 1, 0); n.normalize(); n.y += 0.3; n.normalize();
        nrm.push(n.x, n.y, n.z);
        uv.push(flip ? 1 - (a + 1) / 2 : (a + 1) / 2, (b + 1) / 2);
        // baked shade: darker low in the crown and toward its core (cheap ambient occlusion)
        const t = Math.min(1, Math.max(0, (v.y - (C.y - 0.6)) / 1.2));
        const out = Math.min(1, Math.hypot(v.x - C.x, v.z - C.z) / 0.55);
        const ao = Math.min(1.08, 0.5 + 0.38 * t + 0.2 * out);
        col.push(ao, ao, ao);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const ALPHA = 0.42;
interface Placed { i: number; kind: 0 | 1 | 2; variant: 0 | 1; x: number; y: number; z: number; s: number; sy: number; rot: number; tint: THREE.Color; city: boolean }

export function Forest({ d, w, density, tint, skip, inside, low = false }: { d: GameData; w: World; density?: number; tint?: (i: number) => string | null; skip?: Set<number>; inside?: (r: number, c: number) => boolean; low?: boolean }) {
  const cards = low ? 2 : 4;
  const geos = useMemo(() => KINDS.map((k, ki) => [crownCards(k, cards, ki * 10 + 1), crownCards(k, cards, ki * 10 + 2)]), [cards]);
  useEffect(() => () => geos.flat().forEach((g) => g.dispose()), [geos]);
  const mats = useMemo(() => KINDS.map((k) => {
    const map = artTex(k.tex);
    const m = sway(new THREE.MeshStandardMaterial({ map, alphaTest: ALPHA, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.7 }), k.amp, k.swayBase);
    return { m, depth: cutoutDepth(map, ALPHA) };
  }), []);
  useEffect(() => () => mats.forEach(({ m, depth }) => { m.dispose(); depth.dispose(); }), [mats]);
  const trunkGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.62, 1, 1, low ? 5 : 7, 1); g.translate(0, 0.5, 0); return g; }, [low]);
  useEffect(() => () => trunkGeo.dispose(), [trunkGeo]);

  const placed = useMemo(() => {
    const out: Placed[] = [];
    const { cols } = d.grid;
    const parkP = density ?? (low ? 0.13 : 0.19), cityP = parkP * 0.42;
    for (let i = 0; i < d.cover.length; i++) {
      if (d.cover[i] !== 6) continue;
      if (skip?.has(i)) continue;
      const r = Math.floor(i / cols), c = i % cols;
      if (inside && !inside(r, c)) continue;
      const park = d.inPark[i] === 1;
      if (hash(i * 7 + 3) >= (park ? parkP : cityP)) continue;
      const u = hash(i * 29);
      // Glen Canyon: mostly eucalyptus, then oaks and other broadleaf trees, a few conifers; street trees are broadleaf
      const kind: 0 | 1 | 2 = park ? (u < 0.56 ? 1 : u < 0.9 ? 0 : 2) : 0;
      const jx = (hash(i * 3) - 0.5) * 0.45, jz = (hash(i * 5) - 0.5) * 0.45;
      // crowns big enough to close into a canopy (the real park is a dense blue-gum forest), with a wide size spread
      const s = (park ? 0.98 + Math.pow(hash(i * 11), 1.4) * 0.62 : 0.6 + hash(i * 11) * 0.3) * (kind === 1 ? 1.0 : 1);
      const t = tint?.(i);
      const col = new THREE.Color();
      if (t) col.set(t).multiplyScalar(1.35);
      else {
        const v = 0.84 + hash(i * 19) * 0.3, h2 = hash(i * 23);
        // eucalyptus: blue-green to olive; oaks: warm deep green; cypress: dark blue-green (per-tree variety)
        // (the blue-gum foliage picture is pale; from above a blue-gum canopy reads as a deeper olive / blue-green)
        if (kind === 1) col.setRGB(v * (0.66 + h2 * 0.12), v * (0.8 + h2 * 0.06), v * (0.72 + (1 - h2) * 0.12));
        else if (kind === 0) col.setRGB(v * (0.98 + h2 * 0.06), v * 1.0, v * (0.78 + h2 * 0.08));
        else col.setRGB(v * 0.8, v * 0.9, v * 0.9);
        if (!park) col.multiplyScalar(1.05);
      }
      out.push({ i, kind, variant: hash(i * 37) > 0.5 ? 1 : 0, x: w.x(c) + jx, y: w.hAt(r + jz * 2, c + jx * 2) - 0.04, z: w.z(r) + jz, s, sy: s * (0.9 + hash(i * 17) * 0.22), rot: hash(i * 13) * Math.PI * 2, tint: col, city: !park });
    }
    return out;
  }, [d, w, density, tint, skip, inside, low]);

  const crownRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const trunkRef = useRef<THREE.InstancedMesh>(null!);
  const groups = useMemo(() => { const g: Placed[][] = [[], [], [], [], [], []]; for (const p of placed) g[p.kind * 2 + p.variant].push(p); return g; }, [placed]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    groups.forEach((list, gi) => {
      const im = crownRefs.current[gi]; if (!im) return;
      list.forEach((t, k) => { q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y, t.z); s.set(t.s, t.sy, t.s); m.compose(p, q, s); im.setMatrixAt(k, m); im.setColorAt(k, t.tint); });
      im.count = list.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    });
    const tr = trunkRef.current; const bark = KINDS.map((k) => new THREE.Color(k.bark)); const c = new THREE.Color();
    placed.forEach((t, k) => {
      const K = KINDS[t.kind];
      q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y, t.z); s.set(K.trunkR * t.s, K.trunkH * t.sy, K.trunkR * t.s); m.compose(p, q, s);
      tr.setMatrixAt(k, m); c.copy(bark[t.kind]).multiplyScalar(0.85 + hash(t.i * 41) * 0.3); tr.setColorAt(k, c);
    });
    tr.count = placed.length; tr.instanceMatrix.needsUpdate = true; if (tr.instanceColor) tr.instanceColor.needsUpdate = true; tr.computeBoundingSphere();
  }, [groups, placed]);

  return (
    <group>
      {groups.map((list, gi) => {
        const kind = Math.floor(gi / 2), variant = gi % 2;
        return (
          <instancedMesh key={`${gi}-${cards}`} ref={(el) => { crownRefs.current[gi] = el; }} args={[geos[kind][variant], mats[kind].m, Math.max(1, list.length)]}
            customDepthMaterial={mats[kind].depth} castShadow={!low} receiveShadow frustumCulled={false} />
        );
      })}
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, Math.max(1, placed.length)]} castShadow={!low} receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
