// The canyon season (trial version): one 6–8 minute game. Three autumns on the east slope (real daily weather Oct 2020 →
// Sept 2023), the New Year's Eve 2022 storm replayed hour by hour at the Rec Center, and one of eight endings.
// Rules and numbers: src/campaign/campaign.ts (bookkeeping) on top of the unchanged prototype model.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameData } from '../../data/load';
import { useGame } from '../../state/store';
import { Stage, SHOT } from '../../stage/Stage';
import { A } from '../../model/assumptions';
import { wyIndex, survival } from '../../model/season';
import { GARDEN_M2, TANK_M3, GardenSize, StormResult, runStorm, tankHistory } from '../../model/storm';
import { COST, LEVEL2, tankStartFor } from '../../levels/stormLevels';
import { COSTS3, SlopeModel, runSlope } from '../../model/slope';
import {
  makeCtx, withBudget, evaluate, emptyAutumns, newCampaign, setAutumn, commitAutumn, redo, canRedo, award, predict, respond, addLog, finishCampaign, setFocus,
  CampaignState, AutumnChoice, YEARS, offerFor, bareAtStart, stormRun, SHADE_COUNTS, NpcId, StormPrep, describeAutumn,
} from '../../campaign/campaign';
import { NPCS, questStates, pauseLines, stormLines, endingLine, allyLines, JUNO_OPEN, ACT_REACT, Line } from '../../content/npcs';
import { autumnQuestion, STORM_QUESTION, truthFor, Question } from '../../content/predictions';
import { ENDINGS, ENDING_HINTS, endingSentences, tryNext, missing } from '../../content/endings';
import { slopeHints, overBudgetText, JUNO_STORM } from '../../content/juno';
import { useSlopeScene, useSiteScene } from './scenes';
import { PlayerFigure, Beacon, newPlayer, type Act, type PlayerState } from '../../stage/Characters';
import { makeWorld } from '../../stage/world';
import { DECOR, refreshDecor } from '../../stage/Decor';
import { QuestBoard, QuestPopover, ConsequencePanel, Voices, Avatar, rainRankNote, fmtDay, fmtClock, fmtStormDate, LensKind } from './parts';
import { TopBar, ResChip, TargetPill, Cards, Tray, Bubble } from '../GameHud';
import { Timeline, NdviChart, LdnScale } from '../SlopeParts';
import { Proposal } from '../Proposal';
import { whyChain } from '../../content/why';
import { achievementOn, ACHIEVEMENTS } from '../../content/achievements';
import { addAchievements, addEnding, addCorrectGuess, getCollection, rankOf, addPlace } from '../../state/collection';
import { ENDING_IDS, stormBuilt } from '../../campaign/campaign';
import { askJuno, PRESETS, swapStorm, Answer } from '../../content/juno';
import { endingImage, download } from '../ShareCard';
import { stormDayIdx, CheckPanel } from '../SlopeLevel';
import { slopePlanOf } from '../../campaign/campaign';
import { diagnose, spotScan } from '../StormLevel';
import { sfx } from '../../audio/sfx';
import { Coins, Wheat, TreeDeciduous, Construction, Search, Play, RotateCcw, Sprout, Cylinder, CloudLightning } from '../Icons';
import { Hand, Droplet, CalendarDays, Trees as TreesIcon, MapPin } from 'lucide-react';
import { cardArt, endingArt, endingPhoto, JUNO_WAVE, faceArt, artUrl } from '../art';
const faceArtFor = (id: NpcId) => faceArt(id, 'happy');
import { Icon3d, ArtOr } from '../ArtBits';
import { WhereMap } from '../WhereMap';
import { ScreenRain, StormColdOpen, MissionCard, TaskList, RequestCard, GOALS, type Task } from './Guide';
import { CREDITS } from '../../content/credits';
import { LayersPanel } from '../LayersPanel';

type Phase = 'intro' | 'plan' | 'guess' | 'play' | 'pause' | 'stormIntro' | 'stormGuess' | 'storm' | 'stormResult' | 'recap' | 'ending';
const SHOW_HOURS_AFTER = 4;
/** Test hook: `?fast` in the address makes every replay near-instant (used by the automated play-throughs only). */
const FAST = (() => { try { return /[?&]fast\b/.test(window.location.search); } catch { return false; } })();

