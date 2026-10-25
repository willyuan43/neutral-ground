// Decorations you earn (a game reward only — they are not model results): good achievements put a small prop on the
// island — a trail signpost, watering cans, a rain gauge, a bench, a weather vane, a flag, a map board. They stay in this
// browser (the collection), so the island you come back to shows what you have done. Simple shapes, toy colours.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { GameData } from '../data/load';
import type { World } from './world';
import { getCollection } from '../state/collection';

export interface DecorDef { id: string; name: string; from: string; emoji: string }
/** Which achievement unlocks which decoration. */
export const DECOR: DecorDef[] = [
  { id: 'sign', name: 'Trail signpost', from: 'trail-diplomat', emoji: '🪧' },
  { id: 'cans', name: 'Watering cans', from: 'watered-through', emoji: '🪣' },
  { id: 'gauge', name: 'Rain gauge', from: 'storm-reader', emoji: '🌧️' },
  { id: 'bench', name: 'Bench in the shade', from: 'right-tree', emoji: '🪑' },
  { id: 'vane', name: 'Weather vane', from: 'forecaster', emoji: '🧭' },
  { id: 'flag', name: 'Common Ground flag', from: 'common-ground', emoji: '🏳️' },
  { id: 'board', name: 'Neighbourhood map board', from: 'explorer', emoji: '🗺️' },
];
export const decorFor = (achievements: string[]) => DECOR.filter((x) => achievements.includes(x.from));
/** Tell every island to look again (after new achievements). */
export const refreshDecor = () => { try { window.dispatchEvent(new Event('ng-decor')); } catch { /* no window */ } };

const WOOD = '#9a6a43', CREAM = '#fff4dc', TEAL = '#2f9e8f', RED = '#e4573d', GREEN = '#4aa43a', SKY = '#6fc3ff';
function M({ c, ...p }: { c: string } & any) { return <mesh castShadow receiveShadow {...p}><meshStandardMaterial color={c} roughness={0.75} /></mesh>; }

function Sign() { return <group><M c={WOOD} position={[0, 0.8, 0]}><cylinderGeometry args={[0.07, 0.08, 1.6, 8]} /></M><M c={CREAM} position={[0.35, 1.35, 0]} rotation={[0, 0, -0.06]}><boxGeometry args={[0.95, 0.34, 0.08]} /></M><M c={GREEN} position={[0.35, 1.35, 0.045]}><boxGeometry args={[0.7, 0.08, 0.02]} /></M><M c={CREAM} position={[-0.28, 1.0, 0]} rotation={[0, 0, 0.08]}><boxGeometry args={[0.7, 0.28, 0.08]} /></M></group>; }
function Cans() { return <group>{[[0, 0], [0.42, 0.18]].map(([x, z], k) => <group key={k} position={[x, 0, z]}><M c={k ? SKY : TEAL} position={[0, 0.2, 0]}><cylinderGeometry args={[0.17, 0.19, 0.4, 14]} /></M><M c={k ? SKY : TEAL} position={[0.24, 0.3, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.03, 0.04, 0.36, 8]} /></M><M c="#555" position={[0, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.02, 6, 16, Math.PI]} /></M></group>)}</group>; }
function Gauge() { return <group><M c={WOOD} position={[0, 0.6, 0]}><cylinderGeometry args={[0.06, 0.07, 1.2, 8]} /></M><mesh position={[0, 1.42, 0]} castShadow><cylinderGeometry args={[0.13, 0.11, 0.5, 16]} /><meshStandardMaterial color="#dff3ff" transparent opacity={0.75} roughness={0.15} /></mesh><M c={SKY} position={[0, 1.3, 0]}><cylinderGeometry args={[0.1, 0.1, 0.22, 16]} /></M></group>; }
function Bench() { return <group><M c={WOOD} position={[0, 0.42, 0]}><boxGeometry args={[1.5, 0.1, 0.45]} /></M><M c={WOOD} position={[0, 0.74, -0.2]} rotation={[-0.15, 0, 0]}><boxGeometry args={[1.5, 0.32, 0.07]} /></M>{[-0.62, 0.62].map((x) => <M key={x} c="#5b4636" position={[x, 0.2, 0]}><boxGeometry args={[0.08, 0.4, 0.4]} /></M>)}</group>; }
function Vane() {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.4) * 0.8; });
  return <group><M c="#4b4b4b" position={[0, 1.0, 0]}><cylinderGeometry args={[0.04, 0.05, 2.0, 8]} /></M><group ref={ref} position={[0, 1.9, 0]}><M c={RED} position={[0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.1, 0.3, 8]} /></M><M c="#4b4b4b" position={[-0.15, 0, 0]}><boxGeometry args={[0.6, 0.04, 0.04]} /></M><M c={CREAM} position={[-0.42, 0, 0]}><boxGeometry args={[0.04, 0.24, 0.3]} /></M></group></group>;
}
function Flag() {
  const ref = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => new THREE.PlaneGeometry(1.3, 0.8, 12, 4), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime(); const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3] + 0.65; p.setZ(i, Math.sin(x * 4 - t * 4) * 0.08 * x); }
    p.needsUpdate = true;
  });
  return <group><M c="#e9e2d0" position={[0, 1.5, 0]}><cylinderGeometry args={[0.05, 0.06, 3.0, 8]} /></M><mesh ref={ref} geometry={geo} position={[0.68, 2.55, 0]} castShadow><meshStandardMaterial color={GREEN} side={THREE.DoubleSide} roughness={0.8} /></mesh></group>;
}
function Board() { return <group>{[-0.55, 0.55].map((x) => <M key={x} c={WOOD} position={[x, 0.6, 0]}><cylinderGeometry args={[0.05, 0.06, 1.2, 8]} /></M>)}<M c={CREAM} position={[0, 1.15, 0.02]} rotation={[-0.2, 0, 0]}><boxGeometry args={[1.4, 0.85, 0.06]} /></M><M c="#8fd0a0" position={[-0.2, 1.17, 0.07]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.6, 0.5, 0.01]} /></M><M c={SKY} position={[0.35, 1.08, 0.07]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.35, 0.25, 0.01]} /></M></group>; }
const SHAPES: Record<string, () => JSX.Element> = { sign: Sign, cans: Cans, gauge: Gauge, bench: Bench, vane: Vane, flag: Flag, board: Board };

