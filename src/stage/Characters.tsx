// The fictional neighbours (and Juno) as animated 3D figures on the island, like game pieces on a diorama.
// Models: Higgsfield (Meshy image-to-3D, auto-rigged) from character art made for this prototype; one shared humanoid
// skeleton, so the extra moves (wave, cheer, worried, walk, talk, plant — rigged once on one model) play on everyone.
// Display only: they stand where each neighbour's concern is; they are not people in the data.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { faceArt, artBytes, type Who } from '../ui/art';

export type Act = 'idle' | 'wave' | 'cheer' | 'worried' | 'walk' | 'talk' | 'plant';
const CLIPS: Exclude<Act, 'idle'>[] = ['wave', 'cheer', 'worried', 'walk', 'talk', 'plant'];

const loader = new GLTFLoader();
/** Parse a GLB from its bytes (no fetch of data: URLs). Its embedded textures load through <img> from blob: URLs rather
 *  than fetch + createImageBitmap, which sandboxed hosts can block: hide createImageBitmap while the parser is made. */
function parseGlb(name: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  return artBytes(name).then((buf) => new Promise<any>((resolve, reject) => {
    const g = globalThis as any; const cib = g.createImageBitmap;
    try { g.createImageBitmap = undefined; loader.parse(buf, '', resolve, reject); } catch (e) { reject(e); } finally { g.createImageBitmap = cib; }
  }));
}
const modelCache = new Map<string, Promise<{ scene: THREE.Object3D; idle: THREE.AnimationClip | null }>>();
function loadModel(id: Who) {
  if (!modelCache.has(id)) modelCache.set(id, parseGlb(`char-${id}.glb`).then((g) => ({ scene: g.scene, idle: g.animations[0] ?? null })));
  return modelCache.get(id)!;
}
interface ClipSrc { clip: THREE.AnimationClip; rest: Map<string, THREE.Quaternion>; hipsY: number }
let clipPromise: Promise<Record<string, ClipSrc>> | null = null;
function loadClips() {
  if (!clipPromise) clipPromise = Promise.all(CLIPS.map((k) => parseGlb(`anim-${k}.glb`).then((g) => {
    // the bones' rest pose in the clip's own rig: moves are re-applied relative to it on each figure
    const rest = new Map<string, THREE.Quaternion>(); let hipsY = 1;
    g.scene.traverse((o) => { rest.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o.quaternion.clone()); if (o.name === 'Hips') hipsY = o.position.y || 1; });
    return [k, { clip: g.animations[0], rest, hipsY }] as const;
  }).catch(() => [k, null] as const)))
    .then((list) => Object.fromEntries(list.filter((x) => !!x[1] && !!x[1].clip)) as Record<string, ClipSrc>);
  return clipPromise;
}
/** Start loading the figures early (title screen), so the island has them when the game starts. */
export function preloadCharacters() { (['maya', 'leo', 'coach', 'chen', 'juno'] as Who[]).forEach((id) => { loadModel(id).catch(() => {}); }); loadClips().catch(() => {}); }

/** A clip made on another rig of the same skeleton: each bone's rotation is taken relative to that rig's rest pose and put
 *  on this figure's own rest pose (rigs fitted to different bodies rest a little differently); the hips' travel is
 *  scaled to this figure's size. */
function retarget(src: ClipSrc, root: THREE.Object3D): THREE.AnimationClip {
  const tgtRest = new Map<string, THREE.Quaternion>(); let hipsY = 1;
  root.traverse((o) => { tgtRest.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o.quaternion.clone()); if (o.name === 'Hips') hipsY = o.position.y || 1; });
  const tracks: THREE.KeyframeTrack[] = [];
  const qs = new THREE.Quaternion(), qi = new THREE.Quaternion(), qv = new THREE.Quaternion();
  for (const t of src.clip.tracks) {
    const dot = t.name.lastIndexOf('.'); const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') {
      const r0 = src.rest.get(bone), r1 = tgtRest.get(bone);
      if (!r0 || !r1) { tracks.push(t); continue; }
      qi.copy(r0).invert();
      const v = new Float32Array(t.values.length);
      for (let i = 0; i < v.length; i += 4) {
        qv.fromArray(t.values as unknown as number[], i);
        qs.copy(r1).multiply(qi).multiply(qv).normalize();
        qs.toArray(v as unknown as number[], i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, t.times as unknown as number[], v as unknown as number[]));
    } else if (prop === 'position' && bone === 'Hips') {
      const k = hipsY / src.hipsY; const v = t.values.slice(); for (let i = 0; i < v.length; i++) v[i] *= k;
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times as unknown as number[], v as unknown as number[]));
    }
  }
  return new THREE.AnimationClip(src.clip.name, src.clip.duration, tracks);
}

