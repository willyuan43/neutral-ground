import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { GameData } from '../data/load';
import { useGame } from '../state/store';
import { Stage } from '../stage/Stage';
import { Html } from '@react-three/drei';
import { Rain } from '../stage/Props';
import { Sprouts, Rills, lookColor } from '../stage/SlopeOverlay';
import type { World } from '../stage/world';
import { SlopeModel, runSlope, SlopePlan, YearActions, judgeSlope, BUDGET3, COSTS3, SlopeResult, EST_YEARS } from '../model/slope';
import { wyIndex, survival } from '../model/season';
import { A } from '../model/assumptions';
import { LEVEL3, planLabel3 } from '../levels/slopeLevel';
import { cellLooks, SlopeCells } from '../levels/slopeDisplay';
import { LdnScale, FaceCard, NdviChart, Timeline } from './SlopeParts';
import { Stars } from './LevelSelect';
import { sfx } from '../audio/sfx';
import { Confetti } from './Confetti';
import { Coins, Menu, Satellite, Volume2, VolumeX, Timer, Droplets, Wheat, TreeDeciduous, Axe, Leaf, Construction, Search, CircleDashed, Play, CloudLightning, RotateCcw, Tok, Damselfly } from './Icons';
import { TopBar, ResChip, TargetPill, Cards, Tray, GoalBar, Bubble, FaceRow } from './GameHud';
import { Hand, Droplet } from 'lucide-react';
import { cardArt } from './art';

type Phase = 'plan' | 'guess' | 'play' | 'pause' | 'result';
const YEAR_LABEL = ['autumn 2020', 'autumn 2021', 'autumn 2022'];

function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}

