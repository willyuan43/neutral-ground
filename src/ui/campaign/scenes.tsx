// 3D scenes for the canyon season, built from the prototype's existing pieces (display only — every state drawn here is a
// model state: planting beds, survival, closed or rerouted shortcut, gardens and the tank filling, water reaching the drain).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState as useStateR, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { Sprout, Footprints } from 'lucide-react';
import { useFrame, useThree } from '@react-three/fiber';
import type { GameData } from '../../data/load';
import type { World } from '../../stage/world';
import { Rain } from '../../stage/Props';
import { Sprouts, Rills, lookColor } from '../../stage/SlopeOverlay';
import { FlowNetwork, CellHighlight, WaterParticles, GardenMesh, TankMesh, DrainMarker, SpotMarker, cellPos, PreviewFlow } from '../../stage/Water';
import { hash } from '../../stage/Terrain';
import { cellLooks, SlopeCells } from '../../levels/slopeDisplay';
import { A } from '../../model/assumptions';
import { GARDEN_M2, TANK_M3, StormResult } from '../../model/storm';
import { slopePlanOf, Autumns, CampaignCtx, CampaignResult, StormPrep } from '../../campaign/campaign';
import type { NpcId } from '../../campaign/campaign';
import { NPCS, type QuestState } from '../../content/npcs';
import { Characters, type CharSpec, type Act } from '../../stage/Characters';
import { Saplings, type SaplingSpot } from '../../stage/real/Saplings';
import type { TuftFn } from '../../stage/real/Meadow';

export interface SceneNpcs { states: Record<NpcId, QuestState>; onOpen: (id: NpcId | 'juno') => void;
  /** who is on the island now (default: everyone of this place) */ cast?: (NpcId | 'juno')[];
  /** what each one is doing, and what they say (a bubble over the head) */ acts?: Partial<Record<NpcId | 'juno', Act>>; says?: Partial<Record<NpcId | 'juno', ReactNode>>;
  /** who walks in now (their first appearance) */ enter?: Partial<Record<NpcId | 'juno', boolean>> }
const MARK: Record<QuestState, string> = { done: '✓', failed: '✕', atRisk: '!', onTrack: '●', open: '' };
function npcSpec(w: World, id: NpcId | 'juno', r: number, c: number, height: number, npcs: SceneNpcs): CharSpec {
  const st = id === 'juno' ? undefined : npcs.states[id];
  return { id, pos: [w.x(c), w.hAt(r, c), w.z(r)], height, color: id === 'juno' ? '#16867a' : NPCS[id].color, name: id === 'juno' ? 'Juno' : NPCS[id].name,
    mark: st ? MARK[st] : undefined, state: st, onClick: () => npcs.onOpen(id), act: npcs.acts?.[id], say: npcs.says?.[id] };
}

// ------------------------------------------------------------------ east slope
/** A button that fires once on tap and keeps firing while held (sow plot after plot). */
function HoldButton({ className, onFire, children }: { className: string; onFire: () => void; children: ReactNode }) {
  const timer = useRef<number | null>(null), fired = useRef(false), fire = useRef(onFire);
  fire.current = onFire;
  const stop = () => { if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; } };
  const start = (e: React.PointerEvent) => {
    e.stopPropagation(); fired.current = true; fire.current();
    const again = (ms: number) => { timer.current = window.setTimeout(() => { fire.current(); again(Math.max(170, ms * 0.8)); }, ms); };
    again(420);
  };
  useEffect(() => stop, []);
  return <button className={className} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onClick={(e) => { e.stopPropagation(); if (!fired.current) fire.current(); fired.current = false; }}>{children}</button>;
}

/** Choices pinned on the island itself (planning): tap the shortcut to close it, the roof to add a tank, … */
export interface PinOpt { key: string; label: ReactNode; on: boolean; onPick: () => void }
export interface WorldPick { title: ReactNode; opts: PinOpt[] }
export function PickPin({ pos, pick, along }: { pos: THREE.Vector3; pick: WorldPick; /** put the pin at the point of this line nearest the middle of the screen */ along?: THREE.Vector3[] }) {
  const { camera } = useThree();
  const [at, setAt] = useStateR<THREE.Vector3>(pos);
  const acc = useRef(1);
  useFrame((_, dt) => {
    if (!along || along.length < 2) return;
    acc.current += dt; if (acc.current < 0.5) return; acc.current = 0;
    let best = at, bd = Infinity; const v = new THREE.Vector3();
    for (const q of along) { v.copy(q).project(camera); if (v.z > 1) continue; const d = Math.hypot(v.x + 0.05, v.y - 0.12); if (d < bd) { bd = d; best = q; } }
    if (best !== at) setAt(best);
  });
  return (
    <Html center position={along ? new THREE.Vector3(at.x, at.y + 2, at.z) : pos} zIndexRange={[30, 20]}>
      <div className="pick-pin" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pick-title">{pick.title}</div>
        <div className="pick-opts">{pick.opts.map((o) => <button key={o.key} className={o.on ? 'on' : ''} onClick={(e) => { e.stopPropagation(); o.onPick(); }}>{o.label}</button>)}</div>
      </div>
    </Html>
  );
}

