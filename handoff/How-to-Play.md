# Neutral Ground — How to Play

2026-10-25 · Copy of the online doc (https://claude.ai/artifact/S72bDtDyjcuqmQR9rwxQw8)

## What Neutral Ground is

Neutral Ground is a 6–8 minute browser game: you have three autumns to get a real San Francisco canyon ready for a real storm.

You play Juno, the new canyon keeper at Glen Canyon Park. The island you walk on is built from 5 m lidar terrain and real land cover. The weather you play through is the real daily record for October 2020 to September 2023, ending with the New Year's Eve 2022 storm.

It was made for the UNCCD challenge at Hack for Social Impact 2026. It is aimed at players aged 15–24, and runs on a laptop or a phone with no install.

## Controls

You walk your character and press one big button; the game shows what to press when you need it.

| Action | Laptop | Phone |
| --- | --- | --- |
| Walk | W A S D or arrow keys, or click the ground | Tap the ground |
| Do the action shown | Space or E, or click the big orange button | Tap the big orange button |
| Look around | Drag to turn the view, scroll to zoom | Drag to turn, pinch to zoom |
| Pick a tool (trees, shortcut, rain garden) | Tool bar at the bottom | Tool bar at the bottom |

Four guides always say what to do next:

- **Task list** (top left): this autumn's jobs, ticked off as you go. The next one glows.
- **Hint line** (top centre): one sentence from Maya about the next step.
- **Yellow arrow**: bounces over the place to walk to, such as the golden slope or Leo.
- **Action button** (bottom right): changes with where you stand: Plant here, Talk to Leo, Field note, The shortcut, or Water them.

## Your mission: three stars

You win a star for each goal you reach by 30 September 2023; all three together give the Neutral Ground ending.

| Star | What it takes (teaching model) | Whose ask |
| --- | --- | --- |
| Grow the meadow | At least 1,000 m² of native grass established on the east slope, with no net loss of grassland | Maya |
| Beat the storm | The storm's biggest hour into the Rec Center drain stays at or under 100 m³ (doing nothing gives 107.3 m³) | Ms. Chen |
| Help 3 neighbours | At least 3 of the 4 neighbours get what they asked for | All four |

The lines (1,000 m², 100 m³) are game rules set for this prototype. Whether you reach them is computed by the model from your choices and the real weather.

## How each season works

Each autumn runs the same loop: do your jobs, play the year, read the result.

1. **Autumn.** Do the jobs on your task list: plant, water or wait, talk to neighbours, build. Actions spend your budget: 16 tokens for the whole game, plus 60 hours of volunteer sweat and 900 m³ of water each year. These are teaching units, not dollars.
2. **Start the year.** Press Play the year, then confirm. Your autumn plan is locked in.
3. **The year plays.** The real weather of that year runs day by day, in about 17 seconds. A meter shows how many seedlings are alive. If they get thirsty, the game stops and asks: water now, or let them be. You can still walk over and water them later.
4. **Result on 30 September.** A card shows what survived, your meadow level, one lesson, and what other choices would have done in the same weather.
5. **Next autumn.** After the third autumn, the year plays on to the New Year's Eve 2022 storm.

## Walkthrough

A full season takes 6–8 minutes: an opening, three autumns, then the storm.

### Opening

- A flash-forward to 31 December 2022: 139 mm of rain in one day (observed). Then a rewind to autumn 2020.
- Maya tells you that you are the new canyon keeper. Storms wash soil off bare ground; native grass roots hold it.
- The mission card shows your three stars and the controls.

### Autumn 2020: plant, then meet Leo

1. Stand on the golden slope and press Plant here. Each press sows 250 m² for 1 token.
2. Choose: water the seedlings through their first summer (costs water and sweat), or wait.
3. Leo walks up the shortcut and waves. Walk over and talk to him.
4. Optional: plant trees, decide the shortcut (keep, close or reroute), or test the soil.
5. Play the year. 2020–21 was a drought year: 230 mm of rain fell downtown.

### Autumn 2021: one move

- Re-sow the patches where seedlings died, or plant shade trees by the Rec Center lawn for Leo. You get one move this autumn.
- Before the year you may guess what the model will show. Three right guesses earn the Forecaster badge.

### Autumn 2022: the Rec Center

- Meet Ms. Chen and Coach Rivera at the Rec Center; each makes a request.
- Build a rain garden (pick a size, then a spot from A to F) or a roof tank.
- Play on to New Year's Eve.

### The storm: 31 December 2022

- The storm plays hour by hour at the Rec Center, with a live gauge of water reaching the drain.
- Tap This is the peak! at the hour you think is the biggest.
- The storm result shows whether the biggest hour stayed under Ms. Chen's line of 100 m³. The season then ends on 30 September 2023 with one of eight endings.

## Your neighbours

Four fictional neighbours each ask for one thing, and some asks pull against each other.

| Neighbour | Who they are | What they ask | Done when (teaching model) | Helping them also |
| --- | --- | --- | --- | --- |
| Maya | Nature-area volunteer | Bring the native grass back on the east slope | 1,000 m² or more established by 30 Sept 2023, with no net loss of grassland | No trees on the grassland and the shortcut closed or rerouted: her volunteers add sweat hours in later years |
| Leo | Day-camp counselor | Shade by the lawn for his campers, and keep their way down the slope | 4 or more shade trees alive on 30 Sept 2023, and the way down not cut (open or rerouted) | Shade trees planted: camp families add sweat hours |
| Coach Rivera | Youth soccer coach | Save roof water for the field when the dry season starts | 10 m³ or more in the roof tank on 1 May 2023 | Build the large tank: the team chips in 1 token |
| Ms. Chen | Lives downhill from the Rec Center | Less water rushing to the drain in the big storm | The storm's biggest hour into the drain is 100 m³ or less | Nothing extra; she watches the result |

The neighbours are simulated characters, not real residents. Their lines react to what the model computed and never add numbers of their own.

## The eight endings

The model decides your ending on 30 September 2023 from three things: the slope, the storm and how many neighbours you helped. There is no random roll.

| Ending | What happened | How to reach it |
| --- | --- | --- |
| Neutral Ground | Grass back, storm under the line, three or more neighbours helped | Bring the grass back, keep the storm's biggest hour under the line, and help at least three neighbours |
| A Season of Trade-offs | Some of what you set out to do worked; some did not | Bring the grass back and beat the storm, but help fewer than three neighbours |
| Grassland Returns | Native grass came back on the east slope; the storm's biggest hour went over the line | Bring the grass back, but leave the Rec Center over the line |
| Storm Ready | The storm's biggest hour stayed under the line; the slope changed little | Beat the storm without bringing the slope back |
| The Peak Got Through | You built at the Rec Center, and the biggest hour still went over the line | Build, but not where it catches the biggest hour |
| Greener, Not Better | Trees went in on the grassland; the slope got greener and the grassland smaller | Plant trees on the grassland |
| The Long Dry | The 2020 planting met a very dry year and most of it died | Sow in 2020, don't water through the dry year, and don't sow again |
| Quiet Canyon | You left the canyon as it was; it still changed with the weather | Make no moves at all |

Every ending card is the same size: Neutral Ground is the challenge goal, not the only right answer. Endings you have found stay in your Collection on the title screen.

## What you learn while playing

Every lesson comes from something you do and then watch play out in real weather; nothing is a quiz.

| You do | You see (model, real weather) | The lesson |
| --- | --- | --- |
| Sow native grass on the bare slope | Grass cover holds soil; bare ground and open trail wash hardest on storm days | Ground cover is the first defence against land degradation |
| Water the seedlings, or not | In the 2020–21 drought, most unwatered seedlings die; watered ones mostly survive | Timing is water: restoration in a dry year needs aftercare |
| Plant trees on the grassland | The slope turns greener while the grassland shrinks | Restore the right kind of land, not just more green |
| Keep, close or reroute the shortcut | A trampled path stays bare; a reroute keeps a way down | People's needs and the land both count |
| Build a rain garden or roof tank | The storm's biggest hour into the drain drops; held water still reaches the drain later | Slowing runoff lowers the peak; later isn't less |
| Guess before a year | The model answers your guess | Predict first, then check against the data |
| Read Same weather, other choices | Bars for other plans in the same year | The weather is fixed; your choices change the outcome |

The Science panel adds a land check inspired by Land Degradation Neutrality: avoid loss first, then reduce it, then reverse it, and balance losses only within the same kind of land. It is a teaching indicator, not an official assessment.

## Levels, badges and collecting

Your progress stays in this browser, so the island you come back to shows what you have done.

- **Meadow level.** After each year your meadow levels up by the native grass alive: Seedbed, Sprouting (200 m²), Young meadow (600), Meadow (1,100), Lush meadow (1,700), Wild meadow (2,400). The levels are game steps; the area alive is planted area times the model's survival.
- **Badges.** There are 18, from Forecaster (three good guesses) to Storm Reader (call the storm's peak hour). Three are warning badges, such as Muddy Boots: the slope washed out more than doing nothing.
- **Field notes.** Walk up to a real named place near the park and press Field note. Find five for the Neighbourhood Explorer badge.
- **Decorations.** Some badges put a prop on your island for good.

| Decoration | Earned with |
| --- | --- |
| Trail signpost | Trail Diplomat: reroute the shortcut after Leo speaks up |
| Watering cans | Watered Through: 70% or more of a watered planting survives |
| Rain gauge | Storm Reader: call the peak hour while the storm plays |
| Bench in the shade | Right Tree, Right Place: shade trees by the lawn, none on the grassland |
| Weather vane | Forecaster: three guesses right |
| Common Ground flag | Common Ground: all four neighbours' quests in one season |
| Neighbourhood map board | Neighbourhood Explorer: five real places found |

## What is real, what is the model, what is fiction

The place and the weather are real, the outcomes come from a simple teaching model, and the people are fictional.

| Layer | What it is | Source |
| --- | --- | --- |
| Terrain | 5 m lidar bare-earth surface, 2023 | USGS 3DEP |
| Land cover | 10 m land-cover map, 2021 | ESA WorldCover |
| Paths, lawns, trails, named places | Map features | OpenStreetMap |
| Buildings, park boundary | Footprints | DataSF |
| Soils | Soil map units | USDA NRCS SSURGO |
| Daily rain, Sept 2020 to Sept 2023 | Downtown San Francisco station, 3.7 km away | NOAA GHCN-Daily (USW00023272) |
| Hourly storm rain, 31 Dec 2022 | Oakland and SFO airports | NOAA ISD/LCD |
| Evaporation | Reference evapotranspiration (model output) | Open-Meteo ERA5 |
| Aerial photo (photo layer only) | 2024 imagery | USDA NAIP |
| Satellite greenness (display only) | Monthly NDVI | Sentinel-2 |
| Management zones | 2006 plan, historical and approximate | SF Recreation and Park Department |

**The model.** Seedling survival comes from a daily soil-water balance on the real rain. Storm runoff is computed hour by hour for every 5 m cell and routed downhill to the drain; rain gardens and tanks fill and overflow. Erosion is a relative index, never tonnes.

**Fiction.** Maya, Leo, Coach Rivera, Ms. Chen and Juno are simulated characters, and the ending pictures are labelled AI illustrations. Budgets are teaching tokens, not dollars.

**Not modelled.** Flooding downstream, pipes, groundwater, fire, and any animal or species numbers.

## Tips, and running it with a class

Play once without help; the second run is where most players find a better ending.

**Tips for a first play**

- 2020–21 is a drought year. Decide about watering before you press Play.
- Reroute the shortcut: it closes the old line for Maya and keeps a way down for Leo.
- Shade trees belong by the Rec Center lawn, not on the grassland.
- Put the rain garden where the most water runs, before the storm's biggest hour.
- After a result, Try 2020 again shows what one change would do in the same weather.

**For a class (about 20 minutes)**

1. Students play once on their own, 6–8 minutes.
2. Ask: which ending did you get, and which choice made the difference?
3. Students play again, aiming for a different ending.
4. Discuss: why did more trees not help? Why does a rain garden lower the storm's peak but not the total? Where is the real Glen Canyon?
5. Open Science in the game to see the model and its data sources.

**How to open it.** Use the web link, or double-click `dist-single/neutral-ground.html` to play offline. For a fresh start, use a private window, or clear the Collection on the title screen.
