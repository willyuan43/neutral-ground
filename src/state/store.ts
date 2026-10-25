import { create } from 'zustand';
import type { GameData } from '../data/load';

export type Screen = 'title' | 'levels' | 'level1' | 'level2' | 'level3' | 'about' | 'campaign' | 'collection';
export interface LevelProgress { stars: number; tries: number; cleared: boolean; best?: string }
export interface Settings { sound: boolean; reduceMotion: boolean; aerial: boolean; graphics?: 'high' | 'low'; science?: boolean;
  /** map layers on the island (see stage/real/Layers.tsx) */ layers?: { boundary?: boolean; places?: boolean; water?: boolean; steep?: boolean } }

const KEY = 'neutral-ground-prototype-v1';
// Per-viewer convenience only (stars and settings). Wrapped in try/catch: storage can be blocked.
function loadSaved(): { progress: Record<number, LevelProgress>; settings: Settings } | null {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function save(progress: Record<number, LevelProgress>, settings: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify({ progress, settings })); } catch { /* ignore */ }
}

// touch devices (phones, most tablets) start with the lighter graphics setting
export const defaultGraphics = (): 'high' | 'low' => { try { return window.matchMedia('(pointer: coarse)').matches ? 'low' : 'high'; } catch { return 'high'; } };
const prefersReduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

interface State {
  screen: Screen;
  data: GameData | null;
  progress: Record<number, LevelProgress>;
  settings: Settings;
  setScreen: (s: Screen) => void;
  setData: (d: GameData) => void;
  recordTry: (level: number) => void;
  recordClear: (level: number, stars: number, best?: string) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  resetProgress: () => void;
}

const saved = loadSaved();
const emptyProgress = (): Record<number, LevelProgress> => ({ 1: { stars: 0, tries: 0, cleared: false }, 2: { stars: 0, tries: 0, cleared: false }, 3: { stars: 0, tries: 0, cleared: false } });

export const useGame = create<State>((set, get) => ({
  screen: 'title',
  data: null,
  progress: saved?.progress ?? emptyProgress(),
  // sound on by default (soft generated music and clicks start with the first tap; the mute button is always on screen)
  settings: saved?.settings ?? { sound: true, reduceMotion: prefersReduced(), aerial: false },
  setScreen: (screen) => set({ screen }),
  setData: (data) => set({ data }),
  recordTry: (level) => {
    const p = { ...get().progress };
    p[level] = { ...p[level], tries: (p[level]?.tries ?? 0) + 1 };
    set({ progress: p }); save(p, get().settings);
  },
  recordClear: (level, stars, best) => {
    const p = { ...get().progress };
    const prev = p[level] ?? { stars: 0, tries: 0, cleared: false };
    p[level] = { ...prev, cleared: true, stars: Math.max(prev.stars, stars), best: stars >= prev.stars ? best : prev.best };
    set({ progress: p }); save(p, get().settings);
  },
  setSetting: (k, v) => { const s = { ...get().settings, [k]: v }; set({ settings: s }); save(get().progress, s); },
  resetProgress: () => { const p = emptyProgress(); set({ progress: p }); save(p, get().settings); },
}));

export const levelUnlocked = (progress: Record<number, LevelProgress>, level: number) =>
  level === 1 || !!progress[level - 1]?.cleared;