/** Tap-to-sow on the island (planning): the next plot the selected card would add, and buttons pinned on the slope. */
export interface SowPin { next: { autumns: Autumns; res: CampaignResult } | null; addLabel: ReactNode; areaLabel: ReactNode; onAdd?: () => void; onRemove?: () => void }
export function useSlopeScene(a: {
  d: GameData; ctx: CampaignCtx; autumns: Autumns; res: CampaignResult; lookYear: number; after: boolean;
  playing: boolean; planning: boolean; dayIdx: number; reduceMotion: boolean; compare?: CampaignResult | null; runoff?: boolean; npcs?: SceneNpcs; sow?: SowPin | null;
  /** a choice pinned on the shortcut, or on the slope (Check First) */ pick?: { at: 'trail' | 'slope'; pick: WorldPick } | null;
  /** while a year plays: this year's new grass survival so far (model rule), shown as sparser, paler sprouts */ liveS?: number | null;
  /** while a year plays: care for your planting — a water drop to tap when it is thirsty, a sign when it is being watered */
  care?: { thirsty: boolean; watered: boolean; onWater?: () => void } | null;
  /** where the player planted (cells) */ meadowAt?: { r: number; c: number } | { r: number; c: number }[] | null;
}) {
  const slope = a.d.slope;
  const cellsAll: SlopeCells[] = useMemo(() => [...slope.classes.grassland.cells, ...slope.classes.riparian.cells], [slope]);
  const plan = useMemo(() => slopePlanOf(a.autumns), [a.autumns]);
  const looks = useMemo(() => cellLooks(slope.classes.grassland.cells, slope.classes.riparian.cells, slope.trail?.cells ?? [], plan, a.res.slope, a.lookYear, a.after, a.meadowAt),
    [slope, plan, a.res, a.lookYear, a.after, JSON.stringify(a.meadowAt ?? null)]);
  const di = Math.floor(a.dayIdx);
  const rainToday = a.playing ? a.d.weather.precipMm[di] ?? 0 : 0;
  const liveQ = a.playing && a.liveS != null ? Math.round(a.liveS * 10) / 10 : null;
  const grassCol = a.ctx.model.col('grass');
  const wet = a.planning ? 0.4 : Math.max(0, Math.min(1, 1 - grassCol.dr[di] / (A.awcMissing.value * A.grassRootM.value)));
  const wetQ = Math.round(wet * 16) / 16; // the ground colour steps (repainting every cell each replay day is heavy)
  const storm = rainToday >= A.stormDayMm.value ? 1 : 0;
  // vs Do Nothing lens (T7): cells whose model state differs from doing nothing, tinted better (green) or worse (red)
  const lens = useMemo(() => {
    if (!a.compare) return null;
    const baseLooks = cellLooks(slope.classes.grassland.cells, slope.classes.riparian.cells, slope.trail?.cells ?? [], slopePlanOf([{}, {}, {}]), a.compare.slope, a.lookYear, a.after);
    const rank: Record<string, number> = { bare: 0, trail: 0, removed: 0, seedling: 1, willowSeed: 1, youngTree: 1, grass: 2, closedTrail: 2, establishing: 2, euc: 2, native: 3, willow: 3 };
    const m = new Map<number, 'better' | 'worse'>();
    looks.forEach((l, g) => { const b = baseLooks.get(g); if (!b || b === l) return; const dv = (rank[l] ?? 2) - (rank[b] ?? 2); if (l === 'youngTree' && b === 'grass') m.set(g, 'worse'); else if (dv > 0) m.set(g, 'better'); else if (dv < 0) m.set(g, 'worse'); });
    return m;
  }, [a.compare, looks, slope, a.lookYear, a.after]);
  // Runoff & Slope lens (T17): slope steepness factor from the 5 m lidar (LS), and D8 flow lines where water gathers
  const lsOf = useMemo(() => { const m = new Map<number, number>(); for (const c of cellsAll) m.set(c.g, c.ls); return m; }, [cellsAll]);
  const paint = useCallback((i: number, rgb: [number, number, number]): [number, number, number] => {
    if (a.runoff) {
      const ls = lsOf.get(i);
      if (ls == null) { const gr = (rgb[0] + rgb[1] + rgb[2]) / 3; return [gr * 0.75 + 40, gr * 0.75 + 40, gr * 0.75 + 40]; }
      const t = Math.max(0, Math.min(1, ls / 20)); // 0 = flat, ≥ 20 = steep
      return [250 - 40 * t, 236 - 150 * t, 170 - 120 * t];
    }
    if (lens) { const v = lens.get(i); if (v === 'better') return [64, 190, 120]; if (v === 'worse') return [226, 84, 96]; const l = looks.get(i); const c = l ? lookColor(l, wetQ, storm, i) : rgb; const gr = (c[0] + c[1] + c[2]) / 3; return [gr * 0.9 + 20, gr * 0.9 + 20, gr * 0.9 + 20]; }
    const l = looks.get(i);
    if (l === 'seedling' && liveQ != null && liveQ < 0.85) { const c = lookColor(l, wetQ, storm, i), t = Math.min(1, (0.85 - liveQ) / 0.75) * 0.7; return [c[0] + (178 - c[0]) * t, c[1] + (150 - c[1]) * t, c[2] + (104 - c[2]) * t]; }
    return l ? lookColor(l, wetQ, storm, i) : rgb;
  }, [looks, wetQ, storm, lens, a.runoff, lsOf, liveQ]);
  // where the neighbours stand: open grassland cells near their concern (display only); no trees drawn right around them
  const standeeSpots = useMemo(() => {
    const grass = slope.classes.grassland.cells.filter((x: SlopeCells) => x.cover === 4);
    const near = (r: number, c: number) => grass.reduce((b: SlopeCells | null, x: SlopeCells) => (!b || Math.hypot(x.r - r, x.c - c) < Math.hypot(b.r - r, b.c - c) ? x : b), null);
    const L = (slope.labels ?? [])[1]; const path = slope.trail?.path ?? [];
    const out: { id: 'maya' | 'leo' | 'juno'; r: number; c: number }[] = [];
    // Maya just uphill (north) of where the planting starts, so she never stands on the new beds
    const m = L ? near(L.r - 15, L.c - 9) : null; if (m) out.push({ id: 'maya', r: m.r, c: m.c });
    // Leo waits on the shortcut where it passes closest to the slope's middle (a short walk from your meadow)
    const ti = !path.length ? -1 : L ? path.reduce((bi: number, p: [number, number], i: number) => (Math.hypot(p[0] - L.r, p[1] - L.c) < Math.hypot(path[bi][0] - L.r, path[bi][1] - L.c) ? i : bi), 0) : Math.floor(path.length * 0.6);
    const t = ti >= 0 ? path[ti] : null; const l = t ? near(t[0], t[1] - 4) : null; if (l) out.push({ id: 'leo', r: l.r, c: l.c - 2 });
    // Juno at the foot of the slope, on a park path
    const cols = a.d.grid.cols; let best = -1, bd = 1e9;
    for (let i = 0; i < a.d.cover.length; i++) { if (a.d.cover[i] !== 2 || a.d.inPark[i] !== 1) continue; const r = Math.floor(i / cols), c = i % cols; const dd = Math.hypot(r - (slope.focus.r + 30), c - (slope.focus.c - 12)); if (dd < bd) { bd = dd; best = i; } }
    if (best >= 0) out.push({ id: 'juno', r: Math.floor(best / cols), c: best % cols });
    return out;
  }, [slope, a.d]);
  // an area label is left out when a neighbour's tag stands right on it (Leo stands in MA-1b, next to the shortcut's own
  // label), so tags never overlap; with the neighbours hidden (Runoff lens) every label shows
  const labelSpots = useMemo<{ text: string; r: number; c: number }[]>(() => (slope.labels ?? [])
    .filter((L: any) => !String(L.text).startsWith('Creek'))
    .filter((L: any) => !a.npcs || a.runoff || !standeeSpots.some((p) => Math.hypot(L.r - p.r, L.c - p.c) < 8))
    .map((L: any) => ({ text: String(L.text).replace(/\s*·\s*MA-\w+$/i, ''), r: L.r, c: L.c })), [slope, standeeSpots, a.npcs, a.runoff]);
  const removed = useMemo(() => {
    const s = new Set<number>(); looks.forEach((v, g) => { if (v === 'removed' || v === 'willowSeed' || v === 'willow') s.add(g); });
    const cols = a.d.grid.cols;
    for (const p of standeeSpots) for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) s.add((p.r + dr) * cols + p.c + dc);
    return s;
  }, [looks, standeeSpots, a.d]);
  const trailState = a.res.trail;
  // where the planting is (any planted state): outlined after a year, and the closer camera while a year plays
  const plantedCells = useMemo(() => cellsAll.filter((x) => { const l = looks.get(x.g); return l === 'seedling' || l === 'youngTree' || l === 'establishing' || l === 'native' || l === 'bare'; }), [cellsAll, looks]);
  const plantedAt = useMemo(() => {
    const n = plantedCells.length; if (!n) return null;
    return { r: plantedCells.reduce((s, x) => s + x.r, 0) / n, c: plantedCells.reduce((s, x) => s + x.c, 0) / n, n };
  }, [plantedCells]);
  // tap-to-sow: the cells the next plot would fill (same planting order as the model display), and this autumn's beds
  const sowNext = a.sow?.next ?? null;
  const ghostCells = useMemo(() => {
    if (!sowNext) return [] as SlopeCells[];
    const hl = cellLooks(slope.classes.grassland.cells, slope.classes.riparian.cells, slope.trail?.cells ?? [], slopePlanOf(sowNext.autumns), sowNext.res.slope, a.lookYear, a.after, a.meadowAt);
    return cellsAll.filter((x) => { const l = hl.get(x.g); return (l === 'seedling' || l === 'youngTree') && looks.get(x.g) !== l; });
  }, [sowNext, slope, cellsAll, looks, a.lookYear, a.after]);
  const bedCells = useMemo(() => cellsAll.filter((x) => { const l = looks.get(x.g); return l === 'seedling' || l === 'youngTree' || l === 'willowSeed'; }), [cellsAll, looks]);
  const pinCells = ghostCells.length ? ghostCells : bedCells;
  // a little burst of seed where a plot was just sown (planning only; display)
  const prevBeds = useRef<Set<number>>(new Set());
  const [burst, setBurst] = useStateR<{ r: number; c: number; k: number } | null>(null);
  useEffect(() => {
    const now = new Set(bedCells.map((x) => x.g));
    if (a.planning && now.size > prevBeds.current.size && prevBeds.current.size >= 0) {
      const fresh = bedCells.filter((x) => !prevBeds.current.has(x.g));
      if (fresh.length && fresh.length < 400) setBurst({ r: fresh.reduce((t, x) => t + x.r, 0) / fresh.length, c: fresh.reduce((t, x) => t + x.c, 0) / fresh.length, k: Date.now() });
    }
    prevBeds.current = now;
  }, [bedCells, a.planning]);
  const pinAt = pinCells.length ? { r: pinCells.reduce((s, x) => s + x.r, 0) / pinCells.length, c: pinCells.reduce((s, x) => s + x.c, 0) / pinCells.length } : null;
  // grass tufts follow the model state of each slope cell (native bunchgrass, establishing, seedling rows, the existing
  // grass); bare soil and the open shortcut get none
  const tufts = useCallback<TuftFn>((i) => {
    const l = looks.get(i);
    if (l) {
      if (l === 'native') return { n: 9, h: 0.64, native: 1.5 };
      if (l === 'establishing') return { n: 8, h: 0.46, native: 1.6 };
      if (l === 'grass') return { n: 4, h: 0.4, native: 0 };
      if (l === 'closedTrail') return { n: 2, h: 0.24, native: 0.4 };
      // young sprouts: bright green while they live; as the model's survival so far falls, fewer of them, and the rest
      // fade to straw (display of the model's survival share, not a count of plants)
      if (l === 'seedling') { const hl = liveQ != null ? Math.min(1, liveQ / 0.85) : 1; return { n: Math.max(1, Math.round(9 * hl)), h: 0.26 + 0.2 * hl, native: hl > 0.5 ? 1 + hl : 0.2, rows: true }; }
      return null;
    }
    const cv = a.d.cover[i];
    return cv === 4 ? { n: 4, h: 0.4, native: 0 } : cv === 5 ? { n: 2, h: 0.34, native: 0.3 } : null;
  }, [looks, a.d, liveQ]);
  const saplingSpots = useCallback((w: World): SaplingSpot[] => cellsAll.filter((x) => { const l = looks.get(x.g); return l === 'youngTree' || l === 'willowSeed' || l === 'willow'; })
    .map((x) => { const l = looks.get(x.g); const jx = (hash(x.g * 3) - 0.5) * 0.25, jz = (hash(x.g * 5) - 0.5) * 0.25; return { x: w.x(x.c + jx), y: w.hAt(x.r + jz, x.c + jx), z: w.z(x.r + jz), h: l === 'willow' ? 1.1 : l === 'willowSeed' ? 0.5 : 0.85, seed: hash(x.g * 7) }; }), [cellsAll, looks]);
  const stage = useCallback((w: World) => (
    <group>
      <Saplings spots={saplingSpots(w)} />
      {storm === 1 && a.playing && <Rills w={w} d={a.d} cells={cellsAll} looks={looks} />}
      {labelSpots.filter((L) => !(a.planning && a.sow && pinAt && Math.hypot(L.r - pinAt.r, L.c - pinAt.c) < 10) && !(!a.planning && plantedAt && Math.hypot(L.r - plantedAt.r, L.c - plantedAt.c) < 12)).map((L) => <Html key={L.text} center position={[w.x(L.c), w.hAt(L.r, L.c) + 3.2, w.z(L.r)]} zIndexRange={[20, 10]}><div className="label3d ico"><Sprout />{L.text}</div></Html>)}
      {a.planning && burst && !a.reduceMotion && <SeedBurst key={burst.k} pos={new THREE.Vector3(w.x(burst.c), w.hAt(burst.r, burst.c) + 0.3, w.z(burst.r))} />}
      {a.planning && a.sow && ghostCells.length > 0 && <BedOutline w={w} d={a.d} cells={ghostCells} reduceMotion={a.reduceMotion} color="#ffffff" dashed />}
      {a.planning && a.sow && pinAt && (
        <Html center position={[w.x(pinAt.c), w.hAt(pinAt.r, pinAt.c) + 2.2, w.z(pinAt.r)]} zIndexRange={[30, 20]}>
          <div className="sow-pin">
            {a.sow.onRemove && <button className="sow-minus" onClick={(e) => { e.stopPropagation(); a.sow!.onRemove!(); }} aria-label="Remove the last plot">−</button>}
            {a.sow.onAdd ? <HoldButton className="sow-plus" onFire={() => a.sow?.onAdd?.()}><b>＋</b><span>{a.sow.addLabel}</span></HoldButton>
              : <span className="sow-full">{a.sow.areaLabel}</span>}
            {a.sow.onAdd && <span className="sow-area">{a.sow.areaLabel}</span>}
          </div>
        </Html>
      )}
      {slope.trail && (() => { const [tr0, tc] = slope.trail.path[0]; const tr = tr0 + (a.npcs && !a.runoff ? 5 : 0); /* just below Leo's feet when he stands by the trail */ return <Html center position={[w.x(tc), w.hAt(tr, tc) + (a.npcs && !a.runoff ? 0.9 : 1.6), w.z(tr)]} zIndexRange={[20, 10]}><div className="label3d small ico"><Footprints />{trailState === 'rerouted' ? 'Old shortcut closed · new path' : trailState === 'closed' ? 'Closed shortcut' : 'Unofficial shortcut'}</div></Html>; })()}
      {slope.trail && trailState === 'rerouted' && <NewPath w={w} path={slope.trail.path} />}
      {slope.trail && trailState !== 'closed' && !a.runoff && (
        <Walkers pts={trailState === 'rerouted' ? newPathPoints(w, slope.trail.path) : (slope.trail.path as [number, number][]).map(([r, c]) => new THREE.Vector3(w.x(c), w.hAt(r, c) + 0.05, w.z(r)))} n={trailState === 'rerouted' ? 5 : 4} reduceMotion={a.reduceMotion} seed={trailState === 'rerouted' ? 7 : 3} />
      )}
      {a.planning && a.pick && (() => {
        if (a.pick.at === 'trail' && slope.trail) {
          const line = (slope.trail.path as [number, number][]).map(([r, c]) => new THREE.Vector3(w.x(c), w.hAt(r, c), w.z(r)));
          return <PickPin pos={line[Math.floor(line.length / 2)]} along={line} pick={a.pick.pick} />;
        }
        const L = (slope.labels ?? [])[1] ?? { r: slope.focus.r, c: slope.focus.c };
        return <PickPin pos={new THREE.Vector3(w.x(L.c + 3), w.hAt(L.r + 4, L.c + 3) + 2, w.z(L.r + 4))} pick={a.pick.pick} />;
      })()}
      {a.runoff && <FlowLines w={w} d={a.d} cells={cellsAll} />}
      {a.planning && <BedOutline w={w} d={a.d} cells={cellsAll.filter((x) => { const l = looks.get(x.g); return l === 'seedling' || l === 'youngTree' || l === 'willowSeed'; })} reduceMotion={a.reduceMotion} />}
      {!a.planning && plantedCells.length > 0 && <BedOutline w={w} d={a.d} cells={plantedCells} reduceMotion color="#9a6a3f" fence still />}
      {!a.planning && plantedCells.length > 0 && plantedAt && !a.runoff && (
        <Html center position={[w.x(plantedAt.c), w.hAt(plantedAt.r, plantedAt.c) + 1.2, w.z(plantedAt.r)]} zIndexRange={[19, 9]}>
          {a.playing && a.care?.onWater
            ? <button className={`care-pin ${a.care.thirsty ? 'thirsty' : ''}`} onClick={(e) => { e.stopPropagation(); a.care!.onWater!(); }}><span>💧</span>{a.care.thirsty ? 'Thirsty! Tap to water' : 'Water them'}</button>
            : a.playing && a.care?.watered ? <div className="label3d plant-tag watered">💧 Your planting · watered</div>
            : <div className="label3d plant-tag">Your planting</div>}
        </Html>
      )}
      {a.playing && a.care?.thirsty && !a.care.watered && plantedCells.length > 0 && <BedOutline w={w} d={a.d} cells={plantedCells} reduceMotion={a.reduceMotion} color="#ff9a3c" />}
      {a.playing && rainToday > 0.5 && <Rain center={[w.x(slope.focus.c), w.h(slope.focus.r, slope.focus.c) - 8, w.z(slope.focus.r)]} size={90} max={3000} height={34} intensity={Math.min(1, 0.1 + rainToday / 28)} reduceMotion={a.reduceMotion} />}
      {a.npcs && !a.runoff && <Characters list={standeeSpots.filter((p) => !a.npcs!.cast || a.npcs!.cast.includes(p.id)).map((p) => {
        const sp = npcSpec(w, p.id, p.r, p.c, 3.4, a.npcs!);
        // Leo comes up the shortcut the first time (from its far end)
        const path = (slope.trail?.path ?? []) as [number, number][];
        if (a.npcs!.enter?.[p.id] && path.length > 2) {
          const ends = [path[path.length - 1], path[0]]; const far = ends.reduce((b, e) => (Math.hypot(e[0] - p.r, e[1] - p.c) > Math.hypot(b[0] - p.r, b[1] - p.c) ? e : b), ends[0]);
          sp.enterFrom = [w.x(far[1]), w.hAt(far[0], far[1]), w.z(far[0])]; sp.enterS = 3.2;
        }
        return sp;
      })} still={a.reduceMotion} />}
    </group>
  ), [cellsAll, looks, wet, storm, a.playing, rainToday, slope, a.reduceMotion, trailState, a.d, a.runoff, a.npcs, standeeSpots, labelSpots, a.planning, a.sow, ghostCells, pinAt, plantedCells, plantedAt, a.pick, burst, a.care?.thirsty, a.care?.watered, !!a.care?.onWater]);
  const quiet = useCallback((i: number) => looks.has(i), [looks]);

  return { stage, paint, quiet, treeSkip: removed, mood: a.playing ? Math.min(1, rainToday / 30) : 0, rainToday, storm, looks, tufts, wet, plantedAt, spots: standeeSpots };
}