export function Campaign({ d }: { d: GameData }) {
  const { setScreen, settings } = useGame();
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;
  const baseCtx = useMemo(() => makeCtx(d.weather, d.slope, d.site, { id: 'OAK', rainMm: d.storms.OAK.rainMm, startLocal: d.storms.OAK.startLocal }), [d]);
  const [tier, setTier] = useState<'tight' | 'normal' | 'generous'>('normal');
  const ctx = useMemo(() => withBudget(baseCtx, (A.budgetTiers.value as Record<string, number>)[tier]), [baseCtx, tier]);
  const idx = useMemo(() => wyIndex(d.weather), [d]);
  const stormIdx = useMemo(() => d.weather.dates.indexOf('2022-12-31'), [d]);
  const may1Idx = useMemo(() => d.weather.dates.indexOf(A.questCoachDate.value), [d]);
  const [cs, setCs] = useState<CampaignState>(() => newCampaign());
  const [phase, setPhase] = useState<Phase>('intro');
  const [tab, setTab] = useState<'slope' | 'site'>('slope');
  const [tool, setTool] = useState<string>('replant');
  const [question, setQuestion] = useState<Question | null>(null);
  const [dayIdx, setDayIdx] = useState(idx.start[0]);
  const dayRef = useRef(idx.start[0]);
  const [hour, setHour] = useState(0);
  const hourRef = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [gSize, setGSize] = useState<GardenSize>('M');
  const [selSpot, setSelSpot] = useState<string | null>(null);
  const [hoverSpot, setHoverSpot] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(true);
  const [lensKind, setLensKind] = useState<LensKind>('none');
  const lens = lensKind === 'compare';
  const setLens = (on: boolean) => setLensKind(on ? 'compare' : 'none');
  const [toast, setToast] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<StormResult | null>(null);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [openNpc, setOpenNpc] = useState<NpcId | null>(null);
  const [may1Shown, setMay1Shown] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [achToasts, setAchToasts] = useState<string[]>([]);
  const [otherSeen, setOtherSeen] = useState<Record<number, boolean>>({});
  const [hideEnding, setHideEnding] = useState(false);
  const [endingNew, setEndingNew] = useState(false);
  const [peakCall, setPeakCall] = useState<number | null>(null); // the hour the player called the storm's peak
  const [introStep, setIntroStep] = useState(0);
  // first-run guide (autumn 2020): sow → water? → Leo walks up → play. Neighbours join as the story reaches them.
  const [tutWater, setTutWater] = useState(false);
  const [leoMet, setLeoMet] = useState(false);
  const [leoEnter, setLeoEnter] = useState(false);
  // the guide: cold-open stage (storm, then rewind), neighbour requests to show, requests seen
  const [coStage, setCoStage] = useState<0 | 1>(0);
  const [reqQ, setReqQ] = useState<NpcId[]>([]);
  const [reqSeen, setReqSeen] = useState<Partial<Record<NpcId, boolean>>>({});
  // where the player chose to start the meadow (a display choice: the model tracks areas, not places)
  const [meadowAt, setMeadowAt] = useState<{ r: number; c: number } | null>(null);
  // you: the player's own figure on the slope (walk with WASD / arrows, or tap the ground), and the spots you planted
  const player = useRef<PlayerState>(newPlayer());
  const [avCell, setAvCell] = useState<{ r: number; c: number } | null>(null);
  const [sowPts, setSowPts] = useState<{ r: number; c: number }[]>([]);
  const [leoWaiting, setLeoWaiting] = useState(false);
  const [confirmPlay, setConfirmPlay] = useState(false);
  const [youPop, setYouPop] = useState<{ k: number; text: string } | null>(null);
  const actRef = useRef<(() => void) | null>(null);
  const leoWaitingRef = useRef(false); const leoSpotRef = useRef<{ r: number; c: number } | null>(null);
  const grassCellAt = useMemo(() => { const m = new Map<number, { r: number; c: number }>(); for (const x of d.slope.classes.grassland.cells) if (x.cover === 4 && !(d.slope.trail?.cells ?? []).includes(x.g)) m.set(x.g, { r: x.r, c: x.c }); return m; }, [d]);
  const [say, setSay] = useState<{ id: NpcId | 'juno'; text: ReactNode; act?: Act; k: number } | null>(null);
  // (screenshots hold the 3D still for a few seconds before each capture, so bubbles stay up longer there)
  const sayFor = (id: NpcId | 'juno', text: ReactNode, ms = 4200, act?: Act) => { const k = Date.now(); setSay({ id, text, act, k }); window.setTimeout(() => setSay((x) => (x?.k === k ? null : x)), SHOT ? ms * 3 : ms); };
  const [mapOpen, setMapOpen] = useState(false);
  // which neighbours a card touches (a fixed mapping from the quests' wording — never a forecast)
  const [hoverCard, setHoverCard] = useState<string | null>(null);
  const CARD_NPCS: Record<string, NpcId[]> = { replant: ['maya'], trees: ['maya'], trail: ['maya', 'leo'], check: [], shade: ['leo'], garden: ['chen'], tank: ['coach', 'chen'] };

  const y = Math.min(cs.ran, 2); // autumn being planned
  const ry = Math.max(0, cs.ran - 1); // water year being replayed
  const planning = phase === 'plan' || phase === 'guess';
  const r = useMemo(() => evaluate(ctx, cs.autumns), [ctx, cs.autumns]);
  const base = useMemo(() => evaluate(ctx, emptyAutumns()), [ctx]);
  const trailOpen = useMemo(() => (r.trail === 'open' ? null : evaluate(ctx, cs.autumns.map((x) => ({ ...x, trail: null })) as typeof cs.autumns)), [ctx, cs.autumns, r.trail]);
  const yearShown = planning || phase === 'intro' ? y : ry;
  const a: AutumnChoice = cs.autumns[y] ?? {};
  const offer = offerFor(cs.autumns, y);
  const bare = useMemo(() => (y > 0 ? bareAtStart(ctx, cs.autumns, y) : 0), [ctx, cs.autumns, y]);
  const stormPhase = phase === 'stormIntro' || phase === 'stormGuess' || phase === 'storm' || phase === 'stormResult';
  const dayIso = d.weather.dates[Math.floor(dayIdx)] ?? null;
  const qStatesFull = questStates(cs, r, { stormDone: cs.stormDone, dayIso: phase === 'play' || phase === 'ending' ? dayIso : null, ended: phase === 'ending' });
  // before a year (or the storm) plays, the top bar shows only what is settled — no projections (the year tells you)
  const hideProj = phase === 'plan' || phase === 'guess' || phase === 'play' || phase === 'stormIntro' || phase === 'stormGuess' || phase === 'storm';
  const qStates = hideProj ? (Object.fromEntries(Object.entries(qStatesFull).map(([k, v]) => [k, v === 'onTrack' || v === 'atRisk' ? 'open' : v])) as typeof qStatesFull) : qStatesFull;
  const showToast = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 3200); };
  // achievements: kept in the season state (never twice) and in this browser's collection; a pop-up only the first time ever
  const grant = (ids: string[]) => {
    const ok = ids.filter(achievementOn);
    if (!ok.length) return;
    setCs((s) => award(s, ok).state);
    const fresh = addAchievements(ok);
    if (fresh.length) { setAchToasts((q) => [...q, ...fresh]); sfx.play('success'); window.setTimeout(() => setAchToasts((q) => q.filter((x) => !fresh.includes(x))), 3800); refreshDecor(); }
  };
  const grantRef = useRef(grant); grantRef.current = grant;
  const guessed = (correct: boolean | null) => { if (correct) { const n = addCorrectGuess(); if (n >= 3) grant(['forecaster']); } };
  // a quest that turns "done" gets a little celebration (the moment it is settled by the model)
  const [questToasts, setQuestToasts] = useState<NpcId[]>([]);
  const prevQ = useRef<string>('');
  const qKey = (['maya', 'leo', 'coach', 'chen'] as NpcId[]).map((id) => qStates[id]).join(',');
  useEffect(() => {
    const prev = prevQ.current.split(','); prevQ.current = qKey;
    if (prev.length < 4) return;
    const now = qKey.split(',');
    const fresh = (['maya', 'leo', 'coach', 'chen'] as NpcId[]).filter((id, k) => now[k] === 'done' && prev[k] !== 'done');
    if (fresh.length) { setQuestToasts((q) => [...q, ...fresh]); sfx.play('star'); window.setTimeout(() => setQuestToasts((q) => q.filter((x) => !fresh.includes(x))), 4200); }
  }, [qKey]);

  // neighbours react to what you just put in the plan (the action, not its outcome — the year shows that)
  const [reacts, setReacts] = useState<{ id: NpcId; good: boolean; text: string; k: number }[]>([]);
  const prevAut = useRef<{ y: number; a: AutumnChoice } | null>(null);
  useEffect(() => {
    const cur = cs.autumns[y] ?? {}; const prev = prevAut.current; prevAut.current = { y, a: cur };
    if (phase !== 'plan' || !prev || prev.y !== y) return;
    const p0 = prev.a, keys: string[] = [];
    if ((cur.replantSlope?.areaM2 ?? 0) > 0 && !(p0.replantSlope?.areaM2)) keys.push('replant');
    if (cur.replantSlope?.water && !p0.replantSlope?.water) keys.push('water');
    if ((cur.trees?.areaM2 ?? 0) > 0 && !(p0.trees?.areaM2)) keys.push('trees');
    if (cur.trail === 'close' && p0.trail !== 'close') keys.push('close');
    if (cur.trail === 'reroute' && p0.trail !== 'reroute') keys.push('reroute');
    if ((cur.shadeTrees ?? 0) > 0 && !p0.shadeTrees) keys.push('shade');
    if ((cur.storm?.gardens.length ?? 0) > 0 && !(p0.storm?.gardens.length)) keys.push('garden');
    if (cur.storm?.tank && !p0.storm?.tank) keys.push('tank');
    if (!keys.length) return;
    // the neighbour on the island says it (a bubble over their head, with a cheer or a worried look);
    // anyone not standing in this view answers in a corner bubble instead
    const x = ACT_REACT[keys[keys.length - 1]];
    const here = view === 'site' ? ['coach', 'leo', 'chen'] : ['maya', 'leo'];
    if (here.includes(x.id) && metSet.has(x.id)) sayFor(x.id, x.text, 3600, x.good ? 'cheer' : 'worried');
    else { const add = { ...x, k: Date.now() + Math.random() }; setReacts((q) => [...q, add].slice(-2)); window.setTimeout(() => setReacts((q) => q.filter((y2) => y2.k !== add.k)), 3800); }
    if (x.good) sfx.play('star');
  }, [phase, y, cs.autumns]);

  // tap a real place on the map: it goes into your field notes (this browser only)
  const PLACE_LINK: Record<string, string> = { rec: 'the New Year’s Eve storm plays out here', water: 'water leaving the park heads downstream this way', trail: 'park trails: staying on them keeps the slopes from wearing bare', school: 'a school next to the canyon', play: 'a playground in the neighbourhood', shop: 'the shops up the hill', 'park-here': 'the park you are planning', homes: 'homes around the park', peak: 'a hilltop above the canyon', park: 'open space nearby', sport: 'courts and fields', civic: 'a public building nearby' };
  useEffect(() => {
    const on = (e: Event) => {
      const p = (e as CustomEvent).detail as { name: string; kind: string; total: number };
      const { fresh, n } = addPlace(p.name);
      sfx.play(fresh ? 'star' : 'click');
      if (n >= 5) grantRef.current(['explorer']);
      showToast(`${fresh ? 'New in your field notes' : 'In your field notes'} · ${p.name}${PLACE_LINK[p.kind] ? ` — ${PLACE_LINK[p.kind]}` : ''} · ${n} place${n === 1 ? '' : 's'} found (OpenStreetMap)`);
    };
    window.addEventListener('ng-place', on);
    return () => window.removeEventListener('ng-place', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- editing the autumn being planned
  const edit = (patch: Partial<AutumnChoice>, last?: keyof AutumnChoice) => setCs((s) => setAutumn(s, y, { ...s.autumns[y], ...patch }, last));
  const prep: StormPrep = a.storm ?? { gardens: [], tank: null };
  const setPrep = (p: StormPrep) => edit({ storm: p.gardens.length || p.tank || p.disconnect || p.paving ? p : null });
  const pickSpot = (id: string) => {
    sfx.play('place'); setSelSpot(id);
    const has = prep.gardens.find((g) => g.cand === id);
    if (has && has.size === gSize) setPrep({ ...prep, gardens: [] }); // tap again = remove
    else setPrep({ ...prep, gardens: [{ cand: id, size: gSize }] }); // the main line has one rain garden
  };

  // ---------------------------------------------------------------- running a year
  // a short chapter card as each water year starts (names and numbers from the observed record)
  const [chapter, setChapter] = useState<{ n: number; title: string; sub: string } | null>(null);
  const chapterFor = (yy: number) => {
    const wy = d.weather.waterYears[yy]; const all = d.weather.waterYears.map((x) => x.rainMm);
    let big = -1; for (let i = idx.start[yy]; i <= idx.end[yy]; i++) if (big < 0 || (d.weather.precipMm[i] ?? 0) > (d.weather.precipMm[big] ?? 0)) big = i;
    const bigMm = d.weather.precipMm[big] ?? 0, bigDay = fmtDay(d.weather.dates[big]).replace(/ 20\d\d$/, '');
    const title = wy.rainMm === Math.min(...all) ? 'The dry year' : d.weather.dates[big]?.endsWith('-12-31') ? 'The New Year’s Eve storm' : `The ${bigDay} storm`;
    return { n: yy + 1, title, sub: `Water year ${2021 + yy} · ${Math.round(wy.rainMm)} mm of rain downtown · wettest day ${bigDay}: ${bigMm} mm` };
  };
  const startPlay = (yy: number, from?: number) => {
    startHold.current = 0;
    const i0 = from ?? idx.start[yy]; dayRef.current = i0; setDayIdx(i0); setSpeed(1); setPhase('play'); sfx.play('click');
    if (from == null && !FAST) { setChapter(chapterFor(yy)); startHold.current = settings.reduceMotion ? 1.4 : 2.3; window.setTimeout(() => setChapter(null), settings.reduceMotion ? 1600 : 2600); }
  };
  const runAutumn = () => {
    const why = overBudgetText(r, y);
    if (why) { showToast(why); return; }
    const q = y === 0 ? null : autumnQuestion(cs.autumns, y);
    if (q) { setQuestion(q); setPhase('guess'); return; }
    begin(null, null);
  };
  const begin = (q: Question | null, answer: string | null) => {
    const y0 = cs.ran;
    let s = commitAutumn(cs, ctx);
    if (s.ran === cs.ran) return;
    if (q) {
      const t = truthFor(q, ctx, evaluate(ctx, s.autumns), base);
      s = predict(s, { key: q.key, year: y0, answer, truth: t.id, correct: answer == null ? null : answer === t.id });
      guessed(answer == null ? null : answer === t.id);
    }
    setCs(s); setQuestion(null); setAnswered({}); setExperiment(null);
    startPlay(y0);
  };

  // daily replay (clock lives in a ref; React state mirrors it)
  const playEnd = ry < 2 ? idx.end[ry] : cs.stormDone ? idx.end[2] : stormIdx - 1;
  // a decision during the replay: the first day this year's new, unwatered grass is thirsty, the clock stops and asks
  // whether to start watering now (the model runs the same watering rule from that day on)
  const [thirst, setThirst] = useState<{ day: number } | null>(null);
  const thirstRef = useRef<{ day: number } | null>(null);
  const askedRef = useRef<Record<number, { n: number; last: number }>>({}); // per water year: prompts shown, last prompt day
  const thirstFlags = useRef<Uint8Array | null>(null);
  const startHold = useRef(0); // the clock waits while the chapter card shows
  const thirstCo = phase === 'play' ? r.slope.cohorts.find((c) => c.year === ry && c.cls === 'grassland' && c.kind === 'grass' && !c.watered) : undefined;
  thirstFlags.current = thirstCo && (askedRef.current[ry]?.n ?? 0) < 2 && !FAST ? ctx.model.col('seedGrass', ry, false).stressDayFlags : null;
  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0, last = performance.now(), hold = 0;
    const rate = FAST ? 4000 : settings.reduceMotion ? 120 : 22; // days per second at 1× (a year ≈ 17 s)
    const tick = (t: number) => {
      const dt = FAST ? 0.25 : Math.max(0, Math.min(0.25, (t - last) / 1000)); last = t;
      if (thirstRef.current) { raf = requestAnimationFrame(tick); return; } // waiting for the player's answer
      if (startHold.current > 0) { startHold.current -= dt; raf = requestAnimationFrame(tick); return; }
      let di = dayRef.current;
      // a new thirsty spell for this year's unwatered grass (the first day of the year counts as one): stop and ask
      const spell = (i: number) => {
        const f = thirstFlags.current; if (!f || !f[i]) return false;
        const ask = askedRef.current[ry]; if (ask && i < ask.last + 30) return false;
        // not on the first day: the plan already said water or not. Ask when they get thirsty again after a wet spell
        if (i === idx.start[ry]) return false;
        for (let k = Math.max(idx.start[ry], i - 21); k < i; k++) if (f[k]) return false; // thirsty again after at least three wet weeks
        return true;
      };
      if (hold > 0) hold -= dt;
      else {
        const nd = Math.min(playEnd, di + dt * rate * speed);
        di = nd;
        if (!FAST) for (let i = Math.floor(dayRef.current) + 1; i <= Math.floor(nd); i++) {
          if (spell(i)) { di = i; thirstRef.current = { day: i }; setThirst({ day: i }); break; }
          if ((d.weather.precipMm[i] ?? 0) >= A.stormDayMm.value) { di = i; hold = speed > 1 ? 0.8 : 1.8; sfx.play('thunder'); break; }
        }
      }
      dayRef.current = di; setDayIdx(di);
      if (di < playEnd) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed, playEnd, settings.reduceMotion, d]);
  /** Start watering this year's new grass from day `from` (the rest of its first water year). */
  const waterPlanOf = (from: number) => cs.autumns.map((x, k) => (k === ry && x.replantSlope ? { ...x, replantSlope: { ...x.replantSlope, waterFrom: from } } : x)) as typeof cs.autumns;
  const waterNow = (from: number) => {
    const next = waterPlanOf(from);
    const rr = evaluate(ctx, next);
    if (rr.over.water[ry] || rr.over.sweat[ry]) { showToast(`Not enough ${rr.over.water[ry] ? 'water' : 'volunteer sweat'} left in water year ${2021 + ry} to water from here.`); return false; }
    setCs((s) => addLog({ ...s, autumns: next }, { date: d.weather.dates[from], kind: 'decision', text: `${fmtDay(d.weather.dates[from])}: started watering the new native grass` }));
    sfx.play('place'); if (!askedRef.current[ry]) grant(['right-in-time']); askedRef.current[ry] = { n: 2, last: from }; thirstRef.current = null; setThirst(null);
    sayFor('maya', <>Water! Thank you — they needed that.</>, 3000, 'cheer');
    return true;
  };
  const letThemBe = () => { const a0 = askedRef.current[ry]; askedRef.current[ry] = { n: (a0?.n ?? 0) + 1, last: thirstRef.current?.day ?? dayRef.current }; thirstRef.current = null; setThirst(null); sfx.play('click'); };
  // what each answer would do (two model runs: watering from that day, and not watering)
  const thirstOpts = useMemo(() => {
    if (!thirst) return null;
    const co = r.slope.cohorts.find((c) => c.year === ry && c.cls === 'grassland' && c.kind === 'grass');
    if (!co) return null;
    const rr = evaluate(ctx, waterPlanOf(thirst.day));
    const wc = rr.slope.cohorts.find((c) => c.year === ry && c.cls === 'grassland' && c.kind === 'grass');
    return { area: co.areaM2, dry: co.survival ?? 0, wet: wc?.survival ?? 0, water: rr.water[ry] - r.water[ry], sweat: rr.sweat[ry] - r.sweat[ry], over: rr.over.water[ry] || rr.over.sweat[ry], overWhat: rr.over.water[ry] ? 'water' : 'sweat',
      waterAfter: rr.water[ry], waterBudget: rr.waterBudget[ry], firstDay: thirst.day === idx.start[ry],
      // the model's own contrast: the same planting watered from 1 October
      fromStart: thirst.day === idx.start[ry] ? null : (evaluate(ctx, cs.autumns.map((x, k) => (k === ry && x.replantSlope ? { ...x, replantSlope: { ...x.replantSlope, water: true, waterFrom: undefined } } : x)) as typeof cs.autumns).slope.cohorts.find((c) => c.year === ry && c.cls === 'grassland' && c.kind === 'grass')?.survival ?? null) };
  }, [thirst, r, ctx, ry]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'play' || dayIdx < playEnd) return;
    const id = window.setTimeout(() => {
      if (ry < 2) setPhase('pause');
      else if (!cs.stormDone) { setPhase('stormIntro'); setHour(0); hourRef.current = 0; }
      else if (!settings.reduceMotion) { dayRef.current = idx.start[0]; setDayIdx(idx.start[0]); setPhase('recap'); } // the season again, in about five seconds
      else finishSeason();
    }, 60);
    return () => window.clearTimeout(id);
  }, [phase, dayIdx, playEnd, ry, cs.stormDone]);
  const finishSeason = () => { if (finishedRef.current) return; finishedRef.current = true; setCs((s) => (s.ended ? s : finishCampaign(addLog(s, { date: '2023-09-30', kind: 'result', text: `30 Sept 2023: ${ENDINGS[r.ending].title}` })))); setPhase('ending'); sfx.play(r.questCount >= 3 ? 'success' : 'click'); };
  const finishedRef = useRef(false);
  // recap: Oct 2020 → Sept 2023 in about five seconds before the ending (display only; same model states)
  useEffect(() => {
    if (phase !== 'recap') return;
    let raf = 0, last = performance.now();
    const total = idx.end[2] - idx.start[0], rate = total / (FAST ? 0.25 : 5);
    const tick = (t: number) => {
      const dt = Math.max(0, Math.min(0.25, (t - last) / 1000)); last = t;
      const di = Math.min(idx.end[2], dayRef.current + dt * rate);
      dayRef.current = di; setDayIdx(di);
      if (di < idx.end[2]) raf = requestAnimationFrame(tick); else window.setTimeout(finishSeason, 400);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  // Coach's day: 1 May 2023
  useEffect(() => {
    if (phase === 'play' && ry === 2 && cs.stormDone && !may1Shown && dayIdx >= may1Idx && r.tankMay1 != null) {
      setMay1Shown(true);
      showToast(`1 May 2023 · the roof tank holds ${r.tankMay1.toFixed(1)} m³ for the field (model, daily rule)`);
      setCs((s) => addLog(s, { date: A.questCoachDate.value, kind: 'quest', text: `Roof tank on 1 May 2023: ${r.tankMay1!.toFixed(1)} m³ (Coach’s line ${A.questCoachTankM3.value} m³)` }));
    }
  }, [phase, dayIdx, ry, cs.stormDone, may1Shown, may1Idx, r.tankMay1]);
  const di = Math.floor(dayIdx);
  const rainToday = phase === 'play' ? d.weather.precipMm[di] ?? 0 : 0;
  // live survival while a year replays: the model's own survival rule applied to the severe-thirst days counted so far
  // this water year (the same daily columns that settle survival on 30 Sept — on the last day it equals the result)
  const liveRows = useMemo(() => {
    if (phase !== 'play') return [];
    const out: { label: string; flags: Uint8Array; planted?: number; watered: boolean }[] = [];
    for (const co of r.slope.cohorts.filter((c) => c.year === ry && c.cls === 'grassland'))
      out.push({ label: co.kind === 'grass' ? 'New native grass' : 'Young trees on the slope', flags: ctx.model.col(co.kind === 'grass' ? 'seedGrass' : 'seedTree', ry, co.watered, co.waterFrom).stressDayFlags, watered: co.watered });
    for (const sc of r.shade.filter((c) => c.year === ry)) out.push({ label: 'Shade trees by the lawn', flags: ctx.model.col('seedTree', ry, true).stressDayFlags, planted: sc.planted, watered: true });
    return out.slice(0, 2);
  }, [phase, ry, r, ctx]);
  const live = liveRows.map((l) => {
    let n = 0; const i0 = idx.start[ry], i1 = Math.min(di, idx.end[ry]);
    for (let i = i0; i <= i1; i++) n += l.flags[i];
    return { label: l.label, n, s: survival(n), planted: l.planted, watered: l.watered, thirsty: l.flags[di] === 1 };
  });
  useEffect(() => { if (phase === 'play') sfx.rain(Math.min(1, rainToday / 40)); else if (phase !== 'storm') sfx.stopRain(); }, [phase, di]);
  // neighbours react while the year plays (to the model's live state; once per year and kind)
  const saidRef = useRef<Record<string, boolean>>({});
  const liveGrass = live.find((l) => l.label === 'New native grass');
  useEffect(() => {
    if (phase !== 'play' || FAST) return;
    const k = (x: string) => `${ry}-${x}`;
    if (liveGrass && liveGrass.s < 0.6 && !saidRef.current[k('dry60')]) { saidRef.current[k('dry60')] = true; sayFor('maya', <>Our seedlings are <b>drying out</b>…</>, 3400, 'worried'); return; }
    if (liveGrass && liveGrass.s < 0.3 && !saidRef.current[k('dry30')]) { saidRef.current[k('dry30')] = true; sayFor('maya', <>We’re losing most of them!</>, 3400, 'worried'); return; }
    if (rainToday >= A.stormDayMm.value && !saidRef.current[k('storm')]) {
      const yr = r.slope.years[ry]?.grassland; const exposed = (yr?.bare ?? 0) + (yr?.trail ?? 0);
      saidRef.current[k('storm')] = true;
      if (exposed > 1) sayFor('maya', <>The storm is washing the <b>bare soil</b> away!</>, 3400, 'worried');
      else sayFor('maya', <>Big rain! Good thing the slope is covered.</>, 3400, 'cheer');
    }
  }, [phase, di]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { sfx.stopRain(); sfx.music('calm'); }, []);
  // the soundtrack follows the moment (only heard with sound on)
  useEffect(() => { sfx.music(phase === 'play' || phase === 'recap' ? 'play' : stormPhase ? 'storm' : phase === 'ending' ? 'end' : 'calm'); }, [phase, stormPhase]);

  // hourly storm replay
  const rain = d.storms.OAK.rainMm;
  const endHour = rain.length + SHOW_HOURS_AFTER;
  useEffect(() => {
    if (phase !== 'storm') return;
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const dt = Math.max(0, (t - last) / 1000); last = t; // a frame can start before the effect ran: never step back
      hourRef.current = Math.min(endHour, hourRef.current + (FAST ? 12 : dt * speed * (settings.reduceMotion ? 2 : 1.1)));
      setHour(hourRef.current);
      if (hourRef.current < endHour) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed, endHour, settings.reduceMotion]);
  useEffect(() => {
    if (phase === 'storm' && hour >= endHour) {
      const id = window.setTimeout(() => {
        setCs((s) => addLog({ ...s, stormDone: true }, { date: '2022-12-31', kind: 'storm', text: `New Year’s Eve storm: biggest hour into the drain ${r.storm.peakM3.toFixed(1)} m³ (doing nothing ${base.storm.peakM3.toFixed(1)} m³)` }));
        setPhase('stormResult'); sfx.play(r.quests.chen ? 'success' : 'fail');
      }, 60);
      return () => window.clearTimeout(id);
    }
  }, [phase, hour, endHour]);
  useEffect(() => { if (phase === 'storm') { const v = rain[Math.floor(hour)] ?? 0; sfx.rain(Math.min(1, v / 18)); if (v >= d.storms.OAK.maxHourMm * 0.5) sfx.play('thunder'); } }, [phase, Math.floor(hour)]);

  // cards for the autumn being planned
  const replantMaxNew = Math.max(0, Math.floor((d.slope.classes.grassland.grass.areaM2 - (d.slope.trail?.areaM2 ?? 0)) / 250) * 250);
  const bareR = y > 0 && bare > 1 ? Math.round(bare) : 0;
  const areaAt = (j: number) => (j === 0 ? 0 : bareR > 0 ? bareR + (j - 1) * 250 : j * 250);
  const cap = y === 0 ? Math.min(2000, replantMaxNew) : bareR + 500;
  let jMax = 0; while (areaAt(jMax + 1) <= cap) jMax++;
  const curArea = a.replantSlope?.areaM2 ?? 0;
  let jNow = 0; for (let j = 0; j <= jMax; j++) if (Math.abs(areaAt(j) - curArea) < Math.abs(areaAt(jNow) - curArea)) jNow = j;
  const cards = (() => {
    const out: { id: string; name: string; icon: JSX.Element; art: string; img?: string; tag?: string; on?: boolean; badge?: string; cost?: JSX.Element }[] = [];
    if (y < 2 || tab === 'slope') {
      if (offer.replant) out.push({ id: 'replant', name: y === 0 ? 'Replant Native Grassland' : bareR ? 'Re-sow / Expand' : 'Expand Native Grass', icon: <Wheat />, art: 'linear-gradient(165deg,#fff3c9 0%,#9fd56e 100%)', img: cardArt('replant'), tag: 'Reverse', on: curArea > 0, badge: curArea ? `${Math.round(curArea)} m²${a.replantSlope?.water ? ' +water' : ''}` : undefined });
      if (offer.trees) out.push({ id: 'trees', name: 'Plant Trees on the Slope', icon: <TreeDeciduous />, art: 'linear-gradient(165deg,#e2f6d2 0%,#7cbf55 100%)', img: cardArt('trees'), tag: 'Mixed', on: !!a.trees?.areaM2, badge: a.trees?.areaM2 ? `${a.trees.areaM2} m²` : undefined });
      if (offer.trail) out.push({ id: 'trail', name: 'The Shortcut', icon: <Construction />, art: 'linear-gradient(165deg,#fff4c4 0%,#f2b632 100%)', img: cardArt(a.trail === 'close' ? 'trail-closed' : a.trail === 'reroute' ? 'trail-reroute' : 'trail-open'), tag: 'Avoid', on: !!a.trail, badge: a.trail === 'close' ? 'close' : a.trail === 'reroute' ? 'reroute' : undefined });
      if (offer.check) out.push({ id: 'check', name: 'Check First', icon: <Search />, art: 'linear-gradient(165deg,#efeafc 0%,#b6a8e6 100%)', img: cardArt('check'), tag: 'Research', on: !!a.check });
      if (offer.shade) out.push({ id: 'shade', name: 'Shade Trees by the Lawn', icon: <TreesIcon />, art: 'linear-gradient(165deg,#e6f7dc 0%,#5fb36a 100%)', img: cardArt('shade'), tag: 'Shade', on: !!a.shadeTrees, badge: a.shadeTrees ? `${a.shadeTrees} trees` : undefined });
    }
    if (y === 2 && tab === 'site') {
      out.push({ id: 'garden', name: 'Rain Garden', icon: <Sprout />, art: 'linear-gradient(165deg,#d4f0ff 0%,#9fd56e 100%)', img: cardArt('garden'), tag: 'Reduce', on: prep.gardens.length > 0, badge: prep.gardens.map((g) => `${g.size}@${g.cand}`).join(' ') || undefined });
      out.push({ id: 'tank', name: 'Roof Tank', icon: <Cylinder />, art: 'linear-gradient(165deg,#e9f2fb 0%,#9db9d8 100%)', img: cardArt('tank'), tag: 'Store', on: !!prep.tank, badge: prep.tank ? `${TANK_M3[prep.tank.size]} m³` : undefined });
    }
    return out;
  })();
  const toolOk = cards.some((c) => c.id === tool) ? tool : cards[0]?.id ?? '';
  // the tool bar: short names and icons; in the first autumn the other tools open after the first planting, and the
  // shortcut once Leo has come up it (a fixed story order — every option stays the model's own)
  const [seenTools, setSeenTools] = useState<Record<string, boolean>>({});
  const firstMove = !!(cs.autumns[0].replantSlope || cs.autumns[0].trees || cs.autumns[0].trail || cs.autumns[0].check);
  const TOOL_META: Record<string, { label: string; icon: JSX.Element; tone: string }> = {
    replant: { label: y === 0 ? 'Sow grass' : 'Re-sow', icon: <Sprout />, tone: 'reverse' }, trees: { label: 'Trees', icon: <TreeDeciduous />, tone: 'mixed' },
    trail: { label: 'Shortcut', icon: <Construction />, tone: 'avoid' }, check: { label: 'Soil test', icon: <Search />, tone: 'research' },
    shade: { label: 'Shade trees', icon: <TreesIcon />, tone: 'shade' }, garden: { label: 'Rain garden', icon: <Droplet />, tone: 'reduce' }, tank: { label: 'Roof tank', icon: <Cylinder />, tone: 'store' },
  };
  const tools = cards.map((c) => {
    const locked = y === 0 && c.id !== 'replant' && (!firstMove || (c.id === 'trail' && !leoMet));
    const isNew = !seenTools[c.id] && ((y === 0 && c.id !== 'replant' && firstMove) || (y === 1 && c.id === 'shade') || (y === 2 && (c.id === 'garden' || c.id === 'tank')));
    return { id: c.id, ...TOOL_META[c.id], on: c.on, badge: typeof c.badge === 'string' ? c.badge.replace(' +water', ' 💧') : c.badge, tag: c.tag, locked, isNew };
  });
  // shade trees go in by the Rec Center lawn: show that place while their card is picked
  // a year whose only new planting was shade trees ends at the Rec Center lawn, where they grow
  const shadeOnlyYear = phase === 'pause' && r.shade.some((c) => c.year === ry) && !r.slope.cohorts.some((c) => c.year === ry);
  const view: 'slope' | 'site' | 'overview' = phase === 'intro' ? 'slope' : stormPhase ? 'site' : (planning && ((y === 2 && tab === 'site') || toolOk === 'shade')) || shadeOnlyYear ? 'site' : 'slope';
  // what an option would do, before you pick it: a model run of the plan with that option (memoised per plan)
  const previewCache = useRef(new Map<string, ReturnType<typeof evaluate>>());
  const preview = (patch: Partial<AutumnChoice>) => {
    const aut = cs.autumns.map((x, k) => (k === y ? { ...x, ...patch } : x)) as typeof cs.autumns;
    const key = `${tier}|${JSON.stringify(aut)}`;
    let v = previewCache.current.get(key);
    if (!v) { v = evaluate(ctx, aut); previewCache.current.set(key, v); if (previewCache.current.size > 200) previewCache.current.clear(); }
    return v;
  };

  // tap-to-sow on the island: the selected card's next plot (250 m²) and a − for the last one (same model inputs as the tray)
  const treesNow = a.trees?.areaM2 ?? 0;
  const sowAut = (() => {
    if (phase !== 'plan' || view !== 'slope') return null;
    if (toolOk === 'replant' && offer.replant && jNow < jMax) { const v = areaAt(jNow + 1); return cs.autumns.map((x, k) => (k === y ? { ...x, replantSlope: { areaM2: v, water: x.replantSlope?.water ?? y > 0 } } : x)) as typeof cs.autumns; }
    if (toolOk === 'trees' && offer.trees && treesNow < 500) return cs.autumns.map((x, k) => (k === y ? { ...x, trees: { areaM2: treesNow + 250 } } : x)) as typeof cs.autumns;
    return null;
  })();
  const sowKey = sowAut ? JSON.stringify(sowAut[y]) : '';
  const sowRes = useMemo(() => (sowAut ? evaluate(ctx, sowAut) : null), [sowKey, ctx, cs.autumns]); // eslint-disable-line react-hooks/exhaustive-deps
  const sow = (() => {
    if (phase !== 'plan' || view !== 'slope') return null;
    if (toolOk === 'replant' && offer.replant) {
      const next = jNow < jMax ? areaAt(jNow + 1) : null;
      return {
        next: sowAut && sowRes ? { autumns: sowAut, res: sowRes } : null,
        addLabel: next != null ? <>Sow {Math.round(next - curArea)} m² · {Math.ceil(next / 250) - Math.ceil(curArea / 250)} <Coins className="tok-i" /></> : null,
        areaLabel: curArea > 0 ? `${Math.round(curArea).toLocaleString('en-US')} m² sown${a.replantSlope?.water ? ' · watered' : ''}` : '',
        onAdd: next != null ? () => { sfx.play('place'); edit({ replantSlope: { areaM2: next, water: a.replantSlope?.water ?? y > 0 } }, 'replantSlope'); } : undefined,
        onRemove: jNow > 0 ? () => { sfx.play('click'); const v = areaAt(jNow - 1); edit({ replantSlope: v ? { areaM2: v, water: a.replantSlope?.water ?? y > 0 } : null }, 'replantSlope'); } : undefined,
      };
    }
    if (toolOk === 'trees' && offer.trees) {
      const tk = (v: number) => Math.ceil(v / 100) * COSTS3.tokensPer100m2Trees;
      return {
        next: sowAut && sowRes ? { autumns: sowAut, res: sowRes } : null,
        addLabel: treesNow < 500 ? <>Plant 250 m² of trees · {tk(treesNow + 250) - tk(treesNow)} <Coins className="tok-i" /></> : null,
        areaLabel: treesNow ? `${treesNow} m² of young trees` : 'Tap ＋ to plant trees here',
        onAdd: treesNow < 500 ? () => { sfx.play('place'); edit({ trees: { areaM2: treesNow + 250 } }); } : undefined,
        onRemove: treesNow > 0 ? () => { sfx.play('click'); edit({ trees: treesNow - 250 ? { areaM2: treesNow - 250 } : null }); } : undefined,
      };
    }
    return null;
  })();

  // you on the slope: where you may walk (inside the park, not into houses, near the slope), cell ↔ world
  const playerOn = view === 'slope' && tab === 'slope' && (phase === 'plan' || phase === 'play' || phase === 'pause');
  const wd = useMemo(() => makeWorld(d), [d]);
  const cw = d.grid.cellM * 0.1;
  const toCell = (x: number, z: number): [number, number] => [Math.round(z / cw + d.grid.rows / 2 - 0.5), Math.round(x / cw + d.grid.cols / 2 - 0.5)];
  const hAtXZ = (x: number, z: number) => wd.hAt(z / cw + d.grid.rows / 2 - 0.5, x / cw + d.grid.cols / 2 - 0.5);
  const freeXZ = (x: number, z: number) => { const [rr, cc] = toCell(x, z); if (rr < 1 || cc < 1 || rr >= d.grid.rows - 1 || cc >= d.grid.cols - 1) return false; const i = rr * d.grid.cols + cc; return d.inPark[i] === 1 && d.cover[i] !== 1 && Math.hypot(rr - d.slope.focus.r, cc - d.slope.focus.c) < 80; };

  // tap the golden slope to choose where your meadow grows (first autumn, sowing tool)
  const canPickSpot = phase === 'plan' && y === 0 && view === 'slope' && toolOk === 'replant' && lensKind === 'none' && offer.replant;
  const onGround = playerOn && phase !== 'pause' ? (rr: number, cc: number) => { if (!player.current.ready) return; player.current.tx = wd.x(cc); player.current.tz = wd.z(rr); }
    : canPickSpot ? (rr: number, cc: number) => {
    const cols = d.grid.cols; let hit: { r: number; c: number } | null = null;
    for (let dr = -1; dr <= 1 && !hit; dr++) for (let dc = -1; dc <= 1 && !hit; dc++) hit = grassCellAt.get((Math.round(rr) + dr) * cols + Math.round(cc) + dc) ?? null;
    if (!hit) { showToast('Sow on the golden grass.'); return; }
    setMeadowAt(hit); sfx.play('place');
    if (!curArea) sow?.onAdd?.();
  } : undefined;

  // test hook (screenshots only): tap the ground at a cell
  useEffect(() => { if (!SHOT) return; (window as any).__ngGround = onGround ?? null; (window as any).__ngSpots = slopeScene.spots; (window as any).__ngTeleport = (rr: number, cc: number) => { const q = player.current; q.x = wd.x(cc); q.z = wd.z(rr); q.tx = q.tz = null; }; });

  // ---------------------------------------------------------------- scenes
  const recapYear = dayIdx >= idx.start[2] ? 2 : dayIdx >= idx.start[1] ? 1 : 0;
  const lookYear = planning || phase === 'intro' ? y : phase === 'ending' ? 2 : phase === 'recap' ? recapYear : ry;
  // the neighbours stand on the island where their concern is (display only); tap one to see their quest
  const chenMet = (planning && y === 2) || cs.ran >= 3 || stormPhase || phase === 'ending' || phase === 'recap';
  const met: (NpcId | 'juno')[] = ['maya', ...(leoMet || cs.ran >= 1 ? ['leo' as const] : []), ...(chenMet ? ['coach' as const, 'chen' as const] : [])];
  const metSet = new Set(met);
  const introActs: Partial<Record<NpcId | 'juno', Act>> = phase === 'intro' ? { maya: introStep <= 1 ? 'wave' : introStep >= 3 ? 'cheer' : 'talk' } : {};
  const introSays: Partial<Record<NpcId | 'juno', ReactNode>> = phase === 'intro' && introStep === 1 ? { maya: <>Hi, I’m <b>Maya</b>! You’re our new <b>canyon keeper</b>.</> }
    : phase === 'intro' && introStep === 2 ? { maya: <>Storms wash soil off bare ground. <b>Native grass roots</b> hold it.</> } : {};
  // the neighbours act out the moment: Maya cheers or worries at the year's result, Ms. Chen watches the storm
  const momentActs: Partial<Record<NpcId | 'juno', Act>> = (() => {
    if (phase === 'pause') { const g = r.slope.cohorts.find((c) => c.year === ry && c.kind === 'grass'); const sv = g?.survival; return sv == null ? {} : { maya: sv >= 0.6 ? 'cheer' : sv < 0.3 ? 'worried' : 'talk' }; }
    if (phase === 'storm') { const hi = Math.max(0, Math.min(Math.floor(hour), r.storm.hours - 1)); return { chen: (r.storm.outletTotal[hi] ?? 0) > A.questChenPeak.value ? 'worried' : 'idle', coach: 'idle' }; }
    if (phase === 'stormResult') return { chen: r.quests.chen ? 'cheer' : 'worried' };
    return {};
  })();
  const npcs = { states: qStates, onOpen: (id: NpcId | 'juno') => { if (id === 'leo' && leoWaitingRef.current && leoSpotRef.current && player.current.ready) { const L = leoSpotRef.current; player.current.tx = wd.x(L.c + 2); player.current.tz = wd.z(L.r + 2); return; } if (id === 'juno') setCoachOpen(true); else setOpenNpc(id); },
    cast: phase === 'intro' ? (introStep === 0 ? [] : ['maya'] as (NpcId | 'juno')[]) : met,
    acts: { ...momentActs, ...introActs, ...(say?.act ? { [say.id]: say.act } : {}) }, says: { ...introSays, ...(say ? { [say.id]: say.text } : {}) }, enter: leoEnter ? { leo: true } : {} };
  const careGrass = phase === 'play' ? live.find((l) => l.label === 'New native grass') : undefined;
  const care = careGrass ? { thirsty: careGrass.thirsty, watered: careGrass.watered, onWater: !thirst && thirstCo && di < idx.end[ry] ? () => { waterNow(Math.min(idx.end[ry], di + 1)); } : undefined } : null;
  const slopeScene = useSlopeScene({ care, meadowAt: sowPts.length ? sowPts : meadowAt, d, ctx, autumns: cs.autumns, res: r, lookYear, after: phase === 'pause' || phase === 'ending', playing: phase === 'play' || phase === 'recap', planning: planning || phase === 'intro', dayIdx, reduceMotion: settings.reduceMotion, compare: lens ? base : null, runoff: lensKind === 'runoff', npcs, sow: phase === 'plan' && view === 'slope' && lensKind === 'none' && !(playerOn && toolOk === 'replant') ? sow : null, liveS: phase === 'play' ? (live.find((l) => l.label === 'New native grass')?.s ?? null) : null,
    pick: phase === 'plan' && view === 'slope' && lensKind === 'none' && toolOk === 'trail' && offer.trail ? { at: 'trail', pick: { title: 'The shortcut', opts: [
      { key: 'open', label: <>Leave open <Feel f={[['maya', 'worried'], ['leo', 'happy']]} /></>, on: !a.trail, onPick: () => { sfx.play('click'); edit({ trail: null }); } },
      { key: 'close', label: <>Close · {COSTS3.tokensCloseTrail} <Coins className="tok-i" /> <Feel f={[['maya', 'happy'], ['leo', 'worried']]} /></>, on: a.trail === 'close', onPick: () => { sfx.play('place'); edit({ trail: 'close' }); } },
      { key: 'reroute', label: <>Reroute · {COSTS3.tokensCloseTrail + A.rerouteExtraTokens.value} <Coins className="tok-i" /> <Feel f={[['maya', 'happy'], ['leo', 'happy']]} /></>, on: a.trail === 'reroute', onPick: () => { sfx.play('place'); edit({ trail: 'reroute' }); } },
    ] } }
      : phase === 'plan' && view === 'slope' && lensKind === 'none' && toolOk === 'check' && offer.check ? { at: 'slope', pick: { title: 'Dig a soil pit first?', opts: [
      { key: 'no', label: 'No', on: !a.check, onPick: () => { edit({ check: false }); } },
      { key: 'yes', label: <>Yes · {COSTS3.sweatCheck} h</>, on: !!a.check, onPick: () => { sfx.play('place'); edit({ check: true }); setShowCheck(true); } },
    ] } } : null });
  const mayaSpot = slopeScene.spots.find((p) => p.id === 'maya');
  const leoSpot = slopeScene.spots.find((p) => p.id === 'leo');
  leoWaitingRef.current = leoWaiting; leoSpotRef.current = leoSpot ?? null;
  // you start next to Maya
  useEffect(() => {
    if (!playerOn || player.current.ready || !mayaSpot) return;
    const r0 = mayaSpot.r + 5, c0 = mayaSpot.c + 3;
    Object.assign(player.current, { x: wd.x(c0), z: wd.z(r0), tx: null, tz: null, yaw: 0, ready: true });
    setAvCell({ r: r0, c: c0 });
  }, [playerOn, mayaSpot?.r, mayaSpot?.c]); // eslint-disable-line react-hooks/exhaustive-deps
  // keys: WASD / arrows walk; Space or E does the action on the button
  useEffect(() => {
    if (!playerOn) return;
    const keys = player.current.keys;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    const down = (e: KeyboardEvent) => { if (typing(e) || document.querySelector('.modal-bg, .req-card')) return; const k = e.key.toLowerCase(); if (MOVE.includes(k)) { keys.add(k); e.preventDefault(); } else if ((k === ' ' || k === 'e') && actRef.current) { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.(); if (!e.repeat) actRef.current(); } };
    const up = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    const clear = () => keys.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); keys.clear(); };
  }, [playerOn]);
  // the camera follows you (half-way to Leo while he waits for you)
  const leoXZ = leoSpot ? [wd.x(leoSpot.c), wd.z(leoSpot.r)] as const : null;
  const follow = useRef<{ x: number; z: number; ready: boolean }>({ x: 0, z: 0, ready: false });
  follow.current = {
    get x() { const q = player.current; return leoWaiting && leoXZ ? (q.x + leoXZ[0]) / 2 : q.x; },
    get z() { const q = player.current; return leoWaiting && leoXZ ? (q.z + leoXZ[1]) / 2 : q.z; },
    get ready() { return player.current.ready; },
  } as { x: number; z: number; ready: boolean };
  const followOn = playerOn && phase === 'plan' && !leoEnter && toolOk !== 'trail' && lensKind === 'none';
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  useEffect(() => { if (followOn && avCell) setAnchor({ ...avCell }); }, [followOn, !!avCell]); // eslint-disable-line react-hooks/exhaustive-deps
  // what you can do where you stand
  const here = avCell ? grassCellAt.get(avCell.r * d.grid.cols + avCell.c) ?? null : null;
  const sowNext = offer.replant && jNow < jMax ? areaAt(jNow + 1) : null;
  const nearLeo = !!(leoWaiting && leoSpot && avCell && Math.hypot(avCell.r - leoSpot.r, avCell.c - leoSpot.c) < 10);
  const trailPath = (d.slope.trail?.path ?? []) as [number, number][];
  const nearTrail = !!(avCell && offer.trail && leoMet && !leoWaiting && trailPath.some(([tr, tc]) => Math.hypot(tr - avCell.r, tc - avCell.c) < 4));
  const talkLeo = () => { setLeoWaiting(false); sayFor('leo', <>Hey! My campers use <b>that shortcut</b>. Don’t cut us off!</>, 6500, 'wave'); window.setTimeout(() => setReqQ((q) => (q.includes('leo') ? q : [...q, 'leo'])), FAST ? 300 : 1800); sfx.play('click'); };
  const plantHere = () => {
    if (!here || sowNext == null) return;
    setSowPts((q) => [...q, here]); if (!meadowAt) setMeadowAt(here);
    edit({ replantSlope: { areaM2: sowNext, water: a.replantSlope?.water ?? y > 0 } }, 'replantSlope');
    if (toolOk !== 'replant') setTool('replant');
    player.current.act = 'plant'; player.current.actUntil = performance.now() + 1500; player.current.tx = player.current.tz = null; sfx.play('place');
    setYouPop({ k: Date.now(), text: `+${Math.round(sowNext - curArea)} m² 🌱` });
  };
  // while the year plays: walk to your thirsty seedlings and water them (the same choice as the pin: watering starts that day)
  const planted = slopeScene.plantedAt;
  const nearBeds = !!(avCell && planted && Math.hypot(avCell.r - planted.r, avCell.c - planted.c) < 14);
  // explore: walk up to a real named place (OpenStreetMap) to put it in your field notes (5 → Neighbourhood Explorer)
  const [notesTick, setNotesTick] = useState(0);
  const placeHere = useMemo(() => {
    if (!avCell || !d.places?.places?.length) return null;
    let best: { name: string; kind: string; r: number; c: number } | null = null, bd = 6;
    for (const q of d.places.places) { const dd = Math.hypot(q.r - avCell.r, q.c - avCell.c); if (dd < bd) { bd = dd; best = q; } }
    return best && !(getCollection().places ?? []).includes(best.name) ? best : null;
  }, [avCell?.r, avCell?.c, notesTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const action: { icon: string; label: string; sub?: string; run: () => void } | null = playerOn && phase === 'play' && care?.thirsty && care.onWater
    ? (nearBeds ? { icon: '💧', label: 'Water them', sub: 'uses water + sweat', run: () => { player.current.act = 'plant'; player.current.actUntil = performance.now() + 1400; setYouPop({ k: Date.now(), text: '💧 watering!' }); care.onWater!(); } } : null)
    : !(playerOn && phase === 'plan') ? null
    : nearLeo ? { icon: '💬', label: 'Talk to Leo', run: talkLeo }
    : placeHere && (curArea > 0 || !here) ? { icon: '📍', label: 'Field note', sub: placeHere.name, run: () => { const q = placeHere; window.dispatchEvent(new CustomEvent('ng-place', { detail: { name: q.name, kind: q.kind, total: d.places?.places.length ?? 0 } })); setYouPop({ k: Date.now(), text: `📍 ${q.name}` }); setNotesTick((t) => t + 1); } }
    : here && sowNext != null ? { icon: '🌱', label: 'Plant here', sub: `${Math.round(sowNext - curArea)} m² · ${Math.ceil(sowNext / 250) - Math.ceil(curArea / 250)} token`, run: plantHere }
    : nearTrail ? { icon: '🥾', label: 'The shortcut', sub: 'keep, close or reroute it', run: () => { setTool('trail'); sfx.play('click'); } }
    : null;
  actRef.current = action?.run ?? null;
  // the next place to walk to: Leo while he waits; your thirsty beds while the year plays; bare ground to re-sow later
  const nearestGrass = useMemo(() => {
    if (!avCell || here) return null; let best: { r: number; c: number } | null = null, bd = 1e9;
    grassCellAt.forEach((g) => { const dd = Math.hypot(g.r - avCell.r, g.c - avCell.c); if (dd < bd) { bd = dd; best = g; } });
    return best;
  }, [avCell?.r, avCell?.c, !!here]); // eslint-disable-line react-hooks/exhaustive-deps
  const beacon: { r: number; c: number } | null = !playerOn ? null
    : phase === 'plan' && leoWaiting && leoSpot && !nearLeo ? leoSpot
    : phase === 'plan' && y === 0 && !curArea && !here && nearestGrass ? nearestGrass
    : phase === 'play' && care?.thirsty && care.onWater && planted && !nearBeds ? { r: planted.r, c: planted.c }
    : phase === 'plan' && y === 1 && bareR > 0 && !(a.replantSlope?.areaM2 || a.shadeTrees) && planted && !nearBeds ? { r: planted.r, c: planted.c }
    : null;
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const shadePlanted = r.shade.reduce((s, c) => s + c.planted, 0);
  const shadeSettled = r.shade.filter((c) => (stormPhase ? c.year < 2 : phase === 'ending' || (phase === 'pause' && c.year <= ry) || c.year < y)).reduce((s, c) => s + c.alive, 0);
  const shadeKnown = r.shade.length > 0 && r.shade.every((c) => (stormPhase ? c.year < 2 : phase === 'ending' || (phase === 'pause' && c.year <= ry) || c.year < y));
  const siteScene = useSiteScene({
    d, base: base.storm, result: phase === 'storm' || phase === 'stormResult' ? r.storm : null, prep: stormPhase || (planning && y === 2) ? r.stormPrep ?? (planning ? prep : null) : null, hour,
    mode: planning ? 'build' : phase === 'storm' ? 'play' : 'show', onPick: planning && y === 2 ? pickSpot : undefined, selSpot, hoverSpot, setHover: setHoverSpot,
    shade: { planted: shadePlanted, alive: shadeKnown ? shadeSettled : null }, reduceMotion: settings.reduceMotion, npcs,
    flows: !(planning && toolOk === 'shade'),
    tankPick: planning && y === 2 && tab === 'site' && toolOk === 'tank' ? { title: 'Roof tank', opts: [
      { key: 'none', label: 'None', on: !prep.tank, onPick: () => setPrep({ ...prep, tank: null }) },
      { key: 'L', label: <>Tank {TANK_M3.L} m³ · {COST.tankL - A.allyCoachTokens.value} <Coins className="tok-i" /></>, on: prep.tank?.size === 'L', onPick: () => { sfx.play('place'); setPrep({ ...prep, tank: { size: 'L' } }); } },
    ] } : null,
  });

  // ---------------------------------------------------------------- actions between years
  const onRespond = (l: Line, choice: 'adjust' | 'explain' | 'ignore') => {
    const ev = choice === 'explain' ? evidenceFor(l, r, base, trailOpen) : undefined;
    let s = respond(cs, { npc: l.npc, year: ry, choice, evidence: ev });
    s = addLog(s, { date: `${2021 + ry}-09-30`, kind: 'response', text: `${NPCS[l.npc].name}: ${choice === 'adjust' ? 'adjusted the plan (reroute the shortcut)' : choice === 'explain' ? `explained — ${ev}` : 'no reply'}` });
    setCs(s); setAnswered((x) => ({ ...x, [l.key]: choice }));
    if (l.npc === 'leo' && choice === 'adjust') grant(['trail-diplomat']);
    if (new Set(s.responses.map((x) => x.npc)).size === 4) grant(['listener']);
  };
  const nextAutumn = () => { setPhase('plan'); setTool(cs.ran === 1 ? 'replant' : 'replant'); setTab('slope'); setLens(false); };
  const revise = () => { const s = redo(cs, ry); if (s === cs) return; if (otherSeen[ry]) grant(['second-thoughts']); askedRef.current = {}; saidRef.current = {}; setCs(s); setAnswered({}); setPhase('plan'); setLens(false); };
  const watchStorm = () => {
    if (r.stormPrep) { setQuestion(STORM_QUESTION); setPhase('stormGuess'); }
    else { hourRef.current = 0; setHour(0); setSpeed(1); setPeakCall(null); setPhase('storm'); }
  };
  const stormGo = (answer: string | null) => {
    const t = truthFor(STORM_QUESTION, ctx, r, base);
    setCs((s) => predict(s, { key: 'storm', year: 2, answer, truth: t.id, correct: answer == null ? null : answer === t.id }));
    guessed(answer == null ? null : answer === t.id);
    setQuestion(null); hourRef.current = 0; setHour(0); setSpeed(1); setPeakCall(null); setPhase('storm');
  };
  const runExperiment = () => {
    const p: StormPrep = r.stormPrep?.tank ? r.stormPrep : { ...(r.stormPrep ?? { gardens: [] }), tank: { size: 'L' } };
    const e = stormRun(ctx, p, 'slow');
    setExperiment(e);
    const tk = e.facilities.find((f) => f.kind === 'tank');
    if (tk && tk.fullAt != null && tk.fullAt < e.peakHour) grant(['full-before-storm']);
    setCs((s) => addLog({ ...s, experiments: [...new Set([...s.experiments, 'tankEmpty'])] }, { date: '2022-12-31', kind: 'experiment', text: `What if the tank had been empty: biggest hour ${e.peakM3.toFixed(1)} m³` }));
  };
  const continueAfterStorm = () => { setExperiment(null); startPlay(2, stormIdx + 1); };
  // moments that earn achievements (each from the model results on screen)
  useEffect(() => {
    if (phase === 'pause') {
      const g0 = r.slope.cohorts.filter((c) => c.year === ry && c.kind === 'grass');
      if (g0.some((c) => !c.watered && (c.survival ?? 1) < A.longDrySurvival.value)) grant(['drought-lesson']);
      if (g0.some((c) => c.watered && (c.survival ?? 0) >= 0.7)) grant(['watered-through']);
      if (r.shade.some((c) => c.year === ry) && !cs.autumns.some((x) => (x.trees?.areaM2 ?? 0) > 0)) grant(['right-tree']);
    }
    if (phase === 'stormResult' && r.storm.facilities.some((f) => f.kind === 'garden' && f.fullAt != null && f.fullAt < r.storm.peakHour)) grant(['full-before-peak']);
    if (phase === 'stormResult' && peakCall != null && Math.abs(peakCall - (r.storm.peakHour + 0.5)) <= 1) grant(['storm-reader']);
    if (phase === 'ending') {
      setEndingNew(addEnding(r.ending));
      const ids: string[] = [];
      if (r.questCount === 4) ids.push('common-ground');
      if (r.slope.ldn.grassland.erosion.verdict === 'worse') ids.push('muddy-boots');
      if (r.tokens.total >= 0.9 * r.tokens.budget && r.questCount <= 1) ids.push('spread-thin');
      grant(ids);
    }
  }, [phase]);
  useEffect(() => { if (phase === 'plan' && r.over.water[y]) grant(['dry-tap']); }, [phase, r.over.water[y], y]);
  // a second season skips the story start: you know Maya and Leo now
  const restart = () => { player.current.ready = false; setSowPts([]); setLeoWaiting(false); setConfirmPlay(false); setReqQ([]); finishedRef.current = false; chenIntro.current = false; setSelSpot(null); setHoverSpot(null); setMeadowAt(null); setLeoMet(true); setTutWater(true); saidRef.current = {}; askedRef.current = {}; setOtherSeen({}); setCs(newCampaign(cs.focus)); setPhase('plan'); setTool('replant'); setIntroStep(2); setProposalOpen(false); setHideEnding(false); setTab('slope'); setTool('replant'); setAnswered({}); setExperiment(null); setMay1Shown(false); dayRef.current = idx.start[0]; setDayIdx(idx.start[0]); setLens(false); };

  useEffect(() => {
    if (phase !== 'intro' || introStep !== 0) return;
    const quick = settings.reduceMotion || FAST;
    // screenshots only: hold the cold open on one stage (?shot&hold=storm or ?shot&hold=rewind)
    const hold = SHOT ? new URLSearchParams(location.search).get('hold') : null;
    if (hold) { setCoStage(hold === 'rewind' ? 1 : 0); return; }
    setCoStage(0);
    const t1 = window.setTimeout(() => { setCoStage(1); sfx.play('click'); }, quick ? 300 : 4300);
    const t2 = window.setTimeout(() => setIntroStep(1), quick ? 700 : 7200);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [phase, introStep, settings.reduceMotion]);
  const startPlanting = () => { setPhase('plan'); setTool('replant'); sfx.play('click'); };
  const firstArea = cs.autumns[0].replantSlope?.areaM2 ?? 0;
  useEffect(() => {
    if (phase !== 'plan' || y !== 0 || leoMet) return;
    if (!(tutWater || cs.autumns[0].trees || cs.autumns[0].trail)) return;
    const id = window.setTimeout(() => {
      setLeoMet(true); setLeoEnter(true); sfx.play('star');
      window.setTimeout(() => { setLeoEnter(false); setLeoWaiting(true); }, 3300);
    }, 900);
    return () => window.clearTimeout(id);
  }, [phase, y, tutWater, leoMet, cs.autumns]);
  const chenIntro = useRef(false);
  useEffect(() => {
    if (phase !== 'plan' || y !== 2 || chenIntro.current) return;
    chenIntro.current = true;
    setTab('site'); setTool('garden');
    const t1 = window.setTimeout(() => sayFor('chen', <>I live just below. When it pours, it all <b>rushes into the drain at once</b>.</>, 5200, 'talk'), 1600);
    const t2 = window.setTimeout(() => sayFor('coach', <>And my team waters the field all summer. Could the <b>roof rain</b> help?</>, 5200, 'talk'), 7000);
    const t3 = window.setTimeout(() => setReqQ((q) => [...q.filter((x) => x !== 'chen' && x !== 'coach'), 'chen', 'coach']), FAST ? 2000 : 10500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [phase, y]);

  // ---------------------------------------------------------------- HUD values
  const sweatY = r.sweat[yearShown], waterY = r.water[yearShown];
  const dateLabel = phase === 'intro' ? 'Oct 2020' : planning ? `Autumn ${YEARS[y]}` : stormPhase ? (phase === 'storm' ? `${fmtStormDate(d.storms.OAK.startLocal, hour)} ${fmtClock(d.storms.OAK.startLocal, hour)}` : '31 Dec 2022') : fmtDay(d.weather.dates[di]);
  const stormMarks = useMemo(() => stormDayIdx(d, idx.start[0], idx.end[2]).map((i) => ({ idx: i, label: fmtDay(d.weather.dates[i]).replace(/ 20\d\d$/, '') })), [d, idx]);
  const tokensLeft = r.tokens.budget - r.tokens.total;


  const target = (() => {
    if (phase === 'intro') return <>Three autumns · real weather 2020–2023</>;
    if (planning && y === 0) return <>Autumn 2020 · plant the east slope</>;
    if (planning && y === 1) return <>Autumn 2021 · one more card, or skip</>;
    if (planning && y === 2) return <>Autumn 2022 · get ready for the storm</>;
    if (stormPhase) return <>31 Dec 2022 · the storm, hour by hour</>;
    if (phase === 'ending') return <>30 Sept 2023 · the end</>;
    return <>Water year {2021 + ry} · real daily weather</>;
  })();

  // one line at a time, from whoever the moment belongs to (never a paragraph)
  const wy0Rain = d.weather.waterYears[0].rainMm;
  const nyeMm = (() => { const i = d.weather.dates.indexOf('2022-12-31'); return i >= 0 ? (d.weather.precipMm[i] ?? null) : null; })();
  const hint: { key: string; who: NpcId | 'juno'; title: ReactNode; sub?: ReactNode; actions?: ReactNode } | null = (() => {
    if (phase === 'plan' && y === 0) {
      if (!curArea && !a.trees && !a.trail && !a.check) return { key: 'sow', who: 'maya', title: <>Walk onto the golden slope, then <b>🌱 Plant</b></>, sub: touch ? <>Tap the ground to walk there</> : <>Walk: <b className="kbd">W A S D</b> or arrow keys · or click the ground · plant: <b className="kbd">Space</b></> };
      if (curArea > 0 && !tutWater) return { key: 'water', who: 'maya', title: <>Water them through their first summer?</>, sub: <>costs water + sweat · or decide when they’re thirsty</>,
        actions: <><button className="btn small water" onClick={() => { edit({ replantSlope: { areaM2: curArea, water: true } }, 'replantSlope'); setTutWater(true); }}><Droplet className="ti" /> Water them</button><button className="btn small" onClick={() => { setTutWater(true); sfx.play('click'); }}>Not now</button></> };
      if (leoWaiting) return { key: 'leo', who: 'maya', title: <>Leo is waving at you!</>, sub: <>Walk over to him on the shortcut · then <b>💬 Talk</b></> };
      if (!reqSeen.leo) return leoEnter ? { key: 'leo0', who: 'maya', title: <>Someone’s coming up the shortcut…</>, sub: <>Watch the trail</> } : null;
      return { key: 'go', who: 'maya', title: <>Ready? <b>Play the year</b></>, sub: <>Real 2020–21 weather · only {wy0Rain} mm of rain downtown</> };
    }
    if (phase === 'plan' && y === 1) return { key: 'y1', who: 'maya', title: <>Autumn 2021 · one move this year</>, sub: bareR > 0 ? <>{bareR} m² is bare · walk to the arrow and <b>🌱 re-sow</b> · or plant shade trees for Leo</> : <>Walk the slope and <b>🌱 plant</b> more · or plant shade trees for Leo</> };
    if (phase === 'plan' && y === 2) return tab === 'site' ? { key: 'y2s', who: 'maya', title: <>Catch the storm water before it reaches the drain</>, sub: <>Pick a size, tap a spot <b>A–F</b> · or add a roof tank</> }
      : { key: 'y2', who: 'maya', title: <>Last autumn on the slope</>, sub: <>Then the <b>Rec Center</b> — the big storm comes on 31 December</> };
    if (phase === 'play' && !thirst) {
      const planted = (cs.autumns[ry]?.replantSlope?.areaM2 ?? 0) > 0;
      if (ry === 2) return { key: 'p2', who: 'maya', title: <>The storm comes on <b>31 December</b></>, sub: <>Real 2022 weather · then you’ll see your Rec Center plan at work</> };
      return planted ? { key: `p${ry}`, who: 'maya', title: <>Keep your seedlings alive</>, sub: <>Thirsty? Run over and <b>💧 water</b> them</> }
        : { key: `p${ry}`, who: 'maya', title: <>A real year of weather</>, sub: <>Watch what it does to the slope</> };
    }
    if (phase === 'guess' || phase === 'stormGuess') return null;
    return null;
  })();

  const moved = !!(a.replantSlope?.areaM2 || a.trees || a.trail || a.check || a.shadeTrees);
  const stormIn = y === 0 ? <>⛈️ in 3 autumns</> : y === 1 ? <>⛈️ in 2 autumns</> : <>⛈️ this winter</>;
  const taskList: { title: ReactNode; list: Task[] } | null = phase !== 'plan' ? null
    : y === 0 ? { title: 'Autumn 2020', list: [
      { id: 'sow', text: <>Sow grass on the golden slope</>, done: curArea > 0 },
      { id: 'water', text: <>Water them — or wait</>, done: curArea > 0 && tutWater },
      { id: 'leo', text: <>Talk to Leo</>, done: !!reqSeen.leo },
      { id: 'play', text: <>▶ Play the year</>, done: false },
    ] }
    : y === 1 ? { title: 'Autumn 2021', list: [
      { id: 'move', text: bareR > 0 ? <>Re-sow bare ground — or plant shade trees for Leo</> : <>Re-sow — or plant shade trees for Leo</>, done: moved },
      { id: 'play', text: <>▶ Play the year</>, done: false },
    ] }
    : { title: 'Autumn 2022', list: [
      { id: 'meet', text: <>Meet Ms. Chen and Coach</>, done: !!reqSeen.chen && !!reqSeen.coach },
      { id: 'build', text: <>Build a rain garden or a roof tank</>, done: stormBuilt(a.storm) },
      { id: 'play', text: <>▶ Play to New Year’s Eve</>, done: false },
    ] };

  return (
    <div className={`screen ${hint?.key === 'sow' && !playerOn ? 'tut-sow' : ''} ${hint?.key === 'go' ? 'tut-go' : ''}`}>
      <div className="canvas-wrap">
        <Stage d={d} view={view} onGround={onGround} follow={followOn ? follow : null} flyIn={phase === 'intro' && introStep === 0} aerial={settings.aerial || lensKind === 'aerial'} reduceMotion={settings.reduceMotion}
          layers={phase === 'intro' ? { places: false, boundary: false } : undefined} shiftX={(phase === 'pause' || phase === 'stormResult') && !narrow ? 0.17 : 0}
          paint={view === 'slope' ? slopeScene.paint : undefined} quiet={view === 'slope' ? slopeScene.quiet : undefined} treeSkip={view === 'slope' ? slopeScene.treeSkip : undefined}
          mood={phase === 'intro' && introStep === 0 && coStage === 0 ? 1 : view === 'slope' ? slopeScene.mood : view === 'site' ? siteScene.mood : 0} nightLevel={phase === 'intro' && introStep === 0 && coStage === 0 ? 0.82 : view === 'site' ? siteScene.night : 0}
          tufts={view === 'slope' ? slopeScene.tufts : undefined} wet={view === 'slope' ? slopeScene.wet : view === 'site' ? (planning ? 0.35 : 0.9) : 0.3}
          paintMix={view === 'slope' && (lensKind === 'compare' || lensKind === 'runoff') ? 0.9 : 0}
          aim={followOn && anchor ? { r: anchor.r, c: anchor.c, span: leoWaiting ? (narrow ? 96 : 84) : narrow ? 46 : 40 }
            : view === 'slope' && phase === 'intro' && introStep >= 1 && mayaSpot ? { r: mayaSpot.r, c: mayaSpot.c, span: narrow ? 20 : 17, low: true, lift: 2.2 }
            : view === 'slope' && (phase === 'play' || phase === 'pause') && slopeScene.plantedAt ? { r: slopeScene.plantedAt.r, c: slopeScene.plantedAt.c, span: Math.max(56, Math.min(84, Math.sqrt(slopeScene.plantedAt.n) * 6)) }
            : view === 'slope' && phase === 'plan' && (toolOk === 'trail' || (y === 0 && (leoEnter || say?.id === 'leo'))) && d.slope.trail?.path?.length ? (() => { const P = d.slope.trail!.path as [number, number][]; const [tr, tc] = P[Math.floor(P.length / 2)]; return { r: tr + 6, c: tc - 4, span: 76 }; })()
            // sowing: a closer look at your meadow (where you chose to start it), so the beds read
            : view === 'slope' && phase === 'plan' && y === 0 && toolOk === 'replant' ? { r: (meadowAt?.r ?? 161) - 4, c: (meadowAt?.c ?? 176) - 2, span: narrow ? 72 : 66 } : null}>{view === 'slope' ? (w: any) => <>{slopeScene.stage(w)}{beacon && <Beacon pos={[wd.x(beacon.c), wd.hAt(beacon.r, beacon.c), wd.z(beacon.r)]} still={settings.reduceMotion} />}{playerOn && player.current.ready && <PlayerFigure p={player} speed={7} height={3.4} hAt={hAtXZ} toCell={toCell} free={freeXZ} onCell={(rr, cc) => setAvCell({ r: rr, c: cc })} still={false} pop={youPop} />}</> : view === 'site' ? siteScene.stage : undefined}</Stage>
      </div>
      <div className={`overlay game campaign phase-${phase} ${phase === 'intro' && introStep === 0 ? 'intro0' : ''}`}>
        <TopBar coachOpen={coachOpen} onCoach={() => setCoachOpen(!coachOpen)} chips={<>
          <ResChip icon={<Icon3d k="token" fallback={<Coins />} />} label="Tokens" value={<>{r.tokens.budget - r.tokens.total}<small> /{r.tokens.budget}</small></>} warn={r.over.tokens} amount={r.tokens.total} />
          <ResChip icon={<Icon3d k="sweat" fallback={<Hand />} />} tone="sand" label="Sweat" value={<>{Math.max(0, Math.round(r.sweatBudget[yearShown] - sweatY))}<small> h</small></>} warn={r.over.sweat[yearShown]} />
          <ResChip icon={<Icon3d k="water" fallback={<Droplet />} />} tone="water" label="Water" value={<>{Math.max(0, Math.round(r.waterBudget[yearShown] - waterY))}<small> m³</small></>} warn={r.over.water[yearShown]} />
        </>} extra={<div className="q-wrap"><button className="q-map" onClick={() => setMapOpen(true)} title="Where is this? Map of San Francisco" aria-label="Map: where is this?"><MapPin /></button><div className="q-date"><Icon3d k="calendar" fallback={<CalendarDays className="ti" />} /> {dateLabel} <SeasonDots step={phase === 'intro' ? -1 : phase === 'ending' || phase === 'recap' ? 4 : stormPhase ? 3 : planning ? y : ry} /></div>{phase !== 'intro' && <QuestBoard states={qStates} focus={cs.focus} onOpen={setOpenNpc} only={met.filter((x): x is NpcId => x !== 'juno')} />}</div>} />
        {hint && coachOpen && (
          <div className="hint-pill" key={hint.key}>
            <Avatar id={hint.who} size={40} mood="happy" />
            <div className="hp-txt"><b>{hint.title}</b>{hint.sub && <span>{hint.sub}</span>}</div>
            {hint.actions && <div className="hp-act">{hint.actions}</div>}
          </div>
        )}

        {(phase === 'pause' || phase === 'stormResult') && settings.science && (
          <div className="g-side">
            <ConsequencePanel r={r} base={base} title="So far → Sept 2023" sub="vs doing nothing · tap a row: why?" lensKind={lensKind} onLensKind={view === 'slope' ? setLensKind : undefined}
              why={(k) => whyChain(k, r, base, { wyRainMm: d.weather.waterYears.map((x) => x.rainMm), stationKm: d.weather.station?.distanceKm ?? 0, oakKm: Math.round(d.storms.OAK.distanceKm), oakMaxHourMm: d.storms.OAK.maxHourMm })}>
            </ConsequencePanel>
          </div>
        )}

        {phase === 'recap' && <div className="storm-banner recap">The whole season again · {fmtDay(d.weather.dates[di])} <button className="btn small" onClick={finishSeason}>Skip ⏭</button></div>}
        {(phase === 'play' || phase === 'recap') && !thirst && (
          <div className="hyeto timeline">
            <div className="cap"><span>Rain by month · real records <span className="tag obs">observed</span></span>
              {phase === 'play' && <span style={{ display: 'flex', gap: 6 }}>
                <button className={`btn small ${speed === 1 ? 'dark' : ''}`} onClick={() => setSpeed(1)}>1×</button>
                <button className={`btn small ${speed === 4 ? 'dark' : ''}`} onClick={() => setSpeed(4)}>4×</button>
                <button className="btn small" onClick={() => { dayRef.current = playEnd; setDayIdx(playEnd); }}>Skip ⏭</button></span>}
            </div>
            <Timeline dates={d.weather.dates} rain={d.weather.precipMm} dayIdx={di} startIdx={idx.start[0]} endIdx={idx.end[2]} decisions={idx.start} storms={stormMarks} />
          </div>
        )}
        {phase === 'storm' && (
          <div className="hyeto">
            <div className="cap"><span>Hourly rain at OAK airport · 31 Dec 2022</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className={`btn small ${speed === 1 ? 'dark' : ''}`} onClick={() => setSpeed(1)}>1×</button>
                <button className={`btn small ${speed === 4 ? 'dark' : ''}`} onClick={() => setSpeed(4)}>4×</button>
                <button className="btn small" onClick={() => { hourRef.current = endHour; setHour(endHour); }}>Skip ⏭</button></span>
            </div>
            <div className="bars">
              {/* the hours still to come stay hidden (you can't read the peak off the chart before it happens) */}
              {rain.map((v, k) => <div key={k} className={`b ${k < hour ? 'past' : 'future'} ${k === base.storm.peakRainHour && k < hour ? 'peak' : ''}`} style={{ height: k < hour ? `${Math.max(2, (v / d.storms.OAK.maxHourMm) * 100)}%` : '6%' }} title={k < hour ? `${v} mm` : 'still to come'} />)}
              {Array.from({ length: SHOW_HOURS_AFTER }).map((_, k) => <div key={'x' + k} className="b" style={{ height: '2%', background: '#ddd' }} />)}
              <div className="head" style={{ left: `${(Math.min(hour, endHour) / endHour) * 100}%` }} />
              {peakCall != null && <div className="call-mark" style={{ left: `${(Math.min(peakCall, endHour) / endHour) * 100}%` }}><span>your call</span></div>}
            </div>
            <div className="axis"><span>{fmtClock(d.storms.OAK.startLocal, 0)}</span><span>rain ends</span><span>+{SHOW_HOURS_AFTER} h</span></div>
          </div>
        )}

        {planning && phase === 'plan' && (
          <div className="g-bottom2">
            {y === 2 && (
              <div className="seg tabs" role="tablist">
                <button className={tab === 'slope' ? 'on' : ''} onClick={() => { setTab('slope'); setTool('replant'); }}>East slope</button>
                <button className={tab === 'site' ? 'on' : ''} onClick={() => { setTab('site'); setTool('garden'); setLens(false); }}>Rec Center</button>
              </div>
            )}
            {toolOk === 'replant' && offer.replant && view === 'slope' && (curArea > 0 || y > 0) && (
              <div className="tray2">
                <span className="t2-l"><Sprout className="ti" /> <b>{Math.round(curArea).toLocaleString('en-US')} m²</b>{curArea ? <> · {Math.ceil(curArea / 250)} <Coins className="tok-i" /></> : ' sown'}</span>
                <button className="rnd" aria-label="Sow less" disabled={!sow?.onRemove} onClick={() => sow?.onRemove?.()}>−</button>
                <button className="rnd plus" aria-label="Sow more" disabled={!sow?.onAdd} onClick={() => sow?.onAdd?.()}>＋</button>
                <button className={`toggle ${a.replantSlope?.water ? 'on' : ''}`} disabled={!curArea} onClick={() => { edit({ replantSlope: curArea ? { areaM2: curArea, water: !a.replantSlope?.water } : null }, 'replantSlope'); setTutWater(true); }}>
                  <Droplet className="ti" /> {a.replantSlope?.water ? 'Watering: on' : 'Water them'}</button>
                {bareR > 0 && <button className="btn small" onClick={() => edit({ replantSlope: { areaM2: bareR, water: true } }, 'replantSlope')}>Re-sow the bare {bareR} m²</button>}
              </div>
            )}
            {toolOk === 'trees' && offer.trees && (
              <Choices opts={[0, 250, 500].map((v) => ({ key: String(v), label: v ? `${v} m²` : 'No trees', cost: v ? <>{Math.ceil(v / 100) * COSTS3.tokensPer100m2Trees} <Coins className="tok-i" /></> : 'free', on: (a.trees?.areaM2 ?? 0) === v, onPick: () => edit({ trees: v ? { areaM2: v } : null }), feel: v ? [['maya', 'worried']] : [] }))} />
            )}
            {toolOk === 'shade' && offer.shade && (
              <Choices opts={[0, ...SHADE_COUNTS].map((n) => ({ key: String(n), label: n ? `${n} trees` : 'None', cost: n ? <>{Math.ceil((n * COSTS3.crownM2) / 100) * COSTS3.tokensPer100m2Trees} <Coins className="tok-i" /></> : 'free', on: (a.shadeTrees ?? 0) === n, onPick: () => edit({ shadeTrees: n || undefined }, 'shadeTrees'), feel: n ? [['leo', 'happy']] : [] }))} />
            )}
            {toolOk === 'garden' && y === 2 && (
              <Choices hint={prep.gardens[0] ? <>Garden at <b>{prep.gardens[0].cand}</b> · <button className="lnk" onClick={() => setPrep({ ...prep, gardens: [] })}>remove</button></> : <>Pick a size, then tap a spot <b>A–F</b></>}
                opts={(['S', 'M', 'L'] as GardenSize[]).map((sz) => ({ key: sz, label: `${sz === 'S' ? 'Small' : sz === 'M' ? 'Medium' : 'Large'} · ${GARDEN_M2[sz]} m²`, cost: <>{sz === 'S' ? COST.gardenS : sz === 'M' ? COST.gardenM : COST.gardenL} <Coins className="tok-i" /></>, on: gSize === sz,
                  onPick: () => { setGSize(sz); if (prep.gardens[0]) setPrep({ ...prep, gardens: [{ cand: prep.gardens[0].cand, size: sz }] }); }, feel: [['chen', 'happy']] }))} />
            )}
            <div className="tool-row">
              <div className="tbar" role="toolbar" aria-label="Tools">
                {tools.map((t) => (
                  <button key={t.id} className={`tbtn ${toolOk === t.id ? 'sel' : ''} ${t.on ? 'on' : ''} ${t.locked ? 'locked' : ''}`} data-tone={t.tone} disabled={t.locked} aria-pressed={toolOk === t.id}
                    onClick={() => { setTool(t.id); setSeenTools((x) => ({ ...x, [t.id]: true })); sfx.play('click'); }} title={t.tag ? `${t.label} · ${t.tag}` : t.label}>
                    <span className="tool-i">{t.locked ? <span className="lock">🔒</span> : t.icon}</span>
                    <span className="tool-l">{t.label}</span>
                    {t.badge && <span className="tool-b">{t.badge}</span>}
                    {t.isNew && !t.locked && !t.on && <b className="tool-new">NEW</b>}
                  </button>
                ))}
              </div>
              <button className={`btn go big play-btn ${hint?.key === 'go' ? 'pulse' : ''}`} onClick={() => { setConfirmPlay(true); sfx.play('click'); }} disabled={!!overBudgetText(r, y) || (y === 0 && !(curArea > 0 && tutWater && reqSeen.leo))} title={y === 0 && !(curArea > 0 && tutWater && reqSeen.leo) ? 'Finish this autumn’s tasks first' : undefined}><Play className="ti" /> {y < 2 ? 'Play the year' : 'Play to New Year’s Eve'}</button>
            </div>
            {overBudgetText(r, y) && <span className="chip warn">{overBudgetText(r, y)}</span>}
          </div>
        )}

        {phase === 'storm' && (rain[Math.floor(hour)] ?? 0) >= d.storms.OAK.maxHourMm * 0.5 && <div className="flash" key={'sf' + Math.floor(hour)} aria-hidden />}
        {phase === 'storm' && (() => {
          const hi = Math.max(0, Math.min(Math.floor(hour), r.storm.hours - 1));
          let mine = 0, none = 0; for (let k = 0; k <= hi; k++) { mine = Math.max(mine, r.storm.outletTotal[k] ?? 0); none = Math.max(none, base.storm.outletTotal[k] ?? 0); }
          const gd = r.storm.facilities.find((f) => f.kind === 'garden'), tk = r.storm.facilities.find((f) => f.kind === 'tank');
          return <StormTicker date={fmtStormDate(d.storms.OAK.startLocal, hour)} clock={fmtClock(d.storms.OAK.startLocal, hour)} rainNow={rain[Math.floor(hour)] ?? 0} now={r.storm.outletTotal[hi] ?? 0} mine={mine} none={none} line={A.questChenPeak.value}
            max={Math.max(base.storm.peakM3, r.storm.peakM3, A.questChenPeak.value) * 1.1} garden={gd ? gd.storage[hi] / gd.capM3 : null} tank={tk ? tk.storage[hi] / tk.capM3 : null} night={siteScene.night}
            called={peakCall != null ? fmtClock(d.storms.OAK.startLocal, peakCall) : null} onCall={peakCall == null && hour < r.storm.rainHours ? () => { setPeakCall(hour); sfx.play('star'); } : undefined} />;
        })()}
        {phase === 'plan' && y === 0 && !hint && !cs.autumns[0].replantSlope && !cs.autumns[0].trail && <div className="look-hint" aria-hidden>{narrow ? 'Drag to look around · pinch to zoom' : 'Drag to look around · scroll to zoom'}</div>}
        {phase === 'play' && chapter && <div className="chapter has-img" aria-live="polite" style={{ backgroundImage: `linear-gradient(180deg, rgba(10,14,12,.25), rgba(10,14,12,.55)), url("${artUrl(['ch-dry.webp', 'ch-storm.webp', 'ch-nye.webp'][chapter.n - 1] ?? 'ch-dry.webp')}")` }}>
          <div className="chapter-n">Year {chapter.n} of 3</div><div className="chapter-t">{chapter.title}</div><div className="chapter-s">{chapter.sub} <span className="tag obs">observed</span></div>
          <div className="chapter-credit">AI-generated illustration · not a photo of Glen Canyon</div>
        </div>}
        {phase === 'play' && <ReplayTicker iso={d.weather.dates[di]} rain={rainToday} storm={slopeScene.storm === 1} wet={slopeScene.wet} live={live}
          onWater={!thirst && thirstCo && di < idx.end[ry] ? () => waterNow(Math.min(idx.end[ry], di + 1)) : undefined} />}
        {phase === 'play' && thirst && thirstOpts && (
          <div className="event-card" role="dialog" aria-label="Thirsty seedlings">
            <div className="ev-eyebrow">{fmtDay(d.weather.dates[thirst.day])} · your call</div>
            <h3>Your seedlings are thirsty</h3>
            <p>{Math.round(thirstOpts.area).toLocaleString('en-US')} m² of new native grass {thirst.day === idx.start[ry] ? 'went into soil still dry from the summer — the rains haven’t come yet.' : 'is drying out — young roots are shallow.'} <span className="tag model">model</span></p>
            <div className="ev-opts">
              <button className="ev-opt go" onClick={() => waterNow(thirst.day)} disabled={thirstOpts.over}>
                <span className="ev-img"><img src={artUrl('ev-water.webp')} alt="" draggable={false} /></span>
                <b>Water them now</b><span>{thirstOpts.over ? `not enough ${thirstOpts.overWhat} left this year` : `+${Math.round(thirstOpts.water)} m³ water · +${Math.round(thirstOpts.sweat)} h sweat`}</span>
                <span className="ev-bar" aria-label={`water this year: ${Math.round(thirstOpts.waterAfter)} of ${thirstOpts.waterBudget} m³`}><i style={{ width: `${Math.min(100, (thirstOpts.waterAfter / Math.max(1, thirstOpts.waterBudget)) * 100)}%` }} /></span>
                <small className="ev-bar-l">{Math.round(thirstOpts.waterAfter)} of this year’s {thirstOpts.waterBudget} m³ of water</small>
              </button>
              <button className="ev-opt" onClick={letThemBe}>
                <span className="ev-img"><img src={artUrl('ev-dry.webp')} alt="" draggable={false} /></span>
                <b>Let them be</b><span>save water + sweat</span>
              </button>
            </div>
            <small>Watch the survival meter.</small>
          </div>
        )}
        {phase === 'play' && slopeScene.storm === 1 && (() => {
          const yr = r.slope.years[ry]?.grassland; const exposed = (yr?.bare ?? 0) + (yr?.trail ?? 0);
          return <><div className="flash" key={`fl${di}`} aria-hidden /><div className="storm-banner"><CloudLightning className="ti" /> Storm day · {fmtDay(d.weather.dates[di])} · {rainToday} mm downtown{exposed > 1 ? <> · <b>{Math.round(exposed).toLocaleString('en-US')} m²</b> of bare soil and open trail on the slope wash hardest <span className="tag model">model</span></> : null}</div></>;
        })()}

        {mapOpen && <div className="modal-bg" onClick={() => setMapOpen(false)}><div className="modal map-modal" onClick={(e) => e.stopPropagation()}><WhereMap /><div className="actions"><button className="btn primary" onClick={() => setMapOpen(false)}>Back to the canyon</button></div></div></div>}
        {phase === 'intro' && introStep === 0 && <>
          <ScreenRain on={coStage === 0} still={settings.reduceMotion} />
          {coStage === 0 && !settings.reduceMotion && <div className="co-flash" aria-hidden />}
          <StormColdOpen stage={coStage} nyeMm={nyeMm} onSkip={() => { setIntroStep(1); sfx.play('click'); }} />
        </>}
        {phase === 'intro' && (introStep === 1 || introStep === 2) && (
          <div className="where-chip"><MapPin className="ti" /><div><b>Glen Canyon Park · San Francisco</b><small>A real place · real terrain · real 2020–23 weather</small></div></div>
        )}
        {phase === 'intro' && (introStep === 1 || introStep === 2) && (
          <div className="intro-cta">
            <button className="btn primary big pulse" onClick={() => { setIntroStep(introStep + 1); sfx.play('click'); }}>Next ▶</button>
            <button className="btn small ghost" onClick={() => setIntroStep(3)}>Skip</button>
          </div>
        )}
        {phase === 'intro' && introStep >= 3 && <MissionCard onGo={startPlanting} touch={touch} />}
        {taskList && !narrow && <TaskList title={taskList.title} count={stormIn} tasks={taskList.list} />}
        {taskList && narrow && (() => { const t = taskList.list.find((x) => !x.done); return t ? <div className="task-mini"><b>🎯</b> {t.text}<span className="tl-count">{stormIn}</span></div> : null; })()}
        {confirmPlay && phase === 'plan' && (
          <div className="modal-bg" onClick={() => setConfirmPlay(false)}><div className="modal confirm-play" onClick={(e) => e.stopPropagation()}>
            <div className="m-eyebrow">Ready?</div>
            <h2>{y < 2 ? <>Play the real weather of {2020 + y}–{String(21 + y)}</> : <>Play on to New Year’s Eve 2022</>}</h2>
            <p>Your autumn plan is locked in. You can still water when the seedlings get thirsty.</p>
            <div className="actions"><button className="btn" onClick={() => setConfirmPlay(false)}>Not yet</button><button className="btn go big" onClick={() => { setConfirmPlay(false); runAutumn(); }}>▶ Start the year</button></div>
          </div></div>
        )}
        {action && !confirmPlay && (
          <button className={`act-btn ${(action.icon === '🌱' && !curArea) || action.icon === '💬' || action.icon === '💧' ? 'first' : ''}`} onClick={action.run}>
            <span className="ab-ic" aria-hidden>{action.icon}</span><span className="ab-t"><b>{action.label}</b>{action.sub && <small>{action.sub}</small>}</span>{!touch && <kbd>Space</kbd>}
          </button>
        )}
        {phase === 'plan' && reqQ.length > 0 && <RequestCard id={reqQ[0]} onOk={() => { const id = reqQ[0]; setReqSeen((s) => ({ ...s, [id]: true })); setReqQ((q) => q.slice(1)); sfx.play('star'); }} />}

        {(phase === 'guess' || phase === 'stormGuess') && question && (
          <div className="modal-bg"><div className="modal guess2">
            <div className="m-eyebrow">Guess it! 🎯 · optional</div>
            <h2>{question.prompt}</h2>
            <div className="choices">{question.choices.map((c, k) => (
              <button key={c.id} className="choice" data-k={k} onClick={() => { sfx.play('place'); if (phase === 'guess') begin(question, c.id); else stormGo(c.id); }}>
                <span className="g-meter" aria-hidden>{[0, 1, 2].map((j) => <i key={j} className={j < 3 - k ? 'on' : ''} />)}</span>
                <b>{c.label}</b>
              </button>
            ))}</div>
            <div className="actions"><button className="btn small" onClick={() => (phase === 'guess' ? begin(question, null) : stormGo(null))}>Skip — just play</button></div>
            <p className="small-note">Guess what the model will show · 3 right = ★ Forecaster stamp</p>
          </div></div>
        )}

        {phase === 'pause' && (
          <PauseCard d={d} cs={cs} y={ry} r={r} base={base} ctxModel={ctx.model} ctxBare={ry < 2 ? bareAtStart(ctx, cs.autumns, ry + 1) : 0} answered={answered} onRespond={onRespond} tokensLeft={tokensLeft}
            others={ry === 0 ? otherCards(ctx, cs.autumns, r) : null} onOthers={() => setOtherSeen((x) => ({ ...x, [ry]: true }))}
            canRevise={canRedo(cs, ry)} onRevise={revise} onNext={nextAutumn} onSatellite={() => setCs((s) => award(s, ['satellite-eyes']).state)} only={met.filter((x): x is NpcId => x !== 'juno')} />
        )}

        {phase === 'stormIntro' && (
          <div className="storm-intro" style={{ backgroundImage: `radial-gradient(ellipse at 50% 45%, rgba(10,16,22,.72) 0%, rgba(10,16,22,.5) 55%, rgba(10,16,22,.4) 100%), url("${artUrl('ch-nye.webp')}")` }}>
            <div className="chapter-n">The big one</div>
            <div className="chapter-t">31 December 2022</div>
            <div className="si-stats">
              <div><b>{d.storms.downtownDaily20221231Mm} mm</b><span>downtown that day — the wettest day of 2020–2023</span></div>
              <div><b>{d.storms.OAK.maxHourMm} mm</b><span>in the biggest hour at Oakland airport</span></div>
              <span className="tag obs">observed · NOAA</span>
            </div>
            <div className="si-plan">Your Rec Center plan: <b>{r.stormPrep ? describeAutumn({ storm: r.stormPrep }) : 'nothing built'}</b></div>
            <button className="btn primary big" onClick={watchStorm}><CloudLightning className="ti" /> Watch the storm, hour by hour</button>
            <div className="chapter-credit">AI-generated illustration · not a photo of Glen Canyon</div>
          </div>
        )}

        {phase === 'stormResult' && (
          <StormCard d={d} r={r} base={base} peakCall={peakCall} experiment={experiment} onExperiment={runExperiment} onContinue={continueAfterStorm} canRevise={canRedo(cs, 2)} onRevise={() => { setExperiment(null); revise(); setTab('site'); }}
            answered={answered} onRespond={onRespond} swap={() => { grant(['storm-swapper']); return swapStorm(ctx, { id: 'SFO', rainMm: d.storms.SFO.rainMm, startLocal: d.storms.SFO.startLocal }, r.stormPrep); }} />
        )}

        {phase === 'ending' && !proposalOpen && !hideEnding && <EndingCard d={d} cs={cs} r={r} base={base} fresh={endingNew} harder={tier !== 'tight' ? (A.budgetTiers.value as Record<string, number>).tight : null} onHarder={() => { setTier('tight'); restart(); }} onAgain={restart} onLevels={() => setScreen('levels')} onProposal={() => setProposalOpen(true)} onHide={() => setHideEnding(true)} science={settings.science} ask={(id) => askJuno(id, ctx, cs.autumns, r)} />}
        {phase === 'ending' && hideEnding && <button className="btn primary back-ending" onClick={() => setHideEnding(false)}>Back to the ending</button>}
        {phase === 'ending' && proposalOpen && <Proposal cs={cs} r={r} base={base} weather={{ wy2021Mm: d.weather.waterYears[0].rainMm, nyeDowntownMm: d.storms.downtownDaily20221231Mm, oakTotalMm: d.storms.OAK.totalMm, oakMaxHourMm: d.storms.OAK.maxHourMm }} trailOpen={trailOpen} onBack={() => setProposalOpen(false)} onAgain={restart} />}

        {showCheck && phase === 'plan' && a.check && <SoilTest model={ctx.model} plan={slopePlanOf(cs.autumns)} year={y} awcCov={d.zones.awcCoverage} onClose={() => setShowCheck(false)} />}
        {openNpc && <QuestPopover id={openNpc} state={qStates[openNpc]} r={r} focus={cs.focus} onFocus={(id) => setCs((s) => setFocus(s, s.focus.includes(id) ? s.focus.filter((x) => x !== id) : [...s.focus, id].slice(-2)))} onClose={() => setOpenNpc(null)} />}
        {phase !== 'ending' && !proposalOpen && <LayersPanel lens={lensKind} onLens={view === 'slope' && (planning || phase === 'pause' || phase === 'play') ? setLensKind : undefined} />}
        {toast && <div className="toast">{toast}</div>}
        {reacts.length > 0 && <div className="reacts" aria-live="polite">{reacts.map((x) => (
          <div key={x.k} className={`react ${x.good ? 'good' : 'bad'}`} style={{ ['--c' as any]: NPCS[x.id].color }}>
            <Avatar id={x.id} size={36} mood={x.good ? 'happy' : 'worried'} />
            <div><b>{NPCS[x.id].name}</b> <span className="react-tag">simulated neighbour</span><div>“{x.text}”</div></div>
          </div>))}</div>}
        {(achToasts.length > 0 || questToasts.length > 0) && <div className="ach-toasts" aria-live="polite">
          {questToasts.map((id) => <div key={'q' + id} className="ach-toast quest"><Avatar id={id} size={34} mood="happy" /> <span><b>{NPCS[id].name}</b> · quest done!<br /><small>{NPCS[id].ask}</small></span></div>)}
          {achToasts.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id)!; const dc = DECOR.find((x) => x.from === id); return <div key={id} className={`ach-toast ${a.bad ? 'bad' : ''}`}>{a.bad ? '✖' : <Icon3d k="star" fallback="★" size={26} />} <span>Achievement · <b>{a.name}</b>{dc && <small className="ach-decor"><br />{dc.emoji} {dc.name} added to your island</small>}</span></div>; })}
        </div>}
      </div>
    </div>
  );
}

/** An evidence card the game writes for an “explain” answer: metric · your plan vs doing nothing · source tag. */
function evidenceFor(l: Line, r: ReturnType<typeof evaluate>, base: ReturnType<typeof evaluate>, trailOpen: ReturnType<typeof evaluate> | null): string {
  if (l.npc === 'leo' && trailOpen) return `East-slope erosion index in water year 2023 ×${(r.slope.years[2].grassland.erosion / trailOpen.slope.years[2].grassland.erosion).toFixed(2)} with the shortcut closed vs left open (same plantings) · model`;
  if (l.key.startsWith('maya-trees')) return `Grassland ${r.slope.ldn.grassland.area.delta >= 0 ? '+' : ''}${Math.round(r.slope.ldn.grassland.area.delta)} m² vs doing nothing by Sept 2023 · model`;
  if (l.key.startsWith('maya-dry')) { const c = r.slope.cohorts.find((x) => x.kind === 'grass' && !x.watered); return `Seedling survival ${Math.round((c?.survival ?? 0) * 100)}% unwatered (teaching survival rule) · model`; }
  return `Native grass established ${Math.round(r.slope.establishedNative)} m², doing nothing ${Math.round(base.slope.establishedNative)} m² · model`;
}

function IntroCard({ focus, onFocus, onStart, onLevels, tier, onTier }: { focus: NpcId[]; onFocus: (id: NpcId) => void; onStart: () => void; onLevels: () => void; tier: 'tight' | 'normal' | 'generous'; onTier: (t: 'tight' | 'normal' | 'generous') => void }) {
  const T = A.budgetTiers.value as Record<string, number>;
  return (
    <div className="modal-bg intro-bg"><div className="modal wide intro2">
      <div className="m-eyebrow">Autumn 2020 · Glen Canyon Park</div>
      <h2 className="m-head">Four neighbours. One budget. Three autumns.</h2>
      <p className="intro2-sub">Each neighbour asks for one thing. You can’t please everyone for free — pick one or two to help first (you can change your mind).</p>
      <div className="npc-cards">
        {(['maya', 'leo', 'coach', 'chen'] as NpcId[]).map((id) => (
          <button key={id} className={`npc-card2 ${focus.includes(id) ? 'on' : ''}`} onClick={() => onFocus(id)} aria-pressed={focus.includes(id)} style={{ ['--c' as any]: NPCS[id].color }}>
            <span className="npc-card2-face"><img src={faceArtFor(id)} alt="" draggable={false} /></span>
            <span className="npc-card2-txt">
              <b>{NPCS[id].name}</b><small>{NPCS[id].role}</small>
              <span className="npc-card2-ask">“{NPCS[id].ask}”</span>
              <span className="npc-card2-quest">{NPCS[id].quest}</span>
            </span>
            <span className="npc-card2-pin">{focus.includes(id) ? '✓ Helping first' : 'Help first'}</span>
          </button>
        ))}
      </div>
      <div className="ldn-strip2" aria-label="Land Degradation Neutrality: avoid, reduce, reverse">
        <b>The UN’s rule of thumb for land:</b>
        <span><i>1</i> Avoid new damage</span><span><i>2</i> Reduce it</span><span><i>3</i> Reverse it</span>
        <small>UNCCD Land Degradation Neutrality hierarchy · your cards carry these tags</small>
      </div>
      <div className="intro2-foot">
        <div className="tiers"><span>Budget</span>
          <div className="seg">{(['tight', 'normal', 'generous'] as const).map((t) => <button key={t} className={tier === t ? 'on' : ''} onClick={() => onTier(t)}>{t} · {T[t]}</button>)}</div>
        </div>
        <span className="small-note">{tier === 'tight' ? 'Tight: no plan can do all four quests in the model.' : tier === 'generous' ? 'Generous: room for more than one route.' : 'Normal: all four quests are possible, with every token.'} All four neighbours are fictional.</span>
        <div className="actions"><button className="btn" onClick={onLevels}>Challenge levels</button><button className="btn primary" onClick={onStart}>Start autumn 2020 →</button></div>
      </div>
    </div></div>
  );
}

function PauseCard({ d, cs, y, r, base, ctxBare, ctxModel, answered, onRespond, tokensLeft, canRevise, onRevise, onNext, onSatellite, others, onOthers, only }: {
  d: GameData; cs: CampaignState; y: number; r: ReturnType<typeof evaluate>; base: ReturnType<typeof evaluate>; ctxBare: number; ctxModel: ReturnType<typeof makeCtx>['model']; answered: Record<string, string>;
  onRespond: (l: Line, c: 'adjust' | 'explain' | 'ignore') => void; tokensLeft: number; canRevise: boolean; onRevise: () => void; onNext: () => void; onSatellite: () => void;
  others: OtherRow[] | null; onOthers: () => void; only?: NpcId[];
}) {
  const wyRain = d.weather.waterYears[y].rainMm;
  const storms = stormDayIdx(d, d.weather.dates.indexOf(`${2020 + y}-10-01`), d.weather.dates.indexOf(`${2021 + y}-09-30`)).map((i) => `${fmtDay(d.weather.dates[i])} (${d.weather.precipMm[i]} mm)`);
  const cs0 = r.slope.cohorts.filter((c) => c.year === y);
  const shade = r.shade.filter((c) => c.year === y);
  const pred = cs.predictions.find((p) => p.year === y && p.key !== 'storm');
  const lines = [...pauseLines(y, cs.autumns, r), ...allyLines(y, r)].slice(0, 1);
  const hints = slopeHints(y, cs.autumns, r, ctxBare);
  const main = cs0.find((c) => c.kind === 'grass') ?? cs0[0];
  const pct = main ? Math.round((main.survival ?? 0) * 100) : null;
  // the same planting watered from 1 October (the model's own contrast), for the lesson line
  const fromStartPct = main && main.kind === 'grass' && (!main.watered || main.waterFrom != null) ? Math.round(survival(ctxModel.col('seedGrass', y, true).severeDays[y]) * 100) : null;
  const treesOnSlope = cs.autumns.slice(0, y + 1).some((x) => (x.trees?.areaM2 ?? 0) > 0);
  const headline = main ? `${pct}% of your ${main.kind === 'grass' ? 'native grass' : 'slope trees'} survived the dry season.`
    : shade.length ? `${shade[0].alive} of ${shade[0].planted} shade trees made it through their first year.` : 'Nothing new went in this autumn. The canyon changed with the weather anyway.';
  const lesson = treesOnSlope ? { line: 'Restoration isn’t more trees.', sub: 'Trees make it greener — and the grassland smaller.' }
    : main && main.kind === 'grass' && !main.watered && (main.survival ?? 1) < A.longDrySurvival.value ? { line: 'Planting isn’t surviving.', sub: `Unwatered seedlings met a ${wyRain} mm water year.${fromStartPct != null ? ` Watered from 1 October, about ${fromStartPct}% would have made it (model).` : ''}` }
    : main && main.kind === 'grass' && main.waterFrom != null ? { line: 'Timing is water.', sub: `Watering started on ${fmtDay(d.weather.dates[main.waterFrom])}: ${pct}% made it through a ${wyRain} mm water year${fromStartPct != null ? ` — about ${fromStartPct}% if watered from 1 October (model)` : ''}.` }
    : main && main.kind === 'grass' && main.watered && (main.survival ?? 0) >= 0.7 ? { line: 'Water through the first summer.', sub: `Watered seedlings got through a ${wyRain} mm water year.` } : null;
  const q = autumnQuestion(cs.autumns, y); const lab = (id: string | null) => q?.choices.find((c) => c.id === id)?.label ?? id ?? '—';
  // a photo for the moment (AI-generated illustrations, labelled): what this kind of result looks like on a hillside
  const banner = lesson?.line.startsWith('Planting') ? 'ev-dry.webp' : lesson?.line.startsWith('Water') || lesson?.line.startsWith('Timing') ? 'ev-water.webp' : lesson?.line.startsWith('Restoration') ? null : y === 0 ? 'ch-dry.webp' : 'ch-storm.webp';
  // the year's verdict in one look: a ring of sprouts that made it, one line of lesson, the same year with other choices
  const tone = pct == null ? 'mid' : pct >= 60 ? 'good' : pct < 30 ? 'bad' : 'mid';
  return (
    <Moment>
      {banner && <div className="m-banner"><img src={artUrl(banner)} alt="" draggable={false} /><span>AI-generated illustration</span></div>}
      <div className="m-eyebrow">30 September {2021 + y} · Year {y + 1} of 3 · {wyRain} mm of rain <span className="tag obs">observed</span></div>
      <div className={`m-verdict ${tone}`}>
        {pct != null && <SproutRing pct={pct} tone={tone} />}
        <h2 className="m-head">{headline}</h2>
      </div>
      {(cs.autumns.slice(0, y + 1).some((x) => (x.replantSlope?.areaM2 ?? 0) > 0)) && <MeadowLevel m2={meadowAlive(r, y)} before={y > 0 ? meadowAlive(r, y - 1) : 0} />}
      {lesson && <div className="m-lesson"><b>{lesson.line}</b><span>{lesson.sub}</span></div>}
      {others && others.length > 1 && (() => {
        const mx = Math.max(1, ...others.map((o) => o.nativeM2));
        return (
          <div className="m-compare" onMouseEnter={onOthers} onTouchStart={onOthers}>
            <div className="m-compare-title">Same weather, other choices <span>native grass by 2023</span> <span className="tag model">model</span></div>
            {others.map((o) => (
              <div key={o.label} className={`m-bar ${o.mine ? 'mine' : ''}`}>
                <span className="m-bar-l">{o.mine ? 'Your plan' : o.label}</span>
                <span className="m-bar-t"><i style={{ width: `${Math.max(1.5, (o.nativeM2 / mx) * 100)}%` }} /></span>
                <b>{o.native}</b>
              </div>
            ))}
          </div>
        );
      })()}
      <NeighbourRow r={r} title="Your neighbours so far" only={only} />
      {pred && <div className={`m-guess ${pred.answer ? (pred.correct ? 'right' : 'wrong') : ''}`}>{pred.answer ? (pred.correct ? '★ You called it!' : 'Surprise!') : 'Guess skipped'} · you said <b>{pred.answer ? lab(pred.answer) : '—'}</b>, the model says <b>{lab(pred.truth)}</b></div>}
      <Voices lines={lines} answered={answered} onRespond={onRespond} tokensLeft={tokensLeft} />
      {hints[0] && <div className="m-juno"><Avatar id="juno" size={30} mood="happy" /><span>{hints[0].text}</span></div>}
      <details className="m-more">
        <summary>Dig deeper · the numbers behind this</summary>
        <p>Water year {2021 + y}: <b>{wyRain} mm</b> of rain downtown — {rainRankNote(d, y)}. <span className="tag obs">observed</span> {storms.length ? <>Storm days (≥ {A.stormDayMm.value} mm): {storms.join(', ')}.</> : 'No storm day this year.'}</p>
        <p>Native grass by Sept 2023 if you add nothing more: <b>{Math.round(r.slope.establishedNative).toLocaleString('en-US')} m²</b> (doing nothing: {Math.round(base.slope.establishedNative).toLocaleString('en-US')} m²). <span className="tag model">model</span></p>
        {cs0.map((c, k) => <div key={k} className="closeby"><b>{Math.round((c.survival ?? 0) * 100)}% survived</b> — {Math.round(c.areaM2)} m² of {c.kind === 'grass' ? 'native grass' : 'young trees on the slope'} {c.watered ? `(watered: ${Math.round(c.irrigationM3 ?? 0)} m³)` : '(not watered)'}; {c.severeDays} days of severe thirst. <span className="tag model">model</span></div>)}
        {shade.map((c, k) => <div key={'s' + k} className="closeby"><b>{c.alive} of {c.planted} shade trees</b> alive by the lawn ({Math.round(c.survival * 100)}% survival, watered: {Math.round(c.irrigationM3)} m³). <span className="tag model">model</span></div>)}
        {others && others.length > 0 && (
          <details className="real other-cards" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) onOthers(); }}>
            <summary>The other cards, same weather (Sept 2023 if nothing more is added)</summary>
            <table><thead><tr><th>Autumn 2020 card</th><th>Native grass established</th><th>Grassland check</th><th>Tokens</th></tr></thead>
              <tbody>{others.map((o) => <tr key={o.label} className={o.mine ? 'mine' : ''}><td>{o.label}{o.mine ? ' (yours)' : ''}</td><td>{o.native}</td><td>{o.check}</td><td>{o.tokens}</td></tr>)}</tbody></table>
            <div className="small-note">Each row is its own model run with the same 2020–2023 weather. <span className="tag model">model</span></div>
          </details>
        )}
        {y === 0 && d.slope?.ndvi && <details className="real" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) onSatellite(); }}><summary>What the satellite saw (Sentinel-2 greenness)</summary><NdviChart ndvi={d.slope.ndvi} mark="2021-09" /></details>}
      </details>
      <div className="actions">
        {canRevise && <button className="btn" onClick={onRevise}><RotateCcw className="ti" /> Try {2020 + y} again</button>}
        <button className="btn primary big" onClick={onNext}>Next: autumn {2021 + y} ▶</button>
      </div>
    </Moment>
  );
}

