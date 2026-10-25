// Chert boulders on the real rock cells inside the park (WorldCover "bare / sparse" — the canyon's red-brown chert
// outcrops), textured with the rock picture used on the island walls. Display only.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameData } from '../data/load';
import type { World } from './world';
import { hash } from './Terrain';
import { rockGeometry } from './Island';
import { artTex } from './real/tex';
import type { ParkMesh, ParkShape } from './ParkIsland';

export function ParkRocks({ d, w, mesh, shape }: { d: GameData; w: World; mesh: ParkMesh; shape: ParkShape }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => {
    const g = rockGeometry();
    // chert colours instead of the old moss: red-brown stone, a little lichen-olive on top
    const nrm = g.attributes.normal as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
    const stone = new THREE.Color('#8f8074'), lichen = new THREE.Color('#8a8a6c'), t = new THREE.Color();
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const k = Math.min(1, Math.max(0, (nrm.getY(i) - 0.55) / 0.35)) * 0.35;
      const sh = 0.78 + 0.22 * Math.min(1, Math.max(0, (p.getY(i) + 0.7) / 1.4));
      t.copy(stone).lerp(lichen, k).multiplyScalar(sh); col.setXYZ(i, t.r, t.g, t.b);
      uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.6) * 0.45 + 0.5; uv[i * 2 + 1] = p.getY(i) * 0.45 + 0.5;
    }
    col.needsUpdate = true; g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }, []);
  const map = useMemo(() => artTex('tex-rock.webp'), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const spots = useMemo(() => {
    const out: { r: number; c: number; sz: number; k: number }[] = [];
    void mesh; // (the old floating island also had decorative rocks along its edge; the realistic block has none)
    const cols = d.grid.cols;
    for (let i = 0; i < d.cover.length; i++) {
      if (d.cover[i] !== 9 || d.inPark[i] !== 1) continue;
      const r = Math.floor(i / cols), c = i % cols;
      if (!shape.inside(r, c) || hash(i * 41 + 7) > 0.3) continue;
      out.push({ r: r + (hash(i * 3) - 0.5) * 0.6, c: c + (hash(i * 5) - 0.5) * 0.6, sz: 0.2 + hash(i * 11) * 0.24, k: 100000 + i });
    }
    return out;
  }, [d, mesh, shape]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color();
    spots.forEach(({ r, c, sz, k }, n) => {
      p.set(w.x(c), w.hAt(r, c) - sz * 0.18, w.z(r)); // half sunk into the slope, like an outcrop
      e.set((hash(k * 5) - 0.5) * 0.5, hash(k * 7) * 6.28, (hash(k * 9) - 0.5) * 0.5); q.setFromEuler(e);
      s.set(sz * 1.35, sz * 0.55, sz * 1.1);
      m.compose(p, q, s); ref.current.setMatrixAt(n, m);
      col.setScalar(0.9 + hash(k * 23) * 0.2); ref.current.setColorAt(n, col);
    });
    ref.current.count = spots.length;
    ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [w, spots]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, Math.max(1, spots.length)]} castShadow receiveShadow>
      <meshStandardMaterial vertexColors map={map} roughness={0.95} />
    </instancedMesh>
  );
}
