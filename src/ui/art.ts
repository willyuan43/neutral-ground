// Illustrations (generated with Higgsfield for this prototype — fictional characters, no real people, no animals) and the
// "Where we are" relief map (real data: AWS Terrain Tiles / USGS 3DEP + OpenStreetMap). Files live in public/art/;
// the single-file build inlines them (scripts/build-single.mjs). Every image has a drawn fallback, so the game still runs
// without them.
import type { NpcId } from '../campaign/campaign';

const base = () => (import.meta as any).env?.BASE_URL ?? './';
const inline = (): Record<string, string> | undefined => (globalThis as any).__NG_FILES__;

export function artUrl(name: string): string {
  const inl = inline()?.[`art/${name}`];
  if (inl) return `data:${name.endsWith('.json') ? 'application/json' : name.endsWith('.png') ? 'image/png' : name.endsWith('.glb') ? 'model/gltf-binary' : 'image/webp'};base64,${inl}`;
  return `${base()}art/${name}`;
}

/** The bytes of an art file. In the single-file build they are decoded from the inline copy: no fetch, because some hosts
 *  (sandboxed viewers) block fetching data: URLs. Otherwise fetched from art/. */
export async function artBytes(name: string): Promise<ArrayBuffer> {
  const inl = inline()?.[`art/${name}`];
  if (inl) { const s = atob(inl); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  const r = await fetch(`${base()}art/${name}`);
  if (!r.ok) throw new Error(`Could not load ${name}`);
  return r.arrayBuffer();
}
export async function artJson<T = any>(name: string): Promise<T | null> {
  try { return JSON.parse(new TextDecoder().decode(await artBytes(name))) as T; } catch { return null; }
}

export type Mood = 'calm' | 'happy' | 'worried';
export type Who = NpcId | 'juno';
/** head-and-shoulders portrait (transparent); calm uses the happy face */
export const faceArt = (id: Who, mood: Mood) => artUrl(`face-${id}-${mood === 'worried' ? 'worried' : 'happy'}.webp`);
/** full-body standee (transparent, 600 px tall, feet at the bottom) */
export const bodyArt = (id: Who) => artUrl(`body-${id}.webp`);
export type IconKey = 'token' | 'sweat' | 'water' | 'calendar' | 'rain' | 'sprout' | 'star' | 'balance';
export const iconArt = (k: IconKey) => artUrl(`icon-${k}.webp`);
export type CardArt = 'replant' | 'trees' | 'trail-open' | 'trail-closed' | 'trail-reroute' | 'check' | 'shade' | 'garden' | 'tank';
export const cardArt = (k: CardArt) => artUrl(`card-${k}-a.webp`);
export const endingArt = (k: string) => artUrl(`ending-${k}.webp`);
/** photo-realistic illustration of an ending (AI-generated for this prototype; labelled on screen, never shown as a photo of the park) */
export const endingPhoto = (k: string) => artUrl(`ending-photo-${k}.webp`);
export const LOGO = () => artUrl('logo.webp');
export const JUNO_WAVE = () => artUrl('juno-wave.webp');
export const SF_MAP = () => artUrl('sf-map.webp');

export const ART_CREDIT = 'Illustrations, ending pictures and textures: generated with Higgsfield (GPT Image 2.5, Nano Banana Pro) for this prototype — fictional characters; the ending pictures are AI illustrations, not photos of Glen Canyon.';
