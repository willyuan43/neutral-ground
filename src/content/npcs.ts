// Juno and the four neighbours (T4). All of them are fictional (“Simulated neighbor” in the UI). Their concerns echo kinds of
// disagreement on record for the park (lawn water, trails, natural-area restoration, storms) and speak for no real person or group.
// Every quest is a condition the model can compute; lines only react to model results and never invent numbers.
import { A } from '../model/assumptions';
import type { NpcId, CampaignResult, CampaignState, Autumns } from '../campaign/campaign';

export interface Npc { id: NpcId; name: string; role: string; ask: string; quest: string; ally: string; color: string; initials: string }
export const NPCS: Record<NpcId, Npc> = {
  maya: {
    id: 'maya', name: 'Maya', role: 'Nature-area volunteer, 22', color: '#5aa02c', initials: 'M',
    ask: 'Bring the native grass back on the east slope.',
    quest: `≥ ${A.questMayaNative.value.toLocaleString('en-US')} m² of native grass established on the east slope by 30 Sept 2023 — and no net loss of grassland`,
    ally: `No trees on the grassland and the shortcut closed or rerouted → her volunteers add ${A.allyMayaSweat.value} h of sweat each later year`,
  },
  leo: {
    id: 'leo', name: 'Leo', role: 'Day-camp counselor, 20', color: '#e08a1e', initials: 'L',
    ask: 'Shade by the lawn for my campers — and keep our way down the slope.',
    quest: `≥ ${A.questLeoTrees.value} shade trees alive by the lawn on 30 Sept 2023, and the way down the slope not cut (shortcut open or rerouted)`,
    ally: `Shade trees planted → camp families add ${A.allyLeoSweat.value} h of sweat each later year (help watering)`,
  },
  coach: {
    id: 'coach', name: 'Coach Rivera', role: 'Youth soccer coach', color: '#2f7fd0', initials: 'R',
    ask: 'Save roof water for the field when the dry season starts.',
    quest: `≥ ${A.questCoachTankM3.value} m³ in the roof tank on 1 May 2023, kept for watering the field`,
    ally: `Build the large tank → the team chips in ${A.allyCoachTokens.value} token on the spot`,
  },
  chen: {
    id: 'chen', name: 'Ms. Chen', role: 'Lives downhill from the Rec Center', color: '#b0479a', initials: 'C',
    ask: 'Less water rushing to the drain in the big storm.',
    quest: `Biggest hour into the drain ≤ ${A.questChenPeak.value} m³ in the New Year’s Eve 2022 storm`,
    ally: 'No resources — she only watches the result',
  },
};
export const JUNO = { name: 'Juno', role: 'Park intern, 19 — your guide' };

// ------------------------------------------------------------------ quest status rings
export type QuestState = 'open' | 'onTrack' | 'atRisk' | 'done' | 'failed';
export const QUEST_LABEL: Record<QuestState, string> = { open: 'In progress', onTrack: 'On track with this plan', atRisk: 'At risk', done: 'Done', failed: 'Not done' };

/** Has the player done anything that bears on this quest yet? (decides “in progress” vs “at risk”) */
function touched(id: NpcId, autumns: Autumns) {
  const any = (f: (a: Autumns[number]) => boolean) => autumns.some(f);
  if (id === 'maya') return any((a) => (a.replantSlope?.areaM2 ?? 0) > 0 || (a.trees?.areaM2 ?? 0) > 0 || !!a.trail);
  if (id === 'leo') return any((a) => (a.shadeTrees ?? 0) > 0 || !!a.trail);
  if (id === 'coach') return !!autumns[2].storm?.tank;
  return !!autumns[2].storm;
}

/**
 * Status of each quest. `proj` = the model run of the current plan with nothing more added (“on track” is a projection);
 * a quest shows done / not done only once its moment has passed: Ms. Chen after the storm, Coach on 1 May 2023, Maya and Leo at the end.
 */
export function questStates(s: CampaignState, proj: CampaignResult, moment: { stormDone: boolean; dayIso: string | null; ended: boolean }): Record<NpcId, QuestState> {
  const settled: Record<NpcId, boolean> = {
    maya: moment.ended, leo: moment.ended,
    coach: moment.ended || (s.ran >= 3 && !!moment.dayIso && moment.dayIso >= A.questCoachDate.value),
    chen: moment.ended || moment.stormDone,
  };
  const out = {} as Record<NpcId, QuestState>;
  for (const id of ['maya', 'leo', 'coach', 'chen'] as NpcId[]) {
    if (settled[id]) out[id] = proj.quests[id] ? 'done' : 'failed';
    else out[id] = proj.quests[id] ? 'onTrack' : touched(id, s.autumns) ? 'atRisk' : 'open';
  }
  return out;
}

