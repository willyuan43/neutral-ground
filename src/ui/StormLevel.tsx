import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { GameData } from '../data/load';
import { useGame } from '../state/store';
import { Stage } from '../stage/Stage';
import { Rain } from '../stage/Props';
import { FlowNetwork, CellHighlight, WaterParticles, GardenMesh, TankMesh, DrainMarker, SpotMarker, cellPos, PreviewFlow } from '../stage/Water';
import type { World } from '../stage/world';
import { runStorm, StormPlan, StormResult, StormSite, GardenSize, GARDEN_M2, TANK_M3, TankSize, TankStart, tankHistory } from '../model/storm';
import { LEVEL1, LEVEL2, COST, planCost, judge, StormLevelDef, tankStartFor, guessChoices, guessTruth, stormDate } from '../levels/stormLevels';
import { A } from '../model/assumptions';
import { Stars } from './LevelSelect';
import { sfx } from '../audio/sfx';
import { RealData } from './RealData';
import { Confetti } from './Confetti';
import { Sprout, Cylinder, Unplug, Grid3x3, CircleDashed, Coins, Menu, Satellite, Volume2, VolumeX, Play, RotateCcw, Tok } from './Icons';
import { TopBar, ResChip, TargetPill, Cards, Tray, FatePanel, GoalBar, Bubble } from './GameHud';
import { CloudRain, Gauge } from 'lucide-react';
import { cardArt } from './art';

