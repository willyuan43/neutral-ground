// The guide layer: what a first-time player needs, the way games do it.
// - A storm flash-forward: the season's boss is the real New Year's Eve 2022 storm. Then a rewind to autumn 2020.
// - A mission card: three goals (the ending rules) to earn three stars.
// - A task list: what to do now, ticked off as you go, with a countdown to the storm.
// - Neighbour requests: why each person is here (their ask, from the quest rules).
// Display only: every number shown here comes from the data or the model; the goals are the ending rules.
import { useEffect, useRef, type ReactNode } from 'react';
import type { NpcId } from '../../campaign/campaign';
import { CREDITS } from '../../content/credits';
import { NPCS } from '../../content/npcs';
import { Avatar } from './parts';

/** Heavy rain over the whole screen (a canvas of falling streaks) — the cold open only. */
export function ScreenRain({ on, still }: { on: boolean; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!on) return;
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext('2d'); if (!g) return;
    let raf = 0; const drops: { x: number; y: number; v: number; l: number }[] = [];
    const size = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
    size(); window.addEventListener('resize', size);
    for (let i = 0; i < 260; i++) drops.push({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.8, l: 12 + Math.random() * 22 });
    const draw = () => {
      const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(205,225,255,0.55)'; g.lineWidth = 1.2; g.beginPath();
      for (const d of drops) {
        if (!still) { d.y += d.v * 0.022; d.x += d.v * 0.004; if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); } if (d.x > 1) d.x -= 1; }
        const x = d.x * W, y = d.y * H; g.moveTo(x, y); g.lineTo(x - d.l * 0.18, y - d.l);
      }
      g.stroke();
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, [on, still]);
  if (!on) return null;
  return <canvas ref={ref} className="screen-rain" aria-hidden />;
}

/** The cold open: the storm first (the boss you prepare for), then the rewind to the start. */
export function StormColdOpen({ stage, nyeMm, onSkip }: { stage: 0 | 1; nyeMm: number | null; onSkip: () => void }) {
  return (
    <button className={`storm-open st-${stage}`} onClick={onSkip} aria-label="Skip the intro">
      {stage === 0 ? (
        <>
          <span className="so-presents">{CREDITS.team} presents</span>
          <span className="so-eyebrow">Glen Canyon Park · San Francisco</span>
          <span className="so-title">31 Dec 2022</span>
          <span className="so-sub">{nyeMm != null ? <>{Math.round(nyeMm)} mm of rain in one day <span className="tag obs">observed</span></> : <>The biggest storm in years</>}</span>
          <span className="so-sub2">Rain pours off bare ground into the drain.</span>
        </>
      ) : (
        <>
          <span className="so-rewind" aria-hidden>⏪</span>
          <span className="so-title">Autumn 2020</span>
          <span className="so-sub">Three autumns to get the canyon ready.</span>
        </>
      )}
      <span className="so-skip">tap to skip</span>
    </button>
  );
}

export const GOALS: { id: 'meadow' | 'storm' | 'friends'; icon: string; title: string; sub: string; who?: NpcId }[] = [
  { id: 'meadow', icon: '🌱', title: 'Grow the meadow', sub: 'native grass back on the slope', who: 'maya' },
  { id: 'storm', icon: '⛈️', title: 'Beat the storm', sub: 'its biggest hour under the line', who: 'chen' },
  { id: 'friends', icon: '🤝', title: 'Help 3 neighbours', sub: 'they will ask you for things' },
];

/** The mission: what winning means (the ending rules), before the first move. */
export function MissionCard({ onGo, touch = false }: { onGo: () => void; touch?: boolean }) {
  return (
    <div className="modal-bg mission-bg">
      <div className="modal mission">
        <div className="mi-eyebrow">Your mission</div>
        <h2>Get the canyon ready for the New Year’s Eve storm</h2>
        <div className="mi-goals">
          {GOALS.map((g, k) => (
            <div key={g.id} className="mi-goal" style={{ animationDelay: `${0.15 + k * 0.18}s` }}>
              <span className="mi-star" aria-hidden>★</span>
              <span className="mi-ic" aria-hidden>{g.icon}</span>
              <div><b>{g.title}</b><small>{g.sub}</small></div>
            </div>
          ))}
        </div>
        <div className="mi-count"><span aria-hidden>⛈️</span> The storm comes in <b>3 autumns</b></div>
        <div className="mi-keys" aria-label="How to play">
          <span><b aria-hidden>🚶</b>{touch ? 'Tap the ground to walk' : <>Walk: <kbd>W A S D</kbd> or click</>}</span>
          <span><b aria-hidden>🌱</b>{touch ? 'Tap the big button' : <>Do it: <kbd>Space</kbd></>}</span>
          <span><b aria-hidden>🎯</b>Follow your task list</span>
        </div>
        <button className="btn go big pulse" onClick={onGo}>Let’s go! 🌱</button>
        <p className="small-note">Real place · real 2020–23 weather · teaching model · fictional neighbours</p>
      </div>
    </div>
  );
}

export interface Task { id: string; text: ReactNode; done: boolean }
/** The task list: what to do now (the first open task glows), with the countdown to the storm. */
export function TaskList({ title, count, tasks, stars }: { title: ReactNode; count: ReactNode; tasks: Task[]; stars?: Partial<Record<'meadow' | 'storm' | 'friends', boolean>> }) {
  const cur = tasks.findIndex((t) => !t.done);
  return (
    <div className="task-list" role="status" aria-live="polite">
      <div className="tl-head"><b>🎯 {title}</b><span className="tl-count">{count}</span></div>
      <ol>
        {tasks.map((t, k) => (
          <li key={t.id} className={t.done ? 'done' : k === cur ? 'now' : ''}>
            <i aria-hidden>{t.done ? '✓' : k === cur ? '▶' : ''}</i><span>{t.text}</span>
          </li>
        ))}
      </ol>
      <div className="tl-stars" title="Your three stars: the mission goals">
        {GOALS.map((g) => <span key={g.id} className={stars?.[g.id] ? 'on' : ''}>★ {g.icon}</span>)}
      </div>
    </div>
  );
}

/** A neighbour's request: who they are and what they ask (their quest, in their words). */
export function RequestCard({ id, onOk }: { id: NpcId; onOk: () => void }) {
  const n = NPCS[id];
  return (
    <div className="req-card" role="dialog" aria-label={`${n.name} asks for something`}>
      <div className="rq-eyebrow">New request</div>
      <div className="rq-row">
        <Avatar id={id} size={52} mood="happy" />
        <div>
          <b>{n.name}</b> <span className="tag sim">Simulated neighbor</span>
          <small>{n.role}</small>
        </div>
      </div>
      <p className="rq-ask">“{n.ask}”</p>
      <p className="rq-why">Neighbours ask for things. Help 3 of the 4 to earn a ★.</p>
      <button className="btn primary" onClick={onOk}>Got it</button>
    </div>
  );
}