// ------------------------------------------------------------------ what neighbours say (≤ 2 sentences, only after a decision that concerns them)
export interface Line { npc: NpcId; text: string; key: string; options?: { id: 'adjust' | 'explain' | 'ignore'; label: string; tokens?: number }[] }

/** Lines at the pause after water year y (decisions of autumn y have played out). Numbers come from the model result. */
export function pauseLines(y: number, autumns: Autumns, r: CampaignResult): Line[] {
  const out: Line[] = [];
  const a = autumns[y];
  const closedNow = autumns.slice(0, y + 1).some((x) => x.trail === 'close') && !autumns.slice(0, y + 1).some((x) => x.trail === 'reroute');
  if (closedNow && (a.trail === 'close') && y < 2) out.push({
    npc: 'leo', key: `leo-trail-${y}`,
    text: 'You closed our shortcut! Is there another route?',
    options: [{ id: 'adjust', label: 'Reroute it', tokens: A.rerouteExtraTokens.value }, { id: 'explain', label: 'Keep it closed — show Leo why' }, { id: 'ignore', label: 'Not now' }],
  });
  const talk = [{ id: 'explain' as const, label: 'Show the numbers' }, { id: 'ignore' as const, label: 'Not now' }];
  if (a.trail === 'reroute') out.push({ npc: 'leo', key: `leo-reroute-${y}`, text: 'A new way down, and the old line can heal. That works for my campers.', options: talk });
  if ((a.trees?.areaM2 ?? 0) > 0) out.push({
    npc: 'maya', key: `maya-trees-${y}`,
    text: `Trees on the grassland? On the model’s numbers the grassland comes out ${Math.round(Math.abs(r.slope.ldn.grassland.area.delta))} m² ${r.slope.ldn.grassland.area.delta < 0 ? 'smaller' : 'bigger'} than doing nothing by 2023.`,
    options: [{ id: 'explain', label: 'Explain the trees' }, { id: 'ignore', label: 'Not now' }],
  });
  const g = r.slope.cohorts.find((c) => c.year === y && c.cls === 'grassland' && c.kind === 'grass');
  if (g) {
    const pct = Math.round((g.survival ?? 0) * 100);
    if (!g.watered) out.push({ npc: 'maya', key: `maya-dry-${y}`, text: `Only ${pct}% of the seedlings made it through the dry months. Can we water the next ones?`, options: [{ id: 'explain', label: 'Explain the choice' }, { id: 'ignore', label: 'Not now' }] });
    else out.push({ npc: 'maya', key: `maya-ok-${y}`, text: `${pct}% of the watered seedlings made it. The slope is filling in.`, options: talk });
  }
  const sh = r.shade.find((c) => c.year === y);
  if (sh) out.push({ npc: 'leo', key: `leo-shade-${y}`, text: `${sh.alive} of ${sh.planted} shade trees made it through their first year. ${sh.alive >= A.questLeoTrees.value ? 'The kids will have shade.' : 'We hoped for at least ' + A.questLeoTrees.value + '.'}`, options: talk });
  return out.slice(0, 2);
}

/** Allies who start helping from the coming autumn (shown at the pause; values are teaching assumptions). */
export function allyLines(y: number, r: CampaignResult): Line[] {
  const out: Line[] = [];
  if (y + 1 <= 2 && r.allies.maya[y + 1] && !r.allies.maya[y]) out.push({ npc: 'maya', key: `ally-maya-${y}`, text: `Shortcut ${r.trail === 'rerouted' ? 'rerouted' : 'closed'} and no trees on the grass — my volunteers will give ${A.allyMayaSweat.value} more hours a year from now on.` });
  if (y + 1 <= 2 && r.allies.leo[y + 1] && !r.allies.leo[y]) out.push({ npc: 'leo', key: `ally-leo-${y}`, text: `Camp families will help water the trees: ${A.allyLeoSweat.value} more hours a year.` });
  return out;
}