/** A short burst of seeds and leaves where a plot was just sown (display only, about a second). */
function SeedBurst({ pos }: { pos: THREE.Vector3 }) {
  const ref = useRef<THREE.Points>(null!);
  const N = 46;
  const data = useMemo(() => {
    const p = new Float32Array(N * 3), v = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const th = hash(i * 7.1) * Math.PI * 2, sp = 1.2 + hash(i * 3.3) * 2.2; v[i * 3] = Math.cos(th) * sp; v[i * 3 + 1] = 2.2 + hash(i * 5.7) * 3; v[i * 3 + 2] = Math.sin(th) * sp; }
    return { p, v };
  }, []);
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data.p, 3)); return g; }, [data]);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#c9f27a', size: 0.32, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (t0.current == null) t0.current = clock.getElapsedTime();
    const t = clock.getElapsedTime() - t0.current;
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) p.setXYZ(i, pos.x + data.v[i * 3] * t, pos.y + data.v[i * 3 + 1] * t - 6 * t * t, pos.z + data.v[i * 3 + 2] * t);
    p.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - t / 0.9);
    if (ref.current) ref.current.visible = t < 0.95;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

/** A bright outline around this autumn's new planting beds (planning only), so the choice is easy to see on the island. */
function BedOutline({ w, d, cells, reduceMotion, color = '#d6ff5c', dashed = false, still = false, fence = false }: { w: World; d: GameData; cells: SlopeCells[]; reduceMotion: boolean; color?: string; dashed?: boolean; still?: boolean; /** a low wooden edging around your plot */ fence?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const segs = useMemo(() => {
    const cols = d.grid.cols; const set = new Set(cells.map((x) => x.g)); const out: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    const P = (r: number, c: number) => new THREE.Vector3(w.x(c), w.hAt(r, c) + (fence ? 0.2 : 0.16), w.z(r));
    // a dashed outline: each cell edge drawn as a shorter piece (gaps at the corners)
    const push = (a: THREE.Vector3, b: THREE.Vector3) => { if (!dashed) { out.push({ a, b }); return; } out.push({ a: a.clone().lerp(b, 0.2), b: a.clone().lerp(b, 0.8) }); };
    for (const x of cells) {
      const { r, c } = x;
      if (!set.has(x.g - cols)) push(P(r - 0.5, c - 0.5), P(r - 0.5, c + 0.5));
      if (!set.has(x.g + cols)) push(P(r + 0.5, c - 0.5), P(r + 0.5, c + 0.5));
      if (!set.has(x.g - 1)) push(P(r - 0.5, c - 0.5), P(r + 0.5, c - 0.5));
      if (!set.has(x.g + 1)) push(P(r - 0.5, c + 0.5), P(r + 0.5, c + 0.5));
    }
    return out;
  }, [cells, d, w, dashed, fence]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), x = new THREE.Vector3(1, 0, 0);
    if (!ref.current) return;
    segs.forEach((g, k) => { const dir = new THREE.Vector3().subVectors(g.b, g.a); const len = dir.length(); q.setFromUnitVectors(x, dir.normalize()); p.lerpVectors(g.a, g.b, 0.5); s.set(len + 0.16, fence ? 0.32 : 0.1, fence ? 0.16 : 0.24); m.compose(p, q, s); ref.current.setMatrixAt(k, m); });
    ref.current.count = segs.length; ref.current.instanceMatrix.needsUpdate = true;
  }, [segs]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, toneMapped: false }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => { if (!reduceMotion && !still) mat.opacity = 0.65 + 0.35 * Math.sin(clock.getElapsedTime() * 3); else if (still) mat.opacity = 0.8; });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, Math.max(1, segs.length)]} frustumCulled={false} visible={segs.length > 0}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** D8 flow lines on the slope cells where water gathers (flow accumulation from the lidar; display of observed terrain data). */
