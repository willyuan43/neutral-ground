// Level-3 overlay: one flat tile per 5 m cell in the touched classes, coloured by the model state and the season.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GameData } from '../data/load';
import * as THREE from 'three';
import type { World } from './world';
import type { CellLook, SlopeCells } from '../levels/slopeDisplay';
import { hash } from './Terrain';

const LOOK_RGB: Record<CellLook, [number, number, number]> = {
  grass: [200, 190, 100], seedling: [150, 200, 110], establishing: [120, 196, 92], native: [88, 176, 84], bare: [128, 88, 58], youngTree: [70, 140, 80],
  trail: [160, 112, 70], closedTrail: [150, 190, 110], euc: [64, 120, 74], removed: [150, 104, 66], willowSeed: [140, 200, 140], willow: [96, 170, 120],
};

/** wet = 0..1 (soil wetness of the grass column that day); turns golden grass green in the wet season. */
export function lookColor(look: CellLook, wet: number, storm: number, k: number): [number, number, number] {
  let [r, g, b] = LOOK_RGB[look];
  if (look === 'grass' || look === 'native' || look === 'establishing' || look === 'closedTrail') {
    // dry → golden/brown, wet → green
    // planted native bunchgrass keeps living roots and stays sage-green longer into the dry season than the annual grass
    // around it (display choice so your planting reads on the island; the model tracks its area, not its colour)
    const dry: [number, number, number] = look === 'native' ? [96, 168, 70] : look === 'establishing' ? [122, 168, 80] : [214, 186, 110];
    const wetC: [number, number, number] = look === 'native' ? [54, 176, 68] : look === 'establishing' ? [78, 174, 72] : [112, 160, 86];
    r = dry[0] + (wetC[0] - dry[0]) * wet; g = dry[1] + (wetC[1] - dry[1]) * wet; b = dry[2] + (wetC[2] - dry[2]) * wet;
  }
  if (look === 'seedling') {
    // a planting bed: dark prepared soil (the sprouts on it are drawn by Sprouts); a little darker when wet.
    // Kept clearly darker than bare soil, which is the mid-brown 'bare' colour.
    const dryS = [92, 62, 38], wetS = [70, 48, 32];
    r = dryS[0] + (wetS[0] - dryS[0]) * wet; g = dryS[1] + (wetS[1] - dryS[1]) * wet; b = dryS[2] + (wetS[2] - dryS[2]) * wet;
  } else if (look === 'willowSeed') {
    // seedlings wilt (paler) when stressed
    const f = 0.55 + 0.45 * wet; r = 150 * f + 120 * (1 - f); g = 200 * f + 150 * (1 - f); b = 110 * f + 90 * (1 - f);
  }
  if ((look === 'bare' || look === 'trail' || look === 'removed') && storm > 0) {
    // storm wash: darker, streaky
    const s = 0.75 + 0.25 * Math.sin(k * 1.7);
    r *= s; g *= s * 0.95; b *= s * 0.9;
  }
  const n = 0.92 + hash(k) * 0.16;
  return [r * n, g * n, b * n];
}

