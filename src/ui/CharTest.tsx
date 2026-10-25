// Dev check for the 3D cast (open #chartest): the five figures on a plain floor, each playing one move.
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Characters, type Act } from '../stage/Characters';

export function CharTest() {
  const acts: Act[] = ['idle', 'wave', 'cheer', 'worried', 'talk'];
  const ids = ['maya', 'leo', 'coach', 'chen', 'juno'] as const;
  const act = (new URLSearchParams(location.search).get('act') as Act | null);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#cfe8f5' }}>
      <Canvas shadows camera={{ position: [0, 3.2, 9], fov: 40 }}>
        <hemisphereLight args={['#ffffff', '#8a7a60', 0.9]} />
        <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#9fcf6f" /></mesh>
        <Characters still={false} list={ids.map((id, k) => ({ id, pos: [(k - 2) * 1.6, 0, 0] as [number, number, number], height: 1.8, color: '#e2693a', name: id, act: act ?? acts[k], yaw: 0 }))} />
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  );
}
