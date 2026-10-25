import type React from 'react';
// Level-3 widgets: LDN scale, habitat faces, satellite greenness chart, timeline.
import type { LdnClass, Face } from '../model/slope';

export function LdnScale({ title, c, short = false }: { title: string; c: LdnClass; short?: boolean }) {
  const tilt = c.status === 'net_gain' ? -10 : c.status === 'net_loss' ? 12 : 0;
  const color = c.status === 'net_gain' ? '#2fb36d' : c.status === 'net_loss' ? '#e2475b' : c.status === 'neutral' ? '#33505c' : '#9aa5ab';
  const label = { net_gain: 'Net gain', neutral: 'Neutral', net_loss: 'Net loss', not_touched: 'Not touched' }[c.status];
  const chip = (name: string, v: string) => (
    <span className={`ldn-chip ${v}`}>{v === 'better' ? '▲' : v === 'worse' ? '▼' : '●'} {name}</span>
  );
  return (
    <div className="ldn">
      <div className="ldn-head"><span>{title}</span><b style={{ color }}>{label}</b></div>
      <svg viewBox="0 0 160 70" className="ldn-svg" aria-hidden>
        <polygon points="80,62 70,68 90,68" fill="#33505c" />
        <rect x="78" y="22" width="4" height="42" fill="#33505c" />
        <g transform={`rotate(${tilt} 80 22)`} style={{ transition: 'transform .6s' }}>
          <rect x="18" y="20" width="124" height="4" rx="2" fill="#33505c" />
          <line x1="28" y1="22" x2="28" y2="38" stroke="#33505c" /><line x1="132" y1="22" x2="132" y2="38" stroke="#33505c" />
          <path d="M14 38 h28 a14 8 0 0 1 -28 0z" fill="#e2475b" opacity=".85" />
          <path d="M118 38 h28 a14 8 0 0 1 -28 0z" fill="#2fb36d" opacity=".85" />
          <text x="28" y="56" textAnchor="middle" fontSize="9" fill="#33505c">losses</text>
          <text x="132" y="56" textAnchor="middle" fontSize="9" fill="#33505c">gains</text>
        </g>
      </svg>
      {c.touched && (
        <div className="ldn-chips">
          {chip(`area ${c.area.delta >= 0 ? '+' : ''}${Math.round(c.area.delta)} m²`, c.area.verdict)}
          {chip(`water ${((c.water.plan / c.water.base - 1) * 100).toFixed(1)}%`, c.water.verdict)}
          {chip(`erosion ×${c.erosion.ratio.toFixed(2)}`, c.erosion.verdict === 'worse' ? 'worse' : c.erosion.verdict === 'better' ? 'better' : 'same')}
        </div>
      )}
      {!short && c.touched && <div className="ldn-note">Bare at the end: {Math.round(c.bareEnd.plan)} m² (doing nothing: {Math.round(c.bareEnd.base)} m²)</div>}
    </div>
  );
}

const FACE_TEXT: Record<Face, string> = { closer: 'Closer to what it needs', same: 'About the same', further: 'Further from what it needs', insufficient: 'Not enough data yet' };
const FACE_ICON: Record<Face, string> = { closer: '▲', same: '●', further: '▼', insufficient: '?' };

export function FaceCard({ name, emoji, face, lines, why }: { name: string; emoji: React.ReactNode; face: Face; lines: string[]; why?: string }) {
  return (
    <div className={`face ${face}`}>
      <div className="face-top"><span className="face-emoji" aria-hidden>{emoji}</span><div><div className="face-name">{name}</div><div className="face-state">{FACE_ICON[face]} {FACE_TEXT[face]}</div></div></div>
      {why && <div className="face-why">{why}</div>}
      {lines.map((l, k) => <div key={k} className="face-line">{l}</div>)}
    </div>
  );
}