function FlowLines({ w, d, cells }: { w: World; d: GameData; cells: SlopeCells[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const segs = useMemo(() => {
    const cols = d.grid.cols, out: { a: THREE.Vector3; b: THREE.Vector3; acc: number }[] = [];
    for (const x of cells) {
      const acc = d.acc[x.g]; if (acc < 8) continue;
      const j = d.down[x.g]; if (j < 0) continue;
      const r2 = Math.floor(j / cols), c2 = j % cols;
      out.push({ a: new THREE.Vector3(w.x(x.c), w.hAt(x.r, x.c) + 0.12, w.z(x.r)), b: new THREE.Vector3(w.x(c2), w.hAt(r2, c2) + 0.12, w.z(r2)), acc });
    }
    return out.filter((g) => g.a.distanceTo(g.b) > 1e-3);
  }, [cells, d, w]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), x = new THREE.Vector3(1, 0, 0);
    segs.forEach((g, k) => { const dir = new THREE.Vector3().subVectors(g.b, g.a); const len = dir.length(); q.setFromUnitVectors(x, dir.normalize()); p.lerpVectors(g.a, g.b, 0.5); const wd = Math.min(0.32, 0.06 + Math.log10(g.acc) * 0.08); s.set(len, 0.04, wd); m.compose(p, q, s); ref.current.setMatrixAt(k, m); });
    ref.current.count = segs.length; ref.current.instanceMatrix.needsUpdate = true;
  }, [segs]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, segs.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#2f8fe0" />
    </instancedMesh>
  );
}