export function SlopeLevel({ d }: { d: GameData }) {
  const { setScreen, settings, setSetting, recordClear, recordTry } = useGame();
  const slope = d.slope;
  const model = useMemo(() => new SlopeModel(d.weather, slope), [d, slope]);
  const idx = useMemo(() => wyIndex(d.weather), [d]);
  const [year, setYear] = useState(0);
  const [phase, setPhase] = useState<Phase>('plan');
  const [plan, setPlan] = useState<SlopePlan>([{}, {}, {}]);
  const [history, setHistory] = useState<SlopePlan[]>([]);
  const [dayIdx, setDayIdx] = useState(idx.start[0]);
  const [speed, setSpeed] = useState(1);
  const [guess, setGuess] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [showCheck, setShowCheck] = useState(false);
  const [coachOpen, setCoachOpen] = useState(true);
  const [lastDiag, setLastDiag] = useState<string[]>([]);
  const [tool, setTool] = useState<string>('replant');
  const dayRef = useRef(idx.start[0]);
  const jump = (i: number) => { dayRef.current = i; setDayIdx(i); };

  // results for the actions decided so far (later years empty)
  const planSoFar = useMemo(() => plan.map((a, y) => (y <= year ? a : {})) as SlopePlan, [plan, year]);
  const res = useMemo(() => runSlope(model, planSoFar), [model, planSoFar]);
  const base = useMemo(() => runSlope(model, [{}, {}, {}]), [model]);
  const judged = useMemo(() => judgeSlope(res, LEVEL3.targetNative), [res]);

  const a: YearActions = plan[year] ?? {};
  const setA = (patch: Partial<YearActions>) => {
    setHistory((h) => [...h.slice(-30), plan]);
    const p = plan.map((x) => ({ ...x })) as SlopePlan;
    p[year] = { ...p[year], ...patch };
    setPlan(p);
  };
  // history only holds this year's edits (cleared when a year is run), so undo never changes a year already played
  const undo = () => { if (!history.length) return; setPlan(history[history.length - 1]); setHistory(history.slice(0, -1)); };

  // what exists at the start of this year
  const prev = useMemo(() => (year > 0 ? runSlope(model, plan.map((x, y) => (y < year ? x : {})) as SlopePlan) : null), [model, plan, year]);
  const bareSlope = prev ? prev.years[year - 1].grassland.bare + prev.cohorts.filter((c) => c.cls === 'grassland' && c.year === year - 1).reduce((s, c) => s + c.areaM2 * (1 - (c.survival ?? 0)), 0) : 0;
  const bareCreek = (prev ? prev.years[year - 1].riparian.bare + prev.cohorts.filter((c) => c.cls === 'riparian' && c.year === year - 1).reduce((s, c) => s + c.areaM2 * (1 - (c.survival ?? 0)), 0) : 0) + (a.clearEuc?.trees ?? 0) * COSTS3.crownM2;
  const removedBefore = plan.slice(0, year).reduce((s, x) => s + (x.clearEuc?.trees ?? 0), 0);
  // “keep the big trees” is decided in the first year that actually cuts trees (the model does the same)
  const firstCut = plan.slice(0, year).find((x) => (x.clearEuc?.trees ?? 0) > 0);
  const keptBigBefore = !!firstCut?.clearEuc?.keepBig;
  const keepBigNow = removedBefore > 0 ? keptBigBefore : !!a.clearEuc?.keepBig;
  const trailClosedBefore = plan.slice(0, year).some((x) => x.closeTrail);

  // ---- costs shown live (all from the model run of the plan so far)
  const tokensLeft = BUDGET3.tokens - res.tokens;
  const sweatY = res.sweat[year], waterY = res.water[year];

  // ---- play loop (state of the clock lives in refs; React state only mirrors it for rendering)
  const endIdx = idx.end[year];
  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0, last = performance.now();
    let hold = 0; // seconds left to linger on a storm day
    const rate = settings.reduceMotion ? 120 : 30;
    const tick = (t: number) => {
      const dt = Math.max(0, Math.min(0.25, (t - last) / 1000)); last = t;
      let di = dayRef.current;
      if (hold > 0) hold -= dt;
      else {
        const nd = Math.min(endIdx, di + dt * rate * speed);
        di = nd;
        // linger on storm days (≥ storm threshold) so you can see the wash on bare soil
        for (let i = Math.floor(dayRef.current) + 1; i <= Math.floor(nd); i++) {
          if ((d.weather.precipMm[i] ?? 0) >= A.stormDayMm.value) { di = i; hold = speed > 1 ? 1.0 : 2.2; break; }
        }
      }
      dayRef.current = di;
      setDayIdx(di);
      if (di < endIdx) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed, endIdx, settings.reduceMotion, d]);
  useEffect(() => {
    if (phase !== 'play' || dayIdx < endIdx) return;
    const id = window.setTimeout(() => setPhase(year === 2 ? 'result' : 'pause'), 60);
    return () => window.clearTimeout(id);
  }, [phase, dayIdx, endIdx, year]);

  const di = Math.floor(dayIdx);
  const rainToday = d.weather.precipMm[di] ?? 0;
  useEffect(() => { if (phase === 'play') sfx.rain(Math.min(1, rainToday / 40)); else sfx.stopRain(); }, [phase, di]);
  useEffect(() => () => sfx.stopRain(), []);

  useEffect(() => {
    if (phase !== 'result') return;
    if (judged.pass) { sfx.play('success'); recordClear(3, nStars, `${nStars}★ ${res.tokens} tokens`); } else { sfx.play('fail'); setFails((f) => f + 1); setLastDiag(slopeDiagnose(d, res, plan, judged)); }
  }, [phase]);

  const start = () => {
    if (res.overBudget.tokens || res.overBudget.sweat[year] || res.overBudget.water[year]) return;
    if (year === 0 && !guess && (a.replantSlope?.areaM2 ?? 0) > 0) { setPhase('guess'); return; }
    if (year === 0) recordTry(3);
    setHistory([]); jump(idx.start[year]); setPhase('play'); sfx.play('click');
  };
  const restart = () => { setYear(0); setPlan([{}, {}, {}]); setHistory([]); setPhase('plan'); jump(idx.start[0]); setGuess(null); setShowCheck(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.getAttribute('role') === 'button')) return; // the focused control handles its own keys
      if (e.ctrlKey || e.metaKey || e.altKey || showCheck) return;
      if ((e.key === 'r' || e.key === 'R') && (phase === 'plan' || phase === 'result')) { e.preventDefault(); restart(); }
      if ((e.key === 'z' || e.key === 'Z') && phase === 'plan') { e.preventDefault(); undo(); }
      if (e.key === ' ' && phase === 'play') { e.preventDefault(); jump(endIdx); }
      if (e.key === 'Enter' && phase === 'plan') { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // stars
  const facesOk = res.faces && res.faces.butterfly !== 'further' && res.faces.hawk !== 'further' && res.faces.damselfly !== 'further';
  const starConds = [judged.pass, judged.pass && facesOk, judged.pass && res.tokens <= LEVEL3.star3Tokens];
  const nStars = judged.pass ? starConds.filter(Boolean).length : 0;

  // ---- stage
  const cellsAll: SlopeCells[] = useMemo(() => [...slope.classes.grassland.cells, ...slope.classes.riparian.cells], [slope]);
  const after = phase === 'pause' || phase === 'result' || (phase === 'plan' && year > 0);
  // while planning, the island previews this autumn's actions (fresh seedlings, closed trail, cleared trees) on the
  // same cells the run will use, so a choice shows up on the map straight away
  const looks = useMemo(() => cellLooks(slope.classes.grassland.cells, slope.classes.riparian.cells, slope.trail?.cells ?? [], planSoFar,
    res, year, phase === 'plan' ? false : after), [slope, planSoFar, res, year, phase, after]);
  const removedCells = useMemo(() => { const s = new Set<number>(); looks.forEach((v, g) => { if (v === 'removed' || v === 'willowSeed' || v === 'willow') s.add(g); }); return s; }, [looks]);
  const grassCol = model.col('grass');
  const wet = phase === 'plan' ? 0.4 : Math.max(0, Math.min(1, 1 - grassCol.dr[di] / (A.awcMissing.value * A.grassRootM.value)));
  const storm = rainToday >= A.stormDayMm.value ? 1 : 0;
  // level-3 cell states are painted into the terrain colours, so they follow the slope instead of floating as square tiles
  const slopePaint = useCallback((i: number, rgb: [number, number, number]) => { const l = looks.get(i); return l ? lookColor(l, wet, storm, i) : rgb; }, [looks, wet, storm]);
  const stage = useCallback((w: World) => (
    <group>
      <Sprouts w={w} cells={cellsAll} looks={looks} wet={wet} />
      {storm === 1 && phase === 'play' && <Rills w={w} d={d} cells={cellsAll} looks={looks} />}
      {(slope.labels ?? []).map((L: any) => <Html key={L.text} center position={[w.x(L.c), w.hAt(L.r, L.c) + 3.2, w.z(L.r)]} zIndexRange={[20, 10]}><div className="label3d">{L.text}</div></Html>)}
      {/* trail label at the trail's downhill (camera-side) end, so it does not sit on top of the MA-1b zone label */}
      {slope.trail && (() => { const [tr, tc] = slope.trail.path[0]; return <Html center position={[w.x(tc), w.hAt(tr, tc) + 1.6, w.z(tr)]} zIndexRange={[20, 10]}><div className="label3d small">{(plan.some((x, y) => y <= year && x.closeTrail) ? 'Closed trail' : 'Unofficial trail')}</div></Html>; })()}
      {phase === 'play' && rainToday > 0.5 && <Rain center={[w.x(slope.focus.c), w.h(slope.focus.r, slope.focus.c) - 6, w.z(slope.focus.r)]} size={70} intensity={Math.min(1, rainToday / 30)} reduceMotion={settings.reduceMotion} />}
    </group>
  ), [cellsAll, looks, wet, storm, phase, rainToday, slope, settings.reduceMotion, plan, year]);

  const stormMarks = useMemo(() => stormDayIdx(d, idx.start[0], idx.end[2]).map((i) => ({ idx: i, label: fmtDate(d.weather.dates[i]) })), [d, idx]);
  const wy = d.weather.waterYears;

  const sAvail = Math.max(0, Math.floor((slope.classes.grassland.grass.areaM2 - (slope.trail?.areaM2 ?? 0)) / 250) * 250);
  const replantMax = Math.min(2500, sAvail);
  // slider positions: 0, then the bare patches (if any), then +250 m² steps of new planting
  const bareR = year > 0 && bareSlope > 1 ? Math.round(bareSlope) : 0;
  const areaAt = (j: number) => (j === 0 ? 0 : bareR > 0 ? bareR + (j - 1) * 250 : j * 250);
  let jMax = 0; while (areaAt(jMax + 1) <= bareR + replantMax) jMax++;
  const curArea = a.replantSlope?.areaM2 ?? 0;
  let jNow = 0; for (let j = 0; j <= jMax; j++) if (Math.abs(areaAt(j) - curArea) < Math.abs(areaAt(jNow) - curArea)) jNow = j;

  return (
    <div className="screen">
      <div className="canvas-wrap">
        <Stage d={d} view="slope" aerial={settings.aerial} reduceMotion={settings.reduceMotion} treeSkip={removedCells} paint={slopePaint} mood={phase === 'play' ? Math.min(1, rainToday / 30) : 0}>{stage}</Stage>
      </div>
      <div className="overlay game">
        <TopBar coachOpen={coachOpen} onCoach={() => setCoachOpen(!coachOpen)} chips={<>
          <ResChip icon={<Coins />} label="BUILD TOKENS" value={`${res.tokens}/${BUDGET3.tokens}`} warn={res.overBudget.tokens} />
          <ResChip icon={<Hand />} tone="sand" label={`YEARLY SWEAT · ${2021 + year}`} value={`${Math.round(sweatY)}/${BUDGET3.sweatPerYear} h`} warn={res.overBudget.sweat[year]} />
          <ResChip icon={<Droplet />} tone="water" label={`WATER · ${2021 + year}`} value={`${Math.round(waterY)}/${BUDGET3.waterPerYearM3} m³`} warn={res.overBudget.water[year]} />
        </>} />
        <TargetPill level="Level 3 · Very hard"
          text={<>Target: by Sept 2023, <b>≥ {LEVEL3.targetNative.toLocaleString()} m²</b> of replanted native grass established — and <b>no net loss</b> where you act</>}
          tags={<><span className="tag obs">Daily rain: downtown SF station, ~{d.weather.station?.distanceKm ?? '?'} km</span><span className="tag">2006 plan zones (approx.)</span><span className="tag">Teaching units, not dollars</span></>}>
        {coachOpen && (phase === 'plan' || phase === 'play') && (
          <Bubble onClose={() => setCoachOpen(false)}>
            {phase === 'plan' && year === 0 && <>Restore the east slope through real weather, Oct 2020 → Sept 2023. You decide each autumn: <b>2020, 2021, 2022</b>. Water year 2021 had only <b>{wy[0].rainMm} mm</b> of rain downtown.</>}
            {phase === 'plan' && year > 0 && <>Plan {YEAR_LABEL[year]}. {bareSlope > 1 && <>There are <b>{Math.round(bareSlope)} m² of bare patches</b> on the slope where seedlings died. </>}Re-seeding fills bare patches first.</>}
            {phase === 'play' && <><b>{fmtDate(d.weather.dates[di])}</b> · rain {rainToday.toFixed(1)} mm{storm ? <b> · STORM</b> : ''}<br />{storm ? 'Bare soil and open trails wash out in storms — watch the brown patches.' : 'Golden = dry grass, green = wet. Dark beds with sprouts = your new planting; the sprouts go pale when thirsty. Brown = bare soil.'}</>}
            {fails >= 2 && phase === 'plan' && lastDiag.length > 0 && <div className="hintbox" style={{ marginTop: 8 }}><b>Last run:</b> {lastDiag[0]}</div>}
            {settings.science && <div className="small">Keys: R restart · Z undo · Enter run · Space skip to 30 Sept</div>}
          </Bubble>
        )}
        </TargetPill>

        <div className="g-side">
          <div className="g-panel">
            <div className="g-panel-title">Indicators</div>
            <div className="g-panel-sub">{phase === 'result' ? 'Sept 2023 · your plan' : 'Sept 2023 if you add nothing more · model projection'}</div>
            <GoalBar label="Native grass established (m²)" value={phase === 'result' ? res.establishedNative : null} target={LEVEL3.targetNative} max={LEVEL3.targetNative * 1.5} dir="ge" pass={phase === 'result' ? judged.goal : null} digits={0} />
            <div style={{ height: 8 }} />
            {res.faces && <>
              <FaceRow portrait="🦋" name="Mission blue butterfly" face={res.faces.butterfly} why={settings.science ? 'Grassland restoration space on the east slope' : undefined} />
              <FaceRow portrait={<Damselfly />} name="SF forktail damselfly" face={res.faces.damselfly} why={settings.science ? 'No channel maintenance in this level' : undefined} />
              <FaceRow portrait="🦅" name="Red-tailed hawk" face={res.faces.hawk} why={settings.science ? `${res.faces.removed > 0 ? `Removed ${res.faces.removed} eucalyptus, kept ${res.faces.keptBig} big trees` : 'No big trees removed'}; foraging grassland MA-3b not mapped` : undefined} />
            </>}
            <div className="g-panel-note">Tracks habitat conditions, not animal counts. We don’t know which of these live in the park today.</div>
          </div>
          {res.ldn && year > 0 && phase === 'plan' && (
            <div className="g-panel g-ldn">
              <div className="g-panel-title">No net loss?</div>
              <LdnScale title="East-slope grassland" c={res.ldn.grassland} short />
              <LdnScale title="Creek corridor" c={res.ldn.riparian} short />
              <div className="g-panel-note">LDN teaching version · Sept 2023 if you add nothing more{settings.science ? ' — projected by the model with the real weather that followed. Losses and gains only balance within the same kind of land; one indicator worse = net loss.' : ''}</div>
            </div>
          )}
        </div>

        {(phase === 'play' || phase === 'pause') && (
          <div className="hyeto timeline">
            <div className="cap"><span>Rain by month · downtown SF · Oct 2020 → Sep 2023</span>
              {phase === 'play' && <span style={{ display: 'flex', gap: 6 }}>
                <button className={`btn small ${speed === 1 ? 'dark' : ''}`} onClick={() => setSpeed(1)}>1×</button>
                <button className={`btn small ${speed === 4 ? 'dark' : ''}`} onClick={() => setSpeed(4)}>4×</button>
                <button className="btn small" onClick={() => jump(endIdx)}>Skip ⏭</button></span>}
            </div>
            <Timeline dates={d.weather.dates} rain={d.weather.precipMm} dayIdx={di} startIdx={idx.start[0]} endIdx={idx.end[2]} decisions={idx.start} storms={stormMarks} />
          </div>
        )}

        {phase === 'plan' && (
          <div className="g-bottom">
            <div className="g-hand">
              {tool === 'replant' && (
                <Tray title={<><Wheat className="ti" /> Replant Native Grassland · <b>{a.replantSlope?.areaM2 ?? 0} m²</b> · <Tok n={Math.ceil((a.replantSlope?.areaM2 ?? 0) / 250)} /></>} note="Optional: water it through the first dry months — costs water and sweat.">
                  <input type="range" min={0} max={jMax} step={1} value={jNow} onChange={(e) => setA({ replantSlope: { areaM2: areaAt(Number(e.target.value)), water: a.replantSlope?.water ?? false } })} aria-label="Replant area" style={{ width: 220 }} />
                  {bareR > 0 && <button className="btn small" onClick={() => setA({ replantSlope: { areaM2: bareR, water: true } })}>Re-seed the bare patches ({bareR} m²)</button>}
                  <label className="chk"><input type="checkbox" checked={!!a.replantSlope?.water} onChange={(e) => setA({ replantSlope: { areaM2: a.replantSlope?.areaM2 ?? 0, water: e.target.checked } })} /> water the first year</label>
                </Tray>
              )}
              {tool === 'trees' && (
                <Tray title={<><TreeDeciduous className="ti" /> Plant More Trees</>} note="Adds shade and canopy; uses more water; takes space from grassland.">
                  <div className="seg">{[0, 250, 500].map((v) => <button key={v} className={(a.trees?.areaM2 ?? 0) === v ? 'on' : ''} onClick={() => setA({ trees: v ? { areaM2: v } : null })}>{v ? <>{v} m² · <Tok n={Math.ceil(v / 100) * COSTS3.tokensPer100m2Trees} /></> : 'none'}</button>)}</div>
                </Tray>
              )}
              {tool === 'euc' && (
                <Tray title={<><Axe className="ti" /> Clear Invasive Eucalyptus · <b>{a.clearEuc?.trees ?? 0} trees</b> · <Tok n={a.clearEuc?.trees ?? 0} /> · {(a.clearEuc?.trees ?? 0) * COSTS3.sweatPerTreeRemoved} h</>}
                  note={<>Bare soil at first by the creek.{settings.science ? ` The 2006 plan suggested removing about ${COSTS3.maxEuc} in MA-2a — a suggestion, not a count of the trees there.` : ''}</>}>
                  <input type="range" min={0} max={Math.max(0, COSTS3.maxEuc - removedBefore - (keepBigNow ? COSTS3.keepBigTrees : 0))} step={1} value={a.clearEuc?.trees ?? 0} onChange={(e) => setA({ clearEuc: { trees: Number(e.target.value), keepBig: keepBigNow } })} aria-label="Eucalyptus to remove" style={{ width: 200 }} />
                  <label className="chk"><input type="checkbox" checked={keepBigNow} disabled={removedBefore > 0} onChange={(e) => setA({ clearEuc: { trees: Math.max(0, Math.min(a.clearEuc?.trees ?? 0, COSTS3.maxEuc - removedBefore - (e.target.checked ? COSTS3.keepBigTrees : 0))), keepBig: e.target.checked } })} /> keep {COSTS3.keepBigTrees} big trees for raptors{removedBefore > 0 ? ' (decided at the first cut)' : ''}</label>
                </Tray>
              )}
              {tool === 'creek' && bareCreek > 1 && (
                <Tray title={<><Leaf className="ti" /> Creek natives (willows, sedges) · {Math.round(bareCreek)} m² bare</>} note="Replant the gaps by the creek.">
                  <div className="seg"><button className={!a.replantCreek?.areaM2 ? 'on' : ''} onClick={() => setA({ replantCreek: null })}>none</button><button className={a.replantCreek?.areaM2 ? 'on' : ''} onClick={() => setA({ replantCreek: { areaM2: Math.round(bareCreek), water: a.replantCreek?.water ?? true } })}>all {Math.round(bareCreek)} m² · <Tok n={Math.ceil(bareCreek / 250)} /></button></div>
                  <label className="chk"><input type="checkbox" checked={!!a.replantCreek?.water} onChange={(e) => setA({ replantCreek: { areaM2: a.replantCreek?.areaM2 ?? Math.round(bareCreek), water: e.target.checked } })} /> water the first year</label>
                </Tray>
              )}
              {tool === 'trail' && (
                <Tray title={<><Construction className="ti" /> Close an Unofficial Shortcut Trail</>} note={`Less trampling and erosion · ${Math.round(slope.trail?.lengthM ?? 0)} m path down the slope (OpenStreetMap, approximate).`}>
                  <button className="btn small primary" disabled={trailClosedBefore} onClick={() => setA({ closeTrail: !a.closeTrail })}>{trailClosedBefore ? 'Closed' : a.closeTrail ? 'Undo' : <>Close it · <Tok n={COSTS3.tokensCloseTrail} /></>}</button>
                </Tray>
              )}
              {tool === 'check' && (
                <Tray title={<><Search className="ti" /> Check Before You Build · {COSTS3.sweatCheck} h</>} note="Shows the biggest unknowns here and how much they change the results; adds a field check to your plan.">
                  <button className="btn small primary" onClick={() => { setA({ check: !a.check }); setShowCheck(!a.check); }}>{a.check ? 'Remove the check' : 'Check'}</button>
                </Tray>
              )}
              {tool === 'leave' && (
                <Tray title={<><CircleDashed className="ti" /> Leave It As Is</>} note="Costs nothing now; the land still changes with the weather.">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={() => setA({ replantSlope: null, trees: null, clearEuc: null, replantCreek: null, closeTrail: false, check: false })}>Clear year</button>
                    <button className="btn small" onClick={undo} disabled={!history.length}>Undo</button>
                  </div>
                </Tray>
              )}
              <Cards selected={tool} onSelect={(id) => { setTool(id); sfx.play('click'); }} cards={[
                { id: 'replant', name: 'Replant Native Grassland', icon: <Wheat />, art: 'linear-gradient(165deg,#fff3c9 0%,#9fd56e 100%)', img: cardArt('replant'), tag: 'Reverse', on: !!a.replantSlope?.areaM2, badge: a.replantSlope?.areaM2 ? `${a.replantSlope.areaM2} m²${a.replantSlope.water ? ' +water' : ''}` : undefined },
                { id: 'trees', name: 'Plant More Trees', icon: <TreeDeciduous />, art: 'linear-gradient(165deg,#e2f6d2 0%,#7cbf55 100%)', img: cardArt('trees'), tag: 'Mixed', on: !!a.trees?.areaM2, badge: a.trees?.areaM2 ? `${a.trees.areaM2} m²` : undefined },
                { id: 'euc', name: 'Clear Eucalyptus', icon: <Axe />, art: 'linear-gradient(165deg,#f1e6da 0%,#b98c66 100%)', tag: 'Mixed', on: !!a.clearEuc?.trees, badge: a.clearEuc?.trees ? `${a.clearEuc.trees} trees` : undefined },
                ...(bareCreek > 1 ? [{ id: 'creek', name: 'Creek Natives', icon: <Leaf />, art: 'linear-gradient(165deg,#dcf4f6 0%,#6cc3cf 100%)', tag: 'Reverse', on: !!a.replantCreek?.areaM2 }] : []),
                { id: 'trail', name: 'Close a Shortcut Trail', icon: <Construction />, art: 'linear-gradient(165deg,#fff4c4 0%,#f2b632 100%)', img: cardArt('trail-closed'), tag: 'Avoid', on: !!a.closeTrail || trailClosedBefore, badge: trailClosedBefore ? 'closed' : a.closeTrail ? 'closing' : undefined },
                { id: 'check', name: 'Check First', icon: <Search />, art: 'linear-gradient(165deg,#efeafc 0%,#b6a8e6 100%)', img: cardArt('check'), tag: 'Research', on: !!a.check },
                { id: 'leave', name: 'Leave It', icon: <CircleDashed />, art: 'linear-gradient(165deg,#f5f7f8 0%,#cfd8dc 100%)', tag: 'Free' },
              ]} />
            </div>
            <div className="g-run">
              <button className="btn go big" onClick={start} disabled={res.overBudget.tokens || res.overBudget.sweat[year] || res.overBudget.water[year]}><Play className="ti" /> Run to 30 Sept {2021 + year}</button>
            </div>
          </div>
        )}

        {phase === 'play' && storm === 1 && <div className="storm-banner"><CloudLightning className="ti" /> Storm · {fmtDate(d.weather.dates[di])} · {rainToday} mm downtown</div>}
        {showCheck && phase === 'plan' && a.check && <CheckPanel model={model} plan={planSoFar} year={year} awcCov={d.zones.awcCoverage} onClose={() => setShowCheck(false)} />}

        {phase === 'guess' && (
          <div className="modal-bg"><div className="modal">
            <h2>Your guess first</h2>
            <p>How much of the grass you replant this autumn will survive its first dry season (to 30 Sept 2021)?</p>
            <div className="choices">
              {[['most', 'Most of it'], ['half', 'About half'], ['few', 'Very little']].map(([id, label]) => <button key={id} className="choice" onClick={() => { setGuess(id); recordTry(3); setHistory([]); jump(idx.start[0]); setPhase('play'); }}>{label}</button>)}
            </div>
          </div></div>
        )}

        {phase === 'pause' && <PauseCard d={d} res={res} base={base} year={year} guess={guess} plan={plan} onNext={() => { setHistory([]); setYear(year + 1); setPhase('plan'); }} />}
        {phase === 'result' && <SlopeResultCard d={d} res={res} plan={plan} judged={judged} starConds={starConds} nStars={nStars} fails={fails} onRetry={restart} onLevels={() => setScreen('levels')} />}
      </div>
    </div>
  );
}

