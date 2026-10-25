// Game-style HUD pieces shared by the levels: brand, resource chips, target pill, illustrated action cards,
// option tray, water-fate panel, habitat-face panel and the speech bubble. Every number shown comes from the model.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '../state/store';
import { Menu, CircleHelp, Satellite, Volume2, VolumeX, FlaskConical, Target } from 'lucide-react';
import type { StormResult } from '../model/storm';
import { ArtOr } from './ArtBits';

export function Brand() {
  return (
    <div className="g-brand">
      <svg className="g-logo" viewBox="0 0 48 48" aria-hidden>
        <path d="M6 20 L24 10 L42 20 L24 30 Z" fill="#8cc152" />
        <path d="M6 20 L24 30 L24 40 L6 30 Z" fill="#8a5b3a" />
        <path d="M42 20 L24 30 L24 40 L42 30 Z" fill="#6b4329" />
        <circle cx="19" cy="17" r="3.4" fill="#4f8a3a" /><circle cx="27" cy="15" r="2.8" fill="#6fae45" />
        <path d="M14 23 Q24 19 32 24" stroke="#4fc3f7" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <div className="g-brand-text"><b>NEUTRAL GROUND:</b><span>Hold the Canyon</span></div>
    </div>
  );
}

export function ResChip({ icon, label, value, tone = 'gold', warn = false, amount }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'gold' | 'sand' | 'water' | 'sky'; warn?: boolean;
  /** the number spent so far: when it changes, a floating “−n / +n” shows the change (from the model's costs) */ amount?: number }) {
  const prev = useRef<number | undefined>(amount);
  const [delta, setDelta] = useState<{ v: number; k: number } | null>(null);
  useEffect(() => {
    if (amount == null) return;
    const p = prev.current; prev.current = amount;
    if (p == null || Math.abs(amount - p) < 1e-9) return;
    setDelta({ v: amount - p, k: Date.now() });
    const id = window.setTimeout(() => setDelta(null), 1400);
    return () => window.clearTimeout(id);
  }, [amount]);
  return (
    <div className={`g-chip ${warn ? 'warn' : ''} ${delta ? 'bump' : ''}`} key={delta?.k}>
      <span className={`g-chip-ico ${tone}`}>{icon}</span>
      <span className="g-chip-txt"><span className="g-chip-label">{label}</span><span className="g-chip-val">{value}</span></span>
      {delta && <span className={`g-chip-delta ${delta.v > 0 ? 'spend' : 'gain'}`}>{delta.v > 0 ? `−${Math.round(delta.v)}` : `+${Math.round(-delta.v)}`}</span>}
    </div>
  );
}

export function TopBar({ chips, coachOpen, onCoach, extra }: { chips: ReactNode; coachOpen: boolean; onCoach: () => void; extra?: ReactNode }) {
  const { setScreen, settings, setSetting } = useGame();
  return (
    <div className="g-top">
      <Brand />
      <div className="g-res">{chips}</div>
      {extra}
      <div className="g-actions">
        <button className={`g-science ${settings.science ? 'on' : ''}`} onClick={() => setSetting('science', !settings.science)} title="Show sources, formulas and qualifiers">
          <FlaskConical /> <span className="g-science-l">Science</span>
        </button>
        <button className="icon-btn" title="Levels" onClick={() => setScreen('levels')} aria-label="Levels"><Menu /></button>
        <button className={`icon-btn ${coachOpen ? 'on' : ''}`} title="Tips" onClick={onCoach} aria-label="Tips"><CircleHelp /></button>
        <button className={`icon-btn ${settings.sound ? 'on' : ''}`} title="Sound" onClick={() => setSetting('sound', !settings.sound)} aria-label="Sound">{settings.sound ? <Volume2 /> : <VolumeX />}</button>
      </div>
    </div>
  );
}

export function TargetPill({ level, text, tags, children }: { level: string; text: ReactNode; tags?: ReactNode; children?: ReactNode }) {
  const science = useGame((s) => s.settings.science);
  return (
    <div className="g-target">
      <div className="g-target-main"><Target className="g-target-ico" /> <span className="g-target-lvl">{level}</span> <span>{text}</span></div>
      <div className="g-target-tags"><span className="tag model">Prototype model · teaching assumptions</span>{science && tags}</div>
      {children}
    </div>
  );
}

