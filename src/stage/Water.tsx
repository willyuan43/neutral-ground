// Water on the stage: flow network, moving water particles, gardens, tank, drain. Everything is driven by model output.
import { useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { artTex } from './real/tex';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { StormSite, StormResult } from '../model/storm';
import type { World } from './world';
import { hash } from './Terrain';

const LIFT = 0.12;

export function cellPos(w: World, site: StormSite, k: number, lift = LIFT): THREE.Vector3 {
  const c = site.cells[k];
  return new THREE.Vector3(w.x(c.c), w.hAt(c.r, c.c) + lift, w.z(c.r));
}

/** Static flow network (D8 from the lidar terrain): ribbon per edge, width by upstream weight. */
export function FlowNetwork({ w, site, weights, color = '#2f8fe0', opacity = 0.75, minWeight = 0.5 }: {
  w: World; site: StormSite; weights: Float32Array | number[]; color?: string; opacity?: number; minWeight?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const edges = useMemo(() => {
    const out: { a: THREE.Vector3; b: THREE.Vector3; wgt: number }[] = [];
    site.cells.forEach((c, k) => {
      if (c.down < 0 || c.cover === 1) return;
      const wgt = weights[k] as number;
      if (wgt < minWeight) return;
      out.push({ a: cellPos(w, site, k), b: cellPos(w, site, c.down), wgt });
    });
    // last hop to the drain
    return out;
  }, [w, site, weights, minWeight]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(1, 0, 0);
    edges.forEach((e, k) => {
      const dir = new THREE.Vector3().subVectors(e.b, e.a);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.clone().normalize());
      p.addVectors(e.a, e.b).multiplyScalar(0.5);
      const width = Math.min(0.44, 0.08 + Math.log10(1 + e.wgt) * 0.17);
      s.set(len, 0.04, width);
      m.compose(p, q, s);
      ref.current.setMatrixAt(k, m);
    });
    ref.current.count = edges.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [edges]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uHi: { value: new THREE.Color('#d8f1ff') }, uTime: { value: 0 }, uOpacity: { value: opacity } },
    vertexShader: `varying float vU; varying float vV;
      void main() { vU = position.x + 0.5; vV = position.z + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    // a soft ribbon with highlights drifting downstream (+x is downstream for every edge)
    fragmentShader: `uniform vec3 uColor; uniform vec3 uHi; uniform float uTime; uniform float uOpacity; varying float vU; varying float vV;
      void main() { float edge = smoothstep(0.0, 0.25, vV) * smoothstep(1.0, 0.75, vV);
        float shimmer = smoothstep(0.75, 1.0, fract(vU * 1.5 - uTime * 0.9)) * 0.55;
        gl_FragColor = vec4(mix(uColor, uHi, shimmer * edge), min(1.0, uOpacity * 1.15) * (0.35 + 0.65 * edge));
        #include <colorspace_fragment>
      }`,
  }), [color, opacity]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.getElapsedTime(); });
  return (
    <instancedMesh ref={ref} args={[undefined, mat, Math.max(1, site.cells.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** Highlight a set of site cells (e.g. the water that would reach a spot). */
export function CellHighlight({ w, site, cells, color = '#63b8ff', opacity = 0.45 }: { w: World; site: StormSite; cells: number[]; color?: string; opacity?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.5, 0.02, 0.5), p = new THREE.Vector3();
    cells.forEach((k, n) => { const v = cellPos(w, site, k, 0.09); p.copy(v); m.compose(p, q, s); ref.current.setMatrixAt(n, m); });
    ref.current.count = cells.length;
    ref.current.instanceMatrix.needsUpdate = true;
  }, [cells, w, site]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, site.cells.length)]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </instancedMesh>
  );
}

interface Particle { path: THREE.Vector3[]; t: number; speed: number; kind: 0 | 1 }

/**
 * Moving water. Each hour of the replay, particles spawn on cells in proportion to the runoff the model computed for that hour,
 * then follow the D8 path until a garden (absorbed) or the drain. Delayed water (underdrain / tank release) moves as purple dots
 * along a straight "pipe" from the facility to the drain. Piped roof water runs as blue dots from the roof to the drain.
 */
export function WaterParticles({ w, site, result, hour, playing, gardensAt, reduceMotion, roofPiped, drainPos, roofPos, tankPos }: {
  w: World; site: StormSite; result: StormResult | null; hour: number; playing: boolean; gardensAt: Map<number, THREE.Vector3>;
  reduceMotion: boolean; roofPiped: boolean; drainPos: THREE.Vector3; roofPos: THREE.Vector3; tankPos: THREE.Vector3 | null;
}) {
  const MAX = 700;
  const blue = useRef<THREE.InstancedMesh>(null!);
  const purple = useRef<THREE.InstancedMesh>(null!);
  const parts = useRef<Particle[]>([]);
  const lastHour = useRef(-1);
  const spawnAcc = useRef(0);
  const pathCache = useMemo(() => new Map<number, THREE.Vector3[]>(), [site, gardensAt]);
  const pathFrom = (k: number) => {
    if (pathCache.has(k)) return pathCache.get(k)!;
    const pts: THREE.Vector3[] = [];
    let j = k;
    let guard = 0;
    while (j >= 0 && guard++ < 400) {
      pts.push(cellPos(w, site, j, 0.18));
      if (j !== k && gardensAt.has(j)) break;
      j = site.cells[j].down;
    }
    if (j < 0) pts.push(drainPos.clone());
    pathCache.set(k, pts);
    return pts;
  };
  useFrame((_, dt) => {
    if (!blue.current || !purple.current) return;
    const h = Math.floor(hour);
    const r = result;
    if (playing && r && h < r.hours && !reduceMotion) {
      // spawn proportional to this hour's water
      const ft = r.flowThrough[h];
      if (h !== lastHour.current) { lastHour.current = h; }
      const now = r.outletNow[h] + r.facilities.reduce((s, f) => s + (f.kind === 'garden' ? f.inflow[h] : 0), 0);
      const later = r.outletLater[h];
      const rate = Math.min(260, (now + later) * 3.5); // particles per second
      spawnAcc.current += rate * dt;
      while (spawnAcc.current > 1 && parts.current.length < MAX) {
        spawnAcc.current -= 1;
        const u = Math.random() * (now + later);
        if (u < later) {
          // delayed: from a garden/tank with outflow this hour
          const srcs = r.facilities.filter((f) => f.delayed[h] > 0);
          const f = srcs[Math.floor(Math.random() * srcs.length)];
          if (!f) continue;
          const from = f.kind === 'tank' ? (tankPos ?? roofPos) : f.local >= 0 ? (gardensAt.get(f.local) ?? cellPos(w, site, f.local)) : cellPos(w, site, f.local);
          const mid = from.clone().lerp(drainPos, 0.5); mid.y -= 0.3;
          parts.current.push({ path: [from.clone().add(new THREE.Vector3(0, -0.05, 0)), mid, drainPos.clone()], t: 0, speed: 0.55, kind: 1 });
        } else {
          // pick a cell weighted by its runoff this hour (sample a few and keep the heaviest)
          let best = -1, bw = -1;
          for (let s = 0; s < 6; s++) { const k = Math.floor(Math.random() * site.cells.length); const v = ft[k]; if (v > bw) { bw = v; best = k; } }
          if (roofPiped && Math.random() < 0.25 && r.outletNow[h] > 0) {
            const a = roofPos.clone(); const mid = a.clone().lerp(drainPos, 0.5); mid.y -= 0.25;
            parts.current.push({ path: [a, mid, drainPos.clone()], t: 0, speed: 0.8, kind: 0 });
            continue;
          }
          if (best < 0 || bw <= 0) continue;
          parts.current.push({ path: pathFrom(best), t: 0, speed: 3.5 + Math.random() * 2, kind: 0 });
        }
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let nb = 0, np = 0;
    const alive: Particle[] = [];
    for (const pt of parts.current) {
      pt.t += dt * pt.speed * (pt.kind === 1 ? 1 : 1);
      const segs = pt.path.length - 1;
      if (segs <= 0) continue;
      const pos = Math.min(segs, pt.t * (pt.kind === 1 ? 1 : 1) * (pt.kind === 1 ? 1 : 1.0) * (pt.kind === 1 ? 1 : 1));
      if (pos >= segs) continue;
      const i = Math.floor(pos), f = pos - i;
      p.lerpVectors(pt.path[i], pt.path[i + 1], f);
      const size = pt.kind === 1 ? 0.13 : 0.11;
      s.set(size, size, size);
      m.compose(p, q, s);
      if (pt.kind === 0 && nb < MAX) blue.current.setMatrixAt(nb++, m);
      if (pt.kind === 1 && np < MAX) purple.current.setMatrixAt(np++, m);
      alive.push(pt);
    }
    parts.current = alive;
    blue.current.count = nb; purple.current.count = np;
    blue.current.instanceMatrix.needsUpdate = true; purple.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={blue} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#2f8fe0" />
      </instancedMesh>
      <instancedMesh ref={purple} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#8a5cf0" />
      </instancedMesh>
    </group>
  );
}

/** A rain garden: sunken bed + water level (fraction 0..1). */
/** A rain garden: a shallow planted basin with a stone rim; its water level is the model's storage (display of a model
 *  state). Plants: rushes and grasses drawn with the green-grass picture. */
const gardenTufts = (() => { let g: THREE.BufferGeometry | null = null; return () => {
  if (g) return g;
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2 + 0.4, dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5, b = pos.length / 3; pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); for (let j = 0; j < 4; j++) nrm.push(0, 1, 0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}; })();
export function GardenMesh({ pos, areaM2, fill, full, label }: { pos: THREE.Vector3; areaM2: number; fill: number; full: boolean; label?: string }) {
  const radius = (Math.sqrt(areaM2 / Math.PI) / 10) * 1.7; // world units (10 m); drawn 1.7× wider so it reads on the island (display only)
  const plantMat = useMemo(() => new THREE.MeshStandardMaterial({ map: artTex('tex-grass-green.webp'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }), []);
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ map: artTex('tex-rock.webp', { repeat: true }), color: '#b9b2a8', roughness: 0.9 }), []);
  const waterMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3f7f9a', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82, envMapIntensity: 1.4 }), []);
  useEffect(() => () => { plantMat.dispose(); stoneMat.dispose(); waterMat.dispose(); }, [plantMat, stoneMat, waterMat]);
  const stones = useMemo(() => Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2 + hash(k * 3) * 0.2; return { x: Math.cos(a) * radius * 1.06, z: Math.sin(a) * radius * 1.06, s: 0.07 + hash(k * 7) * 0.06 }; }), [radius]);
  const plants = useMemo(() => Array.from({ length: 18 }, (_, k) => { const a = hash(k * 11) * Math.PI * 2, rr = Math.sqrt(hash(k * 13)) * radius * 0.85; return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: 0.22 + hash(k * 17) * 0.18, r: hash(k * 19) * Math.PI }; }), [radius]);
  const level = Math.min(1, fill);
  return (
    <group position={pos}>
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <cylinderGeometry args={[radius * 1.1, radius * 1.12, 0.1, 28]} />
        <meshStandardMaterial color="#4b3a2a" roughness={1} />
      </mesh>
      {stones.map((t, k) => <mesh key={k} position={[t.x, 0.06, t.z]} scale={[t.s * 1.4, t.s, t.s]} material={stoneMat} castShadow><icosahedronGeometry args={[1, 0]} /></mesh>)}
      {plants.map((t, k) => <mesh key={'p' + k} geometry={gardenTufts()} material={plantMat} position={[t.x, 0.05, t.z]} rotation={[0, t.r, 0]} scale={[t.h * 1.2, t.h, t.h * 1.2]} />)}
      {level > 0.01 && (
        <mesh position={[0, 0.06 + 0.16 * level, 0]} material={waterMat}>
          <cylinderGeometry args={[radius * 0.98, radius * 0.98, 0.02 + 0.02 * level, 28]} />
        </mesh>
      )}
      {full && <Html center position={[0, 0.9, 0]} zIndexRange={[20, 10]}><div className="full3d">FULL</div></Html>}
      {label && <Html center position={[0, 1.6, 0]} zIndexRange={[20, 10]}><div className="label3d">{label}</div></Html>}
    </group>
  );
}
/** The Rec Center's roof tank: a green tank with a clear sight glass; the blue level is the model's storage. */
export function TankMesh({ pos, fill, full, capM3 }: { pos: THREE.Vector3; fill: number; full: boolean; capM3: number }) {
  const r = 0.3 + capM3 / 110, hgt = 0.95 + capM3 / 28;
  const lv = Math.min(1, fill);
  return (
    <group position={pos}>
      <mesh position={[0, hgt / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, hgt, 24]} />
        <meshStandardMaterial color="#3d6149" roughness={0.55} metalness={0.05} />
      </mesh>
      {[0.25, 0.5, 0.75].map((f) => <mesh key={f} position={[0, hgt * f, 0]}><torusGeometry args={[r * 1.005, 0.012, 6, 28]} /><meshStandardMaterial color="#2e4c39" roughness={0.6} /></mesh>)}
      <mesh position={[0, hgt + 0.03, 0]} castShadow><cylinderGeometry args={[r * 0.98, r, 0.06, 24]} /><meshStandardMaterial color="#34553f" roughness={0.6} /></mesh>
      {/* sight glass */}
      <mesh position={[r * 0.98, hgt / 2, 0]}><boxGeometry args={[0.04, hgt * 0.9, 0.09]} /><meshStandardMaterial color="#dfe8ea" transparent opacity={0.6} /></mesh>
      <mesh position={[r * 1.0, (hgt * 0.9 * Math.max(0.01, lv)) / 2 + hgt * 0.05, 0]}><boxGeometry args={[0.046, Math.max(0.01, hgt * 0.9 * lv), 0.07]} /><meshStandardMaterial color="#2f8fe0" emissive="#1a5c99" emissiveIntensity={0.25} /></mesh>
      {full && <Html center position={[0, hgt + 0.6, 0]} zIndexRange={[20, 10]}><div className="full3d">FULL</div></Html>}
    </group>
  );
}
export function DrainMarker({ pos, now, later, show }: { pos: THREE.Vector3; now: number; later: number; show: boolean }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.12, 8]} />
        <meshStandardMaterial color="#26343a" flatShading />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <torusGeometry args={[0.38, 0.05, 6, 16]} />
        <meshStandardMaterial color="#ffd25e" />
      </mesh>
      {/* raised so it clears the spot-F marker that sits next to the drain */}
      <Html center position={[0, 2.3, 0]} zIndexRange={[20, 10]}>
        <div className="drain3d">
          <div>DRAIN</div>
          {show && <div className="v">{(now + later).toFixed(1)} m³/h</div>}
        </div>
      </Html>
    </group>
  );
}

export function SpotMarker({ pos, id, selected, onPick, disabled, onHover }: { pos: THREE.Vector3; id: string; selected: boolean; onPick: () => void; disabled?: boolean; onHover?: (on: boolean) => void }) {
  const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => { if (ring.current) ring.current.scale.setScalar(1 + 0.12 * Math.sin(clock.getElapsedTime() * 3 + hash(id.charCodeAt(0)) * 6)); });
  return (
    <group position={pos}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[0.32, 0.42, 24]} />
        <meshBasicMaterial color={selected ? '#ffd25e' : '#ffffff'} transparent opacity={0.9} />
      </mesh>
      <Html center position={[0, 0.85, 0]} zIndexRange={[30, 10]}>
        <div className={`spot3d ${selected ? 'sel' : ''}`} onClick={disabled ? undefined : onPick} onPointerEnter={() => onHover?.(true)} onPointerLeave={() => onHover?.(false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick(); }} aria-label={`Spot ${id}`}>{id}</div>
      </Html>
    </group>
  );
}


/** Before the storm: light droplets trickle along the D8 paths (weighted by the model's runoff for this storm) so you can see where water goes. */
export function PreviewFlow({ w, site, weights, drainPos, reduceMotion, gardensAt }: { w: World; site: StormSite; weights: Float32Array; drainPos: THREE.Vector3; reduceMotion: boolean; gardensAt: Map<number, THREE.Vector3> }) {
  const MAX = 160;
  const ref = useRef<THREE.InstancedMesh>(null!);
  const parts = useRef<{ path: THREE.Vector3[]; t: number; speed: number }[]>([]);
  const acc = useRef(0);
  const cum = useMemo(() => { const c = new Float32Array(site.cells.length); let s = 0; site.cells.forEach((cell, k) => { s += cell.cover === 1 ? 0 : weights[k] ?? 0; c[k] = s; }); return c; }, [site, weights]);
  const pathCache = useMemo(() => new Map<number, THREE.Vector3[]>(), [site, gardensAt]);
  const pathFrom = (k: number) => {
    if (pathCache.has(k)) return pathCache.get(k)!;
    const pts: THREE.Vector3[] = []; let j = k, g = 0;
    while (j >= 0 && g++ < 400) { pts.push(cellPos(w, site, j, 0.2)); if (j !== k && gardensAt.has(j)) break; j = site.cells[j].down; }
    if (j < 0) pts.push(drainPos.clone());
    pathCache.set(k, pts); return pts;
  };
  useFrame((_, dt) => {
    if (!ref.current) return;
    const total = cum[cum.length - 1] || 1;
    if (!reduceMotion) {
      acc.current += dt * 45;
      while (acc.current > 1 && parts.current.length < MAX) {
        acc.current -= 1;
        const u = Math.random() * total; let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
        parts.current.push({ path: pathFrom(lo), t: 0, speed: 2.2 + Math.random() });
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.08, 0.08, 0.08), p = new THREE.Vector3();
    let n = 0; const alive: typeof parts.current = [];
    for (const pt of parts.current) {
      pt.t += dt * pt.speed; const segs = pt.path.length - 1; if (pt.t >= segs) continue;
      const i = Math.floor(pt.t), f = pt.t - i; p.lerpVectors(pt.path[i], pt.path[i + 1], f); m.compose(p, q, s); ref.current.setMatrixAt(n++, m); alive.push(pt);
    }
    parts.current = alive; ref.current.count = n; ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      <meshBasicMaterial color="#9fd8ff" />
    </instancedMesh>
  );
}