/** Storm days (≥ the storm threshold) between two day indexes, from the daily record. */
export function stormDayIdx(d: GameData, from: number, to: number) {
  const out: number[] = [];
  for (let i = Math.max(0, from); i <= Math.min(to, d.weather.precipMm.length - 1); i++) if ((d.weather.precipMm[i] ?? 0) >= A.stormDayMm.value) out.push(i);
  return out;
}
const WY_START = ['2020-10-01', '2021-10-01', '2022-10-01'], WY_END = ['2021-09-30', '2022-09-30', '2023-09-30'];
function stormsInYear(d: GameData, y: number) {
  return stormDayIdx(d, d.weather.dates.indexOf(WY_START[y]), d.weather.dates.indexOf(WY_END[y])).map((i) => `${fmtDate(d.weather.dates[i])} (${d.weather.precipMm[i]} mm)`);
}

/** Model-derived reasons for a result (codes → sentences). Indicators are judged on the final water year (Oct 2022 – Sept 2023). */
export function slopeDiagnose(d: GameData, res: SlopeResult, plan: SlopePlan, judged: ReturnType<typeof judgeSlope>): string[] {
  const out: string[] = [];
  const trailClosed = plan.some((a) => a?.closeTrail);
  const unw = res.cohorts.filter((c) => !c.watered && c.cls === 'grassland');
  if (unw.length) out.push(`Unwatered seedlings: ${unw.map((c) => `${Math.round((c.survival ?? 0) * 100)}% survived in ${2021 + c.year} (${c.severeDays} days of severe thirst)`).join('; ')}.`);
  const g = res.ldn.grassland, r = res.ldn.riparian;
  const storms = stormsInYear(d, 2);
  if (g.erosion.verdict === 'worse') {
    const yP = res.years[2].grassland;
    const extraBare = g.bareEnd.plan - g.bareEnd.base;
    const causes: string[] = [];
    if (extraBare > 1) causes.push(`${Math.round(extraBare)} m² more bare soil than doing nothing`);
    if (yP.seedlings + yP.establishing > 1) causes.push(`${Math.round(yP.seedlings + yP.establishing)} m² of plantings not yet established`);
    out.push(`East-slope erosion index ×${g.erosion.ratio.toFixed(2)} vs doing nothing in water year 2023${storms.length ? ` (storm ${storms.join(', ')})` : ''}${causes.length ? ` — ${causes.join(', ')}` : ''}.`);
  }
  if (g.area.verdict === 'worse') {
    // where the difference sits on 30 Sept 2023, from the model's own bookkeeping
    const pEnd = (c: SlopeResult['cohorts'][number]) => Math.min(1, (2 - c.year) / EST_YEARS[c.kind]);
    const notYet = res.cohorts.filter((c) => c.cls === 'grassland' && c.kind === 'grass').reduce((t, c) => t + c.areaM2 * (c.survival ?? 0) * (1 - pEnd(c)), 0);
    const moreBare = g.bareEnd.plan - g.bareEnd.base;
    const trees = res.cohorts.filter((c) => c.cls === 'grassland' && c.kind === 'tree').reduce((t, c) => t + c.areaM2, 0);
    const parts = [notYet > 1 && `${Math.round(notYet)} m² of planted grass not yet established`, moreBare > 1 && `${Math.round(moreBare)} m² more bare soil`, trees > 1 && `${Math.round(trees)} m² under young trees`].filter(Boolean);
    out.push(`Grassland that matches the 2006 target is ${Math.round(-g.area.delta)} m² smaller than doing nothing on 30 Sept 2023${parts.length ? `. On that day the slope has ${parts.join(', ')}` : ''}.`);
  }
  if (g.water.verdict === 'worse') out.push(`Less rain soaked in on the east slope in water year 2023 than doing nothing (${((g.water.plan / g.water.base - 1) * 100).toFixed(1)}%).`);
  if (r.status === 'net_loss') {
    const worse = [r.area.verdict === 'worse' ? 'area' : '', r.water.verdict === 'worse' ? 'water' : '', r.erosion.verdict === 'worse' ? `erosion ×${r.erosion.ratio.toFixed(2)}` : ''].filter(Boolean).join(', ');
    out.push(`Creek corridor: net loss (${worse}). Gains on the slope can’t balance losses by the creek — like for like.`);
  }
  if (!trailClosed && g.status === 'net_loss') out.push('The unofficial trail is still open — closing it is the “avoid” move, and it costs no water.');
  if (res.overBudget.tokens) out.push(`Over the token budget: ${res.tokens} / ${BUDGET3.tokens}.`);
  res.overBudget.sweat.forEach((o, y) => o && out.push(`Too much sweat in ${2021 + y}: ${Math.round(res.sweat[y])} h of ${BUDGET3.sweatPerYear}.`));
  res.overBudget.water.forEach((o, y) => o && out.push(`Too much water in ${2021 + y}: ${Math.round(res.water[y])} m³ of ${BUDGET3.waterPerYearM3}.`));
  if (!judged.goal) {
    const late = res.cohorts.filter((c) => c.cls === 'grassland' && c.kind === 'grass' && c.year > 0 && (c.survival ?? 0) > 0);
    out.push(`Native grass established: ${Math.round(res.establishedNative)} m² of the ${LEVEL3.targetNative} m² goal.${late.length ? ` Grass needs ${EST_YEARS.grass} years after surviving: autumn-2021 sowings are only ${Math.round(100 * Math.min(1, 1 / EST_YEARS.grass))}% of the way by Sept 2023, autumn-2022 sowings not yet started.` : ''}`);
  }
  return out;
}