type Phase = 'build' | 'guess' | 'play' | 'result';
const SHOW_HOURS_AFTER = 8; // hours of drain-down shown in the replay (the model runs 48)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Local date and time `hoursFromStart` after the storm window opens (the window opens one hour before startLocal). */
function fmtWhen(startLocal: string, hoursFromStart: number, withTime = true) {
  const off = startLocal.slice(19); // e.g. -08:00
  const offMin = (off.startsWith('-') ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6)));
  const t = new Date(new Date(startLocal).getTime() + (hoursFromStart - 1) * 3600e3 + offMin * 60e3);
  const day = `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  return withTime ? `${day} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}` : `${day} ${t.getUTCFullYear()}`;
}
/** 2022-11-08 → 8 Nov 2022 */
function fmtDay(iso: string) { const [y, m, dd] = iso.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; }
function fmtClock(startLocal: string, hoursFromStart: number) {
  // startLocal is the END of the first hourly interval (e.g. 2022-12-31T00:53-08:00)
  const hh = Number(startLocal.slice(11, 13)), mm = Number(startLocal.slice(14, 16));
  const t = (hh * 60 + mm - 60 + Math.round(hoursFromStart * 60) + 24 * 60 * 3) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function StormLevel({ d, level }: { d: GameData; level: 1 | 2 }) {
  const L: StormLevelDef = level === 1 ? LEVEL1 : LEVEL2;
  const { setScreen, settings, setSetting, recordClear, recordTry, progress } = useGame();
  const storm = d.storms[L.storm];
  const site = d.site;
  const rain = storm.rainMm;

  const [phase, setPhase] = useState<Phase>('build');
  const [plan, setPlan] = useState<StormPlan>({ gardens: [], tank: null, disconnect: false, paving: false });
  const [history, setHistory] = useState<StormPlan[]>([]);
  const [size, setSize] = useState<GardenSize>(L.sizes[0]);
  const [tankSize, setTankSize] = useState<TankSize>('L');
  const [tankRelease, setTankRelease] = useState<'closed' | 'slow'>('closed');
  const [guess, setGuess] = useState<string | null>(null);
  const [result, setResult] = useState<StormResult | null>(null);
  const [hour, setHour] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [fails, setFails] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [selSpot, setSelSpot] = useState<string | null>(null);
  const [hoverSpot, setHoverSpot] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(true);

  // the roof tank's level when this storm starts comes from the real daily rain before it (empty on 1 October)
  const tankStart = useMemo<TankStart | undefined>(() => (L.tools.tank ? tankStartFor(site, d.weather, storm.startLocal) : undefined), [L, site, d, storm]);
  const base = useMemo(() => runStorm(site, rain, { gardens: [] }, { tankStart }), [site, rain, tankStart]);
  const tankFullSince = useMemo(() => (L.tools.tank ? tankHistory(site, d.weather, stormDate(storm.startLocal)) : undefined), [L, site, d, storm]);
  const scan = useMemo(() => spotScan(site, rain, base, tankStart), [site, rain, base, tankStart]);
  const [lastDiag, setLastDiag] = useState<{ code: string; text: string }[]>([]);
  const [tool, setTool] = useState<string>('garden');
  const baseFlow = useMemo(() => {
    const tot = new Float32Array(site.cells.length);
    for (const ft of base.flowThrough) for (let k = 0; k < ft.length; k++) tot[k] += ft[k];
    return tot;
  }, [base, site]);

  const cost = planCost(plan);
  const overBudget = L.budget != null && cost > L.budget;

  const showToast = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 2600); };
  const change = (p: StormPlan) => { setHistory((h) => [...h.slice(-30), plan]); setPlan(p); setResult(null); setGuess(null); setPhase('build'); };
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1)); setPlan(prev); setResult(null); setGuess(null); setPhase('build');
  };
  const clear = () => change({ gardens: [], tank: null, disconnect: false, paving: false });

  const pickSpot = (id: string) => {
    if (phase === 'play') return;
    sfx.play('place');
    setSelSpot(id);
    const has = plan.gardens.find((g) => g.cand === id);
    let gardens = plan.gardens.slice();
    if (has) {
      if (has.size === size) gardens = gardens.filter((g) => g.cand !== id); // tap again = remove
      else gardens = gardens.map((g) => (g.cand === id ? { ...g, size } : g));
    } else {
      if (gardens.length >= L.maxGardens) {
        if (L.maxGardens === 1) gardens = [];
        else { showToast(`Up to ${L.maxGardens} gardens in this level — tap a garden to remove it.`); return; }
      }
      gardens.push({ cand: id, size });
    }
    change({ ...plan, gardens });
  };

  const run = () => {
    if (overBudget) { showToast('Over budget — remove something first.'); return; }
    if (!guess) { setPhase('guess'); return; }
    startPlay();
  };
  const startPlay = () => {
    const r = runStorm(site, rain, plan, { tankStart });
    hourRef.current = 0;
    setResult(r); setHour(0); setPhase('play'); recordTry(level);
    sfx.play('click');
  };

  // replay clock (pure state updates; the phase change happens in its own effect)
  const endHour = rain.length + SHOW_HOURS_AFTER;
  const hourRef = useRef(0);
  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.max(0, (t - last) / 1000); last = t; // a frame can start before the effect ran: never step back
      hourRef.current = Math.min(endHour, hourRef.current + dt * speed * (settings.reduceMotion ? 2 : 1.1));
      setHour(hourRef.current);
      if (hourRef.current < endHour) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed, endHour, settings.reduceMotion]);
  useEffect(() => { if (phase === 'play' && hour >= endHour) { const id = window.setTimeout(() => setPhase('result'), 60); return () => window.clearTimeout(id); } }, [phase, hour, endHour]);
  const skip = () => { hourRef.current = endHour; setHour(endHour); };

  // rain sound
  useEffect(() => {
    if (phase === 'play') sfx.rain(Math.min(1, (rain[Math.floor(hour)] ?? 0) / 18));
    else sfx.stopRain();
  }, [phase, Math.floor(hour)]);
  useEffect(() => () => sfx.stopRain(), []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.getAttribute('role') === 'button')) return; // let the focused control handle its own keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === 'r' || e.key === 'R') && (phase === 'build' || phase === 'result')) { e.preventDefault(); setPhase('build'); setResult(null); setGuess(null); }
      if ((e.key === 'z' || e.key === 'Z') && phase === 'build') { e.preventDefault(); undo(); }
      if (e.key === 'Enter' && phase === 'build') { e.preventDefault(); run(); }
      if (e.key === ' ' && phase === 'play') { e.preventDefault(); skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const judged = useMemo(() => (result ? judge(L, base, result, plan) : null), [result, base, plan, L]);
  // stars
  const starConds = useMemo(() => {
    if (!judged) return [false, false, false];
    const s1 = judged.pass;
    const s2 = level === 1 ? s1 && plan.gardens.every((g) => g.size === 'S') : s1 && cost <= (L.star3Budget ?? 0);
    const s3 = s1 && guess === guessTruth(level, L, judged);
    return [s1, s2, s3];
  }, [judged, plan, cost, guess, level, L]);
  const nStars = starConds[0] ? starConds.filter(Boolean).length : 0;

  useEffect(() => {
    if (phase !== 'result' || !judged || !result) return;
    if (judged.pass) { sfx.play('success'); recordClear(level, nStars, `${nStars}★ ${cost} tokens`); }
    else { sfx.play('fail'); setFails((f) => f + 1); setLastDiag(diagnose(level, d, result, base, plan, L, { tankFullSince, scan })); }
  }, [phase]);

  // positions for 3D things
  const stageExtras = useCallback((w: World) => {
    const drainPos = new THREE.Vector3(w.x(site.outlet.c), w.hAt(site.outlet.r, site.outlet.c) + 0.05, w.z(site.outlet.r));
    const roofCells = site.roof.map((k) => site.cells[k]);
    const rr = roofCells.reduce((s, c) => s + c.r, 0) / roofCells.length, rc = roofCells.reduce((s, c) => s + c.c, 0) / roofCells.length;
    const roofPos = new THREE.Vector3(w.x(rc), w.hAt(rr, rc) + 1.0, w.z(rr));
    const se = roofCells.reduce((a, c) => (c.r + c.c > a.r + a.c ? c : a), roofCells[0]);
    const tankPos = new THREE.Vector3(w.x(se.c + 1.4), w.hAt(se.r + 1, se.c + 1.4), w.z(se.r + 1));
    const gardensAt = new Map<number, THREE.Vector3>();
    plan.gardens.forEach((g) => { const c = site.candidates.find((x) => x.id === g.cand); if (c) gardensAt.set(c.local, cellPos(w, site, c.local, 0.02)); });
    const h = Math.floor(hour);
    const showRes = result && (phase === 'play' || phase === 'result');
    const hi = Math.min(h, (result?.hours ?? 1) - 1);
    const lawnCells = plan.disconnect === 'west' ? site.lawnWest : plan.disconnect === 'east' ? site.lawnEast : [];
    const selCand = site.candidates.find((c) => c.id === (hoverSpot ?? selSpot));
    const catchment = (() => {
      if (!selCand || phase !== 'build') return [] as number[];
      const up: number[][] = site.cells.map(() => []);
      site.cells.forEach((c, k) => { if (c.down >= 0) up[c.down].push(k); });
      const out: number[] = []; const st = [selCand.local];
      while (st.length) { const x = st.pop()!; out.push(x); for (const y of up[x]) st.push(y); }
      return out;
    })();
    const rainNow = phase === 'play' ? (rain[h] ?? 0) : phase === 'build' ? 0 : 0;
    return (
      <group>
        <FlowNetwork w={w} site={site} weights={baseFlow} opacity={phase === 'play' ? 0.35 : 0.7} minWeight={0.8} />
        {catchment.length > 0 && <CellHighlight w={w} site={site} cells={catchment} color="#63b8ff" opacity={0.35} />}
        {lawnCells.length > 0 && <CellHighlight w={w} site={site} cells={lawnCells} color="#7be0a0" opacity={0.55} />}
        {plan.paving && <CellHighlight w={w} site={site} cells={site.paving} color="#e9d8a6" opacity={0.9} />}
        {L.tools.paving && !plan.paving && phase === 'build' && <CellHighlight w={w} site={site} cells={site.paving} color="#e9d8a6" opacity={0.3} />}
        {site.candidates.map((c) => {
          const g = plan.gardens.find((x) => x.cand === c.id);
          const pos = cellPos(w, site, c.local, 0.02);
          if (g) {
            const tr = result?.facilities.find((f) => f.kind === 'garden' && f.id === c.id);
            const fill = showRes && tr ? tr.storage[hi] / tr.capM3 : 0;
            const full = !!(showRes && tr && tr.fullAt !== null && hour >= tr.fullAt && fill > 0.98);
            return (
              <group key={c.id}>
                <GardenMesh pos={pos} areaM2={GARDEN_M2[g.size]} fill={fill} full={full} />
                {phase === 'build' && <SpotMarker pos={pos} id={c.id} selected onPick={() => pickSpot(c.id)} onHover={(on) => setHoverSpot(on ? c.id : null)} />}
              </group>
            );
          }
          return phase === 'build' ? <SpotMarker key={c.id} pos={pos} id={c.id} selected={false} onPick={() => pickSpot(c.id)} onHover={(on) => setHoverSpot(on ? c.id : null)} /> : null;
        })}
        {plan.tank && (() => {
          const tr = result?.facilities.find((f) => f.kind === 'tank');
          const fill = showRes && tr ? tr.storage[hi] / tr.capM3 : 0;
          const full = !!(showRes && tr && fill > 0.98);
          return <TankMesh pos={tankPos} fill={fill} full={full} capM3={TANK_M3[plan.tank.size]} />;
        })()}
        <DrainMarker pos={drainPos} now={showRes ? result!.outletNow[hi] : 0} later={showRes ? result!.outletLater[hi] : 0} show={!!showRes} />
        {phase === 'play' && <Rain center={[roofPos.x + 4, roofPos.y - 6, roofPos.z + 6]} size={34} intensity={rainNow / 14} reduceMotion={settings.reduceMotion} />}
        {phase === 'build' && <PreviewFlow w={w} site={site} weights={baseFlow} drainPos={drainPos} reduceMotion={settings.reduceMotion} gardensAt={gardensAt} />}
        <WaterParticles w={w} site={site} result={result} hour={hour} playing={phase === 'play'} gardensAt={gardensAt} reduceMotion={settings.reduceMotion}
          roofPiped={!plan.disconnect && !plan.tank} drainPos={drainPos} roofPos={roofPos} tankPos={plan.tank ? tankPos : null} />
      </group>
    );
  }, [site, plan, result, hour, phase, baseFlow, selSpot, hoverSpot, settings.reduceMotion, rain, size]); // size: spot taps build the selected size

  // running meters
  const h = Math.min(Math.floor(hour), (result?.hours ?? 1) - 1);
  const runningPeak = result && phase !== 'build' ? Math.max(...result.outletTotal.slice(0, Math.min(result.hours, h + 1))) : null;
  const finalPeak = result?.peakM3 ?? null;
  const shownPeak = phase === 'result' ? finalPeak : runningPeak;
  const kept = result ? base.drainTotal - result.drainTotal : null;
  const peakScale = Math.max(base.peakM3 * 1.15, L.targetPeak * 1.3);

  const truthChoices = guessChoices(level, L);
  // computed from the daily record shipped with the game (downtown station, 2020-09 → 2023-09)
  const wettestNote = useMemo(() => {
    const day = storm.startLocal.slice(0, 10);
    const i = d.weather.dates.indexOf(day);
    if (i < 0) return `${storm.totalMm.toFixed(0)} mm in 24 h.`;
    const max = Math.max(...d.weather.precipMm);
    const rank = d.weather.precipMm.filter((v) => v > d.weather.precipMm[i]).length + 1;
    return rank === 1
      ? `${storm.totalMm.toFixed(0)} mm in 24 h at the airport — downtown it was the wettest day of the game’s 2020–2023 daily record (${max} mm).`
      : `${storm.totalMm.toFixed(0)} mm in 24 h at the airport.`;
  }, [d, storm]);

  const coach = (() => {
    if (phase === 'play') return <><b>{fmtClock(storm.startLocal, hour)}</b> · {fmtWhen(storm.startLocal, hour, false)} · rain this hour <b>{(rain[h] ?? 0).toFixed(1)} mm</b>. Blue = reaching the drain now. <span style={{ color: '#c9b3ff' }}>Purple = held, then let out later.</span></>;
    if (level === 1) return <>Water runs downhill along the <b>blue lines</b> to the drain. Tap a <b>spot</b> to build a rain garden where the water goes. Goal: the drain’s <b>biggest hour ≤ {L.targetPeak} m³</b>.</>;
    return <>{wettestNote} Two goals: <b>biggest hour ≤ {L.targetPeak} m³</b> and <b>keep ≥ {L.targetKept} m³ out of the drain</b>. Budget <b>{L.budget} tokens</b>. Up to {L.maxGardens} gardens.</>;
  })();

  const tries = progress[level]?.tries ?? 0;
  return (
    <div className="screen">
      <div className="canvas-wrap">
        <Stage d={d} view="site" aerial={settings.aerial} reduceMotion={settings.reduceMotion} mood={phase === 'play' ? 0.78 + 0.22 * Math.min(1, (rain[h] ?? 0) / Math.max(1e-6, storm.maxHourMm)) : 0}>{stageExtras}</Stage>
      </div>
      <div className="overlay game">
        <TopBar coachOpen={coachOpen} onCoach={() => setCoachOpen(!coachOpen)} chips={<>
          {L.budget != null && <ResChip icon={<Coins />} label="BUILD TOKENS" value={`${cost}/${L.budget}`} warn={overBudget} />}
          <ResChip icon={<CloudRain />} tone="water" label={`RAIN · ${storm.id} AIRPORT`} value={`${storm.totalMm.toFixed(storm.totalMm < 100 ? 1 : 0)} mm`} />
          <ResChip icon={<Gauge />} tone="sky" label="BIGGEST HOUR" value={shownPeak != null ? `${shownPeak.toFixed(1)} m³` : `${base.peakM3.toFixed(1)} m³`} warn={phase === 'result' && !!judged && !judged.passPeak} />
        </>} />
        <TargetPill level={`Level ${level} · ${level === 1 ? 'Easy' : 'Hard'}`}
          text={level === 1 ? <>Target: biggest hour into the drain <b>≤ {L.targetPeak} m³</b></> : <>Target: biggest hour <b>≤ {L.targetPeak} m³</b> and keep <b>≥ {L.targetKept} m³</b> out of the drain</>}
          tags={<><span className="tag obs">Rain recorded at {storm.id} airport, ~{Math.round(storm.distanceKm)} km away</span><span className="tag">Only rain on the Rec Center area counts</span></>}>
        {coachOpen && phase !== 'result' && (
          <Bubble onClose={() => setCoachOpen(false)}>
            {coach}
            {phase === 'build' && fails >= 2 && result === null && lastDiag.length > 0 && <div className="hintbox" style={{ marginTop: 8 }}><b>Hint from your last run.</b> {lastDiag[0].text}{(() => { const sc = lastDiag.find((x) => x.code === 'SPOT_SCAN'); return sc && sc !== lastDiag[0] ? ` ${sc.text}` : lastDiag[1] ? ` ${lastDiag[1].text}` : ''; })()}</div>}
            {settings.science && <div className="small">Keys: R restart · Z undo · Enter run · Space skip</div>}
          </Bubble>
        )}
        </TargetPill>

        <div className="g-side">
          <FatePanel result={phase === 'result' && result ? result : base} title="Water fate" sub={phase === 'result' && result ? 'your plan · this storm' : 'if you do nothing · this storm'}>
            <GoalBar label="Biggest hour into the drain" value={shownPeak} target={L.targetPeak} max={peakScale} dir="le" pass={phase === 'result' && judged ? judged.passPeak : null} />
            {L.targetKept != null && <GoalBar label="Kept out of the drain" value={phase === 'result' && kept != null ? kept : null} target={L.targetKept} max={L.targetKept * 2} dir="ge" pass={phase === 'result' && judged ? judged.passKept : null} />}
            {result && phase !== 'build' && result.delayedTotal > 0.05 && (
              <div className="g-delay"><b>{phase === 'result' ? result.delayedTotal.toFixed(1) : result.outletLater.slice(0, h + 1).reduce((a, b) => a + b, 0).toFixed(1)} m³</b> let out later{phase === 'play' ? ' so far' : ''} — later, not less · not counted as kept out</div>
            )}
          </FatePanel>
        </div>

        {(phase === 'play' || phase === 'result') && result && (
          <div className="hyeto">
            <div className="cap">
              <span>Hourly rain at {storm.id} airport · {fmtWhen(storm.startLocal, 0)} → {fmtWhen(storm.startLocal, rain.length)}</span>
              {phase === 'play' && (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className={`btn small ${speed === 1 ? 'dark' : ''}`} onClick={() => setSpeed(1)}>1×</button>
                  <button className={`btn small ${speed === 4 ? 'dark' : ''}`} onClick={() => setSpeed(4)}>4×</button>
                  <button className="btn small" onClick={skip}>Skip ⏭</button>
                </span>
              )}
            </div>
            <div className="bars">
              {rain.map((v, k) => (
                <div key={k} className={`b ${k < hour ? 'past' : ''} ${k === base.peakRainHour ? 'peak' : ''}`} style={{ height: `${Math.max(2, (v / storm.maxHourMm) * 100)}%` }} title={`${v} mm`} />
              ))}
              {Array.from({ length: SHOW_HOURS_AFTER }).map((_, k) => <div key={'x' + k} className="b" style={{ height: '2%', background: '#ddd' }} />)}
              <div className="head" style={{ left: `${(Math.min(hour, endHour) / endHour) * 100}%` }} />
            </div>
            <div className="axis"><span>{fmtClock(storm.startLocal, 0)}</span><span>rain ends</span><span>+{SHOW_HOURS_AFTER} h</span></div>
          </div>
        )}

        <div className="g-bottom">
          {phase !== 'play' && phase !== 'result' && (
            <div className="g-hand">
              {tool === 'garden' && (
                <Tray title={<><Sprout className="ti" /> Rain Garden — pick a size, then tap a spot on the island</>} note="If the soil drains slowly, a pipe lets stored water out later — later, not less.">
                  <div className="seg">
                    {L.sizes.map((sz) => (
                      <button key={sz} className={size === sz ? 'on' : ''} onClick={() => setSize(sz)} title={`${GARDEN_M2[sz]} m²`}>{sz} {GARDEN_M2[sz]} m²{L.budget != null ? <> <Tok n={sz === 'S' ? COST.gardenS : sz === 'M' ? COST.gardenM : COST.gardenL} /></> : null}</button>
                    ))}
                  </div>
                </Tray>
              )}
              {tool === 'tank' && L.tools.tank && (
                <Tray title={<><Cylinder className="ti" /> Rec Center Roof Tank</>} note="Catches roof rain for lawn watering; once full, it overflows until emptied.">
                  {tankStart && (() => {
                    const z = plan.tank?.size ?? tankSize, m = plan.tank?.release ?? tankRelease;
                    const lvl = tankStart[z][m], cap = TANK_M3[z];
                    const since = tankFullSince?.[z][m].fullSince;
                    return <div className={`tank-level ${lvl >= cap - 1e-6 ? 'full' : ''}`}>{lvl >= cap - 1e-6 ? `Already full when this storm starts — full since ${since ? fmtDay(since) : '1 Oct'} (${cap} m³ of roof rain)` : `${lvl.toFixed(1)} of ${cap} m³ full when this storm starts`}{settings.science ? ' · from the real daily rain since 1 Oct' : ''}</div>;
                  })()}
                  <div className="seg">
                    {(['S', 'L'] as TankSize[]).map((sz) => <button key={sz} className={(plan.tank?.size ?? tankSize) === sz ? 'on' : ''} onClick={() => { setTankSize(sz); if (plan.tank) change({ ...plan, tank: { size: sz, release: plan.tank.release } }); }}>{TANK_M3[sz]} m³ <Tok n={sz === 'S' ? COST.tankS : COST.tankL} /></button>)}
                  </div>
                  <div className="seg">
                    <button className={(plan.tank?.release ?? tankRelease) === 'closed' ? 'on' : ''} title="Water stays in the tank and is used on the lawn later" onClick={() => { setTankRelease('closed'); if (plan.tank) change({ ...plan, tank: { size: plan.tank.size, release: 'closed' } }); }}>keep for watering</button>
                    <button className={(plan.tank?.release ?? tankRelease) === 'slow' ? 'on' : ''} title={`A valve lets ${A.tankRelease.value} m³/h out to the drain`} onClick={() => { setTankRelease('slow'); if (plan.tank) change({ ...plan, tank: { size: plan.tank.size, release: 'slow' } }); }}>release {A.tankRelease.value} m³/h</button>
                  </div>
                  <button className="btn small primary" onClick={() => change({ ...plan, tank: plan.tank ? null : { size: tankSize, release: tankRelease } })}>{plan.tank ? 'Remove the tank' : 'Build the tank'}</button>
                </Tray>
              )}
              {tool === 'disconnect' && L.tools.disconnect && (
                <Tray title={<><Unplug className="ti" /> Disconnect the Roof <Tok n={COST.disconnect} /></>} note="Roof water skips the pipe and spills onto the lawn; what doesn’t soak in runs downhill from there.">
                  <div className="seg">
                    <button className={plan.disconnect === false || !plan.disconnect ? 'on' : ''} onClick={() => change({ ...plan, disconnect: false })}>off</button>
                    <button className={plan.disconnect === 'west' ? 'on' : ''} onClick={() => change({ ...plan, disconnect: 'west' })}>west lawn</button>
                    <button className={plan.disconnect === 'east' ? 'on' : ''} onClick={() => change({ ...plan, disconnect: 'east' })}>east lawn</button>
                  </div>
                </Tray>
              )}
              {tool === 'paving' && L.tools.paving && (
                <Tray title={<><Grid3x3 className="ti" /> Permeable Paving <Tok n={COST.paving} /></>} note={`Swap ${site.paving.length * d.site.cellM2} m² of court-side paving for a gravel bed.`}>
                  <button className="btn small primary" onClick={() => change({ ...plan, paving: !plan.paving })}>{plan.paving ? 'Remove the gravel bed' : 'Build the gravel bed'}</button>
                </Tray>
              )}
              {tool === 'leave' && (
                <Tray title={<><CircleDashed className="ti" /> Leave It As Is</>} note="Costs nothing now; the land still changes with the weather.">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={clear}>Clear all</button>
                    <button className="btn small" onClick={undo} disabled={!history.length}>Undo</button>
                  </div>
                </Tray>
              )}
              <Cards selected={tool} onSelect={(id) => { setTool(id); sfx.play('click'); }} cards={[
                { id: 'garden', name: 'Rain Garden', icon: <Sprout />, art: 'linear-gradient(165deg,#d4f0ff 0%,#9fd56e 100%)', img: cardArt('garden'), tag: 'Reduce', on: plan.gardens.length > 0, badge: plan.gardens.length ? plan.gardens.map((g) => `${g.size}@${g.cand}`).join(' ') : undefined },
                ...(L.tools.tank ? [{ id: 'tank', name: 'Roof Tank', icon: <Cylinder />, art: 'linear-gradient(165deg,#e9f2fb 0%,#9db9d8 100%)', img: cardArt('tank'), tag: 'Store', on: !!plan.tank, badge: plan.tank ? `${TANK_M3[plan.tank.size]} m³` : undefined }] : []),
                ...(L.tools.disconnect ? [{ id: 'disconnect', name: 'Disconnect Roof', icon: <Unplug />, art: 'linear-gradient(165deg,#fff0de 0%,#f1b27a 100%)', cost: <Tok n={COST.disconnect} />, tag: 'Avoid', on: !!plan.disconnect, badge: plan.disconnect ? `→ ${plan.disconnect}` : undefined }] : []),
                ...(L.tools.paving ? [{ id: 'paving', name: 'Permeable Paving', icon: <Grid3x3 />, art: 'linear-gradient(165deg,#f3eee3 0%,#c6b79c 100%)', cost: <Tok n={COST.paving} />, tag: 'Reduce', on: !!plan.paving }] : []),
                { id: 'leave', name: 'Leave It', icon: <CircleDashed />, art: 'linear-gradient(165deg,#f5f7f8 0%,#cfd8dc 100%)', tag: 'Free' },
              ]} />
            </div>
          )}
          <div className="g-run">
            {phase === 'build' && (plan.gardens.length === 0 && !plan.tank && !plan.disconnect && !plan.paving) && <span className="chip muted">Nothing built yet</span>}
            {phase === 'build' && <button className="btn go big" onClick={run} disabled={overBudget}><Play className="ti" /> Let it rain</button>}
            {phase === 'result' && <button className="btn" onClick={() => { setPhase('build'); setResult(null); setGuess(null); }}><RotateCcw className="ti" /> Change the plan (R)</button>}
          </div>
        </div>

        {phase === 'guess' && (
          <div className="modal-bg">
            <div className="modal">
              <h2>Your guess first</h2>
              <p>{level === 1 ? 'With your plan, how much water will reach the drain in the biggest hour?' : 'With your plan, how much will you keep out of the drain (compared with doing nothing)?'}</p>
              <div className="choices">
                {truthChoices.map((c) => <button key={c.id} className="choice" onClick={() => { setGuess(c.id); sfx.play('click'); window.setTimeout(startPlay, 0); }}>{c.label}</button>)}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>A right guess on a cleared level earns the third star.</p>
            </div>
          </div>
        )}

        {phase === 'result' && result && judged && (
          <ResultCard level={level} L={L} d={d} result={result} base={base} judged={judged} plan={plan} starConds={starConds} nStars={nStars} tankStart={tankStart} tankFullSince={tankFullSince} scan={scan} guess={guess}
            fails={fails} onRetry={() => { setPhase('build'); setResult(null); setGuess(null); }}
            onNext={() => setScreen(level === 1 ? 'level2' : 'level3')} onLevels={() => setScreen('levels')} tries={tries} />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spot scan (model runs used for hints)
type TankHist = ReturnType<typeof tankHistory>;
export interface SpotScan { peakHour: number; spots: { id: string; thruPeak: number; share: number; fullAtM: number | null }[] }
/** Doing nothing: water passing each spot in the biggest hour and in the whole storm; plus a medium garden alone at each spot. */
export function spotScan(site: StormSite, rain: number[], base: StormResult, tankStart?: TankStart): SpotScan {
  const spots = site.candidates.map((c) => {
    const thruPeak = base.flowThrough[base.peakHour]?.[c.local] ?? 0;
    const thruAll = base.flowThrough.reduce((s, a) => s + (a[c.local] ?? 0), 0);
    const r = runStorm(site, rain, { gardens: [{ cand: c.id, size: 'M' }] }, { tankStart });
    const g = r.facilities.find((f) => f.kind === 'garden');
    return { id: c.id, thruPeak, share: base.drainTotal > 0 ? thruAll / base.drainTotal : 0, fullAtM: g?.fullAt ?? null };
  });
  return { peakHour: base.peakHour, spots };
}

// ---------------------------------------------------------------- diagnostics → sentences (model-derived codes; templates only)
export function diagnose(level: 1 | 2, d: GameData, result: StormResult, base: StormResult, plan: StormPlan, L: StormLevelDef, ctx: { tankFullSince?: TankHist; scan?: SpotScan } = {}) {
  const storm = d.storms[L.storm];
  const out: { code: string; text: string }[] = [];
  const peakH = result.peakHour;
  const gardens = result.facilities.filter((f) => f.kind === 'garden');
  const tank = result.facilities.find((f) => f.kind === 'tank');
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (tank && plan.tank && (tank.startM3 ?? 0) >= tank.capM3 - 1e-6) {
    const since = ctx.tankFullSince?.[plan.tank.size][plan.tank.release === 'slow' ? 'slow' : 'closed'].fullSince;
    out.push({ code: 'TANK_FULL_AT_START', text: `The roof tank was already full when the storm began — full since ${since ? fmtDay(since) : '1 Oct'}, from the real daily rain (downtown station). Kept for watering, it had no room for this storm.` });
  }
  for (const g of gardens) {
    const spot = ctx.scan?.spots.find((x) => x.id === g.id);
    if (spot && spot.share < A.offFlowpathShare.value) {
      const top = [...(ctx.scan?.spots ?? [])].sort((a, b) => b.thruPeak - a.thruPeak)[0];
      out.push({ code: 'GARDEN_OFF_FLOWPATH', text: `Only ${spot.thruPeak.toFixed(1)} m³ passed spot ${g.id} in the biggest hour (doing nothing) — ${Math.round(spot.share * 100)}% of the storm’s water to the drain. Along the main blue line at ${top.id}, ${top.thruPeak.toFixed(1)} m³ passed in that hour.` });
    }
    if (g.fullAt !== null && g.fullAt < peakH) out.push({ code: 'FULL_BEFORE_PEAK', text: `Your garden at ${g.id} was full at ${fmtClock(storm.startLocal, g.fullAt)} — ${(peakH - g.fullAt).toFixed(1)} hours before the biggest hour (${fmtClock(storm.startLocal, peakH)}). A full garden can’t catch the peak.` });
    else if (g.fullAt !== null && g.fullAt < peakH + 1) out.push({ code: 'FULL_DURING_PEAK', text: `Your garden at ${g.id} filled up at ${fmtClock(storm.startLocal, g.fullAt)}, inside the biggest hour, and spilled ${(g.overflow[peakH] ?? 0).toFixed(1)} m³ in that hour. A bigger garden there would still have room.` });
  }
  if (tank && (tank.startM3 ?? 0) < tank.capM3 - 1e-6 && tank.fullAt !== null && tank.fullAt < peakH + 1) out.push({ code: 'FULL_BEFORE_PEAK', text: `The roof tank was full at ${fmtClock(storm.startLocal, tank.fullAt)}${tank.fullAt < peakH ? `, ${(peakH - tank.fullAt).toFixed(1)} h before the biggest hour` : ', inside the biggest hour'} — after that the roof water overflowed.` });
  if (result.delayedTotal > 3) {
    const viaGardens = sum(result.facilities.filter((f) => f.kind !== 'tank').map((f) => sum(f.delayed)));
    const viaTank = tank ? sum(tank.delayed) : 0;
    const nPiped = result.facilities.filter((f) => f.kind !== 'tank' && sum(f.delayed) > 0.05).length;
    const how = viaGardens > 0.05 && viaTank > 0.05 ? 'through underdrain pipes and the tank’s release valve' : viaTank > 0.05 ? 'through the tank’s release valve' : nPiped > 1 ? 'through the underdrain pipes' : 'through the underdrain pipe';
    out.push({ code: 'UNDERDRAIN_DELAY_ONLY', text: `${result.delayedTotal.toFixed(1)} m³ left ${how} and still reached the drain — later, not less.` });
  }
  if (plan.disconnect) {
    const lawn = plan.disconnect === 'west' ? d.site.lawnWest : d.site.lawnEast;
    out.push({ code: 'DISCONNECT_PATH', text: `Disconnected roof water spills on the ${plan.disconnect} lawn (${lawn.length * d.site.cellM2} m²); what doesn’t soak in runs downhill from there.` });
  }
  // Level 2: after the main reasons, a model check of every spot (one medium garden alone, same storm)
  if (level === 2 && ctx.scan) {
    const early = ctx.scan.spots.filter((x) => x.fullAtM !== null && x.fullAtM < ctx.scan!.peakHour).map((x) => `${x.id} by ${fmtClock(storm.startLocal, x.fullAtM!)}`);
    const room = ctx.scan.spots.filter((x) => (x.fullAtM === null || x.fullAtM >= ctx.scan!.peakHour + 1) && x.thruPeak >= 1).sort((a, b) => b.thruPeak - a.thruPeak);
    if (early.length && room.length) out.push({ code: 'SPOT_SCAN', text: `Model check, one medium garden alone: it is full ${early.join(', ')} — before the biggest hour. At ${room.map((x) => x.id).join(' and ')} it still has room then (${room.map((x) => `${x.thruPeak.toFixed(1)} m³ passes ${x.id} in that hour`).join(', ')}).` });
  }
  return out;
}

function ResultCard({ level, L, d, result, base, judged, plan, starConds, nStars, fails, onRetry, onNext, onLevels, tries, tankStart, tankFullSince, scan, guess }: {
  level: 1 | 2; L: StormLevelDef; d: GameData; result: StormResult; base: StormResult; judged: ReturnType<typeof judge>; plan: StormPlan;
  starConds: boolean[]; nStars: number; fails: number; onRetry: () => void; onNext: () => void; onLevels: () => void; tries: number; tankStart?: TankStart;
  tankFullSince?: TankHist; scan: SpotScan; guess: string | null;
}) {
  const diags = diagnose(level, d, result, base, plan, L, { tankFullSince, scan });
  const truth = guessTruth(level, L, judged);
  const choiceLabel = (id: string | null) => guessChoices(level, L).find((c) => c.id === id)?.label ?? '—';
  const storm = d.storms[L.storm];
  const share = `I held the canyon — Neutral Ground level ${level}: ${'★'.repeat(nStars)}${'☆'.repeat(3 - nStars)}${L.budget != null ? `, ${judged.cost} tokens` : ''}`;
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLSpanElement>(null);
  const lesson = level === 1
    ? 'Water follows the ground. A garden only helps where the water actually runs.'
    : 'A full garden can’t catch the peak — and water let out later still reaches the drain. Later isn’t less.';
  const peakOver = judged.peak - L.targetPeak;
  const keptShort = L.targetKept != null ? L.targetKept - judged.kept : 0;
  return (
    <div className="modal-bg">
      {judged.pass && <Confetti />}
      <div className="modal">
        <h2>{judged.pass ? 'Canyon held!' : judged.overBudget ? 'Over budget' : 'Not yet'}</h2>
        <Stars n={nStars} big />
        <div className="star-rows">
          <div>{starConds[0] ? '★' : '☆'} {L.targetKept != null ? 'Meet both goals' : `Biggest hour ≤ ${L.targetPeak} m³`}</div>
          <div>{starConds[1] ? '★' : '☆'} {level === 1 ? 'Do it with the small garden' : `Spend ≤ ${L.star3Budget} tokens`}</div>
          <div>{starConds[2] ? '★' : '☆'} Guess the outcome right — you said “{choiceLabel(guess)}”, it was “{choiceLabel(truth)}”</div>
        </div>
        <div className="result-numbers">
          <div className={`num-card ${judged.passPeak ? 'good' : 'bad'}`}>
            <div className="k">Biggest hour into the drain</div>
            <div className="v">{judged.peak.toFixed(1)} m³</div>
            <div className="t">goal ≤ {L.targetPeak} · doing nothing {base.peakM3.toFixed(1)}</div>
          </div>
          {L.targetKept != null ? (
            <div className={`num-card ${judged.passKept ? 'good' : 'bad'}`}>
              <div className="k">Kept out of the drain</div>
              <div className="v">{judged.kept.toFixed(1)} m³</div>
              <div className="t">goal ≥ {L.targetKept} · delayed {result.delayedTotal.toFixed(1)} m³ (not counted)</div>
            </div>
          ) : (
            <div className="num-card">
              <div className="k">Delayed (let out later)</div>
              <div className="v" style={{ color: '#5a2fa8' }}>{result.delayedTotal.toFixed(1)} m³</div>
              <div className="t">through the garden’s underdrain pipe</div>
            </div>
          )}
        </div>
        {!judged.pass && (
          <div className="closeby">
            {judged.overBudget && <div>Over budget by {judged.cost - (L.budget ?? 0)} tokens.</div>}
            {peakOver > 0 && <div>Biggest hour was <b>{peakOver.toFixed(1)} m³ over</b> the goal.</div>}
            {keptShort > 0 && <div>Kept out was <b>{keptShort.toFixed(1)} m³ short</b> of the goal.</div>}
          </div>
        )}
        {diags.filter((x) => x.code !== 'SPOT_SCAN' || fails >= 2).slice(0, fails >= 2 || !judged.pass ? 3 : 1).map((x, k) => <div key={k} className={x.code === 'UNDERDRAIN_DELAY_ONLY' || x.code === 'FULL_BEFORE_PEAK' || x.code === 'FULL_DURING_PEAK' || x.code === 'SPOT_SCAN' ? 'hintbox' : 'closeby'}>{x.text}</div>)}
        <div className="lesson">{lesson}</div>
        {judged.pass && <div className="share"><span ref={shareRef}>{share}</span> <button className="btn small" onClick={() => {
          // clipboard can be refused (embedded views): fall back to selecting the text so it can be copied by hand
          const selectIt = () => { const el = shareRef.current; if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); };
          try { navigator.clipboard.writeText(share).then(() => setCopied(true), selectIt); } catch { selectIt(); }
        }}>{copied ? 'Copied' : 'Copy'}</button></div>}
        <RealData d={d} storm={storm} result={result} plan={plan} level={level} tankStart={tankStart} />
        <div className="actions">
          <button className="btn" onClick={onLevels}>Levels</button>
          <button className="btn" onClick={onRetry}><RotateCcw className="ti" /> Try again (R)</button>
          {judged.pass && level < 3 && <button className="btn primary" onClick={onNext}>Next level →</button>}
        </div>
      </div>
    </div>
  );
}
