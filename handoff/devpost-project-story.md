## Inspiration

In the largest survey of its kind (Hickman et al., *The Lancet Planetary Health*, 2021), 59% of 10,000 people aged 16–25 in ten countries were very or extremely worried about climate change, and more than half felt powerless. Lectures don't fix powerlessness. Agency does.

So we asked: what if a teenager could take a real piece of land, in its real weather, and watch their own choices change what happens to it? The UNCCD's idea of **Land Degradation Neutrality** (*avoid, reduce, reverse* degradation, and never offset one kind of land against another) turned out to map neatly onto game rules.

We chose **Glen Canyon Park in San Francisco**, a place you can find on a map, and gave it a real boss fight: the New Year's Eve 2022 storm, when downtown San Francisco recorded **139 mm of rain in a single day** (NOAA).

## What it does

**Neutral Ground** is a 6–8 minute web game for players aged 15–24. It opens with the storm, then rewinds to autumn 2020: you have three autumns to get the canyon ready.

- Walk your character across a toy-like 3D island built from real lidar terrain.
- Sow native grass, water seedlings, deal with a trampled shortcut, build a rain garden or a tank, and help four (fictional) neighbours with their requests.
- The real 2020–2023 weather then plays back day by day, including the 2021 drought, while you run over to water thirsty seedlings and see what survives.
- The storm plays hour by hour. Three goals give three stars, and there are 8 endings, 18 badges and "what if?" replays.

Every number on screen is tagged *model* or *observed*. Nothing is invented.

## How we built it

- **Data (all public):** USGS 3DEP 5 m lidar, ESA WorldCover land cover, OpenStreetMap paths and places, DataSF buildings and park boundary, USDA SSURGO soils, NOAA GHCN-Daily rainfall (Oct 2020 – Sep 2023), NOAA hourly airport records for the storm, Open-Meteo ERA5 evapotranspiration, and SF Recreation and Park's 2006 management zones (historical). Everything sits on one 5 m grid of 211 × 280 cells.
- **Model:** a small, explainable TypeScript model that runs in the browser. Seedlings live or die by a daily FAO-56-style soil-water balance on the recorded rain. Storm runoff is computed hour by hour for every cell with the SCS curve-number method:

$$Q = \frac{(P - 0.2S)^2}{P + 0.8S} \quad \text{for } P > 0.2S, \qquad S = \frac{25400}{CN} - 254 \ \text{(mm)}$$

  The water then follows the steepest path down the real terrain to a garden or the drain. Tests check that every ending can be reached.
- **Game:** Vite, React 18, TypeScript, three.js with React Three Fiber, and zustand. It ships as one 13.5 MB static file that also plays offline on a phone: no server, no accounts, no data collected.
- **Art:** character art made with Higgsfield (GPT Image 2.5), turned into rigged, animated 3D figures with Meshy image-to-3D, and slimmed with gltf-transform.
- **Testing and AI help:** automated Playwright playthroughs at laptop and phone sizes, plus real first-time players. We used Claude as a partner for research, code, copy and bug audits, but no AI ever writes a number in the game.

## Challenges we ran into

- **"This is a teaching video, not a game."** Our first playtests were brutal. It "looked like Google Maps" and "felt like a PowerPoint"; players asked *where is this, why am I here, what do I do?*, and a whole year passed in two clicks. We rebuilt the first minute the way hit games do: the storm first, a character you control, one context button, a mission card with three stars, a task list, a go-here arrow, and years that start only when you're ready.
- **Drama without dishonesty.** We wanted big moments but refused to draw anything the model doesn't compute: no floods, no animals, no species claims. The neighbours are labelled as simulated, budgets are teaching tokens rather than dollars, and the land check is *inspired by* LDN, never an official SDG 15.3.1 assessment.
- **Making real weather playable.** Three years of daily rain had to feel like a story, so we replay it at 22 days per second while the island changes and you react.
- **Shipping one file.** Our 3D characters vanished inside a sandboxed viewer that blocks `data:` URLs, so we now decode the models from base64 and parse them in memory.

## What we learned

- The first 60 seconds decide everything. Show, don't tell, and never leave a player wondering what to do next.
- Real data hits differently in a real place. When unwatered seedlings die in the 2021 drought, it's because that drought actually happened.
- Constraints make better design. "No invented numbers" pushed the trade-offs into the rules instead of the text: planting trees makes the slope greener, but shrinks the grassland.

## What's next

Playtests with youth groups, a 45-minute lesson guide for teachers, Spanish and Chinese versions, an accessibility check, and a "new place" recipe so other communities can rebuild the game around their own land.

---

*Neutral Ground was made by **Team Will-Ai** (Hao Dong Yuan & Chieh Lin Chung) for Hack for Social Impact 2026, UNCCD challenge. A terrain-and-model prototype existed before the event and was disclosed to the organizers; the game season, onboarding and characters were built during the hackathon.*