export function CheckPanel({ model, plan, year, awcCov, onClose }: { model: SlopeModel; plan: SlopePlan; year: number; awcCov?: { components: number; withoutAwc: number }; onClose: () => void }) {
  // the biggest unknown for planting: soil water capacity (AWC) — most soil components have no full-depth value (zones.json awcCoverage)
  const [awcLo, awcHi] = A.awcMissing.range ?? [A.awcMissing.value, A.awcMissing.value];
  const rows = [awcLo, A.awcMissing.value, awcHi].map((awc) => {
    const m2 = new SlopeModel(model.w, model.d, awc);
    const r = runSlope(m2, plan);
    const sDry = survival(m2.col('seedGrass', year, false).severeDays[year]), sWet = survival(m2.col('seedGrass', year, true).severeDays[year]);
    return { awc, water: r.water[year], sDry, sWet, native: r.establishedNative };
  });
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h2>Check before you build</h2>
      <p><b>Biggest unknown here: how much water the soil holds.</b> The soil survey has no full-depth water-holding value for {awcCov ? `${awcCov.withoutAwc} of the ${awcCov.components}` : 'most of the'} soil parts in this area, so the model uses {A.awcMissing.value} mm per metre (range {awcLo}–{awcHi}). Same plan, three soils:</p>
      <table className="mini">
        <thead><tr><th>Soil holds</th><th>Survival, not watered</th><th>Survival, watered</th><th>Water you’d need {2021 + year}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.awc}><td>{r.awc} mm/m</td><td>{Math.round(r.sDry * 100)}%</td><td>{Math.round(r.sWet * 100)}%</td><td>{Math.round(r.water)} m³</td></tr>)}</tbody>
      </table>
      <p style={{ fontSize: 13 }}>Without a measurement the range stays this wide. Your plan now includes a field check: <i>measure soil water-holding on the east slope (with permission) before planting at scale.</i></p>
      <div className="actions"><button className="btn primary" onClick={onClose}>Got it</button></div>
    </div></div>
  );
}