/** The rerouted way down: a switchback path beside the old line (display choice — the model only knows the old line is closed). */
/** The rerouted way down: points of a switchback beside the old line (display choice). */
function newPathPoints(w: World, path: [number, number][]) {
  const pts: THREE.Vector3[] = [];
  const n = path.length;
  for (let k = 0; k < n; k++) {
    const [r, c] = path[k];
    const [r2, c2] = path[Math.min(n - 1, k + 1)];
    const dr = r2 - r, dc = c2 - c; const len = Math.hypot(dr, dc) || 1;
    const side = 2.2 + 1.6 * Math.sin(k * 0.9); // zig-zag beside the old line
    const pr = r + (-dc / len) * side, pc = c + (dr / len) * side;
    const v = new THREE.Vector3(w.x(pc), w.hAt(pr, pc) + 0.08, w.z(pr));
    if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) pts.push(v);
  }
  return pts;
}

/** People on a path, walking up and down it (display only — not a count of visitors): shows where the way down is used. */
const WALKER_COLORS = ['#e2693a', '#2f86c8', '#f2c14e', '#3f9a52', '#b0479a', '#ffffff', '#1f3d36', '#d2553a'];
function Walkers({ pts, n, reduceMotion, seed = 1 }: { pts: THREE.Vector3[]; n: number; reduceMotion: boolean; seed?: number }) {
  const body = useRef<THREE.InstancedMesh>(null!), head = useRef<THREE.InstancedMesh>(null!);
  const seg = useMemo(() => { const L: number[] = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + pts[k].distanceTo(pts[k - 1])); return L; }, [pts]);
  const total = seg[seg.length - 1] || 1;
  const walkers = useMemo(() => Array.from({ length: n }, (_, k) => ({ t0: hash(k * 13 + seed) * total * 2, v: 0.35 + hash(k * 7 + seed) * 0.25, side: (hash(k * 5 + seed) - 0.5) * 0.25, col: new THREE.Color(WALKER_COLORS[Math.floor(hash(k * 3 + seed) * WALKER_COLORS.length)]) })), [n, total, seed]);
  const at = (d: number, out: THREE.Vector3) => {
    let k = 1; while (k < seg.length - 1 && seg[k] < d) k++;
    const f = (d - seg[k - 1]) / Math.max(1e-6, seg[k] - seg[k - 1]);
    return out.lerpVectors(pts[k - 1], pts[k], Math.max(0, Math.min(1, f)));
  };
  useLayoutEffect(() => { walkers.forEach((wk, k) => { body.current?.setColorAt(k, wk.col); }); if (body.current?.instanceColor) body.current.instanceColor.needsUpdate = true; }, [walkers]);
  const m = useMemo(() => new THREE.Matrix4(), []), p = useMemo(() => new THREE.Vector3(), []), q = useMemo(() => new THREE.Quaternion(), []), one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useFrame(({ clock }) => {
    if (!body.current || !head.current || pts.length < 2) return;
    const t = reduceMotion ? 0 : clock.getElapsedTime();
    walkers.forEach((wk, k) => {
      let d = (wk.t0 + t * wk.v) % (2 * total); if (d > total) d = 2 * total - d; // there and back
      at(d, p); p.x += wk.side; p.z += wk.side * 0.6;
      const bob = reduceMotion ? 0 : Math.abs(Math.sin(t * 6 + k)) * 0.03;
      m.compose(p.clone().setY(p.y + 0.2 + bob), q, one); body.current.setMatrixAt(k, m);
      m.compose(p.clone().setY(p.y + 0.44 + bob), q, one); head.current.setMatrixAt(k, m);
    });
    body.current.instanceMatrix.needsUpdate = true; head.current.instanceMatrix.needsUpdate = true;
  });
  if (pts.length < 2 || n === 0) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, n]} castShadow frustumCulled={false}><capsuleGeometry args={[0.075, 0.24, 3, 8]} /><meshStandardMaterial roughness={0.8} /></instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, n]} castShadow frustumCulled={false}><sphereGeometry args={[0.065, 10, 8]} /><meshStandardMaterial color="#e8c4a2" roughness={0.7} /></instancedMesh>
    </group>
  );
}

