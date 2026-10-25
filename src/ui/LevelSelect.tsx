import { useGame, levelUnlocked } from '../state/store';
import type { GameData } from '../data/load';
import { Stage } from '../stage/Stage';
import { sfx } from '../audio/sfx';
import { LEVEL1, LEVEL2 } from '../levels/stormLevels';
import { LEVEL3 } from '../levels/slopeLevel';

const LEVELS = [
  { n: 1, title: 'Where does the water go?', diff: 'easy', label: 'Easy', blurb: 'A short storm hits the Rec Center. Put one rain garden where the water actually runs.', screen: 'level1' as const,
    stars: [`Biggest hour ≤ ${LEVEL1.targetPeak} m³`, 'Do it with the small garden', 'Guess the outcome right'], lesson: 'Water follows the ground.' },
  { n: 2, title: 'The Long Storm', diff: 'hard', label: 'Hard', blurb: 'New Year’s Eve 2022: a whole day of rain. A full garden can’t catch the peak — and “later” isn’t “less”.', screen: 'level2' as const,
    stars: ['Meet both goals', `Spend ≤ ${LEVEL2.star3Budget} tokens`, 'Guess the outcome right'], lesson: 'Later isn’t less. Avoid before you reduce.' },
  { n: 3, title: 'Neutral Ground', diff: 'vhard', label: 'Very hard', blurb: 'Restore the east slope through the dry 2021 water year and the big storms after it — without losing ground anywhere.', screen: 'level3' as const,
    stars: ['Goal + no net loss + budget', 'No habitat face “further”', `Use ≤ ${LEVEL3.star3Tokens} tokens`], lesson: 'Restoration isn’t more trees; losses are balanced like for like.' },
];

export function Stars({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <div className={big ? 'big-stars' : 'stars'} aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((k) => <span key={k} className={k < n ? 'on' : ''}>★</span>)}
    </div>
  );
}

export function LevelSelect({ d }: { d: GameData }) {
  const { setScreen, progress, settings } = useGame();
  return (
    <div className="screen">
      <div className="canvas-wrap">
        <Stage d={d} view="overview" aerial={settings.aerial} reduceMotion={settings.reduceMotion} interactive={false} autoRotate />
      </div>
      <div className="levels">
        <h2>Choose a level</h2>
        <div className="level-cards">
          {LEVELS.map((L) => {
            const open = levelUnlocked(progress, L.n);
            const p = progress[L.n];
            return (
              <button key={L.n} className="level-card" disabled={!open} onClick={() => { sfx.play('click'); setScreen(L.screen); }}>
                <span className="num">Level {L.n}</span>
                <h3>{L.title}</h3>
                <span className={`diff ${L.diff}`}>{L.label}</span>
                <p>{open ? L.blurb : 'Clear the level before to unlock.'}</p>
                <Stars n={p?.stars ?? 0} />
                {open && <span className="star-goals">{L.stars.map((t, k) => <span key={k}>☆ {t}</span>)}</span>}
                {p?.cleared && (p.stars ?? 0) > 0 && <span className="learned">Cleared · the idea behind it: {L.lesson}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn ghost" onClick={() => setScreen('title')}>← Title</button>
          <button className="btn ghost" onClick={() => setScreen('about')}>Data & credits</button>
          <button className="btn ghost" onClick={() => { for (const n of [1, 2]) if (!progress[n]?.cleared) useGame.getState().recordClear(n, 0); }}>Unlock all (demo)</button>
        </div>
        <span className="tag dark">Prototype model · teaching assumptions — not a forecast, not an engineering design</span>
      </div>
    </div>
  );
}
