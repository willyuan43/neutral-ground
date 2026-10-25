// Young planted trees (on the slope, or the shade trees by the Rec Center lawn): a wooden stake and a small leafy
// crown made of three crossed cards with the oak-foliage picture. A tree the model counts as dead shows only its stake
// and a brown wisp. Positions are a display choice; how many there are and whether they lived is the model's.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sway } from '../look';
import { artTex, cutoutDepth } from './tex';

export interface SaplingSpot { x: number; y: number; z: number; h: number; dead?: boolean; seed: number }

function crossCards(n: number) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI; const dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5; const b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    for (let j = 0; j < 4; j++) nrm.push(Math.cos(a + Math.PI / 2) * 0.4, 0.9, Math.sin(a + Math.PI / 2) * 0.4);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function Saplings({ spots, low = false }: { spots: SaplingSpot[]; low?: boolean }) {
  const crown = useRef<THREE.InstancedMesh>(null!);
  const stake = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => crossCards(3), []);
  const stakeGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 5); g.translate(0, 0.5, 0); return g; }, []);
  const mat = useMemo(() => { const map = artTex('tex-oak.webp'); return { m: sway(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 }), 0.05, 0.1), depth: cutoutDepth(map, 0.42) }; }, []);
  useEffect(() => () => { geo.dispose(); stakeGeo.dispose(); mat.m.dispose(); mat.depth.dispose(); }, [geo, stakeGeo, mat]);
  useLayoutEffect(() => {
    if (!crown.current || !stake.current) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    spots.forEach((t, k) => {
      q.setFromAxisAngle(up, t.seed * Math.PI * 2);
      const ch = t.dead ? t.h * 0.35 : t.h * 0.62;
      p.set(t.x, t.y + t.h * (t.dead ? 0.45 : 0.38), t.z); s.set(ch * 0.95, ch, ch * 0.95); m.compose(p, q, s); crown.current.setMatrixAt(k, m);
      if (t.dead) col.setRGB(0.62, 0.45, 0.28); else col.setRGB(0.95 + t.seed * 0.1, 1.05, 0.9);
      crown.current.setColorAt(k, col);
      p.set(t.x + 0.03, t.y, t.z); s.set(0.022, t.h * 0.8, 0.022); m.compose(p, q, s); stake.current.setMatrixAt(k, m);
    });
    crown.current.count = spots.length; crown.current.instanceMatrix.needsUpdate = true; if (crown.current.instanceColor) crown.current.instanceColor.needsUpdate = true;
    stake.current.count = spots.length; stake.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  if (!spots.length) return null;
  return (
    <group>
      <instancedMesh key={`c${spots.length}`} ref={crown} args={[geo, mat.m, spots.length]} customDepthMaterial={mat.depth} castShadow={!low} frustumCulled={false} />
      <instancedMesh key={`s${spots.length}`} ref={stake} args={[stakeGeo, undefined, spots.length]} castShadow={!low} frustumCulled={false}>
        <meshStandardMaterial color="#b99a6e" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
