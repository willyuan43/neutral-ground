// Map layers for the island: switch real-data layers on and off (park boundary, real place names, where rain runs,
// steepness from the lidar, the plain aerial photo). A per-viewer choice, kept in settings.
import { useState } from 'react';
import { Layers, MapPinned, Waves, Mountain, Satellite, SquareDashed, X, GitCompareArrows, Droplets } from 'lucide-react';
import { useGame } from '../state/store';

type Key = 'boundary' | 'places' | 'water' | 'steep';
const ROWS: { k: Key | 'aerial'; icon: JSX.Element; name: string; sub: string }[] = [
  { k: 'boundary', icon: <SquareDashed />, name: 'Park boundary', sub: 'Glen Canyon Park · DataSF' },
  { k: 'places', icon: <MapPinned />, name: 'Places nearby', sub: 'Rec center, school, trails · OpenStreetMap' },
  { k: 'water', icon: <Waves />, name: 'Where rain runs', sub: 'Flow paths from the 5 m lidar' },
  { k: 'steep', icon: <Mountain />, name: 'Steepness', sub: 'Slope from the 5 m lidar' },
  { k: 'aerial', icon: <Satellite />, name: 'The real place (photo)', sub: 'USDA NAIP 2024 aerial photo on the real terrain' },
];

type Lens = 'none' | 'compare' | 'runoff' | 'aerial';
export function LayersPanel({ defaults, lens, onLens }: { defaults?: Partial<Record<Key, boolean>>; lens?: Lens; onLens?: (k: Lens) => void }) {
  const { settings, setSetting } = useGame();
  const [open, setOpen] = useState(false);
  const cur = { boundary: true, places: false, water: false, steep: false, ...(defaults ?? {}), ...(settings.layers ?? {}) };
  const on = (k: Key | 'aerial') => (k === 'aerial' ? !!settings.aerial : !!cur[k]);
  const flip = (k: Key | 'aerial') => {
    if (k === 'aerial') { setSetting('aerial', !settings.aerial); return; }
    const next = { ...cur, [k]: !cur[k] };
    if (k === 'steep' && next.steep) next.water = next.water; // both can show together
    setSetting('layers', next);
  };
  const count = ROWS.filter((r) => on(r.k)).length + (lens && lens !== 'none' && lens !== 'aerial' ? 1 : 0);
  return (
    <div className={`layers ${open ? 'open' : ''}`}>
      <button className="layers-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Map layers">
        <Layers /><span>Layers</span>{count > 0 && <b>{count}</b>}
      </button>
      {open && (
        <div className="layers-sheet" role="dialog" aria-label="Map layers">
          <div className="layers-head"><b>Map layers</b><span>Real data on the island</span><button className="layers-x" onClick={() => setOpen(false)} aria-label="Close"><X /></button></div>
          {onLens && (
            <>
              <div className="layers-sub">Model lenses</div>
              {([['compare', <GitCompareArrows key="c" />, 'Compare with doing nothing', 'Green: better than doing nothing · red: worse (model)'], ['runoff', <Droplets key="r" />, 'Runoff & slope', 'Where water gathers on the slope (5 m lidar)']] as const).map(([k, icon, name, sub]) => (
                <button key={k} className={`layers-row ${lens === k ? 'on' : ''}`} onClick={() => onLens(lens === k ? 'none' : k)} aria-pressed={lens === k}>
                  <span className="layers-ico">{icon}</span>
                  <span className="layers-txt"><b>{name}</b><small>{sub}</small></span>
                  <span className="layers-sw" aria-hidden><i /></span>
                </button>
              ))}
              <div className="layers-sub">Real-data layers</div>
            </>
          )}
          {ROWS.map((r) => (
            <button key={r.k} className={`layers-row ${on(r.k) ? 'on' : ''}`} onClick={() => flip(r.k)} aria-pressed={on(r.k)}>
              <span className="layers-ico">{r.icon}</span>
              <span className="layers-txt"><b>{r.name}</b><small>{r.sub}</small></span>
              <span className="layers-sw" aria-hidden><i /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