function NewPath({ w, path }: { w: World; path: [number, number][] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const segs = useMemo(() => {
    const pts = newPathPoints(w, path);
    return pts.slice(0, -1).map((p, k) => ({ a: p, b: pts[k + 1] })).filter((g) => g.a.distanceTo(g.b) > 1e-3); // no zero-length pieces
  }, [w, path]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), x = new THREE.Vector3(1, 0, 0);
    segs.forEach((g, k) => { const dir = new THREE.Vector3().subVectors(g.b, g.a); const len = dir.length(); q.setFromUnitVectors(x, dir.normalize()); p.lerpVectors(g.a, g.b, 0.5); s.set(len + 0.08, 0.06, 0.3); m.compose(p, q, s); ref.current.setMatrixAt(k, m); });
    ref.current.count = segs.length; ref.current.instanceMatrix.needsUpdate = true;
  }, [segs]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, segs.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#f1d9a4" roughness={0.9} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ Rec Center
export function useSiteScene(a: {
  d: GameData; base: StormResult; result: StormResult | null; prep: StormPrep | null; hour: number;
  mode: 'build' | 'play' | 'show'; onPick?: (id: string) => void; selSpot?: string | null; hoverSpot?: string | null; setHover?: (id: string | null) => void;
  shade: { planted: number; alive: number | null }; reduceMotion: boolean; npcs?: SceneNpcs; tankPick?: WorldPick | null; /** false while planting shade trees: no water lines */ flows?: boolean;
}) {
  const site = a.d.site;
  const rain = a.d.storms.OAK.rainMm;
  const baseFlow = useMemo(() => {
    const tot = new Float32Array(site.cells.length);
    for (const ft of a.base.flowThrough) for (let k = 0; k < ft.length; k++) tot[k] += ft[k];
    return tot;
  }, [a.base, site]);
  const plan = a.prep ?? { gardens: [], tank: null };
  const stage = useCallback((w: World) => {
    const drainPos = new THREE.Vector3(w.x(site.outlet.c), w.hAt(site.outlet.r, site.outlet.c) + 0.05, w.z(site.outlet.r));
    const roofCells = site.roof.map((k) => site.cells[k]);
    const rr = roofCells.reduce((s, c) => s + c.r, 0) / roofCells.length, rc = roofCells.reduce((s, c) => s + c.c, 0) / roofCells.length;
    const roofPos = new THREE.Vector3(w.x(rc), w.hAt(rr, rc) + 1.0, w.z(rr));
    const se = roofCells.reduce((m, c) => (c.r + c.c > m.r + m.c ? c : m), roofCells[0]);
    const tankPos = new THREE.Vector3(w.x(se.c + 1.4), w.hAt(se.r + 1, se.c + 1.4), w.z(se.r + 1));
    const gardensAt = new Map<number, THREE.Vector3>();
    plan.gardens.forEach((g) => { const c = site.candidates.find((x) => x.id === g.cand); if (c) gardensAt.set(c.local, cellPos(w, site, c.local, 0.02)); });
    const h = Math.max(0, Math.floor(a.hour));
    const showRes = !!a.result && (a.mode === 'play' || a.mode === 'show');
    const hi = Math.min(h, (a.result?.hours ?? 1) - 1);
    const selCand = site.candidates.find((c) => c.id === (a.hoverSpot ?? a.selSpot));
    const catchment = (() => {
      if (!selCand || a.mode !== 'build') return [] as number[];
      const up: number[][] = site.cells.map(() => []);
      site.cells.forEach((c, k) => { if (c.down >= 0) up[c.down].push(k); });
      const out: number[] = []; const st = [selCand.local];
      while (st.length) { const x = st.pop()!; out.push(x); for (const y of up[x]) st.push(y); }
      return out;
    })();
    const rainNow = a.mode === 'play' ? (rain[h] ?? 0) : 0;
    return (
      <group>
        {a.flows !== false && <FlowNetwork w={w} site={site} weights={baseFlow} opacity={a.mode === 'play' ? 0.3 : 0.7} minWeight={0.8} />}
        {/* during the storm: this hour's water on its way to the drain (model), brighter and wider where more flows */}
        {a.mode === 'play' && a.result && (() => { const hh = Math.max(0, Math.min(Math.floor(a.hour), a.result.flowThrough.length - 1)); const ft = a.result.flowThrough[hh]; return ft ? <FlowNetwork key={`ft${hh}`} w={w} site={site} weights={ft} color="#7cc8ff" opacity={0.95} minWeight={0.05} /> : null; })()}
        {catchment.length > 0 && <CellHighlight w={w} site={site} cells={catchment} color="#63b8ff" opacity={0.35} />}
        {site.candidates.map((c) => {
          const g = plan.gardens.find((x) => x.cand === c.id);
          const pos = cellPos(w, site, c.local, 0.02);
          if (g) {
            const tr = a.result?.facilities.find((f) => f.kind === 'garden' && f.id === c.id);
            const fill = showRes && tr ? tr.storage[hi] / tr.capM3 : 0;
            const full = !!(showRes && tr && tr.fullAt !== null && a.hour >= tr.fullAt && fill > 0.98);
            return (
              <group key={c.id}>
                <GardenMesh pos={pos} areaM2={GARDEN_M2[g.size]} fill={fill} full={full} label={showRes && a.mode === 'play' ? (full ? 'Rain garden full' : `Rain garden ${Math.round(Math.min(1, fill) * 100)}%`) : showRes ? (tr?.fullAt != null ? 'Rain garden · filled up in the storm' : 'Rain garden · had room all storm') : `Rain garden ${g.size}`} />
                {a.mode === 'build' && a.onPick && <SpotMarker pos={pos} id={c.id} selected onPick={() => a.onPick!(c.id)} onHover={(on) => a.setHover?.(on ? c.id : null)} />}
              </group>
            );
          }
          return a.mode === 'build' && a.onPick ? <SpotMarker key={c.id} pos={pos} id={c.id} selected={false} onPick={() => a.onPick!(c.id)} onHover={(on) => a.setHover?.(on ? c.id : null)} /> : null;
        })}
        {plan.tank && (() => {
          const tr = a.result?.facilities.find((f) => f.kind === 'tank');
          const fill = showRes && tr ? tr.storage[hi] / tr.capM3 : a.mode === 'build' ? 0 : 0;
          return <TankMesh pos={tankPos} fill={fill} full={!!(showRes && tr && fill > 0.98)} capM3={TANK_M3[plan.tank.size]} />;
        })()}
        <ShadeTrees w={w} d={a.d} planted={a.shade.planted} alive={a.shade.alive} />
        {a.mode !== 'play' && (() => {
          // a few people on the Rec Center lawn on a dry day (display only): the field is in use
          const lawn = site.lawn.map((k: number) => site.cells[k]); if (!lawn.length) return null;
          const lr = lawn.reduce((t: number, c: any) => t + c.r, 0) / lawn.length, lc = lawn.reduce((t: number, c: any) => t + c.c, 0) / lawn.length;
          const loop = Array.from({ length: 25 }, (_, k) => { const th = (k / 24) * Math.PI * 2; const rr = lr + Math.sin(th) * 3.2, cc = lc + Math.cos(th) * 5; return new THREE.Vector3(w.x(cc), w.hAt(rr, cc) + 0.04, w.z(rr)); });
          return <Walkers pts={loop} n={6} reduceMotion={a.reduceMotion} seed={11} />;
        })()}
        {a.mode === 'build' && a.tankPick && <PickPin pos={new THREE.Vector3(tankPos.x, tankPos.y + 3.2, tankPos.z)} pick={a.tankPick} />}
        {a.shade.planted > 0 && (() => { const k = site.lawn[0]; const c = site.cells[k]; return <Html center position={[w.x(c.c), w.hAt(c.r, c.c) + 2.0, w.z(c.r)]} zIndexRange={[20, 10]}><div className="label3d small">Shade trees · {a.shade.alive != null ? `${a.shade.alive} of ${a.shade.planted} alive` : `${a.shade.planted} planted`}</div></Html>; })()}
        <DrainMarker pos={drainPos} now={showRes ? a.result!.outletNow[hi] : 0} later={showRes ? a.result!.outletLater[hi] : 0} show={showRes} />
        {a.mode === 'play' && <Rain center={[roofPos.x + 4, roofPos.y - 8, roofPos.z + 6]} size={90} max={3200} height={34} intensity={Math.min(1, 0.12 + rainNow / 9)} reduceMotion={a.reduceMotion} />}
        {a.mode === 'build' && a.flows !== false && <PreviewFlow w={w} site={site} weights={baseFlow} drainPos={drainPos} reduceMotion={a.reduceMotion} gardensAt={gardensAt} />}
        <WaterParticles w={w} site={site} result={a.result} hour={a.hour} playing={a.mode === 'play'} gardensAt={gardensAt} reduceMotion={a.reduceMotion}
          roofPiped={!plan.disconnect && !plan.tank} drainPos={drainPos} roofPos={roofPos} tankPos={plan.tank ? tankPos : null} />
        {a.npcs && (() => {
          const lawnW = ((site as any).lawnWest ?? site.lawn).map((k: number) => site.cells[k]);
          const lr = lawnW.reduce((s: number, c: any) => s + c.r, 0) / Math.max(1, lawnW.length), lc = lawnW.reduce((s: number, c: any) => s + c.c, 0) / Math.max(1, lawnW.length);
          const list: CharSpec[] = [
            npcSpec(w, 'coach', se.r + 4, se.c + 7, 2.5, a.npcs),
            npcSpec(w, 'leo', lr + 2, lc - 3, 2.5, a.npcs),
            npcSpec(w, 'chen', site.outlet.r + 7, site.outlet.c - 7, 2.5, a.npcs),
          ];
          return <Characters list={list.filter((x) => !a.npcs!.cast || a.npcs!.cast.includes(x.id))} still={a.reduceMotion} />;
        })()}
      </group>
    );
  }, [site, plan, a.result, a.hour, a.mode, baseFlow, a.selSpot, a.hoverSpot, a.reduceMotion, rain, a.shade.planted, a.shade.alive, a.d, a.npcs, a.tankPick, a.flows]);
  // the light follows the real clock of 31 Dec 2022 in San Francisco (sunrise 07:25, sunset 17:00 — NOAA solar formula):
  // overcast grey in the daylight hours, dark at night; heavier rain darkens it a little more (display only)
  const rainFrac = Math.min(1, (rain[Math.floor(a.hour)] ?? 0) / Math.max(1e-6, a.d.storms.OAK.maxHourMm));
  const night = nightAt(a.d.storms.OAK.startLocal, a.hour);
  const mood = a.mode === 'play' ? (1 - night) * (0.5 + 0.25 * rainFrac) + night * (0.93 + 0.07 * rainFrac) : 0;
  return { stage, mood, night: a.mode === 'play' ? night : 0 };
}

/** Shade trees along the lawn next to the Rec Center (positions are a display choice; the count and survival are the model's). */
function ShadeTrees({ w, d, planted, alive }: { w: World; d: GameData; planted: number; alive: number | null }) {
  const site = d.site;
  const spots = useMemo<SaplingSpot[]>(() => {
    const lawn = [...site.lawn].sort((x, y) => hash(x * 17 + 5) - hash(y * 17 + 5));
    return lawn.slice(0, Math.min(planted, lawn.length)).map((k, n) => {
      const c = site.cells[k];
      return { x: w.x(c.c + 0.3), y: w.hAt(c.r, c.c), z: w.z(c.r + 0.3), h: 1.05, dead: alive != null && n >= alive, seed: hash(k * 13) };
    });
  }, [site, planted, alive, w]);
  if (!planted) return null;
  return <Saplings spots={spots} />;
}

/** 0 = daylight, 1 = night, for an hour of the storm record (start time = end of the first hourly reading). */
export const SUNRISE_MIN = 7 * 60 + 25, SUNSET_MIN = 17 * 60;
export function nightAt(startLocal: string, hour: number) {
  const hh = Number(startLocal.slice(11, 13)), mm = Number(startLocal.slice(14, 16));
  const t = (((hh * 60 + mm - 60 + hour * 60) % 1440) + 1440) % 1440;
  const tw = 35;
  const up = Math.min(1, Math.max(0, (t - (SUNRISE_MIN - tw)) / (2 * tw)));
  const down = Math.min(1, Math.max(0, (SUNSET_MIN + tw - t) / (2 * tw)));
  return 1 - up * down;
}
