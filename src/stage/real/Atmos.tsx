// Sky, light and air for the realistic miniature look (display only — weather on screen follows the real records the
// levels pass in as `mood`; the sea of clouds below the floating island is a backdrop, not weather).
// - A physically based daylight sky (Preetham model, three.js `Sky`) with a low late-afternoon sun from the west;
//   the same sky lights the scene as an environment map.
// - Rain and night (the storm replay follows the real clock) fade the sky to overcast grey and night blue.
// - A soft sea of clouds below the island and a few cloud puffs around it.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { artTex } from './tex';
import { hash } from '../Terrain';

/** Direction towards the sun (unit). Late afternoon, from the west-southwest, ~22° up: long soft shadows. */
export const SUN_DIR = new THREE.Vector3(-0.78, 0.4, 0.48).normalize();

// backdrop behind the island (screen space): a golden-hour haze, overcast grey in rain, night blue at night
const GOLD = { top: new THREE.Color('#6fc2f0'), mid: new THREE.Color('#bfe6f8'), bottom: new THREE.Color('#f3e4c8') };
const OVERCAST = { top: new THREE.Color('#aab3bb'), mid: new THREE.Color('#9aa4ad'), bottom: new THREE.Color('#5e6a76') };
const NIGHT = { top: new THREE.Color('#13213a'), mid: new THREE.Color('#0d1829'), bottom: new THREE.Color('#050b16') };

