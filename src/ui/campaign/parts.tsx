// HUD pieces for the canyon season: neighbours' quest board, the “last consequence” panel, and the cards between the years.
// Every number shown here is read off a model run (CampaignResult) or the observed weather record.
import { useState, type ReactNode } from 'react';
import type { GameData } from '../../data/load';
import { A } from '../../model/assumptions';
import { NPCS, QUEST_LABEL, QuestState, Line } from '../../content/npcs';
import type { NpcId, CampaignResult, CampaignState } from '../../campaign/campaign';
import { NPC_IDS, describeAutumn, YEARS } from '../../campaign/campaign';
import { Tok } from '../Icons';
import { consequenceRows } from '../../content/evidence';
import type { WhyStep } from '../../content/why';
import { faceArt } from '../art';

export function Avatar({ id, size = 34, mood = 'calm' }: { id: NpcId | 'juno'; size?: number; mood?: 'calm' | 'happy' | 'worried' }) {
  const color = id === 'juno' ? '#16867a' : NPCS[id].color;
  const [bad, setBad] = useState(false);
  // illustrated portrait (fictional character) in the neighbour's colour; the flat drawing below is the fallback
  if (!bad) return (
    <span className={`npc-av art ${mood}`} style={{ width: size, height: size, background: color }} aria-hidden>
      <img src={faceArt(id, mood)} alt="" draggable={false} onError={() => setBad(true)} />
    </span>
  );
  const mouth = mood === 'happy' ? 'M11 21 Q16 25 21 21' : mood === 'worried' ? 'M11 23 Q16 19.5 21 23' : 'M11.5 22 H20.5';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="npc-av">
      <circle cx="16" cy="16" r="16" fill={color} />
      <circle cx="16" cy="15" r="8.6" fill="#f3d2b3" />
      <path d={id === 'leo' ? 'M7.5 12 Q16 3 24.5 12 L24 9 Q16 1 8 9 Z' : id === 'maya' ? 'M7 15 Q8 5 16 5.5 Q24 5 25 15 Q22 9 16 9 Q10 9 7 15 Z' : id === 'chen' ? 'M7.4 14 Q9 5 16 5 Q23 5 24.6 14 L24.6 19 Q23 12 16 10.5 Q9 12 7.4 19 Z' : id === 'coach' ? 'M8 11 H24 V9 Q16 4 8 9 Z M8 11 H27 V12.4 H8 Z' : 'M7.6 13 Q9 5 16 5 Q23 5 24.4 13 Q20 8.5 16 9 Q12 8.5 7.6 13 Z'} fill={id === 'coach' ? '#173a63' : '#3b2a20'} />
      <circle cx="12.8" cy="15.5" r="1.1" fill="#2a1d14" /><circle cx="19.2" cy="15.5" r="1.1" fill="#2a1d14" />
      <path d={mouth} stroke="#7a3d2a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function QuestBoard({ states, focus, onOpen, pulse, only }: { states: Record<NpcId, QuestState>; focus: NpcId[]; onOpen: (id: NpcId) => void; /** neighbours a hovered card touches */ pulse?: NpcId[]; /** only the neighbours met so far */ only?: NpcId[] }) {
  return (
    <div className="q-board" role="group" aria-label="Neighbours’ quests">
      {NPC_IDS.filter((id) => !only || only.includes(id)).map((id) => (
        <button key={id} className={`q-av ${states[id]} ${focus.includes(id) ? 'focus' : ''} ${pulse?.includes(id) ? 'pulse' : ''}`} onClick={() => onOpen(id)} title={`${NPCS[id].name}: ${QUEST_LABEL[states[id]]}`} aria-label={`${NPCS[id].name}: ${QUEST_LABEL[states[id]]}`}>
          <Avatar id={id} size={30} mood={states[id] === 'done' || states[id] === 'onTrack' ? 'happy' : states[id] === 'atRisk' || states[id] === 'failed' ? 'worried' : 'calm'} />
          <span className="q-mark" aria-hidden>{states[id] === 'done' ? '✓' : states[id] === 'failed' ? '✕' : states[id] === 'atRisk' ? '!' : states[id] === 'onTrack' ? '●' : ''}</span>
        </button>
      ))}
    </div>
  );
}