export interface CharSpec {
  id: Who; pos: [number, number, number]; height: number; color: string; name: string; mark?: string; state?: string; onClick?: () => void;
  /** what they are doing (default: idle; worried when their quest is at risk) */ act?: Act;
  /** turn towards the camera (default) or face this yaw (radians) */ yaw?: number;
  /** a speech bubble above the head */ say?: ReactNode;
  /** hide the name tag */ noTag?: boolean;
  /** walk in from here when they first appear (world position), over `enterS` seconds */ enterFrom?: [number, number, number]; enterS?: number;
}

function Figure({ s, still, k }: { s: CharSpec; still: boolean; k: number }) {
  const [obj, setObj] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Partial<Record<Act, THREE.AnimationAction>>; scale: number } | null>(null);
  const group = useRef<THREE.Group>(null!);
  const cur = useRef<Act | null>(null);
  const { camera } = useThree();
  useEffect(() => {
    let on = true;
    Promise.all([loadModel(s.id), loadClips()]).then(([m, clips]) => {
      if (!on) return;
      const root = skClone(m.scene);
      root.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (mesh.isMesh) {
          mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && 'roughness' in mat) { mat.roughness = 0.78; mat.metalness = 0; mat.envMapIntensity = 0.9; }
        }
      });
      // size: the model's standing height → the requested height on the island (game-piece scale)
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root); const h = Math.max(1e-3, box.max.y - box.min.y);
      const scale = s.height / h;
      if ((window as any).__ngCharLog) console.log('[char]', s.id, 'h', h.toFixed(3), 'scale', scale.toFixed(3), 'clips', Object.keys(clips).join(','));
      root.position.y = -box.min.y * scale; root.scale.setScalar(scale);
      const mixer = new THREE.AnimationMixer(root);
      const actions: Partial<Record<Act, THREE.AnimationAction>> = {};
      for (const key of CLIPS) if (clips[key]) actions[key] = mixer.clipAction(retarget(clips[key], root));
      if (m.idle) actions.idle = mixer.clipAction(m.idle);
      setObj({ root, mixer, actions, scale });
    }).catch((e) => console.warn('[characters]', s.id, e));
    return () => { on = false; };
  }, [s.id, s.height]);
  const enter = useRef<{ t: number } | null>(s.enterFrom ? { t: 0 } : null);
  const [walking, setWalking] = useState(!!s.enterFrom);
  const outer = useRef<THREE.Group>(null!);
  const act: Act = walking ? 'walk' : s.act ?? (s.state === 'atRisk' || s.state === 'failed' ? 'worried' : 'idle');
  useEffect(() => {
    if (!obj) return;
    const next = obj.actions[act] ?? obj.actions.idle; if (!next) return;
    const prev = cur.current ? obj.actions[cur.current] : null;
    next.reset(); next.setEffectiveWeight(1); next.time = (k * 0.37) % Math.max(0.1, next.getClip().duration);
    next.play(); if (prev && prev !== next) prev.crossFadeTo(next, 0.35, false);
    cur.current = act;
  }, [obj, act, k]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  // keep the start point once known (the caller may drop enterFrom before the model has loaded and walked)
  const fromRef = useRef<THREE.Vector3 | null>(null);
  if (!fromRef.current && s.enterFrom) fromRef.current = new THREE.Vector3(...s.enterFrom);
  const from = fromRef.current;
  const to = useMemo(() => new THREE.Vector3(...s.pos), [s.pos[0], s.pos[1], s.pos[2]]);
  useFrame((_, dt) => {
    if (!obj) return;
    obj.mixer.update(still ? 0 : Math.min(dt, 0.1));
    let walkYaw: number | null = null;
    if (enter.current && from && outer.current) {
      const e = enter.current; e.t = Math.min(1, e.t + (still ? 1 : dt / (s.enterS ?? 3)));
      outer.current.position.lerpVectors(from, to, e.t);
      walkYaw = Math.atan2(to.x - from.x, to.z - from.z);
      if (e.t >= 1) { enter.current = null; setWalking(false); }
    }
    if (group.current) {
      let yaw = walkYaw ?? s.yaw;
      if (yaw == null) { group.current.getWorldPosition(tmp); yaw = Math.atan2(camera.position.x - tmp.x, camera.position.z - tmp.z); }
      // ease towards the yaw (shortest way round)
      let d = yaw - group.current.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      group.current.rotation.y += d * Math.min(1, dt * 4);
    }
  });
  const r = s.height * 0.2;
  const sad = s.state === 'atRisk' || s.state === 'failed';
  return (
    <group ref={outer} position={walking && from ? [from.x, from.y, from.z] : s.pos}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} onClick={(e) => { e.stopPropagation(); s.onClick?.(); }}>
        <circleGeometry args={[r * 1.15, 28]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[r * 0.95, r * 1.12, 36]} />
        <meshBasicMaterial color={s.color} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={group} onClick={(e) => { e.stopPropagation(); s.onClick?.(); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
        {obj && <primitive object={obj.root} />}
        {/* an invisible tap target the size of the figure (thin limbs are hard to hit) */}
        <mesh position={[0, s.height * 0.5, 0]} visible={false}><cylinderGeometry args={[s.height * 0.22, s.height * 0.22, s.height, 8]} /></mesh>
      </group>
      {!s.noTag && (
        <Html position={[0, s.height * 1.08 + 0.25, 0]} center zIndexRange={[25, 15]}>
          <div className="ch-tag-wrap">
            {s.say && <div className="say-bubble" style={{ ['--c' as any]: s.color }}>{s.say}</div>}
            <button className={`st-tag ${s.state ?? ''}`} style={{ ['--c' as any]: s.color }} onClick={s.onClick}>
              <span className="st-face" style={{ background: s.color }}><img src={faceArt(s.id, sad ? 'worried' : 'happy')} alt="" draggable={false} /></span>
              {s.name}<i className="st-sim" title="A fictional, simulated character">sim</i>{s.mark ? <b className="st-mark">{s.mark}</b> : null}
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

export function Characters({ list, still }: { list: CharSpec[]; still: boolean }) {
  return <group>{list.map((s, k) => <Figure key={s.id} s={s} still={still} k={k} />)}</group>;
}

/** The player's own figure: driven every frame from a ref (no React re-render while walking).
 *  Keys (WASD / arrows) move it relative to the camera; a target point (tap the ground) walks it there.
 *  `free(x, z)` says where it may stand (inside the park); `onCell` reports the cell it stands on, when it changes. */
export interface PlayerState { x: number; z: number; tx: number | null; tz: number | null; yaw: number; act: Act; actUntil: number; keys: Set<string>; moving: boolean; ready: boolean }
export function newPlayer(): PlayerState { return { x: 0, z: 0, tx: null, tz: null, yaw: 0, act: 'idle', actUntil: 0, keys: new Set(), moving: false, ready: false }; }
export function PlayerFigure({ p, id = 'juno', height, hAt, toCell, free, onCell, still, name = 'You', color = '#ff8a3d', speed = 5, pop }: {
  p: React.MutableRefObject<PlayerState>; id?: Who; height: number; hAt: (x: number, z: number) => number; toCell: (x: number, z: number) => [number, number];
  free: (x: number, z: number) => boolean; onCell?: (r: number, c: number) => void; still: boolean; name?: string; color?: string; speed?: number;
  /** a short pop over the head after an action ("+250 m²") */ pop?: { k: number; text: string } | null;
}) {
  const [obj, setObj] = useState<{ root: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Partial<Record<Act, THREE.AnimationAction>> } | null>(null);
  const outer = useRef<THREE.Group>(null!); const body = useRef<THREE.Group>(null!);
  const cur = useRef<Act | null>(null); const lastCell = useRef(''); const lastEmit = useRef(0);
  const { camera } = useThree();
  useEffect(() => {
    let on = true;
    Promise.all([loadModel(id), loadClips()]).then(([m, clips]) => {
      if (!on) return;
      const root = skClone(m.scene);
      root.traverse((o) => { const mesh = o as THREE.SkinnedMesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.frustumCulled = false; const mat = mesh.material as THREE.MeshStandardMaterial; if (mat && 'roughness' in mat) { mat.roughness = 0.78; mat.metalness = 0; } } });
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root); const h = Math.max(1e-3, box.max.y - box.min.y); const scale = height / h;
      root.position.y = -box.min.y * scale; root.scale.setScalar(scale);
      const mixer = new THREE.AnimationMixer(root); const actions: Partial<Record<Act, THREE.AnimationAction>> = {};
      for (const key of CLIPS) if (clips[key]) actions[key] = mixer.clipAction(retarget(clips[key], root));
      if (m.idle) actions.idle = mixer.clipAction(m.idle);
      setObj({ root, mixer, actions });
    }).catch((e) => console.warn('[player]', e));
    return () => { on = false; };
  }, [id, height]);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt0) => {
    const s = p.current; if (!s.ready || !outer.current) return;
    const dt = Math.min(dt0, 0.1);
    // input: keys relative to the camera, else walk to the target
    let vx = 0, vz = 0;
    const k = s.keys;
    const kf = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const kr = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (kf || kr) {
      camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      vx = fwd.x * kf - fwd.z * kr; vz = fwd.z * kf + fwd.x * kr; s.tx = s.tz = null;
    } else if (s.tx != null && s.tz != null) {
      const dx = s.tx - s.x, dz = s.tz - s.z, dd = Math.hypot(dx, dz);
      if (dd < 0.12) { s.tx = s.tz = null; } else { vx = dx / dd; vz = dz / dd; }
    }
    const vl = Math.hypot(vx, vz);
    s.moving = vl > 0 && !still;
    if (s.moving) {
      vx /= vl; vz /= vl;
      const nx = s.x + vx * speed * dt, nz = s.z + vz * speed * dt;
      if (free(nx, nz)) { s.x = nx; s.z = nz; } else if (free(nx, s.z)) s.x = nx; else if (free(s.x, nz)) s.z = nz; else { s.tx = s.tz = null; s.moving = false; }
      s.yaw = Math.atan2(vx, vz);
    }
    outer.current.position.set(s.x, hAt(s.x, s.z), s.z);
    if (body.current) { let d = s.yaw - body.current.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; body.current.rotation.y += d * Math.min(1, dt * 10); }
    // animation
    if (obj) {
      const want: Act = s.moving ? 'walk' : performance.now() < s.actUntil ? s.act : 'idle';
      if (want !== cur.current) {
        const next = obj.actions[want] ?? obj.actions.idle; const prev = cur.current ? obj.actions[cur.current] : null;
        if (next) { next.reset(); next.setEffectiveWeight(1); next.play(); if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false); }
        cur.current = want;
      }
      obj.mixer.update(still ? 0 : dt0 > 0.1 ? 0.1 : dt0);
    }
    // the cell under the feet
    // (at most ~8 times a second while walking: each report re-renders the game screen)
    const [r, c] = toCell(s.x, s.z); const key = `${r}|${c}`; const now = performance.now();
    if (key !== lastCell.current && (!s.moving || now - lastEmit.current > 120)) { lastCell.current = key; lastEmit.current = now; onCell?.(r, c); }
  });
  const rr = height * 0.22;
  return (
    <group ref={outer}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}><circleGeometry args={[rr * 1.2, 28]} /><meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} /></mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}><ringGeometry args={[rr * 1.0, rr * 1.25, 36]} /><meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} toneMapped={false} /></mesh>
      <group ref={body}>{obj && <primitive object={obj.root} />}</group>
      <Html position={[0, height * 1.08 + 0.25, 0]} center zIndexRange={[26, 16]} style={{ pointerEvents: 'none' }}>
        <div className="you-wrap">{pop && <div key={pop.k} className="you-pop">{pop.text}</div>}<div className="you-tag" style={{ ['--c' as any]: color }}>▼ {name}</div></div>
      </Html>
    </group>
  );
}

/** "Go here": a bouncing arrow and a pulsing ring on the ground (the next place to walk to). */
export function Beacon({ pos, color = '#ffb020', still, size = 1.6 }: { pos: [number, number, number]; color?: string; still: boolean; size?: number }) {
  const arrow = useRef<THREE.Group>(null!); const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (arrow.current) { arrow.current.position.y = 3.6 + (still ? 0 : Math.abs(Math.sin(t * 3)) * 0.7); arrow.current.rotation.y = still ? 0 : t * 1.5; }
    if (ring.current) { const k = still ? 1 : 1 + ((t * 0.9) % 1) * 0.8; ring.current.scale.setScalar(k); (ring.current.material as THREE.MeshBasicMaterial).opacity = still ? 0.8 : 0.9 * (1 - ((t * 0.9) % 1)); }
  });
  return (
    <group position={pos} scale={size}>
      <group ref={arrow}>
        <mesh rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.55, 1.1, 4]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
        <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.2, 0.2, 0.8, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      </group>
      <mesh ref={ring} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><ringGeometry args={[1.0, 1.35, 40]} /><meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}
