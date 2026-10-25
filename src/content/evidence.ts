// Evidence cards and the proposal card (T8), and the “last consequence” rows (T7).
// Every card is written by the game from a model run or the observed record: metric · your plan vs doing nothing · source tag.
// The player's own sentence is kept exactly as typed. No names, no locations.
import { A } from '../model/assumptions';
import type { CampaignResult, CampaignState, NpcId } from '../campaign/campaign';
import { describeAutumn, NPC_IDS, YEARS } from '../campaign/campaign';
import { NPCS } from './npcs';
import { ENDINGS } from './endings';

export type Tier = 'model' | 'observed' | 'assumption' | 'teaching units';
export interface Evidence { id: string; metric: string; value: string; tier: Tier }
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
export const evidenceText = (e: Evidence) => `${e.metric} · ${e.value} · ${e.tier}`;

export interface WeatherFacts { wy2021Mm: number; nyeDowntownMm: number; oakTotalMm: number; oakMaxHourMm: number }

/** Evidence cards available for this season (only ones that say something about the player's plan). */
export function evidenceCards(r: CampaignResult, base: CampaignResult, w: WeatherFacts, trailOpen?: CampaignResult | null): Evidence[] {
  const out: Evidence[] = [];
  out.push({ id: 'native', metric: 'Native grass established on the east slope by 30 Sept 2023', value: `${n0(r.slope.establishedNative)} m², doing nothing ${n0(base.slope.establishedNative)} m²`, tier: 'model' });
  const g = r.slope.ldn.grassland;
  if (g.touched) out.push({ id: 'grassland', metric: 'East-slope grassland vs doing nothing (teaching LDN check)', value: `${g.status.replace('_', ' ')} — area ${g.area.delta >= 0 ? '+' : ''}${n0(g.area.delta)} m², erosion index ×${g.erosion.ratio.toFixed(2)}`, tier: 'model' });
  const gs = r.slope.cohorts.find((c) => c.year === 0 && c.kind === 'grass');
  if (gs) out.push({ id: 'survival', metric: 'First-year survival of the 2020 planting', value: `${Math.round((gs.survival ?? 0) * 100)}% (${gs.watered ? 'watered' : 'not watered'}, ${gs.severeDays} days of severe thirst)`, tier: 'model' });
  // what the shortcut decision itself changed: the same plan with the shortcut left open (a second model run)
  if (r.trail !== 'open' && trailOpen) {
    const a = r.slope.years[2].grassland.erosion, b = trailOpen.slope.years[2].grassland.erosion;
    out.push({ id: 'trail', metric: 'East-slope erosion index, water year 2023', value: `×${(a / b).toFixed(2)} with the shortcut ${r.trail} vs left open (same plantings)`, tier: 'model' });
  }
  if (r.shade.length) out.push({ id: 'shade', metric: 'Shade trees alive by the lawn, 30 Sept 2023', value: `${r.shadeAlive} of ${r.shade.reduce((s, c) => s + c.planted, 0)} planted`, tier: 'model' });
  if (r.stormPrep) {
    out.push({ id: 'peak', metric: 'Biggest hour into the Rec Center drain, 31 Dec 2022', value: `${r.storm.peakM3.toFixed(1)} m³, doing nothing ${base.storm.peakM3.toFixed(1)} m³`, tier: 'model' });
    if (r.storm.delayedTotal > 0.05) out.push({ id: 'delayed', metric: 'Let out later through pipes in that storm', value: `${r.storm.delayedTotal.toFixed(1)} m³ — still reached the drain`, tier: 'model' });
  }
  if (r.tankMay1 != null) out.push({ id: 'tank', metric: 'Water in the roof tank on 1 May 2023', value: `${r.tankMay1.toFixed(1)} m³`, tier: 'model' });
  out.push({ id: 'rain2021', metric: 'Rain in water year 2021, downtown SF', value: `${w.wy2021Mm} mm`, tier: 'observed' });
  out.push({ id: 'nye', metric: 'Rain on 31 Dec 2022', value: `${w.nyeDowntownMm} mm downtown; ${w.oakTotalMm} mm at OAK airport, biggest hour ${w.oakMaxHourMm} mm`, tier: 'observed' });
  out.push({ id: 'cost', metric: 'What the season cost', value: `${r.tokens.total} of ${r.tokens.budget} tokens, ${n0(r.sweat.reduce((a, b) => a + b, 0))} h sweat, ${n0(r.water.reduce((a, b) => a + b, 0))} m³ water`, tier: 'teaching units' });
  return out;
}

