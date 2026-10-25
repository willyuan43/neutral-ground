# Neutral Ground — status (2026-10-25, Sunday ~13:05 PDT)

This is for Hack for Social Impact 2026: the Climate track, UNCCD challenge (Sat 10/24 – Sun 10/25, Wefunder HQ, SF).

**Single source of truth:** the folder `C:\Users\willy\Projects\neutral-ground` on the linked computer. This note only points there; if they disagree, the folder wins. The day-by-day log is `prototype/NOTES.md`.

## Demo package (ready ~13:05)

| What | Where |
| --- | --- |
| Game, final demo build (v12) | https://claude.ai/artifact/N2KNRSqUg41rRKYGAdUKvA (original account only) |
| Offline copy | `prototype/dist-single/neutral-ground.html` (13.5 MB; double-click to play) |
| Presentation, 15 slides | https://claude.ai/artifact/R1ZppPoApW5f64iYmniE7G (original account); local copy in `prototype/handoff/presentation/` |
| How to Play guide | https://claude.ai/artifact/S72bDtDyjcuqmQR9rwxQw8 (original account); local copy in `prototype/handoff/How-to-Play.md` and `.docx` |

**Presentation slides:**

1. Cover
2. Why (Lancet 2021 youth survey)
3. The idea
4. Real data
5. The model
6. Game mode
7. How it hooks young players
8. Player journey
9. Neighbours
10. What players learn
11. Eight endings
12. Honest by design
13. Tools
14. Research and iteration
15. Play it / next steps

## Before the demo

- Open the game in a private window, or clear the saved progress (Title → Collection → "Clear the collection", tap twice). The browser remembers endings, badges and decorations from rehearsals.
- The save-picture buttons show the picture in an overlay inside the artifact viewer (it blocks downloads). They download normally from the offline file.

## What the game is now

- **You play Juno:** WASD / arrows / click on desktop, tap on phones; the camera follows.
- **One context action button** (Space or E): Plant here, Talk to Leo, Field note, The shortcut, Water them.
- **Guide layer:**
  - A storm flash-forward (observed 139 mm on 31 Dec 2022), then a rewind to autumn 2020.
  - A "where" chip.
  - A mission card with three stars and the controls.
  - A task list with a countdown to the storm.
  - Neighbour request cards.
  - A bouncing go-here arrow.
  - Three stars on the ending.
- **No accidental year skips:** "Play the year" stays disabled until the 2020 tasks are done, then asks to confirm. There is no bet in year 1.
- **Fix:** the 3D characters now load inside the artifact viewer. GLBs are decoded from base64 rather than fetched, and their textures load through `<img>`.

## Working notes for whoever builds next

- **Where to work.** Work in a cloud copy. Never `npm install` in the shared folder. Write back changed files only, and compare device hashes with the baseline before writing back.
- **Screenshots.**
  - Take them from `vite preview` (port 4173).
  - Start them with `tools/shotbg.sh` and stop them with `tools/shotkill.sh`. Run one at a time.
  - `?shot&hold=storm` holds the cold open.
- **Test hooks (only with `?shot`):** `__ngGround(r, c)` walks you there, `__ngTeleport(r, c)` moves you there, and `__ngSpots` lists where the figures stand.

## Never

- Modify any BAYLINK repo.
- Read, print, copy or commit the key in `app/.env.local`.
- Let an LLM produce numbers or comparisons on its own.
- Claim species outcomes or draw animals arriving.
- Draw outcomes the model does not compute (flooding, dry ground, dust, water quality).
- Present the LDN check as an official assessment.
- Present fictional neighbours as real residents.
- Write outside `prototype/`.