export function RealAtmosphere({ mood, night, shadows, center, radius, baseY, still, high }: {
  /** 0 = clear, 1 = heaviest rain */ mood: number; /** 0 = day, 1 = night */ night: number; shadows: boolean;
  center: [number, number, number]; radius: number; baseY: number; still: boolean; high: boolean;
}) {
  const { gl, scene } = useThree();
  // ---- sky dome
  const sky = useMemo(() => {
    const s = new Sky(); s.scale.setScalar(1800);
    const u = (s.material as THREE.ShaderMaterial).uniforms;
    u.turbidity.value = 5.5; u.rayleigh.value = 1.35; u.mieCoefficient.value = 0.0055; u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(SUN_DIR);
    s.renderOrder = -20; (s.material as THREE.ShaderMaterial).depthWrite = false;
    return s;
  }, []);
  useEffect(() => () => { sky.geometry.dispose(); (sky.material as THREE.Material).dispose(); }, [sky]);
  // ---- environment light from the same sky (made once; rain and night dim it)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tmp = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(1000);
    const u2 = (s2.material as THREE.ShaderMaterial).uniforms; const u = (sky.material as THREE.ShaderMaterial).uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u2[k].value = u[k].value;
    u2.sunPosition.value.copy(SUN_DIR);
    tmp.add(s2);
    const env = pm.fromScene(tmp, 0.02).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); s2.geometry.dispose(); (s2.material as THREE.Material).dispose(); };
  }, [gl, scene, sky]);
  // ---- overcast / night veil over the sky (screen space, behind everything)
  // drawn in the opaque pass right after the sky (custom blending keeps it out of the transparent pass, which would
  // put it over the island)
  const veil = useMemo(() => new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, transparent: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    uniforms: { top: { value: GOLD.top.clone() }, mid: { value: GOLD.mid.clone() }, bottom: { value: GOLD.bottom.clone() }, alpha: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float alpha; varying vec2 vUv;
      void main(){
        float y = vUv.y;
        vec3 c = y > 0.55 ? mix(mid, top, smoothstep(0.55, 1.0, y)) : mix(bottom, mid, smoothstep(0.0, 0.55, y));
        // a soft glow towards the sun side (upper left)
        float g = exp(-3.2 * length(vUv - vec2(0.12, 1.02)));
        c += vec3(0.3, 0.24, 0.12) * g;
        gl_FragColor = vec4(c, alpha);
        #include <colorspace_fragment>
      }`,
  }), []);
  useEffect(() => () => veil.dispose(), [veil]);
  // ---- lights
  const sun = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const fill = useRef<THREE.DirectionalLight>(null!);
  const fog = useMemo(() => new THREE.FogExp2('#d9dcd8', 0.0007), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const cur = useRef({ m: mood, n: night });
  const tmpC = useMemo(() => new THREE.Color(), []);
  const day = useMemo(() => ({ fog: new THREE.Color('#e4eef2'), sun: new THREE.Color('#fff0d4') }), []);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 1.8);
    cur.current.m += (mood - cur.current.m) * k; cur.current.n += (night - cur.current.n) * k;
    const m = cur.current.m, n = cur.current.n;
    const over = Math.min(1, m * 1.6); // rain → overcast
    veil.uniforms.top.value.lerpColors(GOLD.top, OVERCAST.top, over).lerp(NIGHT.top, n);
    veil.uniforms.mid.value.lerpColors(GOLD.mid, OVERCAST.mid, over).lerp(NIGHT.mid, n);
    veil.uniforms.bottom.value.lerpColors(GOLD.bottom, OVERCAST.bottom, over).lerp(NIGHT.bottom, n);
    (scene as any).environmentIntensity = 0.75 * (1 - 0.55 * over) * (1 - 0.6 * n); // night stays readable (a game choice)
    if (sun.current) {
      sun.current.intensity = 3.1 * (1 - 0.78 * over) * (1 - 0.72 * n);
      sun.current.color.copy(day.sun).lerp(tmpC.set('#dfe6ee'), over).lerp(tmpC.set('#9fb3d6'), n);
    }
    if (hemi.current) { hemi.current.intensity = 0.55 + 0.35 * over - 0.22 * n; hemi.current.color.set('#dfeaf6').lerp(tmpC.set('#5d7396'), n); }
    if (fill.current) fill.current.intensity = 0.25 + 0.25 * over + 0.3 * n;
    fog.color.copy(day.fog).lerp(tmpC.set('#b9bec2'), over).lerp(tmpC.set('#16233a'), n);
    fog.density = 0.0007 + 0.0016 * over + 0.0004 * n;
  });
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(center[0], center[1], center[2]); return o; }, [center[0], center[1], center[2]]);
  const sunPos: [number, number, number] = [center[0] + SUN_DIR.x * 220, center[1] + SUN_DIR.y * 220, center[2] + SUN_DIR.z * 220];
  const S = radius * 1.05;
  return (
    <group>
      <mesh material={veil} frustumCulled={false} renderOrder={-10}><planeGeometry args={[2, 2]} /></mesh>
      <primitive object={target} />
      <directionalLight ref={sun} castShadow={shadows} position={sunPos} target={target} intensity={3.1} color="#ffe2b8"
        shadow-mapSize-width={high ? 4096 : 2048} shadow-mapSize-height={high ? 4096 : 2048} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-left={-S} shadow-camera-right={S} shadow-camera-top={S} shadow-camera-bottom={-S} shadow-camera-near={20} shadow-camera-far={520} />
      <hemisphereLight ref={hemi} args={['#dfeaf6', '#6e5c44', 0.55]} />
      <directionalLight ref={fill} position={[center[0] + 90, center[1] + 50, center[2] - 70]} intensity={0.25} color="#a9c4ff" />
      <CloudSea y={baseY - 26} center={center} still={still} mood={mood} night={night} />
      <CloudPuffs center={center} radius={radius} y={baseY} still={still} mood={mood} night={night} />
    </group>
  );
}

/** A soft sea of clouds far below the island (procedural noise; backdrop only). */
function CloudSea({ y, center, still, mood, night }: { y: number; center: [number, number, number]; still: boolean; mood: number; night: number }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uLit: { value: new THREE.Color('#ffe9cf') }, uShade: { value: new THREE.Color('#8ea2ba') }, uC: { value: new THREE.Vector2(center[0], center[2]) }, uSun: { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uLit; uniform vec3 uShade; uniform vec2 uC; uniform vec2 uSun; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){
        vec2 q = (vW.xz - uC) * 0.011 + vec2(uTime * 0.006, uTime * 0.002);
        float d = fbm(q);
        float dl = fbm(q + uSun * 0.08);
        float dens = smoothstep(0.42, 0.78, d);
        float lit = clamp(0.5 + (d - dl) * 5.0, 0.0, 1.0);
        vec3 col = mix(uShade, uLit, lit * lit);
        float r = length(vW.xz - uC);
        float fade = smoothstep(900.0, 300.0, r);
        gl_FragColor = vec4(col, dens * fade * 0.82);
        #include <colorspace_fragment>
      }`,
  }), [center[0], center[2]]);
  useEffect(() => () => mat.dispose(), [mat]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    if (!still) mat.uniforms.uTime.value += dt;
    const over = Math.min(1, mood * 1.6);
    mat.uniforms.uLit.value.set('#ffffff').lerp(tmp.set('#c5cbd0'), over).lerp(tmp.set('#2f4670'), night);
    mat.uniforms.uShade.value.set('#a8c6e0').lerp(tmp.set('#7d868f'), over).lerp(tmp.set('#0c1628'), night);
  });
  return (
    <mesh material={mat} position={[center[0], y, center[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-5}>
      <planeGeometry args={[1800, 1800, 1, 1]} />
    </mesh>
  );
}

/** A few cloud puffs drifting around and below the island (decorative backdrop, not weather). */
function CloudPuffs({ center, radius, y, still, mood, night }: { center: [number, number, number]; radius: number; y: number; still: boolean; mood: number; night: number }) {
  const ref = useRef<THREE.Group>(null!);
  const map = useMemo(() => artTex('tex-cloud.webp'), []);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.92, fog: false }), [map]);
  useEffect(() => () => mat.dispose(), [mat]);
  const puffs = useMemo(() => Array.from({ length: 9 }, (_, k) => {
    const th = (k / 9) * Math.PI * 2 + hash(k * 7) * 0.5;
    const rr = radius * (1.25 + hash(k * 3) * 0.5);
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, yy: -radius * (0.3 + hash(k * 5) * 0.3), s: radius * (0.16 + hash(k * 11) * 0.14) };
  }), [radius]);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    if (!still && ref.current) ref.current.rotation.y += dt * 0.008;
    const over = Math.min(1, mood * 1.6);
    mat.color.set('#ffffff').lerp(tmp.set('#b8bec4'), over).lerp(tmp.set('#2c3f60'), night);
  });
  return (
    <group ref={ref} position={[center[0], y, center[2]]}>
      {puffs.map((p, k) => <sprite key={k} material={mat} position={[p.x, p.yy, p.z]} scale={[p.s * 1.9, p.s * 1.07, 1]} renderOrder={-4} />)}
    </group>
  );
}