// ------------------------------------------------------------------ proposal card
export interface ProposalRow { k: 'chose' | 'environment' | 'social' | 'economic' | 'responded' | 'missing' | 'next'; label: string; text: string }
export function proposalRows(s: CampaignState, r: CampaignResult, base: CampaignResult): ProposalRow[] {
  const resp = s.responses.map((x) => `${NPCS[x.npc].name}: ${x.choice === 'adjust' ? 'rerouted the shortcut' : x.choice === 'explain' ? 'explained with evidence' : 'no reply'}`);
  const notDone = NPC_IDS.filter((k) => !r.quests[k]).map((k) => `${NPCS[k].name}’s quest`);
  return [
    { k: 'chose', label: 'What I chose', text: s.autumns.map((a, y) => `${YEARS[y]}: ${describeAutumn(a)}`).join(' | ') },
    { k: 'environment', label: 'Environment', text: `native grass established ${n0(r.slope.establishedNative)} m² (doing nothing ${n0(base.slope.establishedNative)}); grassland check ${r.slope.ldn.grassland.status.replace('_', ' ')}; storm’s biggest hour ${r.storm.peakM3.toFixed(1)} m³ (doing nothing ${base.storm.peakM3.toFixed(1)})` },
    { k: 'social', label: 'Neighbours', text: `${r.questCount} of 4 quests done — ${NPC_IDS.map((k) => `${NPCS[k].name} ${r.quests[k] ? '✓' : '✕'}`).join(', ')}` },
    { k: 'economic', label: 'Cost (teaching units, not dollars)', text: `${r.tokens.total} of ${r.tokens.budget} tokens · ${n0(r.sweat.reduce((a, b) => a + b, 0))} h volunteer sweat · ${n0(r.water.reduce((a, b) => a + b, 0))} m³ water` },
    { k: 'responded', label: 'Who I answered', text: resp.length ? resp.join('; ') : 'nobody yet' },
    { k: 'missing', label: 'Not done', text: notDone.length ? notDone.join(', ') : '—' },
    { k: 'next', label: 'What to test next', text: nextTest(s, r) },
  ];
}
/** The model's biggest unknowns for what was built (assumptions.ts), as field checks — not claims. */
export function nextTest(s: CampaignState, r: CampaignResult): string {
  const out: string[] = [];
  if (s.autumns.some((a) => (a.replantSlope?.areaM2 ?? 0) > 0 || (a.shadeTrees ?? 0) > 0)) out.push(`measure how much water the east-slope soil holds (the model assumes ${A.awcMissing.value} mm/m, range ${A.awcMissing.range?.join('–')})`);
  if (r.stormPrep) out.push('check where the Rec Center downspouts really go (the model assumes the roof is piped to the drain)');
  if (!out.length) out.push('walk the east slope after a storm and note where soil washes');
  return out.join('; ');
}

export interface NextStep { id: 'look' | 'help' | 'speak' | 'home'; label: string; anywhere: string; sf: string }
export const NEXT_STEPS: NextStep[] = [
  { id: 'look', label: 'Go and look', anywhere: 'Next time it rains, watch where the water runs at your school or home, and note one place where it pools or washes soil away.', sf: 'In San Francisco: BART to Glen Park station, then a 15–20 minute walk to Glen Canyon.' },
  { id: 'help', label: 'Lend a hand', anywhere: 'Join one volunteer day at a park near you; stay on the official trails.', sf: 'In San Francisco: the parks’ volunteer programmes.' },
  { id: 'speak', label: 'Speak up', anywhere: 'Take this card to a public meeting and ask one question backed by your evidence. 60-second template: “I played a model of [place]. With real weather it showed [evidence]. I’d accept [cost] because [your sentence]. Could the city check [what to test next]?”', sf: 'In San Francisco: the Youth Commission (members appointed at 12–23) advises the Board of Supervisors and the Mayor.' },
  { id: 'home', label: 'At home', anywhere: 'If you can use a roof or a downspout: a rain barrel fills fast too — use the stored water on plants.', sf: 'In San Francisco: ask the SFPUC about its rain-barrel rebate.' },
];
export const NOT_ENDORSED = 'None of the organisations named here has endorsed this game.';

