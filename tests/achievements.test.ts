// T11: achievements for features not in the build are hidden; the collection survives a reload and works when storage is blocked.
import { describe, it, expect, beforeEach } from 'vitest';
import { ACHIEVEMENTS, FEATURES, shownAchievements, achievementOn } from '../src/content/achievements';
import { addAchievements, addEnding, getCollection, clearCollection, addCorrectGuess, _forgetForTests } from '../src/state/collection';

function fakeStorage() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; }

describe('achievements', () => {
  it('eighteen in all; one for a feature that is off is not shown', () => {
    expect(ACHIEVEMENTS.length).toBe(18);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(18);
    const was = FEATURES.swap;
    FEATURES.swap = false;
    expect(shownAchievements().some((a) => a.id === 'storm-swapper')).toBe(false);
    expect(achievementOn('storm-swapper')).toBe(false);
    FEATURES.swap = was;
    expect(achievementOn('storm-swapper')).toBe(was);
  });
});

describe('collection (this browser only)', () => {
  beforeEach(() => { (globalThis as any).localStorage = fakeStorage(); _forgetForTests(); clearCollection(); });
  it('is still there after a reload, and never issues an achievement twice', () => {
    expect(addAchievements(['watered-through', 'watered-through'])).toEqual(['watered-through']);
    expect(addEnding('neutral')).toBe(true);
    addCorrectGuess();
    _forgetForTests(); // reload
    const c = getCollection();
    expect(c.achievements).toEqual(['watered-through']);
    expect(c.endings).toEqual(['neutral']);
    expect(c.correctGuesses).toBe(1);
    expect(addAchievements(['watered-through'])).toEqual([]);
    expect(addEnding('neutral')).toBe(false);
  });
  it('works in memory when storage is blocked', () => {
    (globalThis as any).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    _forgetForTests();
    expect(addAchievements(['listener'])).toEqual(['listener']);
    expect(getCollection().achievements).toEqual(['listener']);
  });
});