/** “Your meadow”: the new native grass you planted that is still alive after its first dry season (planted area ×
 *  the model's survival), for the cohorts settled up to a water year; levels are a game reward on that model number. */
const MEADOW_LV = [{ at: 0, name: 'Seedbed' }, { at: 200, name: 'Sprouting' }, { at: 600, name: 'Young meadow' }, { at: 1100, name: 'Meadow' }, { at: 1700, name: 'Lush meadow' }, { at: 2400, name: 'Wild meadow' }];
function meadowAlive(r: ReturnType<typeof evaluate>, upTo: number) {
  return r.slope.cohorts.filter((c) => c.kind === 'grass' && c.cls === 'grassland' && c.year <= upTo).reduce((t, c) => t + c.areaM2 * (c.survival ?? 0), 0);
}
function meadowLevel(m2: number) { let k = 0; for (let i = 0; i < MEADOW_LV.length; i++) if (m2 >= MEADOW_LV[i].at) k = i; return { lv: k + 1, name: MEADOW_LV[k].name, from: MEADOW_LV[k].at, next: MEADOW_LV[k + 1] ?? null }; }
function MeadowLevel({ m2, before }: { m2: number; before: number }) {
  const L = meadowLevel(m2), B = meadowLevel(before);
  const up = L.lv > B.lv;
  const frac = L.next ? (m2 - L.from) / (L.next.at - L.from) : 1;
  useEffect(() => { if (up) sfx.play('success'); }, [up]);
  return (
    <div className={`meadow-lv ${up ? 'up' : ''}`}>
      {up && <Confetti />}
      <span className="mlv-badge"><small>Lv</small>{L.lv}</span>
      <div className="mlv-txt">
        <b>Your meadow · {L.name}{up && <em className="mlv-up">LEVEL UP!</em>}</b>
        <div className="mlv-bar"><i style={{ width: `${Math.round(Math.max(0.03, Math.min(1, frac)) * 100)}%` }} /></div>
        <small>{Math.round(m2).toLocaleString('en-US')} m² of your new native grass alive <span className="tag model">model</span>{L.next ? ` · next level at ${L.next.at.toLocaleString('en-US')} m² (game level)` : ' · top level'}</small>
      </div>
    </div>
  );
}

