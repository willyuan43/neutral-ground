import { Suspense, useEffect, useMemo, useRef, useState, ReactNode, Component } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, TiltShift2, Vignette, HueSaturation, BrightnessContrast, ToneMapping, Bloom } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useGame, defaultGraphics } from '../state/store';
import type { GameData } from '../data/load';
import { makeWorld, World } from './world';
import { dataImageUrl } from '../data/load';
import type { CellPaint } from './Terrain';
import { Buildings, Trees } from './Props';
import { Creek, Outline, creekCells } from './Island';
import { parkShape, buildParkMesh, ParkTerrain, ParkCliffs, type ParkShape, type ParkMesh } from './ParkIsland';
import { ParkRocks } from './ParkRocks';
import { useLoader } from '@react-three/fiber';
import { WindClock, night } from './look';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from './Terrain';
import { Meadow, meadowWet, type TuftFn } from './real/Meadow';
import { RealAtmosphere } from './real/Atmos';
import { ParkBoundaryLine, PlaceLabels, WaterPaths, type LayerFlags } from './real/Layers';
import { Decor } from './Decor';

/** Test hook: `?shot` in the address lowers the most expensive settings so headless (software GL) screenshots finish. */
export const SHOT = (() => { try { return /[?&]shot\b/.test(window.location.search); } catch { return false; } })();

export interface View { target: [number, number, number]; position: [number, number, number] }

export interface Aim { r: number; c: number; span: number; /** a low, near-eye-level look (talking to a neighbour) */ low?: boolean; /** raise the look-at point (world units) */ lift?: number }
export function viewFor(w: World, kind: 'overview' | 'site' | 'slope' | 'hero', d: GameData, aim?: Aim | null): View {
  // one island (the whole park); each view is a camera on it
  const sh = parkShape(d);
  let r = sh.cr, c = sh.cc, span = Math.max(sh.hr, sh.hc) * 2;
  if (kind === 'slope' && d.slope) { r = d.slope.focus.r + 6; c = d.slope.focus.c - 1; span = 84; }
  if (kind === 'slope' && aim) {
    // a closer, lower look at one spot (the new planting while a year plays): the beds and their sprouts fill the view
    const tt: [number, number, number] = [w.x(aim.c), w.hAt(aim.r, aim.c) + (aim.lift ?? 0), w.z(aim.r)];
    // steep enough that the canopy around the beds doesn't hide them; or low and frontal for a conversation
    const dd = (aim.low ? new THREE.Vector3(-0.18, 0.42, 0.89) : new THREE.Vector3(-0.22, 0.86, 0.5)).normalize().multiplyScalar(aim.span * 0.5 * 1.5);
    return { target: tt, position: [tt[0] + dd.x, tt[1] + dd.y, tt[2] + dd.z] };
  }
  if (kind === 'site' && d.site?.cells?.length) {
    const cs = d.site.cells; r = cs.reduce((s: number, x: any) => s + x.r, 0) / cs.length; c = cs.reduce((s: number, x: any) => s + x.c, 0) / cs.length; span = 84;
  }
  if (kind === 'hero') {
    // the title: a low, close look along the canyon (the park's own centre), like a diorama seen from the table
    let n = 0, sr = 0, sc = 0; for (let i = 0; i < d.inPark.length; i++) if (d.inPark[i] === 1) { n++; sr += Math.floor(i / d.grid.cols); sc += i % d.grid.cols; }
    r = sr / Math.max(1, n); c = sc / Math.max(1, n); span = Math.max(sh.hr, sh.hc) * 2;
    const tt: [number, number, number] = [w.x(c), w.hAt(r, c) - 4, w.z(r)];
    const dd = new THREE.Vector3(-0.42, 0.56, 0.72).normalize().multiplyScalar(span * 0.5 * 0.86);
    return { target: tt, position: [tt[0] + dd.x, tt[1] + dd.y, tt[2] + dd.z] };
  }
  const t: [number, number, number] = [w.x(c), w.hAt(r, c) - (kind === 'overview' ? 6 : 1), w.z(r) + (kind === 'overview' ? 6 : 0)];
  const dist = span * 0.5 * (kind === 'overview' ? 1.32 : 1.5); // world units: 0.5 per cell
  // overview: an oblique look up the canyon (north), like a museum diorama on a table; zoomed views a little steeper
  const dir = (kind === 'overview' ? new THREE.Vector3(-0.3, 0.66, 0.74) : new THREE.Vector3(-0.36, 0.66, 0.66)).normalize().multiplyScalar(dist);
  return { target: t, position: [t[0] + dir.x, t[1] + dir.y, t[2] + dir.z] };
}