export function QuestPopover({ id, state, r, onClose, focus, onFocus }: { id: NpcId; state: QuestState; r: CampaignResult; onClose: () => void; focus: NpcId[]; onFocus: (id: NpcId) => void }) {
  const n = NPCS[id];
  const ally = id === 'maya' ? r.allies.maya.some(Boolean) : id === 'leo' ? r.allies.leo.some(Boolean) : id === 'coach' ? r.allies.coach : false;
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal q-pop" onClick={(e) => e.stopPropagation()}>
      <div className="q-pop-head"><Avatar id={id} size={52} /><div><h2>{n.name}</h2><div className="q-role">{n.role} · <span className="tag">Simulated neighbor</span></div></div></div>
      <p className="q-ask">“{n.ask}”</p>
      <div className="q-line"><b>Quest</b> {n.quest}</div>
      <div className="q-line"><b>Ally</b> {n.ally}{ally ? <span className="tag model" style={{ marginLeft: 6 }}>helping now</span> : null}</div>
      <div className={`q-state ${state}`}>{QUEST_LABEL[state]}{state === 'onTrack' || state === 'atRisk' ? ' — Sept 2023 if you add nothing more, model projection' : ''}</div>
      <p className="small-note">A fictional neighbour. The concern echoes kinds of disagreement on record for the park; it speaks for no real person or group.</p>
      <div className="actions">
        <button className="btn" onClick={() => onFocus(id)}>{focus.includes(id) ? 'Stop focusing' : 'Help first'}</button>
        <button className="btn primary" onClick={onClose}>OK</button>
      </div>
    </div></div>
  );
}

// ------------------------------------------------------------------ last consequence (T7): only what differs from doing nothing (rows built in content/evidence.ts)
const narrow = () => { try { return window.matchMedia('(max-width: 720px)').matches; } catch { return false; } };
export type LensKind = 'none' | 'compare' | 'runoff' | 'aerial';
export const LENS_INFO: Record<Exclude<LensKind, 'none'>, { name: string; src: string }> = {
  compare: { name: 'vs Do Nothing', src: 'Model difference: cells whose computed state differs from doing nothing (green better, red worse)' },
  runoff: { name: 'Runoff & Slope', src: 'USGS 3DEP lidar, 5 m: slope steepness (LS factor) and D8 flow paths' },
  aerial: { name: 'Aerial', src: 'USDA NAIP aerial photo, May 2024, resampled to 2048 px' },
};
export function ConsequencePanel({ r, base, title, sub, children, lens, onLens, why, lensKind, onLensKind, reveal = true }: { r: CampaignResult; base: CampaignResult; title: string; sub: string; children?: ReactNode; lens?: boolean; onLens?: () => void; why?: (k: string) => WhyStep[] | null; lensKind?: LensKind; onLensKind?: (k: LensKind) => void; /** false while planning or playing: show the direction only, so the year itself reveals the numbers */ reveal?: boolean }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(() => !narrow());
  const [whyK, setWhyK] = useState<string | null>(null);
  const rows = consequenceRows(r, base);
  const changed = rows.filter((x) => x.dir !== 'same');
  const show = all ? rows : changed.slice(0, 3);
  const chain = whyK && why ? why(whyK) : null;
  return (
    <div className={`g-panel c-panel ${open ? '' : 'closed'}`}>
      <div className="g-panel-title" onClick={() => setOpen(!open)} role="button" aria-expanded={open}>{title} <span aria-hidden>{open ? '▾' : '▸'}</span></div>
      <div className="g-panel-sub">{sub}</div>
      {show.length === 0 && <div className="c-empty">Same as doing nothing so far.</div>}
      {show.map((x) => (
        <div key={x.k} className={`c-row ${x.dir}`} onClick={() => setWhyK(whyK === x.k ? null : x.k)} title="Why? Tap to see the chain from the weather to the result">
          <span className="c-arrow" aria-hidden>{x.dir === 'better' ? '▲' : x.dir === 'worse' ? '▼' : '●'}</span>
          <span className="c-label">{x.label}</span>
          <b className={`c-val ${reveal ? '' : 'hidden-val'}`}>{reveal ? x.plan : x.dir === 'better' ? 'better' : x.dir === 'worse' ? 'worse' : 'same'}</b>
          {reveal && x.base !== '—' && <span className="c-base">doing nothing {x.base}</span>}
          <span className={`tag ${x.tier}`}>{x.tier === 'model' ? 'model' : x.tier === 'obs' ? 'observed' : 'assumption'}</span>
        </div>
      ))}
      {chain && (
        <div className="why"><b>Why?</b>
          <ol>{chain.map((c, k) => <li key={k}>{c.text}<span className={`tag ${c.tier === 'observed' ? 'obs' : c.tier === 'model' ? 'model' : 'assumed'}`}>{c.tier}</span></li>)}</ol>
        </div>
      )}
      <div className="c-actions">
        <button className="btn small" onClick={() => setAll(!all)}>{all ? 'Only changes' : 'All'}</button>
        {/* the model lenses (vs doing nothing, runoff & slope) live in the Layers panel now */}
        {!onLensKind && onLens && <button className={`btn small ${lens ? 'dark' : ''}`} onClick={onLens} title="Tint the cells that differ from doing nothing">vs Do Nothing</button>}
      </div>
      {lensKind && lensKind !== 'none' && <div className="lens-src">{LENS_INFO[lensKind].name} · {LENS_INFO[lensKind].src}</div>}
      {all && <Faces r={r} />}
      {children}
    </div>
  );
}