/** Ms. Chen and Coach after the storm (numbers from the hourly run and the daily tank rule). */
export function stormLines(r: CampaignResult): Line[] {
  const out: Line[] = [];
  const peak = r.storm.peakM3;
  const talk = [{ id: 'explain' as const, label: 'Show the numbers' }, { id: 'ignore' as const, label: 'Not now' }];
  out.push({ npc: 'chen', key: 'chen-storm', text: peak <= A.questChenPeak.value + 1e-9 ? `${peak.toFixed(1)} m³ in the biggest hour — under ${A.questChenPeak.value}. That’s the line I asked for.` : `${peak.toFixed(1)} m³ in the biggest hour. Still over ${A.questChenPeak.value}.`, options: talk });
  const tank = r.storm.facilities.find((f) => f.kind === 'tank');
  if (tank && (tank.startM3 ?? 0) >= tank.capM3 - 1e-6) out.push({ npc: 'coach', key: 'coach-storm', text: 'The tank was already full before the rain — fine by me. What counts is what’s left on 1 May.', options: talk });
  else if (!r.stormPrep?.tank) out.push({ npc: 'coach', key: 'coach-storm', text: 'No tank on the roof, so all that rain went down the pipe. Next season?', options: talk });
  return out;
}

/** One line per neighbour for the ending (from the final model state). */
export function endingLine(id: NpcId, r: CampaignResult): string {
  const q = r.quests[id];
  if (id === 'maya') return q ? `${Math.round(r.slope.establishedNative).toLocaleString('en-US')} m² of native grass established. The slope is ours again.` : `${Math.round(r.slope.establishedNative).toLocaleString('en-US')} m² established${r.slope.ldn.grassland.status === 'net_loss' ? ', and the grassland came out behind doing nothing' : ''}. Not there yet.`;
  if (id === 'leo') {
    if (q) return `${r.shadeAlive} shade trees by the lawn${r.trail === 'rerouted' ? ', and a new way down' : ''}. The campers are happy.`;
    if (r.trail === 'closed') return `${r.shadeAlive ? `${r.shadeAlive} shade trees, but ` : ''}the shortcut is closed — my campers walk the long way round.`;
    return r.shade.length ? `${r.shadeAlive} shade trees made it — we hoped for ${A.questLeoTrees.value}.` : 'No shade trees by the lawn this time.';
  }
  if (id === 'coach') {
    if (r.tankMay1 == null) return 'No roof tank this time.';
    return q ? `${r.tankMay1.toFixed(1)} m³ in the tank on 1 May. That’s what I asked for.` : `${r.tankMay1.toFixed(1)} m³ on 1 May — under the ${A.questCoachTankM3.value} I hoped for.`;
  }
  return q ? `${r.storm.peakM3.toFixed(1)} m³ in the biggest hour — under ${A.questChenPeak.value}.` : `${r.storm.peakM3.toFixed(1)} m³ in the biggest hour. Still over ${A.questChenPeak.value}.`;
}

// ------------------------------------------------------------------ Juno (scripted; P0 basic lines)
/** A neighbour's reaction to what you just put in the plan (the action, never its outcome — the year shows that). */
export const ACT_REACT: Record<string, { id: NpcId; good: boolean; text: string }> = {
  replant: { id: 'maya', good: true, text: 'Yes! Native grass is what this slope needs.' },
  water: { id: 'maya', good: true, text: 'Watering all summer? My volunteers will carry the cans!' },
  trees: { id: 'maya', good: false, text: 'Trees? This slope is meant to be grassland…' },
  close: { id: 'leo', good: false, text: 'Close it? My campers need that way down!' },
  reroute: { id: 'leo', good: true, text: 'A new way down? That works for us!' },
  shade: { id: 'leo', good: true, text: 'Shade by the lawn! The kids will love it.' },
  garden: { id: 'chen', good: true, text: 'A garden to catch the water? Let’s see if it holds.' },
  tank: { id: 'coach', good: true, text: 'Roof water for the field in May — I like it!' },
};
/** A neighbour's quick reaction while you plan, when the model's projection for their quest changes (fictional people). */
export const REACT: Record<NpcId, { onTrack: string; atRisk: string }> = {
  maya: { onTrack: 'Yes — that could bring the native grass back by 2023.', atRisk: 'That won’t bring enough native grass back by 2023.' },
  leo: { onTrack: 'Shade by the lawn and a way down. My campers say thanks!', atRisk: 'My campers need shade by the lawn — and a way down the slope.' },
  coach: { onTrack: 'Water saved for the field in May. Nice.', atRisk: 'That won’t leave enough water for the field on 1 May.' },
  chen: { onTrack: 'That could keep the storm’s biggest hour under my line.', atRisk: 'Too much water still reaches the drain in the biggest hour.' },
};
export const JUNO_OPEN = 'This canyon is real. The weather you’ll play is the real 2020–2023 weather — the drought, the storms, all of it.';
export const JUNO_FIRST_CARD = 'Pick one or two cards for autumn 2020, then run the year. You can always compare with doing nothing.';
