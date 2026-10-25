// The fictional neighbours (and Juno) as illustrated standees on the island, like game pieces on a diorama: a billboard
// picture on a coloured base, with a name tag. Tap one to see what they ask for. Display only — they mark where each
// neighbour's concern is (east slope, the old shortcut, the field, downhill from the drain); they are not people in the data.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { bodyArt, faceArt, type Who } from '../ui/art';

const cache = new Map<string, Promise<THREE.Texture>>();
/** Load the standee picture and give it a white sticker outline, so it reads against the busy island. */
function loadTex(url: string): Promise<THREE.Texture> {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const pad = 10, sc = Math.min(1, 360 / img.height);
      const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
      const cv = document.createElement('canvas'); cv.width = w + pad * 2; cv.height = h + pad * 2;
      const g = cv.getContext('2d')!;
      // white outline: the silhouette stamped around in a ring, then the picture on top
      const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
      const sg = sil.getContext('2d')!; sg.drawImage(img, 0, 0, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, w, h);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.drawImage(sil, pad + Math.cos(a) * 5, pad + Math.sin(a) * 5); }
      g.drawImage(img, pad, pad, w, h);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
      res(t);
    };
    img.onerror = rej;
    img.src = url;
  }));
  return cache.get(url)!;
}

export interface StandeeSpec { id: Who; pos: [number, number, number]; height: number; color: string; name: string; mark?: string; state?: string; onClick?: () => void }

function Standee({ s, still, k }: { s: StandeeSpec; still: boolean; k: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const spr = useRef<THREE.Sprite>(null);
  useEffect(() => { let on = true; loadTex(bodyArt(s.id)).then((t) => { if (on) setTex(t); }).catch(() => {}); return () => { on = false; }; }, [s.id]);
  useFrame(({ clock }) => {
    if (!spr.current) return;
    spr.current.position.y = still ? 0.06 : 0.06 + Math.max(0, Math.sin(clock.getElapsedTime() * 2.2 + k * 1.7)) * 0.08 * s.height;
  });
  const img = tex?.image as HTMLImageElement | undefined;
  const aspect = img && img.height ? img.width / img.height : 0.4;
  const r = s.height * 0.2;
  return (
    <group position={s.pos}>
      {/* soft contact shadow and a thin ring in the neighbour's colour (a game marker on the diorama) */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); s.onClick?.(); }} renderOrder={2}>
        <circleGeometry args={[r * 1.1, 28]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[r * 0.92, r * 1.08, 32]} />
        <meshBasicMaterial color={s.color} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      {tex && (
        <sprite ref={spr} center={new THREE.Vector2(0.5, 0)} scale={[s.height * aspect, s.height, 1]} onClick={(e) => { e.stopPropagation(); s.onClick?.(); }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
          <spriteMaterial map={tex} transparent alphaTest={0.3} depthWrite toneMapped={false} />
        </sprite>
      )}
      <Html position={[0, s.height * 1.12 + 0.3, 0]} center zIndexRange={[25, 15]}>
        <button className={`st-tag ${s.state ?? ''}`} style={{ ['--c' as any]: s.color }} onClick={s.onClick}>
          <span className="st-face" style={{ background: s.color }}><img src={faceArt(s.id, s.state === 'atRisk' || s.state === 'failed' ? 'worried' : 'happy')} alt="" draggable={false} /></span>
          {s.name}{s.mark ? <b className="st-mark">{s.mark}</b> : null}
        </button>
      </Html>
    </group>
  );
}

export function Standees({ list, still }: { list: StandeeSpec[]; still: boolean }) {
  return <group>{list.map((s, k) => <Standee key={s.id} s={s} still={still} k={k} />)}</group>;
}
