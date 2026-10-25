# Neutral Ground — redesign v2 (2026-10-25)

## Why: what the user said (playtest by Crystal, 2026-10-24/25)

The user quit at the first two screens. Recorded shortcomings, in their words where possible:

1. **"Looks like Google Maps."** The game opens on the NAIP satellite photo draped on the terrain. There is no game feel.
2. **No lead-in.** The first thing asked is "which of 4 neighbours do you help first". Players don't know why they are here or what to do. No guidance and no immersion.
3. **Abstract cards on a "Google map".** Four cards sit over the photo. Players can't tell what a card does or what happens when they pick one.
4. **People are paper cut-outs.** The 2D billboard standees are "completely unacceptable". The user had authorised all Higgsfield tools (3D, video…) and expected them to be used.
5. **Feels like a PowerPoint.** Choosing is random, and there is too much text that nobody reads.

Independent reviewer, round 3: 6.5/10 (Mia 15 → 5, Daniel 19 → 7, Ms. Ortiz 38 → 8, Sam 24 → 7).

## Research takeaways

- **User's references** (video contact sheets):
  - A chunky floating-island farm with a soil cross-section, cartoon trees, clouds below, and a HUD with quests, resources and build icons.
  - A bridge-builder mobile game: coin counter, priced cards, hand-pointer tutorial, emoji reactions.
  - A tiny planet; a castle above the clouds at night with warm windows; Harbor Jelly's toy harbour; a terrarium sim ("you set the environment, life writes the story").
- **Roblox FTUE:**
  - Teach the essentials, get to the fun fast, leave players wanting more.
  - Order: controls → core loop → early reward → goals → a moment of joy.
  - The worst failure: the player doesn't know what to do or why.
- **Onboarding tactics (playio):**
  - Core play within 60 s, the aha moment within 90 s.
  - A first-run tour of at most 2 steps, skippable; an early achievement.
- **Terra Nil:**
  - Tools visibly change the land; levels are finite; it is optimistic, not preachy.
  - Trade-offs are built into the rules, not explained in text.
- **Gen Z (YPulse 2025):**
  - Roblox, Minecraft, Fortnite.
  - Cozy and stress-relief games (Block Blast, Candy Crush).
  - Social play.

## The plan

- **A. Real place, toy look.**
  - The default terrain is painted from land cover (grass, scrub, trees, rock, paths) with soft hillshade and warm light.
  - The satellite photo is a "reveal the real place" layer and moment, not the base.
  - Toy houses, chunky stylised trees, turquoise water. The camera stays close on the slope (the play board).
- **B. Story-led onboarding.** Replace the 4-neighbour picker with:
  - A cinematic swoop-in to the slope.
  - Maya (3D) waves: "My slope is washing away."
  - A hand pointer on the slope: tap to sow. Seeds burst, sprouts pop, +1.
  - Then "Play the year".
  - Other neighbours appear in context (Leo at the trail in year 2, Ms. Chen and Coach before the storm).
- **C. Tools, not cards.**
  - A bottom tool bar with icons; tools unlock over time (Seeds first, then Water, Trail, Trees, Garden).
  - Picking a tool lights up where it can be used on the island, with a pointer and a 1-line hint.
  - Every tap gives instant juice: particles, a cost pop, and an emoji reaction from the neighbour it helps.
- **D. Real 3D people.**
  - Higgsfield `image_to_3d` (Meshy), rigged and animated (idle, wave, walk), from stylised full-body art.
  - GLBs are loaded with drei `useGLTF` and `useAnimations`.
- **E. Text diet.**
  - Paragraphs become one line plus icons.
  - Results become big visual bars, a face reaction and one sentence.
  - Lesson lines stay, short.
- **F. Carry-over from round 3:**
  - The storm should be visible on the island.
  - The planting is too small in the frame.
  - The phone layout while planning.
  - Neighbour reactions during replays.
  - The ending art shows a tank when none was built.

The hard constraints are unchanged (model-only numbers, no species claims, fictional neighbours labelled, teaching tokens).

## What came after (added 2026-10-25 13:30)

A later third-party playtest said players still didn't know where they were, why, or what to do, and that it felt like "a teaching video, not a game". So the game got:

- A player-controlled character.
- Context actions at your feet.
- A storm flash-forward.
- A mission card with three stars.
- A task list.
- Neighbour request cards.
- A go-here arrow.
- Gated, confirmed year starts.

See `../HANDOFF.md` section 4.
