# Neutral Ground

**A real storm is coming.** Neutral Ground is a 6–8 minute web game for players aged 15–24. You have three autumns to get a real San Francisco canyon ready for a real storm.

Made by **Team Will-Ai** (Hao Dong Yuan & Chieh Lin Chung) for **Hack for Social Impact 2026 · UNCCD challenge**.

- ▶ **Play offline:** download [`play/neutral-ground.html`](play/neutral-ground.html) and open it in a browser. It is one 13.5 MB file and needs no install.
- 📖 **How to play, the presentation and the full project notes:** [`handoff/`](handoff/)

## What it is

The game is set in Glen Canyon Park, San Francisco, and built on real data:

- 5 m lidar terrain
- real land cover
- the recorded 2020–2023 weather, including the 2021 drought and the New Year's Eve 2022 storm (138.7 mm of rain in one day downtown, NOAA)

You walk your character and:

- sow native grass
- water seedlings
- deal with a trampled shortcut
- build a rain garden or a tank
- help four simulated neighbours

Then the real weather plays back, and the storm arrives hour by hour. Three goals give three stars, and there are 8 endings.

The land check is inspired by the UNCCD's Land Degradation Neutrality: avoid > reduce > reverse, with no offsetting between kinds of land. It is a teaching check, not an official SDG 15.3.1 assessment.

## Run it

```bash
npm install
npm run dev           # local dev server
npm run build         # type-check and build to dist/
npm run build:single  # also writes dist-single/neutral-ground.html (one offline file)
npm test              # model tests (every ending can be reached)
```

**Not included:** the SF Recreation and Park 2006 management-zone layer (`public/data/zone.u8` and `public/data/zones.json`) is withheld until its redistribution licence is checked. Ask the team for these two files to run the game from source.

## How it works

- **`src/model/`:** a small, explainable model that runs in the browser.
  - Seedlings: a daily FAO-56-style soil-water balance.
  - Storm runoff: hourly SCS curve-number runoff for every 5 m cell, routed down the steepest path to a garden or the drain.
  - Rain gardens and tanks: simple buckets.
- **`src/stage/`:** the 3D island (three.js with React Three Fiber).
- **`src/ui/`:** the screens, the guide layer and the campaign.
- **`public/data/`:** the prepared public data on one 5 m grid of 211 × 280 cells. `scripts/prep-data.mjs` prepares it.

## Data (all public)

| Layer | Source |
| --- | --- |
| Terrain, 5 m lidar bare earth | USGS 3DEP |
| Land cover, 10 m | ESA WorldCover |
| Paths, trails, places | OpenStreetMap |
| Buildings, park boundary | DataSF |
| Soils | USDA NRCS SSURGO |
| Daily rain, Oct 2020 – Sep 2023 | NOAA GHCN-Daily, downtown SF (USW00023272) |
| Hourly rain, 31 Dec 2022 | NOAA ISD, Oakland airport (OAK) |
| Reference evapotranspiration | Open-Meteo ERA5 (model output) |
| Management zones, 2006 (historical) | SF Recreation and Park |
| Aerial photo, greenness (display only) | USDA NAIP, Sentinel-2 |

## Honest by design

- **Numbers:** every number comes from data or the model and is tagged *observed* or *model* on screen. No AI writes numbers.
- **Outcomes:** only computed outcomes are drawn. There are no floods, dust, water quality, animals or species claims.
- **Fiction is labelled:** the neighbours are labelled "Simulated neighbor", and the ending pictures are labelled AI illustrations.
- **Money:** budgets are teaching tokens, not dollars.

## Built with

- **Game:** Vite, React 18, TypeScript, three.js with React Three Fiber, and zustand.
- **Testing:** Vitest and Playwright.
- **Characters:** art made with Higgsfield (GPT Image 2.5), turned into 3D with Meshy image-to-3D, and slimmed with gltf-transform.
- **AI help:** Claude helped with research, code, copy and bug audits.

## Notes

A terrain-and-model prototype was made just before the event and disclosed to the organizers. The canyon season, onboarding and characters were built during the hackathon.

The day-by-day log is in `NOTES.md` (Chinese). No license has been chosen yet.
