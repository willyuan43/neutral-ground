// "Where we are": a relief map of San Francisco made from real data — AWS Terrain Tiles (USGS 3DEP and other public
// sources) for the land, sea floor and shoreline, OpenStreetMap (via Nominatim) for parks, bridges and places — with a
// pin on Glen Canyon Park. The picture and its label positions come from public/art/sf-map.* (see src/ui/art.ts).
import { useEffect, useState } from 'react';
import { artJson, artUrl, SF_MAP } from './art';

interface MapLabel { name: string; kind: string; lat: number; lon: number; x: number; y: number }
interface MapMeta { width: number; height: number; bounds: { west: number; east: number; south: number; north: number }; labels: MapLabel[]; sources: string[] }

let metaCache: Promise<MapMeta | null> | null = null;
function loadMeta(): Promise<MapMeta | null> {
  if (!metaCache) metaCache = artJson<MapMeta>('sf-map.json');
  return metaCache;
}

const SHOW = new Set(['Golden Gate Bridge', 'Golden Gate Park', 'Presidio', 'Downtown', 'Twin Peaks', 'McLaren Park', 'Glen Park BART']);

export function WhereMap({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const [meta, setMeta] = useState<MapMeta | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => { let on = true; loadMeta().then((m) => { if (on) setMeta(m); }); return () => { on = false; }; }, []);
  if (bad || !meta) return null;
  const here = meta.labels.find((l) => l.kind === 'park-here');
  const b = meta.bounds;
  const kmWide = (b.east - b.west) * 111.32 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  const bar = (2 / kmWide) * 100; // % of the width for 2 km
  return (
    <div className={`where-map ${compact ? 'compact' : ''} ${className}`}>
      <div className="wm-head"><b>Where we are</b> <span>Glen Canyon Park · San Francisco, California</span></div>
      <div className="wm-frame" style={{ aspectRatio: `${meta.width} / ${meta.height}` }}>
        <img src={SF_MAP()} alt="Relief map of San Francisco with Glen Canyon Park marked" onError={() => setBad(true)} draggable={false} />
        <span className="wm-water" style={{ left: '14%', top: '62%' }}>Pacific Ocean</span>
        <span className="wm-water" style={{ left: '74%', top: '52%' }}>San Francisco Bay</span>
        {!compact && meta.labels.filter((l) => SHOW.has(l.name)).map((l) => (
          <span key={l.name} className={`wm-label ${l.kind}`} style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}><i />{l.name}</span>
        ))}
        {here && <span className="wm-pin" style={{ left: `${here.x * 100}%`, top: `${here.y * 100}%` }}><span className="wm-pin-dot" /><span className="wm-pin-txt">You are here<span className="wm-long"> · Glen Canyon Park</span></span></span>}
        <span className="wm-scale" style={{ width: `${bar}%` }}>2 km</span>
      </div>
      {!compact && <div className="wm-src">Land, sea floor and shoreline: AWS Terrain Tiles (USGS 3DEP and other public sources) · Parks, bridges, places: © OpenStreetMap contributors</div>}
    </div>
  );
}