export function SlopeOverlay({ w, cells, looks, wet, storm }: { w: World; cells: SlopeCells[]; looks: Map<number, CellLook>; wet: number; storm: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const shown = useMemo(() => cells.filter((x) => looks.has(x.g)), [cells, looks]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.5, 0.03, 0.5), p = new THREE.Vector3();
    shown.forEach((x, k) => { p.set(w.x(x.c), w.hAt(x.r, x.c) + 0.05, w.z(x.r)); m.compose(p, q, s); ref.current.setMatrixAt(k, m); });
    ref.current.count = shown.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [shown, w]);
  useLayoutEffect(() => {
    const col = new THREE.Color();
    shown.forEach((x, k) => {
      const [r, g, b] = lookColor(looks.get(x.g)!, wet, storm, x.g);
      col.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
      ref.current.setColorAt(k, col);
    });
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [shown, looks, wet, storm]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, cells.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial flatShading roughness={1} />
    </instancedMesh>
  );
}

/** Small young trees and seedling tufts on top of the tiles. */
export function Sprouts({ w, cells, looks, wet = 0.5 }: { w: World; cells: SlopeCells[]; looks: Map<number, CellLook>; wet?: number }) {
  const trees = useRef<THREE.InstancedMesh>(null!);
  const tufts = useRef<THREE.InstancedMesh>(null!);
  const tr = useMemo(() => cells.filter((x) => looks.get(x.g) === 'youngTree'), [cells, looks]);
  const tf = useMemo(() => cells.filter((x) => { const l = looks.get(x.g); return l === 'seedling' || l === 'establishing' || l === 'willowSeed' || l === 'native' || l === 'willow'; }), [cells, looks]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    tr.forEach((x, k) => { p.set(w.x(x.c), w.hAt(x.r, x.c) + 0.35, w.z(x.r)); s.set(0.35, 0.6, 0.35); m.compose(p, q, s); trees.current.setMatrixAt(k, m); });
    trees.current.count = tr.length; trees.current.instanceMatrix.needsUpdate = true;
    const col = new THREE.Color();
    // seedlings go pale (straw) when the soil is dry and bright green when it is wet
    const seedCol = new THREE.Color('#dcd58e').lerp(new THREE.Color('#b9f06a'), 0.25 + 0.75 * wet);
    const willowSeedCol = new THREE.Color('#c9d9a0').lerp(new THREE.Color('#8fe0a8'), 0.25 + 0.75 * wet);
    let n = 0;
    tf.forEach((x) => {
      const l = looks.get(x.g)!;
      const count = l === 'willowSeed' ? 2 : 3;
      for (let j = 0; j < count; j++) {
        const jx = (hash(x.g * 5 + j) - 0.5) * 0.35, jz = (hash(x.g * 9 + j) - 0.5) * 0.35;
        // big enough to read at island scale: a new planting should be visible the moment you choose it
        const hgt = l === 'seedling' || l === 'willowSeed' ? 0.3 : l === 'establishing' ? 0.36 : 0.44;
        const wid = l === 'seedling' || l === 'willowSeed' ? 0.15 : 0.16;
        p.set(w.x(x.c) + jx, w.hAt(x.r, x.c) + 0.04 + hgt / 2, w.z(x.r) + jz); s.set(wid, hgt, wid); m.compose(p, q, s);
        tufts.current.setMatrixAt(n, m);
        if (l === 'seedling') col.copy(seedCol); else if (l === 'willowSeed') col.copy(willowSeedCol); else col.set(l === 'native' ? '#5aa85a' : l === 'willow' ? '#6fbf8f' : '#8fd65e');
        tufts.current.setColorAt(n, col);
        n++;
      }
    });
    tufts.current.count = n; tufts.current.instanceMatrix.needsUpdate = true; if (tufts.current.instanceColor) tufts.current.instanceColor.needsUpdate = true;
  }, [tr, tf, w, looks, Math.round(wet * 20)]);
  return (
    <group>
      <instancedMesh ref={trees} args={[undefined, undefined, Math.max(1, cells.length)]} frustumCulled={false}>
        <coneGeometry args={[0.5, 1, 6]} />
        <meshStandardMaterial color="#3f8a4c" flatShading />
      </instancedMesh>
      <instancedMesh ref={tufts} args={[undefined, undefined, Math.max(1, cells.length * 3)]} frustumCulled={false}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
    </group>
  );
}


/** Storm-day wash: short dark streaks running downhill (D8) from bare soil, open trail and seedling cells. Display only. */
export function Rills({ w, d, cells, looks }: { w: World; d: GameData; cells: SlopeCells[]; looks: Map<number, CellLook> }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const segs = useMemo(() => {
    const out: { a: THREE.Vector3; b: THREE.Vector3; k: number }[] = [];
    const cols = d.grid.cols;
    for (const x of cells) {
      const l = looks.get(x.g);
      if (l !== 'bare' && l !== 'trail' && l !== 'removed' && l !== 'seedling' && l !== 'willowSeed') continue;
      const j = d.down[x.g]; if (j < 0) continue;
      const r2 = Math.floor(j / cols), c2 = j % cols;
      out.push({ a: new THREE.Vector3(w.x(x.c), w.hAt(x.r, x.c) + 0.09, w.z(x.r)), b: new THREE.Vector3(w.x(c2), w.hAt(r2, c2) + 0.09, w.z(r2)), k: x.g });
    }
    return out;
  }, [cells, looks, d, w]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), x = new THREE.Vector3(1, 0, 0);
    const t = clock.getElapsedTime();
    segs.forEach((g, n) => {
      const dir = new THREE.Vector3().subVectors(g.b, g.a); const len = dir.length();
      q.setFromUnitVectors(x, dir.normalize());
      const ph = ((t * 1.6 + (g.k % 7) * 0.13) % 1);
      p.lerpVectors(g.a, g.b, 0.25 + ph * 0.5);
      s.set(len * 0.6, 0.03, 0.07);
      m.compose(p, q, s); ref.current.setMatrixAt(n, m);
    });
    ref.current.count = segs.length; ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, cells.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#5a3a22" />
    </instancedMesh>
  );
}
