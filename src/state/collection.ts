// The collection (T11): endings found, achievements and correct guesses — kept only in this browser (localStorage, every read
// and write in try/catch; the game works the same when storage is blocked). Can be cleared. Nothing is uploaded.
import type { EndingId } from '../campaign/campaign';

const KEY = 'neutral-ground-season-v1';
export interface Collection { endings: EndingId[]; achievements: string[]; correctGuesses: number; seasons: number; places?: string[] }
const empty = (): Collection => ({ endings: [], achievements: [], correctGuesses: 0, seasons: 0, places: [] });
let mem: Collection | null = null;
function load(): Collection {
  if (mem) return mem;
  try { const s = localStorage.getItem(KEY); mem = s ? { ...empty(), ...JSON.parse(s) } : empty(); } catch { mem = empty(); }
  return mem!;
}
function save(c: Collection) { mem = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked: keep it in memory */ } }
export const getCollection = () => load();
/** Adds achievements; returns the ones that are new to this browser (for the pop-up). */
export function addAchievements(ids: string[]): string[] {
  const c = load();
  const fresh = [...new Set(ids)].filter((id) => !c.achievements.includes(id));
  if (fresh.length) save({ ...c, achievements: [...c.achievements, ...fresh] });
  return fresh;
}
export function addEnding(e: EndingId): boolean { const c = load(); if (c.endings.includes(e)) { save({ ...c, seasons: c.seasons + 1 }); return false; } save({ ...c, endings: [...c.endings, e], seasons: c.seasons + 1 }); return true; }
export function addCorrectGuess(): number { const c = load(); const n = c.correctGuesses + 1; save({ ...c, correctGuesses: n }); return n; }
export function clearCollection() { save(empty()); }
/** A real place tapped on the map (OpenStreetMap names). Returns how many are found, and whether this one is new. */
export function addPlace(name: string): { fresh: boolean; n: number } {
  const c = load(); const have = c.places ?? [];
  if (have.includes(name)) return { fresh: false, n: have.length };
  save({ ...c, places: [...have, name] }); return { fresh: true, n: have.length + 1 };
}
/** Test hook: forget the in-memory copy, as a page reload would. */
export function _forgetForTests() { mem = null; }

/** A steward rank from what this browser has found (a game reward only): 3 points per ending, 1 per good achievement. */
export const RANKS: { name: string; at: number }[] = [
  { name: 'Newcomer', at: 0 }, { name: 'Volunteer', at: 3 }, { name: 'Steward', at: 8 }, { name: 'Ranger', at: 14 }, { name: 'Canyon Keeper', at: 22 },
];
export function rankOf(c: Collection, good: (id: string) => boolean): { name: string; pts: number; next: { name: string; at: number } | null; from: number } {
  const pts = c.endings.length * 3 + c.achievements.filter(good).length;
  let k = 0; for (let i = 0; i < RANKS.length; i++) if (pts >= RANKS[i].at) k = i;
  return { name: RANKS[k].name, pts, next: RANKS[k + 1] ?? null, from: RANKS[k].at };
}