export interface CardDef { id: string; name: string; icon: ReactNode; art: string; img?: string; cost?: ReactNode; tag?: string; on?: boolean; badge?: ReactNode; disabled?: boolean }
export function Cards({ cards, selected, onSelect, onHover }: { cards: CardDef[]; selected: string | null; onSelect: (id: string) => void; onHover?: (id: string | null) => void }) {
  return (
    <div className="g-cards" role="toolbar" aria-label="Actions" onMouseLeave={() => onHover?.(null)}>
      {cards.map((c) => (
        <button key={c.id} className={`g-card ${selected === c.id ? 'sel' : ''} ${c.on ? 'on' : ''}`} data-tag={c.tag?.toLowerCase()} onClick={() => onSelect(c.id)} disabled={c.disabled} aria-pressed={selected === c.id}
          onMouseEnter={() => onHover?.(c.id)} onFocus={() => onHover?.(c.id)} onBlur={() => onHover?.(null)}>
          <span className={`g-card-art ${c.img ? 'has-img' : ''}`} style={{ background: c.art }}>{c.img ? <ArtOr className="g-card-img" src={c.img} fallback={c.icon} /> : c.icon}</span>
          <span className="g-card-name">{c.name}</span>
          {c.cost != null && <span className="g-card-cost">{c.cost}</span>}
          {c.tag && <span className="g-card-tag">{c.tag}</span>}
          {c.badge && <span className="g-card-badge">{c.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tray({ title, children, note, tone }: { title: ReactNode; children: ReactNode; note?: ReactNode; /** the card type, for its colour */ tone?: string }) {
  const science = useGame((s) => s.settings.science);
  return (
    <div className="g-tray" data-tag={tone}>
      <div className="g-tray-title">{title}</div>
      <div className="g-tray-body">{children}</div>
      {note && <div className={`g-tray-note ${science ? 'sci' : ''}`}>{note}</div>}
    </div>
  );
}

/** Where the storm's water went, from the model run (no evaporation: it is not modelled during a storm). */
export function FatePanel({ result, title, sub, children }: { result: StormResult; title: string; sub?: string; children?: ReactNode }) {
  const science = useGame((s) => s.settings.science);
  const straight = Math.max(0, result.drainTotal - result.delayedTotal);
  const rows = [
    { k: 'ground', label: 'Soaked into the ground', v: result.soakedGround, c: '#4fb3a4' },
    { k: 'fac', label: 'Soaked in gardens / gravel', v: result.soakedFacilities, c: '#86c95a' },
    { k: 'tank', label: 'Kept in the tank', v: result.heldForWatering, c: '#7aa7da' },
    { k: 'held', label: 'Still held at the end', v: result.stillStored, c: '#b6dfee' },
    { k: 'delay', label: 'Let out later (pipe)', v: result.delayedTotal, c: '#a98be8' },
    { k: 'drain', label: 'Straight to the drain', v: straight, c: '#3f7fe0' },
  ].filter((r) => r.v > 0.05);
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  return (
    <div className="g-panel g-fate">
      <div className="g-panel-title">{title}</div>
      {sub && <div className="g-panel-sub">{sub}</div>}
      <div className="g-fate-body">
        <div className="g-fate-bar" aria-hidden>
          {rows.map((r) => <span key={r.k} style={{ flexGrow: r.v / total, background: r.c }} />)}
        </div>
        <div className="g-fate-legend">
          {rows.map((r) => (
            <div key={r.k} className="g-fate-row"><i style={{ background: r.c }} /><span>{r.label}</span><b>{r.v.toFixed(1)}</b></div>
          ))}
          <div className="g-fate-unit">m³ · {total.toFixed(0)} m³ in all</div>
        </div>
      </div>
      {science && <div className="g-panel-note">Evaporation during the storm is not modelled. Water balance closes to {Math.abs(result.balanceError).toExponential(1)} m³.</div>}
      {children}
    </div>
  );
}

export function GoalBar({ label, value, target, max, dir, pass, digits = 1 }: { label: string; value: number | null; target: number; max: number; dir: 'le' | 'ge'; pass?: boolean | null; digits?: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className={`g-goal ${pass === true ? 'pass' : pass === false ? 'fail' : ''}`}>
      <div className="g-goal-top"><span>{label}</span><b>{value != null ? value.toFixed(digits) : '—'}<small> / {dir === 'le' ? '≤' : '≥'} {target}</small></b></div>
      <div className="g-goal-bar">{value != null && <span style={{ width: pct(value) }} />}<i style={{ left: pct(target) }} /></div>
    </div>
  );
}

export function Bubble({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="g-bubble">
      {onClose && <button className="x" aria-label="Hide tips" onClick={onClose}>×</button>}
      {children}
    </div>
  );
}

const FACE_TXT: Record<string, string> = { closer: 'Closer to what it needs', same: 'About the same', further: 'Further from what it needs', insufficient: 'Not enough data yet' };
const FACE_ARROW: Record<string, string> = { closer: '▲', same: '●', further: '▼', insufficient: '?' };
/** One habitat “face”: tracks conditions for a species, never animal counts or presence. */
export function FaceRow({ portrait, name, face, why }: { portrait: ReactNode; name: string; face: string; why?: string }) {
  return (
    <div className={`g-face ${face}`}>
      <span className="g-face-pic">{portrait}</span>
      <span className="g-face-txt"><b>{name}</b><span className="g-face-state">{FACE_ARROW[face]} {FACE_TXT[face]}</span>{why && <span className="g-face-why">{why}</span>}</span>
    </div>
  );
}
