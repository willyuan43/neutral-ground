// Loads the prototype's prepared data (public/data, made by scripts/prep-data.mjs). No network beyond this origin.
import type { StormSite } from '../model/storm';

export interface GridMeta {
  rows: number; cols: number; cellM: number; originX: number; originY: number; crs: string;
  elevMin: number; elevMax: number; parkCells: number;
}
export interface Storm {
  id: 'SFO' | 'OAK'; name: string; station: string; stationId: string; distanceKm: number; file: string;
  startLocal: string; rainMm: number[]; totalMm: number; maxHourMm: number; hourLabels: string[];
}
export interface Storms { SFO: Storm; OAK: Storm; downtownDaily20221231Mm: number; center: { lon: number; lat: number } }
export interface WeatherDaily {
  start: string; end: string; days: number; dates: string[]; precipMm: number[]; et0Mm: number[]; label: string;
  station?: { id: string; name: string; distanceKm: number };
  waterYears: { wy: number; start: string; end: string; rainMm: number }[];
}
export interface Zone { index: number; code: string | null; mgmtClass?: number; referenceEcosystem?: string; sourceAreaM2?: number; cells?: number; description?: string }

export interface GameData {
  grid: GridMeta;
  elev: Float32Array;
  cover: Uint8Array;
  inPark: Uint8Array;
  zone: Uint8Array;
  hsg: Uint8Array;
  acc: Float32Array;
  down: Int32Array;
  site: StormSite & { stats?: any; zoneOutlet?: any };
  storms: Storms;
  weather: WeatherDaily;
  zones: { zones: Zone[]; soilUnits: any[]; note: string; awcCoverage?: { components: number; withoutAwc: number } };
  slope?: any;
  ndvi?: any;
  manifest?: any;
  buildings?: { note: string; count: number; b: { h: number; p: 0 | 1; r: number[][] }[] };
  creek?: { note: string; lines: { name: string | null; culvert: boolean; p: number[] }[] };
  /** real named places around the park (OpenStreetMap), for the Places layer */
  places?: { note: string; places: { name: string; kind: string; r: number; c: number }[] };
}

const base = () => (import.meta as any).env?.BASE_URL ?? './';
const url = (f: string) => `${base()}data/${f}`;

// The single-file build (scripts/build-single.mjs) puts every file of public/data/ into window.__NG_FILES__ (base64)
// so the game runs from one HTML file with no requests. The normal build fetches ./data/ instead.
const inlineFiles = (): Record<string, string> | undefined => (globalThis as any).__NG_FILES__;
function b64ToBuffer(b64: string): ArrayBuffer {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
const inlineJson = (b64: string) => JSON.parse(new TextDecoder().decode(b64ToBuffer(b64)));
/** URL for an image in public/data/ (a data: URL in the single-file build). */
export function dataImageUrl(f: string, mime = 'image/jpeg') {
  const inl = inlineFiles()?.[f];
  return inl ? `data:${mime};base64,${inl}` : url(f);
}

async function bin(f: string) {
  const inl = inlineFiles()?.[f];
  if (inl) return b64ToBuffer(inl);
  const r = await fetch(url(f));
  if (!r.ok) throw new Error(`Could not load ${f}`);
  return r.arrayBuffer();
}
async function json<T = any>(f: string): Promise<T> {
  const inl = inlineFiles()?.[f];
  if (inl) return inlineJson(inl);
  const r = await fetch(url(f));
  if (!r.ok) throw new Error(`Could not load ${f}`);
  return r.json();
}
async function optionalJson<T = any>(f: string): Promise<T | undefined> {
  const files = inlineFiles();
  if (files) return files[f] ? inlineJson(files[f]) : undefined;
  try { const r = await fetch(url(f)); if (!r.ok) return undefined; return await r.json(); } catch { return undefined; }
}

let cache: Promise<GameData> | null = null;
export function loadGameData(): Promise<GameData> {
  if (!cache) {
    cache = (async () => {
      const [grid, elev, cover, inPark, zone, hsg, acc, down, site, storms, weather, zones, slope, ndvi, manifest, buildings, creek, places] = await Promise.all([
        json<GridMeta>('grid.json'), bin('elev.f32'), bin('cover.u8'), bin('inpark.u8'), bin('zone.u8'), bin('hsg.u8'), bin('acc.f32'), bin('down.i32'),
        json('site-storm.json'), json<Storms>('storms.json'), json<WeatherDaily>('weather-daily.json'), json('zones.json'),
        optionalJson('site-slope.json'), optionalJson('ndvi.json'), optionalJson('manifest.json'), optionalJson('buildings.json'), optionalJson('creek.json'), optionalJson('places.json'),
      ]);
      return {
        grid, elev: new Float32Array(elev), cover: new Uint8Array(cover), inPark: new Uint8Array(inPark), zone: new Uint8Array(zone),
        hsg: new Uint8Array(hsg), acc: new Float32Array(acc), down: new Int32Array(down), site, storms, weather, zones, slope, ndvi, manifest, buildings, creek, places,
      } as GameData;
    })();
  }
  return cache;
}