function CameraRig({ view: view0, flyIn, reduceMotion, controls }: { view: View; flyIn: boolean; reduceMotion: boolean; controls: React.MutableRefObject<any> }) {
  const { camera, size } = useThree();
  // portrait screens: step back so the whole puzzle area fits the narrow view
  const aspect = size.width / Math.max(1, size.height);
  const view = useMemo(() => {
    const k = aspect < 1 ? Math.pow(1 / aspect, 0.85) : 1;
    if (k === 1) return view0;
    const t = view0.target, p = view0.position;
    return { target: t, position: [t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k] as [number, number, number] };
  }, [view0, aspect < 1 ? Math.round(aspect * 20) : 20]);
  const anim = useRef<{ t: number; from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const to = new THREE.Vector3(...view.position);
    const toT = new THREE.Vector3(...view.target);
    const from = flyIn ? new THREE.Vector3(view.position[0] + 60, view.position[1] + 140, view.position[2] + 190) : camera.position.clone();
    const fromT = controls.current ? controls.current.target.clone() : toT.clone();
    if (reduceMotion) {
      camera.position.copy(to);
      controls.current?.target.copy(toT);
      controls.current?.update();
      anim.current = null;
      return;
    }
    anim.current = { t: 0, from, to, fromT, toT };
    if (flyIn) camera.position.copy(from);
  }, [view, flyIn, reduceMotion]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / (flyIn ? 3.2 : 1.4));
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.from, a.to, e);
    if (controls.current) { controls.current.target.lerpVectors(a.fromT, a.toT, e); controls.current.update(); }
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

const DAY = { top: new THREE.Color('#7ccbe8'), bottom: new THREE.Color('#fbefd3') };
const NIGHT = { top: new THREE.Color('#0b1730'), bottom: new THREE.Color('#25406a') };
/** Background gradient (screen space, so it works under post-processing) and lights. `mood` 0 = sunny day,
 *  1 = heavy rain: the scene turns to a stormy night-blue while it rains (display only). */
function NightLevel({ value }: { value: number }) {
  useFrame((_, dt) => { night.value += (value - night.value) * Math.min(1, dt * 2); });
  return null;
}

/** Soft studio-like image lighting (procedural, no files): gives the clay-render look of the illustrations. */
function SoftEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env; (scene as any).environmentIntensity = 0.22;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