/** The decorations this browser has earned, on the island (scale: game pieces, like the figures). */
export function Decor({ d, w, labels = false }: { d: GameData; w: World; labels?: boolean }) {
  const [have, setHave] = useState<DecorDef[]>(() => decorFor(getCollection().achievements));
  useEffect(() => { const on = () => setHave(decorFor(getCollection().achievements)); window.addEventListener('ng-decor', on); return () => window.removeEventListener('ng-decor', on); }, []);
  const spots = useMemo(() => {
    const at = (r: number, c: number): [number, number, number] => [w.x(c), w.hAt(r, c), w.z(r)];
    const out: Record<string, [number, number, number]> = {};
    const sl = d.slope, site = d.site as any;
    const path = (sl?.trail?.path ?? []) as [number, number][];
    if (path.length) { const [r, c] = path[Math.floor(path.length * 0.3)]; out.sign = at(r, c + 3); }
    const L = sl?.labels?.[1]; if (L) out.cans = at(L.r + 3, L.c + 4);
    if (sl) { out.flag = at(sl.focus.r - 22, sl.focus.c - 4); out.board = at(sl.focus.r + 34, sl.focus.c - 16); }
    if (site?.cells?.length) {
      const cen = (idx: number[]) => { const cs = idx.map((k) => site.cells[k]).filter(Boolean); return cs.length ? [cs.reduce((s: number, x: any) => s + x.r, 0) / cs.length, cs.reduce((s: number, x: any) => s + x.c, 0) / cs.length] : null; };
      const lawn = cen(site.lawn ?? []); const roof = cen(site.roof ?? []);
      if (lawn) { out.bench = at(lawn[0] + 3, lawn[1] - 4); out.gauge = at(lawn[0] - 3, lawn[1] + 6); }
      if (roof) out.vane = at(roof[0] + 5, roof[1] + 5);
    }
    return out;
  }, [d, w]);
  if (!have.length) return null;
  return (
    <group>
      {have.filter((x) => spots[x.id]).map((x) => { const S = SHAPES[x.id]; const p = spots[x.id]; return (
        <group key={x.id} position={p} scale={1.25}>
          <S />
          {labels && <Html position={[0, 3.2, 0]} center zIndexRange={[12, 6]} style={{ pointerEvents: 'none' }}><div className="decor-tag" title="A decoration you earned (not a model result)">{x.emoji} {x.name}</div></Html>}
        </group>
      ); })}
    </group>
  );
}