/** Ten sprouts in a ring: how many of every ten new seedlings made it (the model's survival, rounded). */
function SproutRing({ pct, tone }: { pct: number; tone: string }) {
  const n = Math.round(pct / 10);
  return (
    <div className={`sprout-ring ${tone}`} aria-label={`${pct}% survived`}>
      {Array.from({ length: 10 }, (_, k) => { const th = (k / 10) * Math.PI * 2 - Math.PI / 2; return <i key={k} className={k < n ? 'alive' : 'dead'} style={{ left: `${50 + Math.cos(th) * 40}%`, top: `${50 + Math.sin(th) * 40}%`, animationDelay: `${k * 0.06}s` }}>{k < n ? '🌱' : '·'}</i>; })}
      <b><CountUp to={pct} suffix="%" /></b>
    </div>
  );
}

/** The big date while a year replays: month and year, the day's real rain, and how wet the grass's soil is (model). */
interface LiveRow { label: string; n: number; s: number; planted?: number; watered: boolean; thirsty: boolean }
function ReplayTicker({ iso, rain, storm, wet, live, onWater }: { iso: string; rain: number; storm: boolean; wet: number; live: LiveRow[]; onWater?: () => void }) {
  const science = useGame((st) => st.settings.science);
  if (!iso) return null;
  const [yy, mm, dd] = iso.split('-').map(Number);
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mm - 1];
  const season = mm >= 12 || mm <= 2 ? 'Winter rains' : mm <= 4 ? 'Spring' : mm <= 9 ? 'Dry season' : 'Autumn';
  const [lo, hi] = A.guessSurvivalBins.value as number[];
  return (
    <div className={`ticker ${storm ? 'storm' : ''}`} aria-live="off">
      <div className="ticker-season">{season}</div>
      <div className="ticker-date">{M} <span>{yy}</span></div>
      <div className="ticker-sub"><b>{dd}</b> · {rain >= 0.5 ? <>🌧 {rain.toFixed(1)} mm</> : 'dry day'} · soil {wet > 0.66 ? 'wet' : wet > 0.33 ? 'drying' : 'dry'}</div>
      <div className="ticker-bar" title="soil wetness (model)"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, wet)) * 100)}%` }} /></div>
      {science && <div className="ticker-legend"><span><i className="sw dry" />dry grass</span><span><i className="sw wet" />wet grass</span><span><i className="sw bed" />new beds</span><span><i className="sw bare" />bare soil</span></div>}
      {live.length > 0 && (
        <div className="ticker-live">
          {live.map((l) => {
            const tone = l.s >= hi ? 'good' : l.s >= lo ? 'mid' : 'bad';
            return (
              <div key={l.label} className={`tl-row ${tone} ${l.thirsty ? 'thirsty' : ''}`}>
                <div className="tl-top"><span>{l.label === 'New native grass' ? 'Your seedlings' : l.label}{l.watered ? ' 💧' : ''}</span>
                  <b>{l.planted != null ? `${Math.floor(l.planted * l.s + 1e-9)} of ${l.planted}` : `${Math.round(l.s * 100)}%`}</b></div>
                <div className="tl-bar"><i style={{ width: `${Math.round(l.s * 100)}%` }} /></div>
                <div className="tl-sub">{l.thirsty ? <b className="thirst">thirsty today!</b> : null} {l.n} thirsty day{l.n === 1 ? '' : 's'} <span className="tag model">model</span></div>
                {onWater && !l.watered && l.planted == null && l.label === 'New native grass' && <button className="tl-water" onClick={onWater}>💧 Start watering</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The storm as it plays: the clock, this hour's rain (observed) and the biggest hour into the drain so far (model),
 *  against Ms. Chen's line and against doing nothing — the number that decides her quest, filling up hour by hour. */
function StormTicker({ date, clock, rainNow, now, mine, none, line, max, garden, tank, night, called, onCall }: { date: string; clock: string; rainNow: number; now: number; mine: number; none: number; line: number; max: number; garden: number | null; tank: number | null; night: number; called: string | null; onCall?: () => void }) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const over = mine > line + 1e-9;
  return (
    <div className="ticker storm-t" aria-live="off">
      <div className="ticker-season">{date} · {night > 0.5 ? 'night' : 'daylight'}</div>
      <div className="ticker-date">{clock}</div>
      <div className="ticker-sub">rain this hour <b>{rainNow.toFixed(1)} mm</b> <span className="tag obs">observed</span> · into the drain <b>{now.toFixed(1)} m³</b> <span className="tag model">model</span></div>
      <div className={`st-gauge ${over ? 'over' : ''}`}>
        <div className="st-top"><span>Biggest hour so far</span><b>{mine.toFixed(1)} m³</b></div>
        <div className="st-bar"><i className="fill" style={{ width: pos(mine) }} /><i className="ghost" style={{ left: pos(none) }} title="doing nothing" /><i className="line" style={{ left: pos(line) }} /></div>
        <div className="st-keys"><span><i className="k-line" />Ms. Chen’s line {line}</span><span><i className="k-ghost" />doing nothing {none.toFixed(1)}</span></div>
      </div>
      <div className="ticker-legend"><span><i className="sw now" />water reaching the drain now</span><span><i className="sw later" />held, let out later</span></div>
      {(garden != null || tank != null) && <div className="st-fac">
        {garden != null && <span>Rain garden <b>{Math.round(Math.min(1, garden) * 100)}%</b> full</span>}
        {tank != null && <span>Roof tank <b>{Math.round(Math.min(1, tank) * 100)}%</b> full</span>}
      </div>}
      {called ? <div className="st-called">You called <b>{called}</b> — find out after the storm</div>
        : onCall && <button className="st-call" onClick={onCall}>This is the peak! <span>call the storm’s biggest hour</span></button>}
    </div>
  );
}

/** The four neighbours with how their quests stand on the plan so far (Sept 2023 if you add nothing more). */
function NeighbourRow({ r, title, only }: { r: ReturnType<typeof evaluate>; title: string; /** only the neighbours met so far */ only?: NpcId[] }) {
  return (
    <div className="n-row">
      <div className="n-row-t">{title} <span className="tag model">model</span><span className="n-legend">✓ on track · ½ part way · · not yet</span></div>
      <div className="n-row-faces">
        {(['maya', 'leo', 'coach', 'chen'] as NpcId[]).filter((id) => !only || only.includes(id)).map((id) => {
          const ok = r.quests[id], parts = questParts(id, r), part = !ok && parts.some((p) => p.ok);
          const need = parts.filter((p) => !p.ok).map((p) => p.need).join(' and ');
          return (
            <div key={id} className={`n-face ${ok ? 'ok' : part ? 'part' : 'no'}`} title={ok ? 'on track' : `still needs ${need}`}>
              <img src={faceArt(id, ok || part ? 'happy' : 'worried')} alt="" draggable={false} /><i>{ok ? '✓' : part ? '½' : '·'}</i>
              <span>{NPCS[id].name.replace('Coach ', '').replace('Ms. ', '')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The parts of each neighbour's quest (same rules as the quests), for “does its part, still needs …”. */
function questParts(id: NpcId, x: ReturnType<typeof evaluate>): { ok: boolean; need: string }[] {
  if (id === 'maya') return [{ ok: x.slope.establishedNative >= A.questMayaNative.value, need: `${A.questMayaNative.value.toLocaleString('en-US')} m² of native grass` }, { ok: x.slope.ldn.grassland.status !== 'net_loss', need: 'no net loss of grassland' }];
  if (id === 'leo') return [{ ok: x.shadeAlive >= A.questLeoTrees.value, need: `${A.questLeoTrees.value} shade trees alive` }, { ok: x.trail !== 'closed', need: 'a way down the slope' }];
  if (id === 'coach') return [{ ok: (x.tankMay1 ?? 0) >= A.questCoachTankM3.value, need: `${A.questCoachTankM3.value} m³ in the tank on 1 May` }];
  return [{ ok: x.storm.peakM3 <= A.questChenPeak.value, need: `the biggest hour under ${A.questChenPeak.value} m³` }];
}

/** Choices as tiles: a label, the cost, and the neighbours this option would help or not by Sept 2023 (a model run of
 *  the plan with that option, if you add nothing more) — so a player can see what a choice does before making it. */
interface OptDef { key: string; label: ReactNode; cost?: ReactNode; on: boolean; onPick: () => void; r?: ReturnType<typeof evaluate>; disabled?: boolean }
function Opts({ opts, cur, who, metric, need }: { opts: OptDef[]; cur: ReturnType<typeof evaluate>; who: NpcId[]; /** the number this choice moves, from the same model run */ metric?: (r: ReturnType<typeof evaluate>) => { label: string; v: string; good?: boolean | null };
  /** what the neighbours need (their quest lines) — shown instead of a verdict, so the year itself tells you */ need?: ReactNode }) {
  const verdict = !need;
  return (
    <>
    {need && <div className="opts-need">{who.map((id) => <img key={id} src={faceArt(id, 'happy')} alt="" draggable={false} />)}<span>{need}</span></div>}
    <div className="opts" role="radiogroup">
      {opts.map((o) => (
        <button key={o.key} className={`opt ${o.on ? 'on' : ''}`} onClick={() => { sfx.play('click'); o.onPick(); }} disabled={o.disabled} role="radio" aria-checked={o.on}>
          <span className="opt-l">{o.label}</span>
          {o.cost != null && <span className="opt-c">{o.cost}</span>}
          {o.r && metric && (() => { const m = metric(o.r); return <span className={`opt-m ${m.good === true ? 'good' : m.good === false ? 'bad' : ''}`}>{m.label} <b>{m.v}</b></span>; })()}
          {o.r && verdict && (
            <span className="opt-who" aria-label="Who this helps by Sept 2023 (model)">
              {who.map((id) => {
                const ok = o.r!.quests[id], was = cur.quests[id];
                const parts = questParts(id, o.r!), part = !ok && parts.some((p) => p.ok);
                const need = parts.filter((p) => !p.ok).map((p) => p.need).join(' and ');
                return <span key={id} className={`ow ${ok ? 'ok' : part ? 'part' : 'no'} ${ok !== was ? 'chg' : ''}`} title={`${NPCS[id].name}: ${ok ? 'on track with this option' : part ? `this option does its part — still needs ${need}` : `not on track — needs ${need}`}`}>
                  <img src={faceArt(id, ok || part ? 'happy' : 'worried')} alt="" draggable={false} /><i>{ok ? '✓' : part ? '½' : '✕'}</i>
                </span>;
              })}
            </span>
          )}
        </button>
      ))}
    </div>
    </>
  );
}

/** Choice tiles for a tool: a label, the cost, and how the neighbours it touches feel about it (their stance — a fixed
 *  part of each fictional character, never a forecast; the year itself shows what happens). */
/** The soil test (Check First): a field pit shows the model's biggest unknown here — how much water the soil holds —
 *  as three soil jars; each runs the model on the same plan with that soil (the range is the assumptions' own). */
function SoilTest({ model, plan, year, awcCov, onClose }: { model: ReturnType<typeof makeCtx>['model']; plan: ReturnType<typeof slopePlanOf>; year: number; awcCov?: { components: number; withoutAwc: number }; onClose: () => void }) {
  const [lo, hi] = A.awcMissing.range ?? [A.awcMissing.value, A.awcMissing.value];
  const rows = useMemo(() => [lo, A.awcMissing.value, hi].map((awc) => {
    const m2 = new SlopeModel(model.w, model.d, awc); const rr = runSlope(m2, plan);
    return { awc, dry: survival(m2.col('seedGrass', year, false).severeDays[year]), wet: survival(m2.col('seedGrass', year, true).severeDays[year]), water: rr.water[year] };
  }), [model, plan, year, lo, hi]);
  const names = ['Holds little water', 'The model’s guess', 'Holds a lot'];
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal soil-test" onClick={(e) => e.stopPropagation()}>
      <div className="m-eyebrow">Soil test · east slope 🔍</div>
      <h2>The soil’s big unknown: how much water it holds</h2>
      <div className="jars">
        {rows.map((r2, k) => (
          <div key={r2.awc} className={`jar ${k === 1 ? 'mid' : ''}`}>
            <div className="jar-glass"><i style={{ height: `${Math.round((r2.awc / hi) * 100)}%` }} /></div>
            <b>{names[k]}</b><small>{r2.awc} mm per metre</small>
            <div className="jar-bar"><span>not watered</span><em><i style={{ width: `${Math.round(r2.dry * 100)}%` }} /></em><b>{Math.round(r2.dry * 100)}%</b></div>
            <div className="jar-bar wet"><span>watered</span><em><i style={{ width: `${Math.round(r2.wet * 100)}%` }} /></em><b>{Math.round(r2.wet * 100)}%</b></div>
          </div>
        ))}
      </div>
      <p className="small-note">Seedling survival in {2021 + year} with each soil, same plan <span className="tag model">model</span> · the soil survey has no full-depth value for {awcCov ? `${awcCov.withoutAwc} of ${awcCov.components}` : 'most'} soil parts here. Your plan now measures it before planting at scale.</p>
      <div className="actions"><button className="btn primary" onClick={onClose}>Got it</button></div>
    </div></div>
  );
}

/** Small faces: how the neighbours feel about an option (their stance, not a forecast). */
function Feel({ f }: { f: [NpcId, 'happy' | 'worried'][] }) {
  return <>{f.map(([id, m]) => <img key={id} className={`pf ${m}`} src={faceArt(id, m)} alt={`${NPCS[id].name} ${m === 'happy' ? 'pleased' : 'worried'}`} draggable={false} />)}</>;
}
interface ChoiceDef { key: string; label: ReactNode; cost?: ReactNode; on: boolean; onPick: () => void; feel?: [NpcId, 'happy' | 'worried'][] }
function Choices({ opts, hint }: { opts: ChoiceDef[]; hint?: ReactNode }) {
  return (
    <div className="choices2">
      {hint && <div className="c2-hint">{hint}</div>}
      <div className="c2-row" role="radiogroup">
        {opts.map((o) => (
          <button key={o.key} className={`c2 ${o.on ? 'on' : ''}`} role="radio" aria-checked={o.on} onClick={() => { sfx.play('click'); o.onPick(); }}>
            <span className="c2-l">{o.label}</span>
            {o.cost != null && <span className="c2-c">{o.cost}</span>}
            {o.feel && o.feel.length > 0 && <span className="c2-f">{o.feel.map(([id, m]) => <img key={id} className={m} src={faceArt(id, m)} alt={`${NPCS[id].name}: ${m === 'happy' ? 'pleased' : 'worried'}`} title={`${NPCS[id].name}: ${m === 'happy' ? 'pleased' : 'worried'}`} draggable={false} />)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A survival outlook in words (the guess bins), so a choice shows its odds without printing the answer. */
function binWords(v: number) {
  const [lo, hi] = A.guessSurvivalBins.value as number[];
  return v >= hi ? 'most should make it' : v >= lo ? 'maybe half make it' : 'very few make it';
}

/** Where you are in the season: three autumns, the storm, the end. */
function SeasonDots({ step }: { step: number }) {
  const names = ['Autumn 2020', 'Autumn 2021', 'Autumn 2022', 'The storm'];
  const short = ['2020', '2021', '2022', '⛈️'];
  return <div className="s-track" aria-label={step >= 0 ? `${names[Math.min(3, step)] ?? 'The end'} · the storm comes after three autumns` : 'Season not started'}>{short.map((n, k) => <i key={n} className={k < step ? 'done' : k === step ? 'now' : ''} title={names[k]}>{n}</i>)}</div>;
}

/** A result moment: a side sheet (bottom sheet on phones) so the island stays in view behind it. */
function Moment({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className="moment-wrap"><div className={`moment ${wide ? 'wide' : ''}`}>{children}</div></div>;
}
function Stat({ v, k, tag, tone }: { v: ReactNode; k: ReactNode; tag?: 'model' | 'observed'; tone?: 'good' | 'bad' | 'mid' }) {
  return <div className={`m-stat ${tone ?? ''}`}><div className="m-v">{v}</div><div className="m-k">{k} {tag && <span className={`tag ${tag === 'observed' ? 'obs' : 'model'}`}>{tag}</span>}</div></div>;
}
/** Counts up to a number from the model (display only; instant with Reduce motion). */
function CountUp({ to, suffix = '', digits = 0 }: { to: number; suffix?: string; digits?: number }) {
  const reduce = useGame((s) => s.settings.reduceMotion);
  const [v, setV] = useState(reduce || FAST || SHOT ? to : 0);
  useEffect(() => {
    if (reduce || FAST || SHOT) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 600); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <>{v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}{suffix}</>;
}

function StormCard({ d, r, base, peakCall, experiment, onExperiment, onContinue, canRevise, onRevise, answered, onRespond, swap }: { d: GameData; r: ReturnType<typeof evaluate>; base: ReturnType<typeof evaluate>; peakCall: number | null; experiment: StormResult | null; onExperiment: () => void; onContinue: () => void; canRevise: boolean; onRevise: () => void;
  answered: Record<string, string>; onRespond: (l: Line, c: 'adjust' | 'explain' | 'ignore') => void; swap: () => ReturnType<typeof swapStorm> }) {
  const [sw, setSw] = useState<ReturnType<typeof swapStorm> | null>(null);
  const start = d.storms.OAK.startLocal;
  const plan = { gardens: r.stormPrep?.gardens ?? [], tank: r.stormPrep?.tank ? { size: r.stormPrep.tank.size, release: 'closed' as const } : null, disconnect: false as const, paving: false };
  const diags = useMemo(() => (r.stormPrep ? diagnose(2, d, r.storm, base.storm, plan, LEVEL2, { scan: spotScan(d.site, d.storms.OAK.rainMm, base.storm, undefined), tankFullSince: tankHistory(d.site, d.weather, '2022-12-31') }) : []), [r, base, d]);
  const lines = stormLines(r).slice(0, 1);
  const peakH = r.storm.peakHour;
  const g = r.stormPrep?.gardens[0];
  const smaller = useMemo(() => {
    if (!g || g.size === 'S') return null;
    const alt = g.size === 'L' ? 'M' : 'S';
    const ar = runAlt(d, base, { ...plan, gardens: [{ cand: g.cand, size: alt }] });
    if (ar.peakM3 > r.storm.peakM3 + 1e-9) return null;
    const f = r.storm.facilities.find((x) => x.kind === 'garden'), fa = ar.facilities.find((x) => x.kind === 'garden');
    return { alt, peak: ar.peakM3, ud: f?.delayed[peakH] ?? 0, udAlt: fa?.delayed[ar.peakHour] ?? 0 };
  }, [g, r, d, base]);
  const tank = experiment?.facilities.find((f) => f.kind === 'tank');
  const line = A.questChenPeak.value;
  const max = Math.max(base.storm.peakM3, r.storm.peakM3, line) * 1.12;
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const fullEarly = r.storm.facilities.find((f) => f.kind === 'garden' && f.fullAt != null && f.fullAt < peakH);
  const later = r.storm.delayedTotal;
  return (
    <Moment>
      <div className="m-banner"><img src={artUrl('ch-nye.webp')} alt="" draggable={false} /><span>AI-generated illustration</span></div>
      <div className="m-eyebrow">31 December 2022 · biggest hour {fmtClock(start, peakH)}–{fmtClock(start, peakH + 1)}</div>
      <h2 className="m-head">{r.quests.chen ? 'Under the line' : 'The peak got through'} <span className="m-margin">by {Math.abs(A.questChenPeak.value - r.storm.peakM3).toFixed(1)} m³</span></h2>
      {peakCall != null && (() => { const ok = Math.abs(peakCall - (peakH + 0.5)) <= 1; return (
        <div className={`m-guess ${ok ? 'right' : 'wrong'}`}>{ok ? '★ Storm reader!' : 'Close call'} · you called <b>{fmtClock(start, peakCall)}</b>; the biggest hour into the drain was <b>{fmtClock(start, peakH)}–{fmtClock(start, peakH + 1)}</b> <span className="tag model">model</span></div>
      ); })()}
      <div className="m-gauge" aria-label="Biggest hour into the drain">
        <div className="m-gauge-top"><span>Biggest hour into the drain</span><b><CountUp to={r.storm.peakM3} digits={1} suffix=" m³" /></b><span className="tag model">model</span></div>
        <div className="m-gauge-bar">
          <span className={`m-gauge-fill ${r.quests.chen ? 'good' : 'bad'}`} style={{ width: pos(r.storm.peakM3) }} />
          <i className="m-mark line" style={{ left: pos(line) }}><em>Ms. Chen’s line {line}</em></i>
          <i className="m-mark base" style={{ left: pos(base.storm.peakM3) }}><em>doing nothing {base.storm.peakM3.toFixed(1)}</em></i>
        </div>
      </div>
      <NeighbourRow r={r} title="Your neighbours now" />
      {later > 0.5 ? <div className="m-lesson"><b>Later isn’t less.</b><span>{later.toFixed(1)} m³ waited in the garden, then reached the drain anyway.</span></div>
        : fullEarly ? <div className="m-lesson"><b>Full before the peak.</b><span>The garden filled at {fmtClock(start, fullEarly.fullAt ?? 0)}, before the biggest hour.</span></div> : null}
      <Voices lines={lines} answered={answered} onRespond={onRespond} tokensLeft={0} />
      <div className="m-try">
        <div className="m-try-title">Try it another way</div>
        {!sw && <button className="btn" onClick={() => setSw(swap())}>Same plan, another real storm (4 Jan 2023)</button>}
        {sw && <div className="hintbox"><b>4 Jan 2023 storm</b> (SFO airport hourly, {d.storms.SFO.totalMm} mm, biggest hour {d.storms.SFO.maxHourMm} mm <span className="tag obs">observed</span>): your plan sends <b>{sw.mine.peakM3.toFixed(1)} m³</b> in its biggest hour, doing nothing {sw.nothing.peakM3.toFixed(1)} m³. In this shorter storm the best single garden is the {sw.best.k} ({sw.best.v.toFixed(1)} m³) — a garden that fills before the peak of a long storm can still catch a short one. <span className="tag model">model</span></div>}
        {!experiment && <button className="btn" onClick={onExperiment}>What if the tank had been empty first?</button>}
        {experiment && tank && <div className="hintbox"><b>Tank emptied before the rain</b> (release 1 m³/h): it filled again at {fmtClock(start, tank.fullAt ?? 0)} — {Math.max(0, experiment.peakHour - (tank.fullAt ?? 0)).toFixed(1)} h before the biggest hour. Biggest hour: <b>{experiment.peakM3.toFixed(1)} m³</b> (kept full: {r.storm.peakM3.toFixed(1)} m³). In that hour the roof sent {tank.inflow[experiment.peakHour].toFixed(1)} m³ into a {tank.capM3} m³ tank{tank.inflow[experiment.peakHour] > tank.capM3 ? ' — more than the whole tank holds' : ''}. <span className="tag model">model</span></div>}
      </div>
      {(diags.length > 0 || smaller) && (
        <details className="m-more">
          <summary>Dig deeper · why it came out this way</summary>
          {diags.slice(0, 2).map((x, k) => <div key={k} className="hintbox">{x.text}</div>)}
          {smaller && <div className="closeby">A {smaller.alt === 'M' ? 'medium' : 'small'} garden at {g!.cand} would have done as well or better for less: {smaller.peak.toFixed(1)} m³ in the biggest hour. Your larger garden’s underdrain pipe let out {smaller.ud.toFixed(2)} m³ in that hour, the smaller one {smaller.udAlt.toFixed(2)} m³. <span className="tag model">model</span></div>}
          <p className="small-note">Only water on the ground inside the park and at the Rec Center is modelled — not the sewer pipes downstream. Rain: NOAA Oakland airport, hour by hour.</p>
        </details>
      )}
      <div className="actions">
        {canRevise && <button className="btn" onClick={onRevise}><RotateCcw className="ti" /> Revise 2022 (once)</button>}
        <button className="btn primary" onClick={onContinue}>Continue to 30 Sept 2023 →</button>
      </div>
    </Moment>
  );
}
const altCache = new Map<string, StormResult>();
function runAlt(d: GameData, base: ReturnType<typeof evaluate>, plan: any): StormResult {
  const k = JSON.stringify(plan);
  if (!altCache.has(k)) altCache.set(k, runStorm(d.site, d.storms.OAK.rainMm, plan, { tankStart: tankStartFor(d.site, d.weather, d.storms.OAK.startLocal) }));
  void base;
  return altCache.get(k)!;
}

function EndingCard({ d, cs, r, base, fresh, harder, onHarder, onAgain, onLevels, onProposal, onHide, science, ask }: { d: GameData; cs: CampaignState; r: ReturnType<typeof evaluate>; base: ReturnType<typeof evaluate>; fresh: boolean; harder: number | null; onHarder: () => void; onAgain: () => void; onLevels: () => void; onProposal: () => void; onHide: () => void; science?: boolean; ask: (id: (typeof PRESETS)[number]['id']) => Answer }) {
  const [ans, setAns] = useState<Answer | null>(null);
  const [ansId, setAnsId] = useState<string | null>(null);
  const [peek, setPeek] = useState<(typeof ENDING_IDS)[number] | null>(null);
  const e = ENDINGS[r.ending];
  const [s1, s2] = endingSentences(r, base);
  const miss = r.ending === 'tradeoffs' ? missing(r) : [];
  void d;
  // the collection (this browser only): endings found so far and the badges this season earned
  const [col, setCol] = useState(getCollection());
  useEffect(() => { const t = window.setTimeout(() => setCol(getCollection()), 60); return () => window.clearTimeout(t); }, [fresh]);
  const found = new Set([...col.endings, r.ending]);
  // the what-if buttons say the other choice from the one you made
  const w0 = cs.autumns[0].replantSlope;
  const whatIfLabel = (id: string, q: string) => id === 'water' && w0?.areaM2 ? (w0.water ? 'I hadn’t watered the 2020 seedlings' : w0.waterFrom != null ? 'I had watered them from the start' : 'I had watered the 2020 seedlings')
    : id === 'trail' && r.trail !== 'open' ? 'I had left the shortcut open' : q.replace(/^What if /, '').replace(/\?$/, '');
  const badges = cs.achievements.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a): a is (typeof ACHIEVEMENTS)[number] => !!a && achievementOn(a.id));
  return (
    <div className="ending-screen">{r.questCount >= 3 && <Confetti />}
      <div className="ending-photo">
        {/* the Neutral Ground picture has a roof tank in it: a plan without a tank gets the same scene without one */}
        <ArtOr className="ending-photo-img" src={endingPhoto(r.ending === 'neutral' && !r.stormPrep?.tank ? 'neutral-notank' : r.ending)} fallback={<ArtOr className="ending-photo-img" src={endingPhoto(r.ending)} fallback={<ArtOr className="ending-photo-img" src={endingArt(r.ending)} fallback={null} />} />} />
        <div className="ending-photo-shade" />
        <div className="ending-photo-txt">
          <div className="m-eyebrow light">Ending · 30 September 2023</div>
          <h1>{e.title}</h1>
          <p>{e.sub}</p>
        </div>
        <div className="ending-photo-credit">AI-generated illustration of this ending · not a photo of Glen Canyon</div>
      </div>
      <div className="ending-side">
        <div className="e-stars" aria-label="Your mission stars">{GOALS.map((g, k) => { const on = g.id === 'meadow' ? r.quests.maya : g.id === 'storm' ? r.quests.chen : r.questCount >= 3; return (
          <div key={g.id} className={`e-star ${on ? 'on' : ''}`} style={{ animationDelay: `${0.3 + k * 0.35}s` }}><span className="es-s" aria-hidden>★</span><span className="es-i" aria-hidden>{g.icon}</span><b>{g.title}</b><small>{on ? 'done' : 'not this time'}</small></div>
        ); })}</div>
        <div className="m-stats three">
          <Stat v={<>{r.questCount}<small> of 4</small></>} k="neighbours got what they asked for" tone={r.questCount >= 3 ? 'good' : r.questCount <= 1 ? 'bad' : 'mid'} />
          <Stat v={<CountUp to={Math.round(r.slope.establishedNative)} suffix=" m²" />} k={`native grass established on the east slope · doing nothing: ${Math.round(base.slope.establishedNative)} m²`} tag="model" tone={r.quests.maya ? 'good' : 'mid'} />
          <Stat v={<CountUp to={r.storm.peakM3} digits={1} suffix=" m³" />} k={`storm’s biggest hour into the drain · doing nothing: ${base.storm.peakM3.toFixed(1)} m³`} tag="model" tone={r.quests.chen ? 'good' : 'bad'} />
        </div>
        <p className="m-cost">{s2}</p>
        {miss.length > 0 && <p className="closeby">Not done: {miss.join('; ')}.</p>}
        <div className="ending-npcs">
          {(['maya', 'leo', 'coach', 'chen'] as NpcId[]).map((id) => (
            <div key={id} className={`ending-npc ${r.quests[id] ? 'done' : 'not'}`}>
              <Avatar id={id} size={44} mood={r.quests[id] ? 'happy' : 'worried'} />
              <div><b>{NPCS[id].name}</b> <span className="q-tick">{r.quests[id] ? '✓ done' : '✕ not done'}</span><div>“{endingLine(id, r)}”</div></div>
            </div>
          ))}
        </div>
        <div className="m-juno"><Avatar id="juno" size={30} mood="happy" /><span>{tryNext(r, cs.autumns, cs.focus)}</span></div>
        <div className="e-col">
          <div className="e-col-head"><b>Endings found · {found.size} of {ENDING_IDS.length}</b>{fresh && <span className="e-new">New ending!</span>}</div>
          <div className="e-col-row">
            {ENDING_IDS.map((id) => (
              <button key={id} className={`e-tile ${found.has(id) ? 'got' : 'not'} ${id === r.ending ? 'cur' : ''} ${peek === id ? 'peek' : ''}`} title={ENDINGS[id].title} onClick={() => setPeek(peek === id ? null : id)}>
                {found.has(id) ? <ArtOr className="e-tile-img" src={endingPhoto(id)} fallback={<span>◆</span>} /> : <span className="e-lock" aria-hidden>?</span>}
              </button>
            ))}
          </div>
          {peek && <div className="e-peek"><b>{ENDINGS[peek].title}</b>{found.has(peek) ? ' · found' : ' · not found yet'}<span>{found.has(peek) ? ENDINGS[peek].sub : `How to find it: ${ENDING_HINTS[peek]}`}</span></div>}
          {badges.length > 0 && <div className="e-badges">{badges.map((a) => <span key={a.id} className={`e-badge ${a.bad ? 'bad' : ''}`}>{a.bad ? '✖' : '★'} {a.name}</span>)}</div>}
          <div className="e-decor"><div className="e-col-head"><b>Your island · {DECOR.filter((x) => col.achievements.includes(x.from)).length} of {DECOR.length} decorations</b></div>
            <div className="e-decor-row">{DECOR.map((x) => { const got = col.achievements.includes(x.from); const a = ACHIEVEMENTS.find((q) => q.id === x.from); return (
              <span key={x.id} className={`e-dec ${got ? 'got' : 'not'}`} title={got ? `${x.name} — on your island (a decoration, not a model result)` : `Earn “${a?.name}”: ${a?.how}`}><i>{got ? x.emoji : '🔒'}</i><small>{got ? x.name : a?.name}</small></span>
            ); })}</div>
          </div>
          {(() => { const rk = rankOf({ ...col, endings: [...found] }, (id) => { const x = ACHIEVEMENTS.find((q) => q.id === id); return !!x && !x.bad && achievementOn(id); }); return (
            <div className="e-rank"><span>Your rank</span><b>{rk.name}</b>
              {rk.next ? <><span className="e-rank-bar"><i style={{ width: `${Math.round(((rk.pts - rk.from) / (rk.next.at - rk.from)) * 100)}%` }} /></span><small>{rk.next.at - rk.pts} more to {rk.next.name} · 3 per ending, 1 per star</small></> : <small>Top rank</small>}
            </div>
          ); })()}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={onProposal}>Make my proposal card →</button>
          <button className="btn" onClick={onAgain}><RotateCcw className="ti" /> Play again</button>
          {harder != null && r.questCount >= 3 && <button className="btn" onClick={onHarder}>Harder: {harder} tokens</button>}
          <button className="btn" onClick={onHide}>View the island</button>
        </div>
        <div className="e-whatif">
          <div className="e-whatif-head"><b>What if…?</b><span>each is a new model run of your season, same weather</span></div>
          <div className="e-whatif-row">{PRESETS.filter((p) => p.id !== 'tank' || !!r.stormPrep?.tank).map((p) => <button key={p.id} className={ansId === p.id ? 'on' : ''} onClick={() => { sfx.play('click'); setAnsId(p.id); setAns(ask(p.id)); }}>{whatIfLabel(p.id, p.q)}</button>)}</div>
          {ans && <div className="closeby"><b>{ans.title}</b><ul>{ans.lines.map((l, k) => <li key={k}>{l}</li>)}</ul><span className="tag model">model</span></div>}
        </div>
        <details className="m-more">
          <summary>Dig deeper · Neutral Ground check and canyon log</summary>
          <p>{s1}</p>
          <div className="ldn-pair"><LdnScale title="East-slope grassland" c={r.slope.ldn.grassland} /></div>
          <div className="ldn-disclaimer">A teaching check inspired by Land Degradation Neutrality (avoid &gt; reduce &gt; reverse) — water, erosion and matching area compared with doing nothing in water year 2023, within one kind of land. Not an official SDG 15.3.1 assessment.</div>
          <ul className="log">{cs.log.map((x, k) => <li key={k}><span className="log-date">{x.date}</span> {x.text}</li>)}</ul>
          {science && <p className="small-note">Drawing: established native grass is shown as taller tufts (a display choice). The island shows only states the model computes — no puddles, dust or animals.</p>}
          <div className="actions"><button className="btn small" onClick={onLevels}>Challenge levels</button><button className="btn small" onClick={() => download(endingImage(r, base), `neutral-ground-${r.ending}.png`)}>Save the ending card</button></div>
        </details>
        <div className="e-credits" aria-label="Credits">
          <div className="ec-thanks">Thanks for playing! 🌱</div>
          <div className="ec-game">Neutral Ground</div>
          <div className="ec-by">a game by <b>{CREDITS.team}</b></div>
          <div className="ec-names">{CREDITS.members.map((n) => <span key={n}>{n}</span>)}</div>
          <div className="ec-event">Made for {CREDITS.event} · {CREDITS.challenge}</div>
        </div>
        <div className="ending-foot">Prototype model · teaching assumptions · historical 2020–23 weather · fictional neighbours · not yet checked against the park.</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ “the other cards” (T17): the main 2020 cards, each its own model run in the same weather
export interface OtherRow { label: string; native: string; nativeM2: number; check: string; tokens: number; mine: boolean }
function otherCards(ctx: ReturnType<typeof makeCtx>, autumns: CampaignState['autumns'], mineR: ReturnType<typeof evaluate>): OtherRow[] {
  const area = autumns[0].replantSlope?.areaM2 || 1250;
  const cards: [string, CampaignState['autumns'][0]][] = [
    [`Replant ${area.toLocaleString('en-US')} m² + water`, { replantSlope: { areaM2: area, water: true } }],
    [`Replant ${area.toLocaleString('en-US')} m², no water`, { replantSlope: { areaM2: area, water: false } }],
    ['Trees on the slope 500 m²', { trees: { areaM2: 500 } }],
    ['Close the shortcut', { trail: 'close' }],
  ];
  const mineKey = JSON.stringify(autumns[0]);
  const rows = cards.map(([label, a]) => {
    const x = evaluate(ctx, [a, {}, {}], 0);
    return { label, native: `${Math.round(x.slope.establishedNative).toLocaleString('en-US')} m²`, nativeM2: x.slope.establishedNative, check: x.slope.ldn.grassland.status.replace('_', ' '), tokens: x.tokens.total, mine: JSON.stringify(a) === mineKey };
  });
  if (!rows.some((x) => x.mine)) { const me = evaluate(ctx, autumns, 0); rows.unshift({ label: describeAutumn(autumns[0]), native: `${Math.round(me.slope.establishedNative).toLocaleString('en-US')} m²`, nativeM2: me.slope.establishedNative, check: me.slope.ldn.grassland.status.replace('_', ' '), tokens: me.tokens.total, mine: true }); }
  void mineR;
  return rows.slice(0, 5);
}

/** A short burst of paper confetti for a season where most neighbours got what they asked for (UI only). */
function Confetti() {
  const reduce = typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === '1';
  if (reduce) return null;
  const cols = ['#ffd36b', '#5aa02c', '#e08a1e', '#2f7fd0', '#b0479a', '#16867a'];
  return <div className="confetti" aria-hidden>{Array.from({ length: 36 }, (_, k) => <i key={k} style={{ left: `${(k * 37) % 100}%`, background: cols[k % cols.length], animationDelay: `${(k % 9) * 0.12}s`, transform: `rotate(${k * 47}deg)` }} />)}</div>;
}