function PauseCard({ d, res, base, year, guess, plan, onNext }: { d: GameData; res: SlopeResult; base: SlopeResult; year: number; guess: string | null; plan: SlopePlan; onNext: () => void }) {
  const cs = res.cohorts.filter((c) => c.year === year);
  const older = res.cohorts.filter((c) => c.year < year && c.cls === 'grassland' && c.kind === 'grass');
  const g = res.years[year].grassland;
  const wyRain = d.weather.waterYears[year].rainMm;
  const storms = stormsInYear(d, year);
  const wyAll = d.weather.waterYears.map((w) => w.rainMm);
  const rankNote = wyRain === Math.min(...wyAll) ? ' — the driest of the three water years in this game' : wyRain === Math.max(...wyAll) ? ' — the wettest of the three water years in this game' : '';
  const trailOpen = !plan.slice(0, year + 1).some((a) => a?.closeTrail);
  const sh = res.ldn?.grassland?.short;
  const truth = (() => { const c = cs.find((x) => x.cls === 'grassland' && x.kind === 'grass'); if (!c) return null; const sv = c.survival ?? 0; return sv >= 0.6 ? 'most' : sv >= 0.3 ? 'half' : 'few'; })();
  const bareNext = g.bare + cs.filter((c) => c.cls === 'grassland').reduce((t, c) => t + c.areaM2 * (1 - (c.survival ?? 0)), 0);
  return (
    <div className="modal-bg"><div className="modal wide">
      <h2>30 September {2021 + year}</h2>
      <p>Water year {2021 + year}: <b>{wyRain} mm</b> of rain downtown{rankNote}.{storms.length ? <> Storm days (≥ {A.stormDayMm.value} mm): {storms.join(', ')}.</> : ' No storm day this year.'}</p>
      {cs.length === 0 && <p>Nothing was planted this year.</p>}
      {cs.map((c, k) => (
        <div key={k} className="closeby">
          <b>{Math.round((c.survival ?? 0) * 100)}% survived</b> — {Math.round(c.areaM2)} m² of {c.kind === 'grass' ? 'native grass' : c.kind === 'tree' ? 'young trees' : 'creek natives'} {c.watered ? `(watered: ${Math.round(c.irrigationM3 ?? 0)} m³)` : '(not watered)'}; {c.severeDays} days of severe thirst. {c.survival != null && c.survival < 1 && <>The other {Math.round(c.areaM2 * (1 - c.survival))} m² {c.cls === 'grassland' ? 'turns to bare soil' : 'stays bare'} on 1 October.</>}
          <span className="tag model" style={{ marginLeft: 6 }}>model result</span>
        </div>
      ))}
      {older.length > 0 && <p style={{ fontSize: 14 }}>Earlier plantings: {older.map((c) => `${Math.round(c.areaM2 * (c.survival ?? 0))} m² from ${2020 + c.year}, ${Math.min(100, Math.round(((year - c.year) / 2) * 100))}% of the way to established`).join('; ')}.</p>}
      {bareNext > 1 && <p style={{ fontSize: 14 }}>Bare soil on the slope from 1 October: <b>{Math.round(bareNext)} m²</b>{trailOpen && g.trail > 0 ? ` plus the open trail (${Math.round(g.trail)} m²)` : ''}. Bare soil takes the storms hardest.</p>}
      {year === 0 && sh && <p style={{ fontSize: 13 }}>Short-term check, Sept 2021 vs doing nothing (east slope): matching grassland {sh.matchingDelta >= 0 ? '+' : ''}{Math.round(sh.matchingDelta)} m²{sh.matchingDelta < -1 && cs.some((c) => c.cls === 'grassland') ? ' (new seedlings only count once they establish — it often looks worse before it looks better)' : ''}, erosion index ×{sh.erosionRatio.toFixed(2)}{trailOpen ? ', trail still open' : ', trail closed'}. <span className="tag model">model result</span> The level is judged on Sept 2023.</p>}
      {year === 0 && guess && truth && <p>Your guess: <b>{guess === 'most' ? 'most' : guess === 'half' ? 'about half' : 'very little'}</b> — {guess === truth ? 'right.' : 'not this time.'}</p>}
      <p style={{ fontSize: 13 }}>Survival rule (teaching): {Math.round(A.sMax.value * 100)}% minus {+(A.kPerSevereDay.value * 100).toFixed(2)} percentage points per day of severe thirst in the first year, never below {Math.round(A.sMin.value * 100)}%.</p>
      {year === 0 && <NdviChart ndvi={d.slope?.ndvi} mark="2021-09" />}
      <div className="actions"><button className="btn primary" onClick={onNext}>Plan {YEAR_LABEL[year + 1]} →</button></div>
    </div></div>
  );
}