/** The text copied by “Copy”: no names, no location; the player's sentence exactly as typed. */
export function proposalText(s: CampaignState, r: CampaignResult, base: CampaignResult, sentence: string, ev: Evidence[], step: NextStep | null): string {
  const lines = [`Neutral Ground — my canyon season proposal`, `Ending: ${ENDINGS[r.ending].title} (30 Sept 2023)`];
  for (const row of proposalRows(s, r, base)) lines.push(`${row.label}: ${row.text}`);
  if (sentence.trim()) lines.push(`I’d accept this cost because ${sentence}`);
  for (const e of ev.slice(0, 2)) lines.push(`Evidence: ${evidenceText(e)}`);
  if (step) lines.push(`What I’ll do next: ${step.label} — ${step.anywhere}`);
  lines.push('Prototype model · teaching assumptions · historical 2020–23 weather. Fictional neighbours. ' + NOT_ENDORSED);
  return lines.join('\n');
}

// ------------------------------------------------------------------ last consequence rows (T7): numbers straight from the runs
export interface Row { k: string; label: string; plan: string; base: string; dir: 'better' | 'worse' | 'same'; tier: 'model' | 'obs' | 'assumed' }
export function consequenceRows(r: CampaignResult, base: CampaignResult): Row[] {
  const rows: Row[] = [];
  const dNat = r.slope.establishedNative - base.slope.establishedNative;
  rows.push({ k: 'native', label: 'Native grass by 2023', plan: `${n0(r.slope.establishedNative)} m²`, base: `${n0(base.slope.establishedNative)} m²`, dir: dNat > 1 ? 'better' : dNat < -1 ? 'worse' : 'same', tier: 'model' });
  const g = r.slope.ldn.grassland;
  rows.push({ k: 'grassland', label: 'Grassland check', plan: g.status === 'not_touched' ? 'not touched' : g.status.replace('_', ' '), base: '—', dir: g.status === 'net_gain' ? 'better' : g.status === 'net_loss' ? 'worse' : 'same', tier: 'model' });
  rows.push({ k: 'erosion', label: 'Soil washing away (index)', plan: `×${g.erosion.ratio.toFixed(2)}`, base: '×1.00', dir: g.erosion.verdict === 'better' ? 'better' : g.erosion.verdict === 'worse' ? 'worse' : 'same', tier: 'model' });
  if (r.shade.length) rows.push({ k: 'shade', label: 'Shade trees alive', plan: `${r.shadeAlive} of ${r.shade.reduce((s, c) => s + c.planted, 0)}`, base: '0', dir: r.shadeAlive > 0 ? 'better' : 'same', tier: 'model' });
  const dPeak = r.storm.peakM3 - base.storm.peakM3;
  rows.push({ k: 'peak', label: 'Storm’s biggest hour', plan: `${r.storm.peakM3.toFixed(1)} m³`, base: `${base.storm.peakM3.toFixed(1)} m³`, dir: dPeak < -0.05 ? 'better' : dPeak > 0.05 ? 'worse' : 'same', tier: 'model' });
  if (r.tankMay1 != null) rows.push({ k: 'tank', label: 'Tank water on 1 May', plan: `${r.tankMay1.toFixed(1)} m³`, base: '—', dir: r.tankMay1 > 0 ? 'better' : 'same', tier: 'model' });
  return rows;
}
export type { NpcId };