function Faces({ r }: { r: CampaignResult }) {
  const f = r.slope.faces;
  const txt: Record<string, string> = { closer: 'Closer to what it needs', same: 'Not touched this season', further: 'Further from what it needs', insufficient: 'Not enough data yet' };
  return (
    <div className="c-faces">
      <div className="c-face"><b>Mission blue butterfly</b> {txt[f.butterfly]}{f.butterfly === 'further' || f.butterfly === 'closer' ? ` — grassland ${r.slope.ldn.grassland.area.delta >= 0 ? '+' : ''}${Math.round(r.slope.ldn.grassland.area.delta)} m² vs doing nothing` : ''}</div>
      <div className="c-face"><b>Red-tailed hawk</b> {txt[f.hawk]} — foraging grassland boundary not mapped</div>
      <div className="g-panel-note">Habitat conditions only — not animal counts. We don’t know which of these live in the park today.</div>
    </div>
  );
}

// ------------------------------------------------------------------ neighbour lines with responses
export function Voices({ lines, answered, onRespond, tokensLeft }: { lines: Line[]; answered: Record<string, string>; onRespond: (l: Line, choice: 'adjust' | 'explain' | 'ignore') => void; tokensLeft: number }) {
  if (!lines.length) return null;
  return (
    <div className="voices">
      {lines.map((l) => (
        <div key={l.key} className="voice">
          <Avatar id={l.npc} size={38} mood={l.options ? 'worried' : 'happy'} />
          <div className="voice-body">
            <div className="voice-name">{NPCS[l.npc].name} <span className="tag">Simulated neighbor</span></div>
            <div className="voice-text">“{l.text}”</div>
            {l.options && !answered[l.key] && (
              <div className="voice-opts">
                {l.options.map((o) => <button key={o.id} className={`btn small ${o.id === 'adjust' ? 'primary' : ''}`} disabled={o.tokens != null && o.tokens > tokensLeft} onClick={() => onRespond(l, o.id)}>{o.label}{o.tokens ? <> · <Tok n={o.tokens} /></> : null}</button>)}
              </div>
            )}
            {answered[l.key] && <div className="voice-done">{answered[l.key] === 'adjust' ? 'Done — it’s in your plan for the coming autumn.' : answered[l.key] === 'explain' ? 'You explained, with an evidence card.' : 'Noted.'}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ helpers shared by the cards
export function rainRankNote(d: GameData, y: number) {
  const wy = d.weather.waterYears.map((w) => w.rainMm);
  const v = wy[y];
  return v === Math.min(...wy) ? 'the driest of the three water years in this game' : v === Math.max(...wy) ? 'the wettest of the three water years in this game' : 'between the other two water years in this game';
}
export const fmtDay = (iso: string) => { const [yy, m, dd] = iso.split('-').map(Number); return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${yy}`; };
/** 24-hour clock for an hour offset into a storm window whose first interval ends at startLocal (e.g. 00:53). */
export function fmtClock(startLocal: string, hoursFromStart: number) {
  const hh = Number(startLocal.slice(11, 13)), mm = Number(startLocal.slice(14, 16));
  const t = (hh * 60 + mm - 60 + Math.round(hoursFromStart * 60) + 24 * 60 * 3) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
/** The calendar date for an hour of a storm window (the replay runs past midnight into the next day). */
export function fmtStormDate(startLocal: string, hoursFromStart: number) {
  const hh = Number(startLocal.slice(11, 13)), mm = Number(startLocal.slice(14, 16));
  const mins = hh * 60 + mm - 60 + Math.floor(hoursFromStart * 60);
  const day0 = new Date(`${startLocal.slice(0, 10)}T00:00:00Z`);
  const dt = new Date(day0.getTime() + Math.floor(mins / 1440) * 86400000);
  return fmtDay(dt.toISOString().slice(0, 10));
}
export function seasonSummary(s: CampaignState) {
  return s.autumns.slice(0, s.ran).map((a, y) => `${YEARS[y]}: ${describeAutumn(a)}`);
}
export const PROTOTYPE_NOTE = 'Prototype model · teaching assumptions';
export const coachLine = () => `≥ ${A.questCoachTankM3.value} m³`;