function Atmosphere({ mood, shadows }: { mood: number; shadows: boolean }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { top: { value: DAY.top.clone() }, bottom: { value: DAY.bottom.clone() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec2 vUv; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 1.0, vUv.y)), 1.0); \n#include <colorspace_fragment>\n}',
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const sun = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const fill = useRef<THREE.DirectionalLight>(null!);
  const cur = useRef(mood);
  const sky = useMemo(() => new THREE.Color(), []);
  const scene = useThree((st) => st.scene);
  useFrame((_, dt) => {
    cur.current += (mood - cur.current) * Math.min(1, dt * 1.8);
    const m = cur.current;
    (scene as any).environmentIntensity = 0.22 * (1 - 0.85 * m);
    mat.uniforms.top.value.lerpColors(DAY.top, NIGHT.top, m);
    mat.uniforms.bottom.value.lerpColors(DAY.bottom, NIGHT.bottom, m);
    if (sun.current) { sun.current.intensity = 2.2 * (1 - 0.82 * m); sun.current.color.setRGB(1 - 0.35 * m, 0.94 - 0.2 * m, 0.84 + 0.16 * m); }
    if (hemi.current) { hemi.current.intensity = 0.8 * (1 - 0.45 * m); hemi.current.color.copy(sky.setRGB(0.93 - 0.5 * m, 0.97 - 0.38 * m, 1)); }
    if (fill.current) fill.current.intensity = 0.35 + 0.3 * m;
  });
  return (
    <group>
      <mesh material={mat} frustumCulled={false} renderOrder={-10}><planeGeometry args={[2, 2]} /></mesh>
      <hemisphereLight ref={hemi} args={['#eef8ff', '#7b6a50', 0.8]} />
      <directionalLight ref={sun} castShadow={shadows} position={[-60, 110, 70]} intensity={2.2} color="#fff1d6"
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0005} shadow-normalBias={0.05}
        shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-near={1} shadow-camera-far={400} />
      <directionalLight ref={fill} position={[80, 40, -60]} intensity={0.35} color="#9cc3ff" />
    </group>
  );
}

/** Soft cloud puffs drifting below and around the floating island (a decorative backdrop, not weather). */
function Clouds({ center, radius, y, still }: { center: [number, number]; radius: number; y: number; still: boolean }) {
  const ref = useRef<THREE.Group>(null!);
  const geo = useMemo(() => {
    const parts = [[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.8], [-1.05, -0.2, -0.1, 0.75], [0.45, 0.35, -0.35, 0.7], [-0.4, 0.3, 0.4, 0.62]];
    const gs = parts.map(([x, yy, z, r]) => { const g = new THREE.IcosahedronGeometry(r, 2); g.translate(x, yy, z); g.deleteAttribute('uv'); return g; });
    const m = mergeGeometries(gs, false)!; gs.forEach((g) => g.dispose());
    m.scale(1, 0.55, 0.8);
    return m;
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e4eef6', emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const puffs = useMemo(() => Array.from({ length: 8 }, (_, k) => {
    const th = (k / 8) * Math.PI * 2 + hash(k * 7) * 0.5;
    const rr = radius * (1.25 + hash(k * 3) * 0.55);
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, yy: -radius * (0.25 + hash(k * 5) * 0.4), s: radius * (0.06 + hash(k * 11) * 0.05) };
  }), [radius]);
  useFrame((_, dt) => { if (!still && ref.current) ref.current.rotation.y += dt * 0.012; });
  return (
    <group ref={ref} position={[center[0], y, center[1]]}>
      {puffs.map((p, k) => <mesh key={k} geometry={geo} material={mat} position={[p.x, p.yy, p.z]} scale={p.s} />)}
    </group>
  );
}

/** NAIP aerial photo for the optional photo view (loaded only when asked for). */
function AerialIsland({ d, w, mesh, onGround }: { d: GameData; w: World; mesh: ParkMesh; onGround?: (r: number, c: number) => void }) {
  const naip = useLoader(THREE.TextureLoader, dataImageUrl('naip.jpg'));
  useEffect(() => { naip.colorSpace = THREE.SRGBColorSpace; naip.flipY = false; naip.anisotropy = 4; naip.needsUpdate = true; }, [naip]);
  return <ParkTerrain d={d} w={w} mesh={mesh} aerialMap={naip} onGround={onGround} />;
}

/** Follow the player: slide the camera and its target together towards the player's figure (the angle and zoom stay
 *  as the player left them). Gentle, so walking does not shake the view. */
