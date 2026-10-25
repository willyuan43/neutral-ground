// All prototype model parameters live here.
// Every entry: value, range (if any), unit, tier and source.
//   tier 'local'    – from a local source in this project's data (data/ or content/)
//   tier 'generic'  – from a published generic table (G7: content/cover-generic-values.json), mapped by us (mapping is assumed)
//   tier 'design'   – a design standard or a player design choice (not data)
//   tier 'teaching' – a teaching assumption: no source found; shown in the UI as an assumption
// Numbers here never come from an LLM. Changing one changes every result; tests pin the check values.

export type Tier = 'local' | 'generic' | 'design' | 'teaching';
export interface Param<T = number> {
  value: T;
  range?: [number, number];
  unit: string;
  tier: Tier;
  source: string;
  note?: string;
}

const p = <T = number>(value: T, unit: string, tier: Tier, source: string, range?: [number, number], note?: string): Param<T> =>
  ({ value, unit, tier, source, range, note });

// Hydrologic soil group codes used in the grid (prep-data.mjs): 1..4 = A..D; 9 = no known group in the map unit
export type HSG = 'A' | 'B' | 'C' | 'D';
export const HSG_FROM_CODE: Record<number, HSG | null> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 9: null };

export const A = {
  // ---------------------------------------------------------------- storms (levels 1–2)
  unknownHsgCentral: p<HSG>('C', '—', 'teaching', 'CLAUDE.md rule 2: unknown soil runs as a B–D range, never A; C is the middle used for the main number', undefined,
    'Results with B and D are shown as the range in “See the real data”.'),
  antecedent: p<'AMC II'>('AMC II', '—', 'teaching', 'Brief §3: average antecedent condition, assumed'),
  // Curve numbers by cover, A/B/C/D (G7 generic table rows, TR-55 via content/cover-generic-values.json)
  cn: {
    roof: p<number[]>([98, 98, 98, 98], 'CN', 'generic', 'G7 cover-generic-values: paved parking lots / roofs / driveways (TR-55)'),
    paved: p<number[]>([98, 98, 98, 98], 'CN', 'generic', 'G7 cover-generic-values: paved parking lots / roofs / driveways (TR-55)'),
    turf: p<number[]>([39, 61, 74, 80], 'CN', 'generic', 'G7 cover-generic-values: open space, good condition (TR-55)'),
    grass: p<number[]>([49, 69, 79, 84], 'CN', 'generic', 'G7 cover-generic-values: pasture/grassland/range, fair (TR-55)'),
    scrub: p<number[]>([35, 56, 70, 77], 'CN', 'generic', 'G7 cover-generic-values: brush–weed mixture, fair (TR-55)'),
    tree: p<number[]>([36, 60, 73, 79], 'CN', 'generic', 'G7 cover-generic-values: woods, fair (TR-55)'),
    bare: p<number[]>([77, 86, 91, 94], 'CN', 'generic', 'G7 cover-generic-values: newly graded pervious, no vegetation (TR-55)'),
    water: p<number[]>([98, 98, 98, 98], 'CN', 'teaching', 'Open water treated like an impervious surface for event runoff (teaching assumption)'),
    rock: p<number[]>([98, 98, 98, 98], 'CN', 'teaching', 'Bare rock treated like an impervious surface (teaching assumption; G7 found no row)'),
    youngTrees: p<number[]>([57, 73, 82, 86], 'CN', 'generic', 'G7 cover-generic-values: woods–grass combination, poor (young trees, TR-55)'),
  },
  iaRatio: p(0.2, '—', 'generic', 'SCS-CN initial abstraction Ia = 0.2 S (docs/04 B)'),
  roofsConnected: p<boolean>(true, '—', 'teaching', 'Assumed: the Rec Center roof drains through downspouts and pipes straight to the drain (docs/04 A: share of directly connected roofs is unknown)'),
  // rain garden (docs/04 K)
  rgPondingM: p(0.15, 'm', 'teaching', 'docs/04 K rg.pondingDepthM', [0.1, 0.3]),
  rgMediaM: p(0.45, 'm', 'teaching', 'docs/04 K rg.mediaDepthM', [0.3, 0.9]),
  rgPorosity: p(0.3, '—', 'teaching', 'docs/04 K rg.mediaPorosity', [0.25, 0.4]),
  rgInletEff: p(0.9, '—', 'teaching', 'docs/04 K rg.inletEff0', [0.6, 1.0]),
  ksatByHsg: p<Record<HSG, number>>({ A: 50, B: 20, C: 5, D: 1 }, 'mm/h', 'teaching', 'docs/04 K ksat.byHsg (teaching values; no bottom-of-facility test exists)'),
  underdrainThreshold: p(12.7, 'mm/h', 'design', 'SFPUC 2016 design condition: native soil under 0.5 in/h needs an underdrain (docs/04 C)'),
  underdrainRate: p(25, 'mm/h', 'teaching', 'docs/04 K underdrain.rateMmH', [10, 50]),
  // roof tank (player design choices — G2 left these null)
  tankRelease: p(1, 'm³/h', 'design', 'Player design choice (slow release). Same rate as the GPT storage experiment so the check values apply'),
  // permeable paving (docs/04 K)
  ppThicknessM: p(0.3, 'm', 'teaching', 'docs/04 K pp.thicknessM', [0.2, 0.45]),
  ppPorosity: p(0.3, '—', 'teaching', 'docs/04 K pp.effPorosity', [0.25, 0.4]),
  rgMaxSlopePct: p(10, '%', 'teaching', 'docs/04 K rg.maxSlopePct', [5, 15]),
  creekCulverted: p<boolean>(true, '—', 'local', 'OpenStreetMap: Islais Creek runs in a culvert (tunnel=culvert) under the Rec Center lawn, so the lawn’s lowest D8 line is not an open channel; only OSM streams that are not culverted block a garden', undefined,
    'Canyon water inside the culvert is outside this puzzle; only rain on the Rec Center area is counted.'),
  // sizes, prices and starting states for levels 1–2 (design choices / teaching values — not data, not dollars)
  gardenM2: p<Record<'S' | 'M' | 'L', number>>({ S: 75, M: 100, L: 150 }, 'm²', 'design', 'Player design choice: rain-garden footprint sizes'),
  tankM3: p<Record<'S' | 'L', number>>({ S: 7.5, L: 15 }, 'm³', 'design', 'L = 10.2 L per m² of roof (SFPUC residential pilot minimum, docs/04 K cistern.lPerM2Roof) × 1,475 m² ≈ 15 m³; S = half'),
  tankEmptyOn1Oct: p<boolean>(true, '—', 'teaching', 'Assumed: the roof tank is emptied by summer lawn watering and starts the rainy season (1 October) empty; its level before a storm is then computed from the real daily rain', undefined,
    'Daily rain (downtown station) is spread evenly over each day for this calculation.'),
  stormCost: p<Record<string, number>>({ gardenS: 2, gardenM: 3, gardenL: 4, tankS: 2, tankL: 3, disconnect: 1, paving: 3 }, 'tokens', 'teaching', 'Teaching prices in build tokens (G2 found no usable unit prices) — not dollars'),
  offFlowpathShare: p(0.1, '—', 'teaching', 'Hint rule: a spot that carries less than 10% of the storm’s water to the drain (doing nothing) is reported as off the main flow line'),
  offFlowpathM3: p(6, 'm³', 'teaching', 'Hint threshold: a garden that receives less than this in the whole storm is reported as “off the flow path” (diagnostic only)'),
  // game targets (picked from the model's own result distribution by scripts/solve-levels.mjs — not real-world standards)
  targetL1Peak: p(40, 'm³ in an hour', 'design', 'Game target for level 1 (see NOTES.md calibration)'),
  targetL2Peak: p(100, 'm³ in an hour', 'design', 'Game target for level 2 (see NOTES.md calibration)'),
  targetL2Kept: p(22, 'm³', 'design', 'Game target for level 2 (see NOTES.md calibration)'),
  star2L2Tokens: p(6, 'tokens', 'design', 'Level 2 ★★: spend at most this many tokens'),
  budgetL2: p(8, 'tokens', 'design', 'Game budget for level 2'),

  // ---------------------------------------------------------------- seasons (level 3)
  p: p(0.5, '—', 'generic', 'FAO-56 depletion fraction p (docs/04 K)', [0.4, 0.6]),
  awcMissing: p(120, 'mm/m', 'teaching', 'Brief §3: AWC missing for 33 of 37 soil components → 120 mm/m', [80, 160]),
  seedlingRootM: p(0.3, 'm', 'teaching', 'docs/04 K est.rootDepthM', [0.2, 0.5]),
  seedlingKc: p(0.6, '—', 'teaching', 'docs/04 K est.kc', [0.4, 0.8]),
  sMax: p(0.85, '—', 'teaching', 'docs/04 E est.sMax', [0.7, 0.95]),
  sMin: p(0.1, '—', 'teaching', 'docs/04 E est.sMin', [0, 0.3]),
  kPerSevereDay: p(0.008, '1/day', 'teaching', 'docs/04 E est.kPerSevereDay', [0.004, 0.015]),
  severeKs: p(0.5, '—', 'teaching', 'docs/04 E: Ks < 0.5 counts as a severe-stress day'),
  bareKc: p(0.3, '—', 'teaching', 'Prototype: evaporation from bare soil as Kc 0.3 (no G7 row)', [0.15, 0.5]),
  bareRootM: p(0.1, 'm', 'teaching', 'Prototype: bare soil dries only in a thin top layer (0.1 m)', [0.05, 0.15]),
  grassRootM: p(0.6, 'm', 'teaching', 'docs/04 K rootDepth grassland 0.6 m (G7 generic range 0.5–1.5)', [0.5, 1.5]),
  grassKc: p(0.75, '—', 'generic', 'G7 FAO-56 grassland mid-season Kc 0.75 (applied all year — simplification)'),
  treeKc: p(0.9, '—', 'teaching', 'Prototype: young/established trees Kc 0.9 (no G7 row)', [0.8, 1.0]),
  treeRootM: p(1.0, 'm', 'teaching', 'Prototype root depth for planted trees', [0.6, 2.0]),
  // erosion (relative RUSLE, docs/04 F)
  cFactor: p<Record<string, number>>({ grass: 0.042, bare: 1.0, tree: 0.06, scrub: 0.038, seedling: 0.2, turf: 0.003 }, 'C', 'generic',
    'G7 AH537 table: grass 0.042, bare/trail 1.0, scrub 0.038, turf 0.003; tree 0.06 = middle of G7 range 0.04–0.087; seedlings 0.2 = teaching assumption'),
  erosiveRainMm: p(12.7, 'mm/day', 'teaching', 'Erosion weight per water year = Σ max(0, daily rain − 12.7 mm): rain below 12.7 mm (0.5 in) is treated as not erosive (RUSLE convention, used here as a teaching proxy)'),
  guessL1LowM3: p(35, 'm³', 'design', 'Level 1 guess bins: under 35 m³ / 35 m³ to the goal / over the goal (biggest hour into the drain)'),
  guessL2BinM3: p(4, 'm³', 'design', 'Level 2 guess bins: under the goal / goal to goal + 4 m³ / more (kept out of the drain)'),
  stormDayMm: p(50, 'mm/day', 'teaching', 'docs/04 K storm.thresholdMm: a day with ≥ 50 mm is marked as a storm'),
  trailWidthM: p(1.5, 'm', 'teaching', 'Assumed width of the unofficial trail (OSM line length × width)'),
  ldnBand: p(0.02, '—', 'teaching', 'docs/04 W ldn.neutralBand ±2%'),
  faceBand: p(0.02, '—', 'teaching', 'docs/04 K face.sameBand ±2%'),
  treeCrownM2: p(50, 'm²', 'teaching', 'docs/04 K tree.crownM2 mature 50 m²', [20, 100]),
  planEucalyptusMax: p(10, 'trees', 'local', '2006 plan suggestion for MA-2a: remove about 10 eucalyptus (not a count of existing trees)'),
  keepBigTrees: p(2, 'trees', 'design', 'Player choice “keep some big trees for raptors”: the 2 biggest stay standing (2006 plan: leave some large trees)'),
  estYears: p<Record<'grass' | 'willow' | 'tree', number>>({ grass: 2, willow: 2, tree: 5 }, 'years', 'teaching', 'docs/04 K est.years: after surviving the first dry season, cover moves 1/est.years of the way to its target each 1 October'),
  dryStart: p(1, '—', 'teaching', 'Soil starts the run on 1 Sept 2020 fully depleted (end of the dry summer); one dry month of spin-up before decisions'),
  wateringRule: p<'et_based'>('et_based', '—', 'teaching', 'docs/04 A/E: first-year watering refills the root zone to field capacity whenever depletion passes the easily-available level (RAW)'),
  slopeCost: p<Record<string, number>>({ tokensPer250m2Replant: 1, tokensPer100m2Trees: 1, tokensPerTreeRemoved: 1, tokensCloseTrail: 1, sweatPer100m2Plant: 2, sweatPer100m2Water: 1.5, sweatPerTreeRemoved: 3, sweatCloseTrail: 8, sweatTrailPatrol: 2, sweatCheck: 4 },
    'tokens / hours', 'teaching', 'Teaching prices: build tokens (one-off) and volunteer hours (“sweat”) — not dollars, not real labour estimates'),
  budgetL3: p<Record<string, number>>({ tokens: 10, sweatPerYear: 60, waterPerYearM3: 900 }, 'tokens / h / m³', 'design', 'Game budgets for level 3 (tokens in total; sweat and water per water year)'),
  targetL3Native: p(1000, 'm²', 'design', 'Game target for level 3: planted native grass established on the east slope by 2023-09-30 (see NOTES.md calibration)'),
  star3L3Tokens: p(6, 'tokens', 'design', 'Level 3 ★★★: use at most this many tokens'),

  // ---------------------------------------------------------------- canyon season (trial version: the east slope + the Rec Center in one timeline)
  // Costs, quest lines and ally help are game rules (design / teaching values), not data. None of them changes the model's physics.
  campaignBudget: p<Record<string, number>>({ tokens: 16, sweatPerYear: 60, waterPerYearM3: 900 }, 'tokens / h / m³', 'design',
    'Game budget for the canyon season: one token pool shared by the east slope and the Rec Center; sweat and water per water year (see NOTES.md, T9 calibration)'),
  budgetTiers: p<Record<string, number>>({ tight: 14, normal: 16, generous: 18 }, 'tokens', 'design', 'Replay option (P1): the shared token pool. At 14 no plan does all four quests (T9); at 16 two routes do; 18 leaves room'),
  rerouteExtraTokens: p(2, 'tokens', 'design', 'Reroute the shortcut: the slope model closes the old line exactly as “Close” does; a new way down costs this many tokens more'),
  shadeTreeCounts: p<number[]>([4, 6, 8], 'trees', 'design', 'Shade trees by the Rec Center lawn: how many the player can plant (one planting, autumn 2021 or 2022)', undefined,
    'Each tree counts as one mature crown (treeCrownM2) for tokens, sweat and first-year watering, like trees on the slope; survival uses the same daily rule as young trees on the slope (watered the first year). The hourly storm model’s ground is not changed by them.'),
  questMayaNative: p(1000, 'm²', 'design', 'Maya’s quest: native grass established on the east slope by 2023-09-30, and no net loss of the grassland class (same line as level 3)'),
  questLeoTrees: p(4, 'trees alive', 'design', 'Leo’s quest: shade trees alive by the lawn on 2023-09-30 (planted × modelled survival, rounded down), and the way down the slope not cut (shortcut open or rerouted)'),
  questCoachTankM3: p(10, 'm³', 'design', 'Coach Rivera’s quest: water in the roof tank on 1 May 2023 (start of the dry season), kept for watering the field'),
  lateWaterSweat: p<string>('irrigation share', 'rule', 'teaching', 'Watering started partway through the first water year (“Water now” during the replay): the same refill rule runs from that day on; its volunteer hours are the full-year watering hours × (water it carries ÷ water a full year of watering would carry). No source — a teaching assumption'),
  questCoachDate: p<string>('2023-05-01', 'date', 'design', 'Day the roof tank is checked for Coach Rivera (start of the dry season, a game choice)'),
  questChenPeak: p(100, 'm³ in an hour', 'design', 'Ms. Chen’s quest: biggest hour into the drain in the New Year’s Eve 2022 storm (same line as level 2; doing nothing gives 107.3)'),
  allyMayaSweat: p(10, 'h per year', 'teaching', 'Ally (teaching value): no trees on the grassland and the shortcut closed or rerouted → nature-area volunteers add these hours each later water year'),
  allyLeoSweat: p(5, 'h per year', 'teaching', 'Ally (teaching value): shade trees planted → camp families add these hours each later water year (help watering)'),
  allyCoachTokens: p(1, 'tokens', 'teaching', 'Ally (teaching value): building the large roof tank → the youth team chips in this many tokens on the spot'),
  longDrySurvival: p(0.3, '—', 'design', 'Ending rule: the autumn-2020 planting counts as “dried out” when under this share survived its first dry season and nothing was re-sown'),
  neutralGroundQuests: p(3, 'quests', 'design', 'Ending rule: the Neutral Ground ending also needs at least this many neighbours’ quests done'),
  // prediction answer bins (the true bin is computed by the model run; the bin edges are game design)
  guessSurvivalBins: p<number[]>([0.3, 0.6], 'share surviving', 'design', 'Guess bins for first-year survival: very little < 30% ≤ about half < 60% ≤ most'),
  guessWaterGainBins: p<number[]>([0.1, 0.3], 'share points', 'design', 'Guess bins for “how many more survive when watered”: about the same < 10 points ≤ a bit more < 30 points ≤ many more'),
  guessErosionBins: p<number[]>([0.02, 0.15], 'share less', 'design', 'Guess bins for the slope’s erosion index vs doing nothing in water year 2021: no change < 2% less ≤ a little less < 15% less ≤ a lot less'),
  guessPeakBins: p<number[]>([0.03, 0.15], 'share less', 'design', 'Guess bins for the storm’s biggest hour vs doing nothing: about the same < 3% less ≤ a bit less < 15% less ≤ much less'),
} as const;

export type Assumptions = typeof A;