function SlopeResultCard({ d, res, plan, judged, starConds, nStars, fails, onRetry, onLevels }: { d: GameData; res: SlopeResult; plan: SlopePlan; judged: ReturnType<typeof judgeSlope>; starConds: boolean[]; nStars: number; fails: number; onRetry: () => void; onLevels: () => void }) {
  const f = res.faces;
  const diags = slopeDiagnose(d, res, plan, judged);
  const allStorms = stormDayIdx(d, d.weather.dates.indexOf(WY_START[0]), d.weather.dates.indexOf(WY_END[2])).map((i) => `${fmtDate(d.weather.dates[i])} (${d.weather.precipMm[i]} mm)`);
  const share = `I held the canyon — Neutral Ground level 3: ${'★'.repeat(nStars)}${'☆'.repeat(3 - nStars)}, ${res.tokens} tokens`;
  return (
    <div className="modal-bg">{judged.pass && <Confetti />}<div className="modal wide">
      <h2>{judged.pass ? 'Neutral ground held!' : 'Not yet'}</h2>
      <Stars n={nStars} big />
      <div className="star-rows">
        <div>{starConds[0] ? '★' : '☆'} ≥ {LEVEL3.targetNative} m² native grass established, no net loss, within budget</div>
        <div>{starConds[1] ? '★' : '☆'} No habitat face “further”</div>
        <div>{starConds[2] ? '★' : '☆'} Use ≤ {LEVEL3.star3Tokens} tokens</div>
      </div>
      <div className="result-numbers">
        <div className={`num-card ${judged.goal ? 'good' : 'bad'}`}><div className="k">Native grass established</div><div className="v">{Math.round(res.establishedNative)} m²</div><div className="t">goal ≥ {LEVEL3.targetNative} · model result</div></div>
        <div className={`num-card ${judged.budgetOk ? 'good' : 'bad'}`}><div className="k">Spent</div><div className="v"><Tok n={res.tokens} /></div><div className="t">sweat {res.sweat.map(Math.round).join(' / ')} h · water {res.water.map(Math.round).join(' / ')} m³</div></div>
      </div>
      <div className="ldn-pair">
        <LdnScale title="East-slope grassland" c={res.ldn.grassland} />
        <LdnScale title="Creek corridor" c={res.ldn.riparian} />
      </div>
      <div className="ldn-disclaimer">Educational LDN check: we use park-specific indicators to explore trade-offs within each reference ecosystem. This is not an official SDG 15.3.1 assessment. Avoid &gt; Reduce &gt; Reverse — your plan: {countLdn(plan)}.</div>
      <div className="faces">
        <FaceCard name="Mission blue butterfly" emoji="🦋" face={f.butterfly} why={`Grassland restoration space on the east slope: ${res.ldn.grassland.area.delta >= 0 ? '+' : ''}${Math.round(res.ldn.grassland.area.delta)} m² vs doing nothing`} lines={['Tracks habitat conditions, not animal counts.', 'We don’t know if it lives in the park today.']} />
        <FaceCard name="SF forktail damselfly" emoji={<Damselfly />} face={f.damselfly} why="No channel maintenance in this level (2006 plan: clear half the ditch each spring and fall)" lines={['Tracks habitat conditions, not animal counts.', 'We don’t know if it lives in the park today.']} />
        <FaceCard name="Red-tailed hawk" emoji="🦅" face={f.hawk} why={f.removed > 0 ? `Removed ${f.removed} eucalyptus; kept ${f.keptBig} big trees (vs cutting all)` : 'No big trees removed'} lines={['Foraging grassland MA-3b: Not enough data yet — boundary not mapped.', 'No tree count for the park yet — tree numbers here are game units.', 'Tracks habitat conditions, not animal counts.']} />
      </div>
      {!judged.pass && diags.slice(0, fails >= 2 ? 5 : 3).map((t, k) => <div key={k} className="closeby">{t}</div>)}
      <div className="lesson">Restoration isn’t more trees. The dry season decides what survives — and a loss has to be made up in the same kind of land. That’s the idea behind Land Degradation Neutrality.</div>
      {judged.pass && <div className="share">{share}</div>}
      <details className="real">
        <summary>See the real data</summary>
        <ul>
          <li><b>Weather:</b> daily rain from NOAA’s downtown San Francisco station ({d.weather.station?.id}, ~{d.weather.station?.distanceKm} km away) — observed; reference evapotranspiration from Open-Meteo ERA5 (a model output). Water years: 2021 {d.weather.waterYears[0].rainMm} mm, 2022 {d.weather.waterYears[1].rainMm} mm, 2023 {d.weather.waterYears[2].rainMm} mm. Storm days ≥ {A.stormDayMm.value} mm: {allStorms.join(', ')}.</li>
          <li><b>Where:</b> 2006 management plan zones MA-1b and MA-1e (native grassland target, {Math.round(d.slope.classes.grassland.areaM2)} m² as digitised, partial and approximate) and MA-2a (willow riparian, {Math.round(d.slope.classes.riparian.areaM2)} m²). Historical plan, not a current approval. Today’s cover from ESA WorldCover 2021: grassland {d.slope.classes.grassland.grass.areaM2} m² and tree cover {d.slope.classes.grassland.tree.areaM2} m² on the slope. Slope steepness from the 5 m lidar.</li>
          <li><b>Model:</b> daily soil-water balance (FAO-56 style, curve-number runoff) for each kind of ground; seedlings: {A.seedlingRootM.value} m roots, Kc {A.seedlingKc.value}; soil water {A.awcMissing.value} mm/m (unknown, range {A.awcMissing.range?.join('–')}). Survival = clamp({A.sMax.value} − {A.kPerSevereDay.value} × severe-thirst days, {A.sMin.value}, {A.sMax.value}) — a teaching rule. Grass takes {EST_YEARS.grass} years to establish after surviving. Water, erosion and area are compared with doing nothing in the final water year (Oct 2022 – Sept 2023), within each kind of land. Erosion: relative index (slope × cover factor, weighted by storm rain), no tonnes.</li>
          <li><b>Judging the creek corridor:</b> today’s tree cover there mixes willow and eucalyptus and the map can’t separate them, so its area change is measured against the whole corridor ({Math.round(d.slope.classes.riparian.areaM2)} m²), not against today’s willow area.</li>
          <li><b>Soil:</b> {d.slope.hsgNote ?? 'Soil groups from the USDA soil survey.'} No range is shown for those cells; the run is the wetter-runoff case.</li>
          <li><b>Goal and budgets:</b> the {LEVEL3.targetNative.toLocaleString()} m² goal, the token, sweat and water budgets and the star rules are game targets picked from the model’s own results so the level has answers — not real-world standards.</li>
          <li><b>Not modelled:</b> which species, animals, fog drip, grazing, weeds, fire, shade.</li>
        </ul>
      </details>
      <div className="actions">
        <button className="btn" onClick={onLevels}>Levels</button>
        <button className="btn primary" onClick={onRetry}><RotateCcw className="ti" /> Try again (R)</button>
      </div>
    </div></div>
  );
}

function countLdn(plan: SlopePlan) {
  let avoid = 0, reduce = 0, reverse = 0, mixed = 0;
  for (const a of plan) {
    if (a.closeTrail) avoid++;
    if (a.replantSlope?.areaM2) reverse++;
    if (a.replantCreek?.areaM2) reverse++;
    if (a.trees?.areaM2) mixed++;
    if (a.clearEuc?.trees) mixed++;
  }
  const parts = [avoid && `avoid ×${avoid}`, reduce && `reduce ×${reduce}`, reverse && `reverse ×${reverse}`, mixed && `mixed ×${mixed}`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing built';
}
