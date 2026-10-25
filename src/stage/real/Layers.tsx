// Map layers on the island (display only; each one draws real data):
// - Park boundary: Glen Canyon Park's real outline (DataSF), so the park stands out in its neighbourhood.
// - Places: real named places around it (OpenStreetMap) — the rec center, playgrounds, trails, a school, the
//   shopping center up the hill — so the park reads as part of people's everyday city.
// - Water paths: where rain runs on the ground, from the 5 m lidar (D8 flow accumulation), plus the open creek.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { GameData } from '../../data/load';
import type { World } from '../world';
import { parkBoundary } from '../ParkIsland';

export interface LayerFlags { boundary?: boolean; places?: boolean; water?: boolean; steep?: boolean }

function Segs({ segs, color, width, lift, opacity = 1, dash = 0 }: { segs: { a: THREE.Vector3; b: THREE.Vector3 }[]; color: string; width: number; lift: number; opacity?: number; dash?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [color, opacity]);
  useEffect(() => () => mat.dispose(), [mat]);
  const shown = useMemo(() => (dash ? segs.filter((_, k) => k % (dash * 2) < dash) : segs), [segs, dash]);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), x = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3();
    shown.forEach((g, k) => { dir.subVectors(g.b, g.a); const len = dir.length(); q.setFromUnitVectors(x, dir.normalize()); p.lerpVectors(g.a, g.b, 0.5); p.y += lift; s.set(len + width * 0.6, width * 0.35, width); m.compose(p, q, s); im.setMatrixAt(k, m); });
    im.count = shown.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  }, [shown, lift, width]);
  if (!shown.length) return null;
  return (
    <instancedMesh key={shown.length} ref={ref} args={[undefined, mat, shown.length]} frustumCulled={false} renderOrder={3}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** Glen Canyon Park's boundary as a warm dashed line on the ground. */
export function ParkBoundaryLine({ d, w, inside }: { d: GameData; w: World; inside: (r: number, c: number) => boolean }) {
  const segs = useMemo(() => parkBoundary(d)
    .filter(([r0, c0, r1, c1]) => inside((r0 + r1) / 2, (c0 + c1) / 2))
    .map(([r0, c0, r1, c1]) => ({ a: new THREE.Vector3(w.x(c0), w.hAt(r0, c0), w.z(r0)), b: new THREE.Vector3(w.x(c1), w.hAt(r1, c1), w.z(r1)) }))
    .filter((g) => g.a.distanceTo(g.b) > 1e-3), [d, w, inside]);
  return <Segs segs={segs} color="#fff4d6" width={0.16} lift={0.14} opacity={0.95} dash={3} />;
}

/** Where rain runs on the ground: cells that gather water from many cells uphill (D8, from the lidar). */
export function WaterPaths({ d, w, inside }: { d: GameData; w: World; inside: (r: number, c: number) => boolean }) {
  const segs = useMemo(() => {
    const cols = d.grid.cols; const out: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    for (let i = 0; i < d.acc.length; i++) {
      if (d.acc[i] < 22) continue;
      const j = d.down[i]; if (j < 0) continue;
      const r = Math.floor(i / cols), c = i % cols, r2 = Math.floor(j / cols), c2 = j % cols;
      if (!inside(r, c) || !inside(r2, c2)) continue;
      out.push({ a: new THREE.Vector3(w.x(c), w.hAt(r, c), w.z(r)), b: new THREE.Vector3(w.x(c2), w.hAt(r2, c2), w.z(r2)) });
    }
    return out;
  }, [d, w, inside]);
  return <Segs segs={segs} color="#4fb3ff" width={0.13} lift={0.12} opacity={0.9} />;
}

const KIND_LABEL: Record<string, string> = { rec: 'Rec center', play: 'Playground', school: 'School', shop: 'Shops', homes: 'Homes', trail: 'Trail', water: 'Creek', peak: 'Hill', park: 'Open space', sport: 'Courts', civic: 'Academy', 'park-here': 'Park' };
const PRIORITY: Record<string, number> = { 'park-here': 0, rec: 1, water: 2, school: 3, play: 4, shop: 5, homes: 6, trail: 7, peak: 8, park: 9, sport: 10, civic: 11 };

/** Real place names (OpenStreetMap) pinned on the island. Labels that would overlap a more important one are hidden
 *  (checked a few times a second from their screen positions). `near`: only places within this many cells of `at`. */
export function PlaceLabels({ d, w, inside, near, at, max = 7 }: { d: GameData; w: World; inside: (r: number, c: number) => boolean; near?: number; at?: [number, number]; /** at most this many, most important first */ max?: number }) {
  const list = useMemo(() => {
    const seen = new Set<string>();
    return (d.places?.places ?? [])
      .filter((p) => inside(p.r, p.c) && (!near || !at || Math.hypot(p.r - at[0], p.c - at[1]) < near))
      .filter((p) => { if (seen.has(p.name)) return false; seen.add(p.name); return true; })
      .sort((a, b) => (PRIORITY[a.kind] ?? 20) - (PRIORITY[b.kind] ?? 20))
      .slice(0, max);
  }, [d, inside, near, at, max]);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const { camera, size } = useThree();
  const acc = useRef(0);
  const pts = useMemo(() => list.map((p) => new THREE.Vector3(w.x(p.c), w.hAt(p.r, p.c) + (p.kind === 'park-here' ? 6 : 1.6), w.z(p.r))), [list, w]);
  useFrame((_, dt) => {
    acc.current += dt; if (acc.current < 0.25) return; acc.current = 0;
    const boxes: [number, number, number, number][] = []; const v = new THREE.Vector3();
    list.forEach((_, k) => {
      const el = els.current[k]; if (!el) return;
      v.copy(pts[k]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
      const wdt = el.offsetWidth || 120, hgt = el.offsetHeight || 30;
      const b: [number, number, number, number] = [x - wdt / 2 - 4, y - hgt - 4, x + wdt / 2 + 4, y + 4];
      const hit = v.z > 1 || boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
      el.style.opacity = hit ? '0' : '1';
      if (!hit) boxes.push(b);
    });
  });
  return (
    <group>
      {list.map((p, k) => (
        <Html key={p.name} position={pts[k]} center zIndexRange={[18, 8]}>
          <div ref={(el) => { els.current[k] = el; }} className={`place3d k-${p.kind}`} role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); try { window.dispatchEvent(new CustomEvent('ng-place', { detail: { name: p.name, kind: p.kind, total: list.length } })); } catch { /* old browser */ } }}><i />{p.name}<small>{KIND_LABEL[p.kind] ?? ''}</small></div>
        </Html>
      ))}
    </group>
  );
}
