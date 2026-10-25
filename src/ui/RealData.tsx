import { useMemo } from 'react';
import type { GameData, Storm } from '../data/load';
import { runStorm, StormPlan, StormResult, GARDEN_M2, TankStart, TANK_M3 } from '../model/storm';
import { stormDate } from '../levels/stormLevels';
import { A } from '../model/assumptions';

export function RealData({ d, storm, result, plan, level, tankStart }: { d: GameData; storm: Storm; result: StormResult; plan: StormPlan; level: number; tankStart?: TankStart }) {
  // the same plan with the unknown soil groups run as B and as D (CLAUDE.md rule 2: a range, never A)
  const range = useMemo(() => {
    const b = runStorm(d.site, storm.rainMm, plan, { unknownAs: 'B', tankStart });
    const dd = runStorm(d.site, storm.rainMm, plan, { unknownAs: 'D', tankStart });
    const bb = runStorm(d.site, storm.rainMm, { gardens: [] }, { unknownAs: 'B', tankStart });
    const bd = runStorm(d.site, storm.rainMm, { gardens: [] }, { unknownAs: 'D', tankStart });
    return { b, d: dd, keptB: bb.drainTotal - b.drainTotal, keptD: bd.drainTotal - dd.drainTotal };
  }, [d, storm, plan]);
  const st = d.site.stats ?? {};
  const unknownCells = d.site.cells.filter((c) => c.hsg === 9).length;
  return (
    <details className="real">
      <summary>See the real data</summary>
      <ul>
        <li><b>Rain:</b> hourly rain gauge at {storm.station} ({storm.stationId}), ~{storm.distanceKm.toFixed(1)} km from the canyon — observed, but <i>not</i> measured in Glen Canyon. {storm.totalMm.toFixed(1)} mm in 24 h, biggest hour {storm.maxHourMm} mm. File: <code>{storm.file}</code>.</li>
        {(() => { const i = d.weather.dates.indexOf(stormDate(storm.startLocal)); return i >= 0 && d.weather.station ? <li>The same day the downtown San Francisco station ({d.weather.station.id}, ~{d.weather.station.distanceKm} km away) recorded <b>{d.weather.precipMm[i]} mm</b> (daily total).</li> : null; })()}
        <li><b>Ground:</b> USGS 3DEP lidar, 5 m grid (2023-04-20). Water follows the steepest-descent direction (D8) on that surface. The drain is the point where this area’s surface water leaves it (computed, at {d.site.outlet.lat.toFixed(5)}, {d.site.outlet.lon.toFixed(5)}). The creek itself runs in a culvert here (OpenStreetMap), so its canyon water is outside this puzzle.</li>
        <li><b>Surfaces:</b> buildings (DataSF footprints), courts, paths and lawns (OpenStreetMap), everything else from ESA WorldCover 2021 — rasterised to 5 m cells. The puzzle area is {d.site.cells.length * 25} m²{st.areaM2 ? '' : ''}.</li>
        <li><b>Soil:</b> USDA soil survey. {unknownCells} cells sit in a map unit with no known hydrologic group (fill soils); the main numbers use group C there. Same plan with group B: biggest hour {range.b.peakM3.toFixed(1)} m³{level === 2 ? `, kept out ${range.keptB.toFixed(1)} m³` : ''}; with group D: {range.d.peakM3.toFixed(1)} m³{level === 2 ? `, kept out ${range.keptD.toFixed(1)} m³` : ''}.</li>
        {tankStart && <li><b>Roof tank:</b> {TANK_M3.S}/{TANK_M3.L} m³ (design choices; 15 m³ ≈ 10.2 L per m² of roof, the SFPUC residential pilot minimum). Assumed empty on 1 October; its level when this storm began is computed from the real daily rain since then (downtown, each day spread evenly): keep {tankStart.S.closed.toFixed(1)}/{tankStart.L.closed.toFixed(1)} m³, release {tankStart.S.slow.toFixed(1)}/{tankStart.L.slow.toFixed(1)} m³ (small/large).</li>}
        <li><b>Before the storm:</b> the model assumes average soil wetness. The days before were wet ({(() => { const i = d.weather.dates.indexOf(storm.startLocal.slice(0, 10)); return i > 1 ? (d.weather.precipMm[i - 1] + d.weather.precipMm[i - 2]).toFixed(1) : '?'; })()} mm downtown in the two days before), so real runoff was probably higher.</li>
        <li><b>Runoff:</b> SCS curve numbers (G7 generic table: roofs/paving 98; lawn {A.cn.turf.value.join('/')}; woods {A.cn.tree.value.join('/')} for soil groups A/B/C/D), average wetness before the storm (assumed). The Rec Center roof is assumed to drain through pipes straight to the drain.</li>
        <li><b>Rain garden:</b> {GARDEN_M2.S}/{GARDEN_M2.M}/{GARDEN_M2.L} m² (design choices); holds {A.rgPondingM.value} m of ponding + {A.rgMediaM.value} m of soil mix × {A.rgPorosity.value} pore space; inlet catches {A.rgInletEff.value * 100}%; bottom soaks {Object.entries(A.ksatByHsg.value).map(([k, v]) => `${k} ${v}`).join(', ')} mm/h (teaching values). Below {A.underdrainThreshold.value} mm/h an underdrain pipe is added (SFPUC 2016 design condition), letting water out at {A.underdrainRate.value} mm/h — that water is <i>delayed</i>, not kept out.</li>
        <li><b>Not modelled:</b> pipes and culverts downstream, flooding, travel time across the site, water soaking in again on its way downhill, evaporation during the storm.</li>
        <li>Water balance of this run closes to {Math.abs(result.balanceError).toExponential(1)} m³.</li>
      </ul>
      <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Game goals are picked from the model’s own results so the puzzle has answers — they are not real-world standards.</div>
    </details>
  );
}