function FollowCam({ follow, controls, w }: { follow: React.MutableRefObject<{ x: number; z: number; ready: boolean }>; controls: React.MutableRefObject<any>; w: World }) {
  const { camera } = useThree();
  const d = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const f = follow.current, c = controls.current; if (!f?.ready || !c) return;
    const cols = w.cols, rows = w.rows; const cw = w.cellM * 0.1;
    const cc = f.x / cw + cols / 2 - 0.5, rr = f.z / cw + rows / 2 - 0.5;
    d.set(f.x - c.target.x, w.hAt(rr, cc) + 1.2 - c.target.y, f.z - c.target.z);
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.6);
    d.multiplyScalar(k);
    c.target.add(d); camera.position.add(d); c.update();
  });
  return null;
}

/** Decorations that fail (a missing picture, a driver hiccup) drop out quietly instead of stopping the game. */
class SafeGroup extends Component<{ children: ReactNode; name: string }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e: unknown) { console.warn(`[stage] ${this.props.name} skipped:`, e); }
  render() { return this.state.bad ? null : this.props.children; }
}

/** Default grass on the island: tufts on the real grassland (and the few scrub) cells. */
function defaultTufts(d: GameData): TuftFn {
  return (i) => (d.cover[i] === 4 ? { n: 4, h: 0.4, native: 0 } : d.cover[i] === 5 ? { n: 2, h: 0.34, native: 0.3 } : null);
}
/** Eases the meadow's shared wetness towards today's value. */
function MeadowWet({ value }: { value: number }) {
  useFrame((_, dt) => { meadowWet.value += (value - meadowWet.value) * Math.min(1, dt * 2.5); });
  return null;
}

/** Shifts the picture sideways (fraction of the width) so a panel can sit beside the island. */
function FrameShift({ x }: { x: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (x) cam.setViewOffset(size.width, size.height, -size.width * x, 0, size.width, size.height); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    return () => { cam.clearViewOffset(); cam.updateProjectionMatrix(); };
  }, [camera, size.width, size.height, x]);
  return null;
}

