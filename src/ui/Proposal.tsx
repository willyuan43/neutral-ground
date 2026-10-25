// The proposal card (T8): filled in by the game from the model results; the player adds one sentence (kept exactly as typed),
// attaches up to two evidence cards, and picks one thing they are willing to do. Copy text only — nothing is sent anywhere.
import { useMemo, useRef, useState } from 'react';
import type { CampaignResult, CampaignState } from '../campaign/campaign';
import { evidenceCards, proposalRows, proposalText, NEXT_STEPS, NOT_ENDORSED, WeatherFacts, Evidence } from '../content/evidence';
import { ENDINGS } from '../content/endings';
import { RotateCcw } from './Icons';
import { proposalImage, download } from './ShareCard';

const COST_WORDS = /(token|water|sweat|hour|cost|money|\$|time|m³|m3|volunteer|budget)/i;

export function Proposal({ cs, r, base, weather, trailOpen, onBack, onAgain }: { cs: CampaignState; r: CampaignResult; base: CampaignResult; weather: WeatherFacts; trailOpen: CampaignResult | null; onBack: () => void; onAgain: () => void }) {
  const cards = useMemo(() => evidenceCards(r, base, weather, trailOpen), [r, base, weather, trailOpen]);
  const rows = useMemo(() => proposalRows(cs, r, base), [cs, r, base]);
  const [sentence, setSentence] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ev: Evidence[] = picked.map((id) => cards.find((c) => c.id === id)!).filter(Boolean);
  const st = NEXT_STEPS.find((x) => x.id === step) ?? null;
  const text = proposalText(cs, r, base, sentence, ev, st);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const copy = () => {
    const fallback = () => { const el = textRef.current; if (el) { el.hidden = false; el.select(); } };
    try { navigator.clipboard.writeText(text).then(() => setCopied(true), fallback); } catch { fallback(); }
  };
  const preds = cs.predictions.filter((p) => p.answer != null);
  return (
    <div className="modal-bg"><div className="modal wide proposal">
      <h2>Your proposal card</h2>
      <div className="prop-card">
        <div className="prop-title">Neutral Ground · {ENDINGS[r.ending].title} · 30 Sept 2023</div>
        {rows.map((row) => <div key={row.k} className={`prop-row ${row.k}`}><b>{row.label}</b><span>{row.text}</span></div>)}
        <label className="prop-say"><b>I’d accept this cost because…</b>
          <textarea value={sentence} maxLength={280} rows={2} onChange={(e) => setSentence(e.target.value)} placeholder="Your own words — they stay exactly as you type them." />
        </label>
        {ev.length > 0 && <div className="prop-ev">{ev.map((e) => <div key={e.id} className="ev-card"><span className="ev-metric">{e.metric}</span><b>{e.value}</b><span className={`tag ${e.tier === 'observed' ? 'obs' : e.tier === 'model' ? 'model' : ''}`}>{e.tier}</span></div>)}</div>}
        <div className="prop-foot">Prototype model · teaching assumptions · historical 2020–23 weather · fictional neighbours</div>
      </div>
      <div className="prop-section"><b>Attach up to two evidence cards</b> <span className="small-note">written by the game from the model and the weather record</span>
        <div className="ev-pick">{cards.map((c) => (
          <button key={c.id} className={`ev-chip ${picked.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)} aria-pressed={picked.includes(c.id)}>
            <span>{c.metric}</span><b>{c.value}</b><i>{c.tier}</i>
          </button>
        ))}</div>
      </div>
      <div className="prop-section"><b>What would you be willing to do now?</b>
        <div className="seg wrap">{NEXT_STEPS.map((x) => <button key={x.id} className={step === x.id ? 'on' : ''} onClick={() => setStep(x.id)}>{x.label}</button>)}</div>
        {st && <div className="closeby"><div>{st.anywhere}</div><div className="small-note">{st.sf} {NOT_ENDORSED}</div></div>}
      </div>
      <div className="prop-section signals"><b>Your season, for you</b> <span className="small-note">(not saved, not sent)</span>
        <ul>
          <li>Guesses: {preds.filter((p) => p.correct).length} right of {preds.length} answered</li>
          <li>Revised after comparing with doing nothing: {cs.redoUsed.some(Boolean) ? 'yes' : 'no'}</li>
          <li>Your sentence names a cost: {COST_WORDS.test(sentence) ? 'yes' : sentence.trim() ? 'not yet (a quick word check)' : '—'}</li>
          <li>Evidence attached: {ev.length}</li>
        </ul>
      </div>
      <textarea ref={textRef} className="prop-copy" readOnly value={text} hidden />
      <div className="actions">
        <button className="btn" onClick={onBack}>Back to the ending</button>
        <button className="btn" onClick={onAgain}><RotateCcw className="ti" /> Play again</button>
        <button className="btn" onClick={() => download(proposalImage(cs, r, base, sentence, ev), 'neutral-ground-proposal.png')}>Save as a picture</button>
        <button className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy the text'}</button>
      </div>
    </div></div>
  );
}
