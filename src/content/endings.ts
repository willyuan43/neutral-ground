// The eight endings (T6). Decided by the model state on 30 Sept 2023 (slope × storm × neighbours, see campaign.ts endingOf);
// no random numbers. Neutral Ground is a challenge goal under these teaching assumptions, not the one right answer —
// every ending card is the same size. Text says what this teaching model computed in the historical weather, never “you saved…”.
import { A } from '../model/assumptions';
import type { EndingId, CampaignResult, NpcId, Autumns } from '../campaign/campaign';
import { NPCS } from './npcs';

export const ENDINGS: Record<EndingId, { title: string; sub: string }> = {
  quiet: { title: 'Quiet Canyon', sub: 'You left the canyon as it was. It still changed with the weather.' },
  neutral: { title: 'Neutral Ground', sub: 'The challenge goal (teaching model): grass back, storm under the line, three or more neighbours helped.' },
  grassland: { title: 'Grassland Returns', sub: 'The native grass came back on the east slope. At the Rec Center, the storm’s biggest hour stayed over the line.' },
  greener: { title: 'Greener, Not Better', sub: 'Trees went in on the grassland. The slope got greener and the grassland it was being restored for got smaller.' },
  longDry: { title: 'The Long Dry', sub: 'The 2020 planting met a very dry water year and most of it died; nothing was sown again.' },
  stormReady: { title: 'Storm Ready', sub: 'At the Rec Center the storm’s biggest hour stayed under the line. On the east slope little changed.' },
  peakThrough: { title: 'The Peak Got Through', sub: 'You built at the Rec Center, and the storm’s biggest hour still went over the line.' },
  tradeoffs: { title: 'A Season of Trade-offs', sub: 'Some of what you set out to do worked; some did not.' },
};

/** How each ending is reached (from the ending rules in campaign.ts endingOf), for the locked tiles. */
export const ENDING_HINTS: Record<EndingId, string> = {
  quiet: 'Play no cards at all, and watch the canyon change with the weather anyway.',
  neutral: 'Bring the grass back, keep the storm’s biggest hour under the line, and help at least three neighbours.',
  grassland: 'Bring the native grass back — but leave the Rec Center over the line in the storm.',
  greener: 'Plant trees on the grassland and see what happens to the slope.',
  longDry: 'Sow in 2020, don’t water through the dry year, and don’t sow again.',
  stormReady: 'Keep the storm under the line at the Rec Center without bringing the slope back.',
  peakThrough: 'Build at the Rec Center — but not where it catches the biggest hour.',
  tradeoffs: 'Bring the grass back and beat the storm, but help fewer than three neighbours.',
};
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');

/** Two sentences: what the model computed in the historical weather, and what it cost. */
export function endingSentences(r: CampaignResult, base: CampaignResult): string[] {
  const s1 = `In the 2020–2023 historical weather, this teaching model computed ${n0(r.slope.establishedNative)} m² of native grass established on the east slope (doing nothing: ${n0(base.slope.establishedNative)} m²) and ${r.storm.peakM3.toFixed(1)} m³ in the storm’s biggest hour at the Rec Center drain (doing nothing: ${base.storm.peakM3.toFixed(1)} m³).`;
  const s2 = `It cost ${r.tokens.total} of ${r.tokens.budget} tokens, ${n0(r.sweat.reduce((a, b) => a + b, 0))} hours of volunteer sweat and ${n0(r.water.reduce((a, b) => a + b, 0))} m³ of water over three years.`;
  return [s1, s2];
}

/** What did not work, for the Trade-offs card. */
export function missing(r: CampaignResult): string[] {
  const out: string[] = [];
  if (!r.quests.maya) out.push(`east-slope grassland goal (${n0(r.slope.establishedNative)} of ${n0(A.questMayaNative.value)} m² established${r.slope.ldn.grassland.status === 'net_loss' ? ', net loss of grassland' : ''})`);
  if (!r.quests.chen) out.push(`storm line (${r.storm.peakM3.toFixed(1)} m³ in the biggest hour, line ${A.questChenPeak.value})`);
  if (!r.quests.leo) out.push(`Leo’s shade and way down`);
  if (!r.quests.coach) out.push(`Coach’s water on 1 May`);
  return out;
}

/** One “Try next”, from a quest that was not done (a neighbour you chose to help first). Mechanism, not the answer. */
export function tryNext(r: CampaignResult, autumns: Autumns, focus: NpcId[]): string {
  const order: NpcId[] = [...focus, 'maya', 'chen', 'leo', 'coach'].filter((x, i, a) => a.indexOf(x) === i) as NpcId[];
  const id = order.find((k) => !r.quests[k]);
  if (!id) return 'Try next: a different route to the same ending — or one of the other seven endings.';
  const who = NPCS[id].name;
  if (id === 'maya') {
    const g = r.slope.cohorts.find((c) => c.year === 0 && c.kind === 'grass');
    if (!g) return `Try next (${who}): the slope only comes back if something is sown — and 2021 was a very dry water year.`;
    if (!g.watered) return `Try next (${who}): unwatered seedlings — ${Math.round((g.survival ?? 0) * 100)}% survived their first dry summer in the model.`;
    if (r.slope.ldn.grassland.status === 'net_loss') return `Try next (${who}): the dead patches and the open shortcut leave bare soil for the storms — what stops that?`;
    return `Try next (${who}): ${n0(r.slope.establishedNative)} m² established — grass takes two years after surviving, so later sowings count for less by 2023.`;
  }
  if (id === 'leo') {
    if (r.trail === 'closed') return `Try next (${who}): a closed shortcut cuts the campers’ way down. Is there a way to protect the slope and keep a path?`;
    if (r.shade.length) return `Try next (${who}): ${Math.round(r.shade[0].survival * 100)}% of young trees survive their first year in the model — how many do you need to plant for ${A.questLeoTrees.value}?`;
    return `Try next (${who}): shade trees by the lawn go in in autumn 2021 or 2022.`;
  }
  if (id === 'coach') return r.tankMay1 == null ? `Try next (${who}): a roof tank kept for watering, checked on 1 May 2023.` : `Try next (${who}): ${r.tankMay1.toFixed(1)} m³ on 1 May — which tank holds ${A.questCoachTankM3.value}?`;
  return `Try next (${who}): a garden only helps if it still has room when the biggest hour comes.`;
}