export function NdviChart({ ndvi, from = '2020-10', to = '2023-09', mark }: { ndvi: any; from?: string; to?: string; mark?: string }) {
  if (!ndvi) return null;
  const W = 320, H = 120, P = 26;
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= to) { months.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  const x = (k: number) => P + (k / (months.length - 1)) * (W - P - 8);
  const yv = (v: number) => H - 18 - ((v - 0) / 0.9) * (H - 30);
  const colors: Record<string, string> = { 'MA-1b': '#c79a2a', 'MA-1e': '#e0b84a', 'WC2021-TREE': '#2f7d46', 'OSM-375333793': '#3aa0d8' };
  const units = Object.keys(colors).filter((u) => ndvi.series[u]);
  return (
    <div className="ndvi">
      <div className="ndvi-title">What the satellite saw <span className="tag obs">Observed · Sentinel-2 · display only</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ndvi-svg" role="img" aria-label="Monthly satellite greenness">
        {[0, 0.3, 0.6, 0.9].map((v) => <g key={v}><line x1={P} x2={W - 8} y1={yv(v)} y2={yv(v)} stroke="#e4ddcf" /><text x={P - 4} y={yv(v) + 3} fontSize="8" textAnchor="end" fill="#6b7b80">{v}</text></g>)}
        {['2021-01', '2022-01', '2023-01'].map((mm) => { const k = months.indexOf(mm); return k >= 0 ? <text key={mm} x={x(k)} y={H - 4} fontSize="8" textAnchor="middle" fill="#6b7b80">{mm.slice(0, 4)}</text> : null; })}
        {mark && months.indexOf(mark) >= 0 && <line x1={x(months.indexOf(mark))} x2={x(months.indexOf(mark))} y1={8} y2={H - 16} stroke="#e2475b" strokeDasharray="3 2" />}
        {units.map((u) => {
          const pts = months.map((mm) => ndvi.series[u].find((r: any) => r.month === mm)).map((r: any, k: number) => (r && r.median != null ? { k, v: r.median, one: (r.flags || '').includes('single_observation_day') } : null));
          // gaps stay gaps (no interpolation)
          const segs: string[] = []; let cur = '';
          pts.forEach((p) => { if (!p) { if (cur) segs.push(cur); cur = ''; } else cur += `${cur ? 'L' : 'M'}${x(p.k).toFixed(1)},${yv(p.v).toFixed(1)}`; });
          if (cur) segs.push(cur);
          return <g key={u}>{segs.map((sg, k) => <path key={k} d={sg} fill="none" stroke={colors[u]} strokeWidth="1.8" />)}
            {pts.map((p) => p && p.one ? <circle key={p.k} cx={x(p.k)} cy={yv(p.v)} r="2.6" fill="#fff" stroke={colors[u]} /> : null)}</g>;
        })}
      </svg>
      <div className="ndvi-legend">
        {units.map((u) => <span key={u}><i style={{ background: colors[u] }} />{ndvi.units[u]}</span>)}
        <span><i style={{ background: '#fff', border: '1.5px solid #888' }} />only one clear day that month</span>
      </div>
      <div className="ndvi-note">Grass browns every dry summer; tree cover stays green. Greener isn’t automatically better. {ndvi.note} Tree-cover pixels are not a species map.</div>
    </div>
  );
}

export function Timeline({ dates, rain, dayIdx, startIdx, endIdx, decisions, storms }: { dates: string[]; rain: number[]; dayIdx: number; startIdx: number; endIdx: number; decisions: number[]; storms: { idx: number; label: string }[] }) {
  const W = 600, H = 54;
  const n = endIdx - startIdx + 1;
  const x = (i: number) => ((i - startIdx) / (n - 1)) * W;
  // monthly bars
  const months: { i: number; mm: number }[] = [];
  let cur = '', sum = 0, first = startIdx;
  for (let i = startIdx; i <= endIdx; i++) {
    const m = dates[i].slice(0, 7);
    if (m !== cur) { if (cur) months.push({ i: first, mm: sum }); cur = m; sum = 0; first = i; }
    sum += rain[i];
  }
  months.push({ i: first, mm: sum });
  const maxM = Math.max(...months.map((m) => m.mm), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-label="Rain by month, Oct 2020 to Sep 2023">
      {months.map((m, k) => <rect key={k} x={x(m.i) + 0.5} y={H - 14 - (m.mm / maxM) * 30} width={W / months.length - 1.5} height={(m.mm / maxM) * 30} fill={m.i <= dayIdx ? '#2f8fe0' : '#9fd0f5'} rx="1" />)}
      {decisions.map((d, k) => <g key={k}><line x1={x(d)} x2={x(d)} y1={4} y2={H - 12} stroke="#ffb81f" strokeWidth="2" /><text x={x(d) + 3} y={11} fontSize="9" fill="#6b4b00">Oct {2020 + k}</text></g>)}
      {(() => { let lastX = -999; return storms.map((s, k) => { const sx = x(s.idx); const room = sx - lastX > 70; if (room) lastX = sx; return <g key={k}><title>{`Storm day ${s.label}`}</title><line x1={sx} x2={sx} y1={H - 14} y2={H - 10} stroke="#0b4f86" strokeWidth="1.5" /><text x={sx} y={H - 2} fontSize="9" textAnchor="middle" fill="#0b4f86">{room ? `⛈ ${s.label}` : '⛈'}</text></g>; }); })()}
      <line x1={x(dayIdx)} x2={x(dayIdx)} y1={0} y2={H - 12} stroke="#e2475b" strokeWidth="2" />
    </svg>
  );
}