export function Stage({ d, view, flyIn = false, aerial, reduceMotion, paint, focus, children, treeTint, interactive = true, autoRotate = false, treeSkip, mood = 0, tilt, quiet, nightLevel = 0, tufts, wet = 0.32, paintMix = 0, layers, shiftX = 0, aim, onGround, follow }: {
  /** keep this point in the middle of the view (the player's figure), keeping the camera's angle and distance */ follow?: React.MutableRefObject<{ x: number; z: number; ready: boolean }> | null;
  d: GameData; view: 'overview' | 'site' | 'slope' | 'hero'; /** move the island right (+) or left (−) by this fraction of the width */ shiftX?: number; flyIn?: boolean; aerial: boolean; reduceMotion: boolean; paint?: CellPaint; focus?: (i: number) => number;
  /** cells whose colour shows a model state: the aerial photo detail is kept faint there */ quiet?: (i: number) => boolean;
  /** 0 = day, 1 = night (the storm replay follows the real clock); some house windows glow */ nightLevel?: number;
  children?: (w: World) => ReactNode; treeTint?: (i: number) => string | null; interactive?: boolean; autoRotate?: boolean; treeSkip?: Set<number>; mood?: number;
  /** miniature-lens blur at the top and bottom of the view (0 = off; default: a light one on high graphics) */ tilt?: number;
  /** grass tufts per cell (default: the real grassland cells) */ tufts?: TuftFn;
  /** soil wetness for the grass colour, 0 = dry (golden) … 1 = wet (green); from the model where a level knows it */ wet?: number;
  /** how much a lens's paint shows on cells without a model state (0 = the photo) */ paintMix?: number;
  /** map layers (default: the player's choice in settings) */ layers?: LayerFlags;
  /** slope view only: look closer at this spot (cells) */ aim?: Aim | null;
  /** a tap on the ground (cell coordinates) */ onGround?: (r: number, c: number) => void;
}) {
  const layerPref = useGame((s) => s.settings.layers);
  const L: LayerFlags = { boundary: true, places: view === 'overview', water: false, steep: false, ...(layerPref ?? {}), ...(layers ?? {}) };
  const graphics = useGame((s) => s.settings.graphics) ?? defaultGraphics();
  const high = graphics === 'high';
  const w = useMemo(() => makeWorld(d), [d]);
  const aimKey = aim ? `${Math.round(aim.r)}|${Math.round(aim.c)}|${Math.round(aim.span)}|${aim.low ? 1 : 0}|${aim.lift ?? 0}` : '';
  // automated screenshots only (?shot): the capture script can hold the 3D frame still so the page's panels get painted
  const [frozen, setFrozen] = useState(false);
  useEffect(() => { if (!SHOT) return; (window as any).__ngFreeze = (on: boolean) => setFrozen(!!on); return () => { delete (window as any).__ngFreeze; }; }, []);
  const v = useMemo(() => viewFor(w, view, d, aim), [w, view, d, aimKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const shape: ParkShape = useMemo(() => parkShape(d), [d]);
  const mesh: ParkMesh = useMemo(() => buildParkMesh(d, w, shape), [d, w, shape]);
  // the creek and a few older helpers take an Outline; the park island provides the same `inside` test
  const outline = useMemo(() => ({ inside: shape.inside, rho: () => 0, project: (r: number, c: number) => [r, c] as [number, number], shape: { cr: shape.cr, cc: shape.cc, hr: shape.hr, hc: shape.hc, n: 2, amp: 0, step: 1, depth: 14 } }) as Outline, [shape]);
  const steepPaint = useMemo(() => {
    const { rows, cols, cellM } = d.grid; const e = d.elev;
    return (i: number): [number, number, number] => {
      const r = Math.floor(i / cols), c = i % cols;
      const ex = (e[r * cols + Math.min(cols - 1, c + 1)] - e[r * cols + Math.max(0, c - 1)]) / (2 * cellM);
      const ez = (e[Math.min(rows - 1, r + 1) * cols + c] - e[Math.max(0, r - 1) * cols + c]) / (2 * cellM);
      const t = Math.min(1, Math.hypot(ex, ez) / 0.7); // 0 = flat … 1 = 35° and steeper (real lidar slope)
      return t < 0.5 ? [250 - 10 * t, 236 - 120 * t, 170 - 150 * t] : [245 - 60 * (t - 0.5), 176 - 230 * (t - 0.5), 95 - 110 * (t - 0.5)];
    };
  }, [d]);
  const facePaint = useMemo(() => (L.steep ? (i: number) => steepPaint(i) : paint || focus ? (i: number, rgb: [number, number, number]) => {
    let c = paint ? paint(i, rgb) : rgb; const f = focus ? focus(i) : 1; if (f !== 1) c = [c[0] * f, c[1] * f, c[2] * f]; return c;
  } : undefined), [paint, focus, L.steep, steepPaint]);
  const mix = L.steep ? 0.9 : paintMix;
  const controls = useRef<any>(null);
  const defTufts = useMemo(() => defaultTufts(d), [d]);
  // labels near the view's centre (slope / Rec Center); the overview shows them all
  const placeAt = useMemo<[number, number]>(() => view === 'site' && d.site?.cells?.length ? [d.site.cells.reduce((s: number, x: any) => s + x.r, 0) / d.site.cells.length, d.site.cells.reduce((s: number, x: any) => s + x.c, 0) / d.site.cells.length] : d.slope ? [d.slope.focus.r, d.slope.focus.c] : [140, 105], [view, d]);
  // trees are not drawn right on the open creek, so the water stays visible (display only)
  const treeSkipAll = useMemo(() => { const s = new Set<number>(creekCells(d)); treeSkip?.forEach((i) => s.add(i)); return s; }, [d, treeSkip]);
  return (
    <Canvas frameloop={frozen ? 'never' : 'always'} shadows={{ type: THREE.PCFSoftShadowMap }} dpr={SHOT ? 1 : high ? [1, 2] : [1, 1.5]} camera={{ position: v.position, fov: 40, near: 0.5, far: 2600 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
      <RealAtmosphere mood={mood} night={nightLevel} shadows={high} high={high && !SHOT} center={[w.x(shape.cc), mesh.minY + 8, w.z(shape.cr)]} radius={Math.max(shape.hr, shape.hc) * 0.5} baseY={mesh.minY - 10} still={reduceMotion} />
      <WindClock still={reduceMotion} />
      <NightLevel value={nightLevel} />
      <MeadowWet value={wet} />
      {aerial
        ? <Suspense fallback={<ParkTerrain d={d} w={w} mesh={mesh} paint={facePaint} quiet={L.steep ? undefined : quiet} paintMix={mix} onGround={onGround} />}><AerialIsland d={d} w={w} mesh={mesh} onGround={onGround} /></Suspense>
        : <ParkTerrain d={d} w={w} mesh={mesh} paint={facePaint} quiet={L.steep ? undefined : quiet} paintMix={mix} onGround={onGround} />}
      <SafeGroup name="cliffs"><ParkCliffs d={d} w={w} shape={shape} mesh={mesh} /></SafeGroup>
      <SafeGroup name="rocks"><ParkRocks d={d} w={w} mesh={mesh} shape={shape} /></SafeGroup>
      {!aerial && <SafeGroup name="creek"><Creek d={d} w={w} outline={outline} /></SafeGroup>}
      {!aerial && <SafeGroup name="buildings"><Buildings d={d} w={w} inside={shape.inside} /></SafeGroup>}
      {!aerial && <SafeGroup name="trees"><Trees d={d} w={w} density={0.34} tint={treeTint} skip={treeSkipAll} inside={shape.inside} low={!high} /></SafeGroup>}
      {!aerial && <SafeGroup name="meadow"><Meadow d={d} w={w} tufts={tufts ?? defTufts} low={!high} inside={shape.inside} /></SafeGroup>}
      {!aerial && <SafeGroup name="decor"><Decor d={d} w={w} /></SafeGroup>}
      {L.boundary && nightLevel < 0.35 && <SafeGroup name="boundary"><ParkBoundaryLine d={d} w={w} inside={shape.inside} /></SafeGroup>}
      {L.water && <SafeGroup name="water"><WaterPaths d={d} w={w} inside={shape.inside} /></SafeGroup>}
      {L.places && <SafeGroup name="places"><PlaceLabels d={d} w={w} inside={shape.inside} near={view === 'overview' ? undefined : 70} at={view === 'overview' ? undefined : placeAt} /></SafeGroup>}
      <SafeGroup key={view} name="level">{children?.(w)}</SafeGroup>
      <OrbitControls ref={controls} makeDefault enabled={interactive} enableDamping dampingFactor={0.08} target={v.target}
        minDistance={12} maxDistance={260} maxPolarAngle={Math.PI * 0.42} minPolarAngle={Math.PI * 0.12} enablePan={true}
        autoRotate={autoRotate && !reduceMotion} autoRotateSpeed={0.35} />
      <CameraRig view={v} flyIn={flyIn} reduceMotion={reduceMotion} controls={controls} />
      {follow && <FollowCam follow={follow} controls={controls} w={w} />}
      <FrameShift x={shiftX} />
      {high && (
        <EffectComposer multisampling={SHOT ? 0 : 4}>
          {SHOT ? <></> : <N8AO halfRes aoRadius={1.1} intensity={1.8} distanceFalloff={0.8} color="#1e1a12" />}
          <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.35} />
          {(tilt ?? 0.09) > 0 ? <TiltShift2 blur={tilt ?? 0.09} taper={0.45} /> : <></>}
          {/* the composer turns the renderer's tone mapping off; put the same ACES curve back so bright colours
              don't clip and both graphics settings show the same colours */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <HueSaturation saturation={0.1} />
          <BrightnessContrast brightness={0.01} contrast={0.085} />
          <Vignette offset={0.32} darkness={0.42} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
