# Neutral Ground · Hold the Canyon (prototype)

> **接手或换账号？先读 [`handoff/HANDOFF.md`](handoff/HANDOFF.md)**：整个过程、现在的状态、规则、怎么构建和同步，以及幻灯片和游戏简介的副本。New here or on another account? Start with `handoff/HANDOFF.md`.


A playable game on the real ground of Glen Canyon Park, San Francisco (the source of Islais Creek): one **canyon season** (the trial version, 6–8 minutes) plus the original three puzzles as challenge levels.
Real lidar terrain, real storms and a real drought; every number in the game is computed by a small, open model in `src/model/`.

> This prototype was made before the event, on 2026-10-23 to 24, and will be disclosed to the organizers; whether the official version reuses it follows the organizers' rules.

## Run it on Windows

Node.js v24 (v22 also works). In PowerShell:

```
cd C:\Users\willy\Projects\neutral-ground\prototype
npm install
npm run dev
```

Then open the address shown in the terminal in Chrome (usually http://localhost:5173).

Other commands:

| Command | What it does |
|---|---|
| `npm run dev:lan` | Same as `npm run dev` but reachable from a phone on the same Wi-Fi. Only on a network you trust: a dev server can serve files from your disk to anyone who can reach it (not at the venue) |
| `npm test` | The original 30 checks (curve numbers, the 4 + 36 roof-tank check values, water balance, tank level at the storm start, guess bins, level calibration, level-3 survival and LDN rules) plus the canyon season’s rules |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run prep-data` | Re-make `public/data/` from `../data/` and `../content/` (read-only; never writes there) |
| `npm run solve` | Run every allowed layout of each level through the model and print the calibration tables |
| `npm run build:single` | Build, then pack everything (JS, CSS, fonts, all of `public/data/`) into one file: `dist-single/neutral-ground.html` |

No-install fallback: `dist-single/neutral-ground.html` is the whole game in one file — double-click it to play in Chrome or Edge without `npm install`.

Vite 5 needs Node 18 or newer (your v24.18.0 is fine). Nothing needs a key or a network connection once installed — all data is in `public/data/`.

Look and feel: each level is a floating low-poly island cut from the real lidar terrain (real building footprints, Islais Creek from OpenStreetMap where it runs open). **Science Mode** (top right) shows sources, formulas and qualifiers; the satellite button drapes the NAIP aerial photo on the same island. The title screen has a **Graphics: high / fast** button: high adds soft shadows and ambient occlusion; fast turns them off (touch devices start on fast).

Deep links for demos: `#campaign` (the canyon season), `#level1`, `#level2`, `#level3`, `#levels`, `#about`. Keys in a level: **R** restart, **Z** undo, **Enter** run, **Space** skip.

## The canyon season (trial version)

**PLAY** on the title screen. You decide in three autumns — 2020 (the main step), 2021 (one card) and 2022 (storm prep) — and the real weather that followed plays out: the east slope day by day (downtown SF daily rain + ERA5 reference evapotranspiration, Oct 2020 → Sept 2023), and the New Year’s Eve 2022 storm hour by hour at the Rec Center (OAK airport hourly rain). The two places are different parts of the park: no water flows between them in the model; they share one budget (tokens, and each water year’s sweat and water). Four fictional neighbours each ask for one thing the model can check; one guess per autumn; compare with doing nothing at any time; one of eight endings; a proposal card with your own sentence and evidence cards.

- Rules: `src/campaign/campaign.ts` (maps cards onto the unchanged model; budgets, allies, quests, endings, snapshots and “revise once”). Content: `src/content/` (neighbours, predictions, endings, evidence, Juno). Screen: `src/ui/campaign/`, `src/ui/Proposal.tsx`.
- Calibration: `npx tsx scripts/solve-campaign.ts 16` (quests and endings per budget) and `npx tsx scripts/solve-campaign.ts --report` (the four T9 criteria, ~3 minutes). Results are in `NOTES.md`.
- Tests: `npm test` runs the original checks plus the season’s (one budget for both places, the storm identical to level 2, the tank experiment, revisions never charge twice, every ending reachable, predictions judged by the model, evidence numbers equal the model output). Tests show the code follows its rules — not that the model matches the park.

### The look (Saturday-night upgrade)
- The island **is Glen Canyon Park**: its outline is the real park boundary (DataSF), grown ~30 m so the first streets and houses show. One island for every view; the camera moves between the east slope and the Rec Center (`src/stage/ParkIsland.tsx`).
- Ground colours are the real land cover (or the model state a level paints) per 5 m cell, blended smoothly; the park carries the NAIP aerial's fine detail. Trees grow only on real canopy cells; rocks only on real bare/rock cells. Houses are DataSF footprints at their lidar height, with simple windows that glow during the night hours of the New Year's Eve storm (the light follows that day's real clock: sunrise 07:25, sunset 17:00).
- Illustrations (characters, cards, endings, icons, title) were made for this prototype with Higgsfield (GPT Image models): fictional people, no animals, no ponding. They live in `public/art/` (from `assets-in/ng-art-pack.json` via `node scripts/import-art.mjs`); every one has a drawn fallback.
- "Where we are": a relief map of San Francisco from AWS Terrain Tiles (USGS 3DEP and other public sources) with OpenStreetMap parks, bridges and places, and a pin on the park (`src/ui/WhereMap.tsx`).

## The three levels

| Level | Real weather | What you do | What it teaches |
|---|---|---|---|
| 1 · Where does the water go? (easy) | SFO airport hourly rain, 2023-01-04 (42.0 mm; biggest hour 12.2 mm), ~15 km away | Put one rain garden where the water runs | Water follows the ground |
| 2 · The Long Storm (hard) | OAK airport hourly rain, 2022-12-31 (127.7 mm; biggest hour 17.8 mm), ~19 km away | Combine gardens, a roof tank, roof disconnection and permeable paving on a budget; two goals | A full garden can't catch the peak; later isn't less; avoid before you reduce |
| 3 · Neutral Ground (very hard) | Downtown SF daily rain + ERA5 ET0, 2020-10 → 2023-09 (a 230 mm water year, then three storm days ≥ 50 mm) | Restore the east slope with sweat, water and tokens; pass a teaching LDN check | Restoration isn't more trees; the dry season decides survival; losses must be balanced within the same kind of land |

## What is real data and what is a teaching assumption

Real (observed or published) data: the 5 m lidar terrain (USGS 3DEP 2023), the 2024 NAIP aerial photo, ESA WorldCover 2021 land cover, OpenStreetMap paths, courts, lawns and trails, DataSF building footprints and park boundary, USDA soil map units and hydrologic groups, NOAA rain (downtown SF daily; OAK and SFO airport hourly), Open-Meteo ERA5 reference evapotranspiration (a model output), Sentinel-2 monthly greenness (display only), the 2006 management-plan zones (approximate, partial, historical).

Teaching assumptions (all in `src/model/assumptions.ts`, each with value, range, unit and tier): rain-garden depths, porosity and inlet efficiency; bottom infiltration by soil group (A 50, B 20, C 5, D 1 mm/h); underdrain rate; roof assumed piped to the drain; tank sizes and release rate (design choices); the tank's level when a storm starts (empty on 1 October, then filled by the real downtown daily rain day by day — a "keep" tank is already full when the New Year's Eve 2022 storm begins); soil water capacity where the soil survey has none (120 mm/m, range 80–160); seedling root depth and crop coefficient; the survival rule `s = clamp(0.85 − 0.008 × severe-stress days, 0.1, 0.85)`; relative erosion factors; the LDN teaching check (water, erosion and matching area compared with doing nothing in the final water year, within each kind of land; ±2 % band; one indicator worse = net loss); costs in tokens, sweat and water, and every game target and budget. Generic table values (curve numbers, FAO-56 Kc, USLE C) come from the project's G7 table and their mapping to local covers is an assumption.

The interface labels results "Prototype model · teaching assumptions". Game goals are picked from the model's own result distribution (see `NOTES.md`) so each level has answers; they are not real-world standards. The model is not a forecast, an engineering design or a measurement of the park. It does not model pipes, culverts or flooding downstream, travel time, re-infiltration on the way downhill, groundwater, species or animal numbers.

## Credits and licences

- Terrain: U.S. Geological Survey, 3D Elevation Program (public domain)
- Aerial photo: USDA NAIP 2024 (public domain)
- Land cover: © ESA WorldCover project 2021 / contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover consortium (CC BY 4.0)
- Map features: © OpenStreetMap contributors (ODbL 1.0)
- Building footprints (drawn as massing at their lidar median height) and park boundary: DataSF, City and County of San Francisco (Open Data Commons PDDL 1.0)
- Soils: Soil Survey Staff, NRCS, USDA (public data)
- "Where we are" relief: AWS Terrain Tiles (Mapzen/terrarium; USGS 3DEP and other public sources); parks, bridges and places: © OpenStreetMap contributors (ODbL), via Nominatim
- Illustrations: generated for this project with Higgsfield (GPT Image 2 / 2.5); all characters fictional
- Rain: NOAA National Centers for Environmental Information (downtown SF USW00023272; Oakland and San Francisco airport hourly records)
- Reference evapotranspiration: Open-Meteo.com, ERA5 (CC BY 4.0; free tier non-commercial)
- Satellite greenness: contains modified Copernicus Sentinel-2 data, processed by the project team (G9)
- 2006 management zones: San Francisco Recreation and Park Department, Significant Natural Resource Areas Management Plan (2006); approximate partial digitisation by the project (redistribution licence of the plan map unresolved — keep this prototype private until checked)
- Fonts: Fredoka and Inter (SIL Open Font License), bundled with @fontsource
- Icons: Lucide (ISC licence); rendering: three.js, React Three Fiber, drei, postprocessing and N8AO (MIT)
- The only photo is the NAIP 2024 aerial image (public domain).

`public/data/manifest.json` lists every input file with its SHA-256 and source ID.
