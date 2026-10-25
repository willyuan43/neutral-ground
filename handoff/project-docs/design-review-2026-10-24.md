# Design review against the official Hack Pack (2026-10-24, ~11:30 PDT)

(Copy from the claude.ai project "UN", 2026-10-25.)

Written by Claude after the HSI Hack Pack 2026 UNCCD page was published on site (user's screenshots), comparing Gemini's and GPT's readings, the team's `docs/11` v0.5 / `docs/13`, and the overnight prototype. The folder `C:\Users\willy\Projects\neutral-ground` stays the source of truth; this note is a proposal until the user confirms it.

## Bottom line
Keep the direction. The brief asks for "a small landscape baseline + one meaningful choice + compare alternatives + a separate, documented rule or model for consequences" — we have that. Three gaps:
1. The brief asks three times for **environmental, social and economic** trade-offs; we show almost only environmental ones.
2. The step from "finished the game" to "participating in local planning" is thin; the proposal card must connect to real, reachable channels.
3. The official build has not started (`app/` holds only the key file at ~11:15), ~1.5 h behind `docs/13`; the prototype already implements the core of both v0.5 rounds. Decide which codebase becomes the official build (depends on the organisers' rule on pre-event code, H0).

## Official brief vs Gemini vs GPT (differences only)
| Point | Official text | Gemini | GPT |
|---|---|---|---|
| Rubric | Technical execution (live demo) 35%, Impact & problem solving 30%, Innovation 20%, Demo & storytelling 15% | Weights right; "previous years only had vague estimates" is unsupported (G6 found explicit 2025 weights, functionality 40%) | Rubric not mentioned (maybe not shown that page) |
| < 3 months | Additional development after the prototype; maintainable by an independent team | Turned into "deploy East Bay grassland + classroom version 4–8 weeks after the event" — its own promise | Correct |
| Optional extension | Credits linked to real project funding; bonus concept | "Free bonus points" — the text gives no points | Correct: no points stated |
| Block by Block | Existing approach; weak on resource scarcity, ecological processes, lasting consequences | Says "ecological succession" — overreads | Correct: a reference case, not a required platform |
| Satellite detective | WorldCover v100 vs v200 differ, so differences are not a clean change map | Praises it, but describes it as WorldCover 2021 vs the 2006 vegetation table — that pair is itself cross-method; it only works as "align extent, year, definition first" (how `docs/11` already frames it) | — |
| Non-profit / open | Must not be profit-driven | "100% open source" — 2006 zone-map licence unchecked; OSM needs attribution; can't say it yet | — |
| Verdict on our plan | — | "Like seeing the answer key" — too optimistic; misses social/economic trade-offs | Sound method, but not mapped onto our design or prototype |

Both missed: social/economic trade-offs are a hard gap; the brief's "water scarcity" maps onto our 2021 drought + watering budget, "land degradation" onto erosion/bare soil/trampling, "ecosystem recovery" onto 3-year native-grass establishment; age is now officially 15–24 (includes minors → no accounts, no personal data, as `docs/11` already says); storytelling is a separate 15%.

## What the rubric implies (our judgement)
- 35% live demo: one golden path computed live (no video), offline single-file fallback, AI timeout → cached answer, every number opens to formula and source.
- 30% impact: show how 15–24-year-olds see trade-offs, how it connects to real local participation, how learning would be assessed.
- 20% innovation: real lidar + real weather as a playable transparent world model; LDN "like-for-like, one-out-all-out" as a game mechanic; AI that explains but never calculates, with a number check.
- 15% storytelling: one 16-year-old protagonist, two lines ("Restoration isn't more trees." / "Later isn't less."), one "this is the real place" reveal.

## Redesign (web game), built on docs/11 v0.5 — not a rewrite
Main path 6–8 min, one island, three chapters:
- **Opening (15 s):** NAIP aerial on the island → morphs into the game island; pick a goal card (butterflies and wildflowers / shade and picnics / less water sent downhill / lawn for dogs / write your own).
- **Chapter 1 — What should this slope become? (~2.5 min):** Replant native grassland (+ optional watering) / Plant more trees / Leave it; plus Close shortcut trail and Check first. Predict survival → fast-forward the 2021 drought → satellite greenness ("greener isn't better") → habitat faces + community faces → the other two cards as three small islands/maps side by side at Sept 2023 → one voice → revise once or keep with a reason.
- **Chapter 2 — The Long Storm (~2 min):** Rain garden / Roof tank / Disconnect roof / Permeable paving / Leave it. Predict "will the garden still have room in the biggest hour?" → 2022-12-31 hourly replay (night, rain, water lines) → water fate → swap the storm (SFO short storm) → why it matters: the park is at the head of the Islais Creek watershed.
- **Chapter 3 — Take it home (~1 min):** proposal card (gains; costs as environmental / social / economic lines; voices answered; unresolved; next measurement), LDN check, three actions (home, park, local planning).
- **Challenge mode:** the prototype's three levels stay as replayable star levels.

By dimension:
| Dimension | Now | Change | Priority |
|---|---|---|---|
| Social & economic | Tokens, sweat, water only | (1) Each card gets a "who gains / who pays" line. (2) "Community faces" next to habitat faces: dog walker, day-camp kid, ballfield user, natural-areas volunteer, downhill neighbour, park gardener — stance computed from model indicators with stated weights (v0.5 Voices support, drawn as faces), labelled "practice voices, not residents' opinions". (3) Economics = build once vs yearly upkeep (sweat, water) → "Can Keep It Up". | P0 |
| Gameplay | Puzzles + stars | Goal card; predictions earn a "Forecaster" badge; three-island comparison; **allies**: plans that win a role's support unlock its sweat or tokens (teaching values) — cooperation around a shared resource as a mechanic | P0 compare; P1 allies |
| Causality | Diagnostic hints | A "why" chain on every result: real rain (observed) → lidar flow path (observed) → rule (model) → result (model), each link tagged observed / model / assumed; leave-one-card-out attribution | P0 |
| Real data | In place | State the hack-pack alignment in the evidence drawer and demo; add a "global vs local" moment | P0 (wording) |
| Real terrain | Floating island | Aerial → game island reveal; an "x-ray" toggle for slope, flow and soil group | P1 |
| Visuals | Island + HUD | Card illustrations, people and species portraits; every animation maps to a computed quantity (v0.5 rule) | P1–P2 |
| AI | None in prototype | See below | P1 |

## Alignment with the official data pack (usable in the demo)
- **ESA WorldCover 2021 v200** (core baseline) is already our starting land cover; the detective puzzle teaches exactly the brief's warning about comparing different methods/versions.
- **InVEST Urban Flood Risk Mitigation** estimates runoff with the SCS Curve Number method, initial abstraction λ = 0.2 (fixed); our storm model uses the same method and the same 0.2, applied to real hourly rain, plus garden/tank storage.
- **LDN check** = three official principles: SDG 15.3.1 one-out-all-out; counterbalancing only within the same land type (like for like); avoid > reduce > reverse. Keep "teaching version, not an official assessment".
- **Global vs local:** SDG 15.3.1 global defaults are 300 m (ESA CCI land cover) and 1 km (JRC land productivity). One 1 km pixel is 100 ha, about 3× the two parks (34.2 ha). Our 5 m lidar grid has 13,681 cells inside the parks.
- **Downstream:** SFPUC (2025) says the Islais Creek watershed historically carried stormwater from Glen Canyon, the Outer Mission and the Excelsior to the Bay, and the Lower Alemany area is still at risk of flooding in heavy rain. We only count water reaching the park's outlet; no sewer or downstream flood model (say so on screen).

## AI (not required by the brief, so only where it helps learning)
| Role | Does | Fallback |
|---|---|---|
| Ask the canyon | Understands a what-if, calls the engine, answers in ≤ 3 sentences with source tags | Preset Q&A buttons |
| Voices | Practice roles voice the engine-computed stance; the player replies; AI only checks whether the reply addresses the concern (acknowledge, reason, mitigation or next step) | Pre-written lines |
| Proposal coach | Turns the plan and the player's own words into a 60-second public comment or a youth greening grant draft; flags overclaims | Fixed template |
| Explain | Narrates the "why" chain, simple / science levels | Templates |

**Number firewall:** every number in an AI answer must match a value in this run's engine output, otherwise the sentence is replaced by a template; no species presence claims; the whole game works offline. Key only in a local server-side proxy; dev server localhost-only.

## Measuring learning (guardrail 4)
- In game: Predict–Observe–Explain in every chapter; log prediction error, whether the second storm is predicted better, whether the player revised after evidence, whether the proposal names a cost.
- Before/after: the 3 concept items G8 prepared + 1 transfer item at a new site.
- Intention/participation: two 1–5 items + count of "send me meeting/volunteer info" clicks (count only).
- Minors: aggregate only. After the event: classroom pilot with pre/post and a 2-week self-reported follow-up.
- Wording: finishing ≠ understanding ≠ behaviour change; report only observed counts and methods.

## Take it home (Chapter 3)
- **Home:** SFPUC rain barrel rebate up to $100 per barrel (max two, ≥ 50 gal); cistern up to $350. Teaching moment with our own model: in the 2022-12-31 storm (OAK hourly), a 50-gallon barrel under a downspout draining 25 m² of roof is full after about 3 hours of rain, ~10 hours before the biggest hour (simple bucket, no roof losses) — "later isn't less" again. (Note 2026-10-25: the dollar amounts were removed from the game's on-screen text, to keep the budget in teaching units.)
- **Park:** volunteer days; stay on official trails (an everyday behaviour the brief mentions).
- **Local planning:** SF Youth Commission (members 12–23 at appointment; advises the Board of Supervisors and the Mayor; the Board must refer youth matters to it for comment); a 60-second public comment from the proposal card; SF Community Challenge Grants (latest announced round: 25 projects, up to $150,000 each, including youth-led greening). State that none of these bodies endorses the game.
- **Precedent for the optional extension:** Boston's Youth Lead the Change — youth aged 12–25 vote on $1 million of the city's capital plan.

## < 3 months and non-profit
- Have: static web app (core needs no server), re-runnable data script, 30 tests.
- Month 1: one codebase, content and claims review, accessibility, Spanish and Chinese, teacher guide.
- Month 2: pilot with 2–3 classes or youth programmes, with the assessment above.
- Month 3: site-pack recipe (terrain, weather, soil, land cover; global open data first) and a second site's data pack.
- Maintenance: static hosting, no database, no accounts, AI optional; choose an open licence after data licences are checked; no ads, paywall or data sales.

## 3-minute demo (outline at the time)
- 0:00 Block by Block: endless resources, no consequences; UNCCD asked for the opposite. Aerial island → game island: "This canyon is real."
- 0:20 Ch1: she wants butterflies. Native grass or trees? Predict, fast-forward the 2021 drought, three islands side by side: "Restoration isn't more trees."
- 1:10 Ch2: New Year's Eve 2022 storm; the garden is full before the biggest hour; water fate; swap the storm: "Later isn't less." This water heads downstream.
- 1:50 Ask the AI a what-if; numbers come from the engine, with sources.
- 2:15 Proposal card and LDN check; three things to do.
- 2:40 How learning is measured; < 3 months to a classroom pilot; open, non-profit; same engine, new site pack.

## Sources
- InVEST UFRM uses the Curve Number method, λ = 0.2: https://community.naturalcapitalalliance.org/t/initial-abstraction-value-urban-flood-risk-mitigation-model/1688
- SDG 15.3.1 Good Practice Guidance v2 (2021), one-out-all-out: https://www.unccd.int/sites/default/files/library/1768_UNCCD_GPG_SDG-Indicator-15.3.1_version2_2021.pdf
- LDN scientific conceptual framework (Cowie, Orr et al. 2018): https://www.unccd.int/index%2Ephp/resources/unccd-library/land-balance-scientific-conceptual-framework-land-degradation-neutrality-0
- Default dataset resolutions (CEOS 2022): https://ceos.org/sdg/files/supportsheets/SDG_15.3.1_EO_Satellite_Data_Requirements_31Aug2022.pdf
- SFPUC Lower Alemany fact sheet (2025): https://www.sfpuc.gov/sites/default/files/documents/SSIP_LowerAlemanyArea_FactSheet_2025.pdf
- SF Youth Commission: https://sfbos.org/youth-commission
- SFPUC rain barrel and cistern rebate: https://www.sfpuc.gov/learning/how-you-can-help/rain-barrel-and-cistern-rebate
- SF Community Challenge Grants: https://www.sf.gov/news-mayor-lurie-city-administrator-chu-announce-33-million-in-funding-for-neighborhood-beautification-projects
- Boston Youth Lead the Change: https://content.boston.gov/node/43586
