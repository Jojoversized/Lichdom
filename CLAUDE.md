# LICH — Eternal Dominion · Project guide for Claude

Dark-fantasy **incremental roguelite tower defense** built with **Phaser 3 + TypeScript + Vite**.
You are the Lich; the keep stands on the far **left** of the map and the mortal crusade
marches in from the **right** along up to five roads.

Development checklist (what's done, what's next, known bugs): **`docs/CHECKLIST.md`** — keep it updated every session.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server (hot reload) | `npm run dev` → http://localhost:5173 |
| Type-check | `npm run typecheck` |
| Production build → `dist/` | `npm run build` |
| Regenerate all art + sound | `npm run assets` |
| Preview a build | `npm run preview` |

GitHub Pages: every push to `main` runs `.github/workflows/deploy.yml` (install → assets → build → deploy).

### Testing without npm (used by Claude's sandbox)
`tools/test/` contains a zero-dependency harness:
1. `tsc -p . --outDir build --noEmit false` (needs `node_modules/phaser` with its `types/`)
2. `python3 tools/test/serve.py 8765` — serves `/play.html` (index.html + import map for Phaser, resolves extension-less imports, maps `/assets` to the site root like Vite)
3. Playwright scripts (Chrome, `--use-gl=swiftshader`):
   - `tools/test/smoke.py` — boot, start campaign, run a wave, screenshots
   - `tools/test/ui_flow.py` — real clicks through build, drawer, level-up, Soul Well, save/reload, codex
   - `tools/test/bot.py [maxWave] [runs] [metaMax]` — automated campaigns for balance/regression (also asserts no duplicate upgrade tiers in offers)
   - `tools/test/closeup.py [outdir] [zoom] [w] [h]` — staged skirmish screenshot for art/render review
   - `tools/test/showcase.py [out.png] [zoom] [w] [h] [marchMs]` — every crusader type + boss in rows, paused (enemy art review)
   - `tools/test/strategy.py '<json configs>' [runs] [maxWave]` — player-model bot (tier, focus unit, card policy, econ-first, walls) for testing strategies seen in real-run analytics
   - `LICH_AN_OUT=runs.json tools/test/bot.py …` also saves analytics records → `python3 tools/analytics/report.py runs.json`
   - `tools/test/balance.py '<json configs>' [runs] [maxWave]` — unit balance: campaigns restricted to fixed undead types (solo/combo), same spending policy, no towers/walls (`LICH_PORT=8766` to run against a frozen copy of the build while you keep editing)

`window.__LICH` exposes the state `G` and every system function for tests.

## Pixel-art standards (do not drift)

- **World cell:** 16 px. Map 64 × 40 cells (1024 × 640 world px; 96 before v0.9). All gameplay coordinates are world px.
- **Texel density:** art is authored at **2 texels per world px** (`TEXEL_RES` in `src/config/zoom.ts`,
  `RES` in `tools/assets/hires.mjs`, `res` in the manifest). Every sheet sprite, shadow, the terrain and the
  decal canvas are drawn at scale ½; the light buffers live at texel resolution too.
- **Rendering:** Phaser `pixelArt: true`, `roundPixels: true`, scale mode NONE. Screen px per world px
  `Z` = largest **even** integer with ≥ 480 × 270 world px visible (user zoom steps through every integer),
  split into canvas zoom `pz` and camera zoom `cz` (smallest divisor ≥ 2 of Z; camera origin 0,0).
  For even Z each texel covers whole screen pixels.
- **Character scale (world px):** humanoid H = 22 (feet at frame bottom); elites 24–26; large units 30–34;
  bosses 40–46; summons up to 54. Sheets are 2× those sizes in texels; the manifest `H` stays in world px.
- **Palette:** `assets/data/palette.json` / `PAL` in `src/config/constants.ts`. Dark, desaturated world
  (charcoal, mud, muddy green); saturated colour is reserved for magic: necro green `#5dff7a`, fire `#ff8a1e`,
  holy `#fff3c4`/gold, frost `#9fe6ff`, arcane `#b26bff`, blood `#7a1414`.
- **Finishing pass (`hires.mjs`), applied to every sheet frame and icon:** silhouette-only Scale2x (interior
  details stay crisp) → form shading at 2× (height field from silhouette + colour regions, light from the
  upper left, 4 bands, Bayer dither, warm highlights / cool shadows, emissive magic colours unshaded) →
  1-texel selective outline (`#08090b` tinted by the wrapped colour). Huge sprites (H ≥ 38) are also
  "unblocked" (their doubled pixels are re-rounded near the silhouette). `LICH_LORES=1` regenerates the old 1× look.
- Lighting is dithered/quantized (5 bands, Bayer 4×4) — never smooth gradients. FX lines/rings are 1 texel.

## Asset pipeline

All art and sound are **procedurally authored** in code and exported to real files:

- `tools/assets/pixelcanvas.mjs` — dependency-free software canvas + PNG/WAV encoders.
- `tools/assets/hires.mjs` — 2× finishing pass (Scale2x, form shading, selective outline, unblocking).
- `tools/assets/painters.mjs` — every painter (humanoid generator, horses, dragons, siege engines,
  towers, keeps, props, fortifications, icons) and the sprite specs. **Edit art here.**
- `tools/assets/gen-sprites.mjs` — writes sheets into `assets/sprites/**` and `assets/data/manifest.json`.
- `tools/assets/gen-font.py` — builds `assets/fonts/LichNumerals.ttf` (pixel digits; needs Python fontTools; the TTF is committed).
- `tools/assets/gen-audio.mjs` — synthesizes SFX into `assets/audio/sfx/*.wav` (+ `assets/data/sfx.json`).
- Output is deterministic (seeded). Commit regenerated assets.

Sheet layout: one horizontal strip per character: `idle(2) walk(4) atk(3) cast(2)` (dragons 4/4/3/4);
the manifest stores `fw, fh, anims{name:[start,count]}, H`. Towers: 12 frames = 3 tiers × 4.
Runtime-only textures (light falloff, enemy ground rings) are made in `src/render/textures.ts`.

```
assets/
  sprites/units | enemies | bosses | summons | towers | buildings | fortifications | environment(/props) | effects
  fonts (Lich Numerals)
  ui/icons
  audio/sfx | audio/music (ambient score is synthesized live — drop tracks here later)
  data/manifest.json, palette.json, sfx.json
```

## AI-assisted art (Dreamina) — the adopted art pipeline

Imported AI art never overwrites generated assets. It is layered at boot:
- **Generate** in Dreamina (Seedream 4.6, 2 credits/image, 4 images per run; Seedream 5.0 Lite was retired in Nov 2026;
  the original style reference attached).
  Generate *on the reference's dark battlefield* (a flat chroma background pushes the palette bright and
  cartoony), one character, facing right, ¾ top-down. Then **Remove BG** (2 credits) and download the cutout.
- **Keep the original** in `art_source/dreamina/<asset>_vN/` (`cutout.png` + `meta.json` with prompt, model,
  credits). `art_source/` is outside `assets/`, so it is not shipped.
- **Import**: `python3 tools/assets/import_ai_sprite.py <cutout> <key> --H 24 [--override <sprite key>]`
  → resample to **H×4 texels** (`--res 4`, the AI detail tier: same world size, twice the detail), palette-quantize, keep emissive glows, 1-texel selective outline, derive the
  idle/walk/atk/cast strip, write `assets/sprites/<category>/ai/<key>.png` and `assets/data/manifest_ai.json`.
- **Runtime**: BootScene merges `manifest_ai.json`; `overrides` maps an existing sprite key to the imported
  sheet (`enabled: false` or removing the entry restores the procedural art). New-content sheets (e.g. `wendigo`)
  always load. Each sheet's `res` sets its draw scale (1/res). Res-4 textures use NEAREST filtering when a
  texel covers ≥ 1 screen px (zoom ≥ 4, default at 1080p) and LINEAR below that (smooth downsampling,
  `WorldRenderer.updateDetailFilters`).
- **Imported so far (all 14 allied units):** skeleton, zombie, acolyte (skeleton cleric), deathknight (haunted
  armor), wendigo (new unit); v0.6.1: archer, pikeman, bonemage, wraith, banshee, vampire, wyvern, abomination,
  golem (prompts in each `meta.json`, styled after the wendigo); v0.7: the Lich (`lich_v1`) and the necropolis
  fortress (`fortress_v1`, original + cutout); v0.10: **crusaders** — 6 bosses (`boss_*_v1`) and 7 strong units
  (`crusader_*_v1`), all made by `tools/assets/crusader_batch.py` (prompts, heights, overrides). Credits remaining: 122.
- **Crusader prompt recipe**: same style preamble, then "an enemy of the undead lich's army: a [soldier|champion] of the holy
  human crusade, a direct foil to the undead. Worn, battle-scarred ivory and tarnished gold, weathered steel, off-white cloth
  stained with mud and soot, deep crimson trim, and soft warm holy-light glows (pale candle gold) where the undead have
  necrotic green; still muted and gritty enough to sit on the same dark battlefield." (Mage-conclave units: arcane violet.)
  Words like "slayer"/"hunter" with weapons can trip the content filter — describe the role, not the violence.
- **Shadows**: Remove BG keeps the painted ground shadow; run `tools/assets/strip_shadow.py <cutout> <out>` before importing
  (`--grow 0` when dark armour touches the shadow, `--keep-dist` larger for floating props).
- **Fortress**: `python3 tools/assets/import_fortress.py <original> <cutout>` places the art unscaled and unwarped at
  x = 0 (keep the AI art's proportions — warping it looked stretched), writes `sprites/buildings/ai/fortress.png` and
  the generated `src/data/fortress_fit.ts` (per-row wall face = solid cells; torch/window/portcullis lights detected by
  colour — flames have g/r < 0.65, the yellowed bones must not glow). Gameplay geometry (gate, Curtain/Bulwark arcs,
  defence radius, KEEP gate cells, Soul Well) is in `src/data/fortress.ts`, `config/constants.ts` and
  `makeWallSites`/`makePlots` in mapgen; tower mounts are made on demand (`mountAt` in systems/keep.ts).
  Composition prompts that worked: "flat map view, no horizon", wall "shaped like a ')' bracket from the very top
  edge to the very bottom edge" (a plain "three-quarter angle" prompt gives isometric perspective shots).
- Prompts are long: typing them into the prompt box freezes the page — set the text with JS
  (`document.execCommand('selectAll')` + `insertText` on the focused editor). Remove BG sometimes doesn't start or says
  "No object detected": wait ~10 s after opening it, re-select the node, press Generate again.
- Batch workflow that works: in the 'Undead lich army pixel art' session, *Edit prompt* on an earlier entry (keeps
  the reference; pick Seedream 4.6 and the ratio), set the image count, queue several prompts; then per image: detail view →
  *Edit on canvas* → select node → *Remove BG* → Generate → select cutout → download → stage from Downloads.
  `import_ai_sprite.py` drops stray specks (the generator's corner 'AI' badge) before cropping.



```
src/
  main.ts                 Phaser game config, debug handle
  config/                 constants (map, keep, lanes, palette), zoom, manifest registry
  core/                   util (rng, math, SpatialHash, MinHeap, Pool), state (G), events (hooks)
  data/                   pure game data: units/summons, enemies/bosses, towers/forts, spells/Soul Well, meta tree/achievements/dialogue, fortresses
  world/mapgen.ts         seeded map gen (roads right→left), runtime terrain painting, flow fields, build checks
  systems/                SIMULATION (no Phaser/DOM):
    stats.ts              derived stats, incremental cost & wave curves, Crusade Fervor, building levels (bld)
    keep.ts               materials, foundations, tower/building construction & upgrades, ruins
    ramparts.ts           preset wall sites (build/upgrade/repair)
    combat.ts             spawning, damage, deaths, corpses, projectiles, hazards, status effects
    ai.ts                 mortal AI, autonomous undead army planner, towers, forts, the Lich
    campaign.ts           new/load campaign, wave generation, wave-end revival, spells, Soul Well, step()
    cards.ts              level-up card pool
    events.ts             roguelite layer: crusade tiers, story events, tithes/curses/war buffs
    progression.ts        XP, codex, achievements, bosses slain, defeat/essence, meta purchases
    bosses.ts             boss abilities/intros
    fx.ts                 particle/ring/bolt/text data (+ visual step)
    analytics.ts          run analytics (per-wave records + decisions, localStorage, JSON export)
    save.ts               localStorage persistence
  render/                 WorldRenderer (all Phaser objects), textures (lights, pixel font)
  audio/                  SFX playback via Phaser, live ambient score
  ui/                     DOM UI (ui.ts) + styles.css
  scenes/                 BootScene (manifest → assets), GameScene (loop, input)
```

Key rules:
- **Simulation is pure data in `G`.** Systems never create Phaser objects or touch the DOM; they call
  `hooks` (`core/events.ts`) for messages/sfx and push to `G.retired` / `G.decalQueue` for the renderer.
- Fixed 1/30 s simulation steps (`step()`), multiplied by game speed; rendering every frame.
- Entities are plain objects (`Ent`); the renderer lazily attaches `view`/`shadow` sprites.
- Pathing: Dijkstra flow fields from the keep (normal + climber). Walls/towers add cost; enemies batter
  blocking structures. `map.dirty = true` triggers recompute.
- UI layering (z-index): HUD 20 · toasts 30 · modal 100 (dims & hides HUD) · screens 150 · tooltip 300.
  The info panel lives inside the right column so it can't overlap other HUD.

## Coding conventions

- TypeScript, ES2022 modules, 2-space indent, single quotes, semicolons.
- `strict` is currently off (ported code); new code should be typed — tightening is on the checklist.
- Data tables stay in `src/data`; balance curves live in `systems/stats.ts`.
- Name things after the game fiction (souls, Life Essence, Fervor, keep, crusade).
- Never break save compatibility silently: bump `SAVE_*` keys in `systems/save.ts` if the format changes.
- After any change: typecheck, run smoke + ui_flow, run the bot for balance changes, update `docs/CHECKLIST.md`.

## Current status

v0.10 — **crusader AI art**: Dreamina sprites for all 6 bosses and 7 strong crusader units (holy foil palette), shadow
stripping for Remove BG cutouts, `tools/test/showcase.py`.

v0.9.1 — balance from the first real-run export: Fervor = wave schedule × **zeal** (each Holy War +3.5%, lasting) ×
**host pressure** (host soul value above `1200 + 60·wave²`, ^0.4, max ×2.5); repeat card picks drawn less often
(×0.55 weight per earlier pick of the family); 8 new unique cards; `tools/test/strategy.py` player-model bot.

v0.9 — **run analytics** for balance work (Settings → Run analytics → Export JSON; `tools/analytics/report.py`; the bot can
dump the same format with `LICH_AN_OUT`), render/AI performance for 3k+ hosts (culling, change-only sprite updates, Blitter
shadows, sliced planner), map shortened to 64 columns, fast mortals escort slow/siege units.

v0.8.1 — HUD modifier strip and floating soul/material gains, end-of-wave summary (damage and kills per unit type /
tower / spell, losses), materials income 3 + 1 per 5 waves, Skirmish keeps full materials.

v0.8 — **roguelite layer**: choose the crusade before every wave (Skirmish / Crusade / Holy War: size vs. spoils) and a
story event with three choices every 3 waves (`data/events.ts`, `systems/events.ts`, state in `run.rogue`).

v0.7.2 — wider wall rings and defence zone (the host answers ranged foes shooting into it), towers on any built rampart
section, faster materials (cheaper towers, dearer buildings), Soul Well crypts priced by unit strength, Ossuary Expansion
removed (squad size only from level-up cards).

v0.7.1 — fortress art at its original proportions (no warping), correct torch/window lights; **gate-centred defence**:
Curtain + Bulwark rampart arcs around the gatehouse (materials), **towers stand on top of built wall segments**,
buildings on foundations behind the walls, the host holds and fights inside the Bulwark (`DEFENSE_R`); save v6.

v0.7 — **the Lich and the necropolis**: Dreamina Lich atop the gatehouse; a colossal fortress spans the map's
left edge (curtain wall top-to-bottom, citadel cut off by the frame) and the gameplay follows the painted wall
(`data/fortress.ts`, generated `fortress_fit.ts`): curtain rampart arc, bailey plots, Soul Well in the bailey, save v5.
Bone Golem retuned (it was strictly worse than the Abomination on paper).

v0.6.1 — AI art for the whole allied cast (9 new Dreamina units, 72 credits).

v0.6 — **keep construction**: towers are no longer bought with souls or placed freely; a slow second
currency, **materials** (after each wave), builds towers and 8 permanent **keep buildings** (army-wide bonuses)
on fixed foundations around the keep (`data/buildings.ts`, `systems/keep.ts`, plots in mapgen). New pixel
numeral web font **Lich Numerals** for every number in the DOM UI (`tools/assets/gen-font.py`).

v0.5 — unit balance pass from solo/combo simulations (investment-based squad cost escalation,
Vampire/Golem nerfs, Pikeman/Skeleton buffs, boss AoE caps, host commits to bosses shelling the line),
preset **Ramparts** (click-to-build/upgrade wall sites: keep ring + two field lines, 3 tiers) replacing
free-form wall painting, **flat Crusade Fervor** (×1.03/wave, ignores the host), readable texel-resolution
digits for world-space numbers.

v0.4.1 — crypt picker (choose unit unlocks), unit detail sheets (hover/right-click), field-filling formation
with post hysteresis (no walk/idle flicker), reworked derived animations, zoom-out black-screen fix.

v0.4 — Dreamina art pipeline adopted (5 AI-art units, res-4 detail tier), new Undead Wendigo unit,
random 3-type starting roster per campaign (front-line + ranged + wild card; more via level-ups and the Soul Well).

v0.3 — hi-res art pass and uncapped squads, on top of v0.2 (Phaser/TS port, left keep / right crusade,
autonomous undead AI, free wave-end revival, incremental curves, Soul Well Ascensions):
- Every sprite, icon, shadow, the terrain and the decals are 2× texel density with rounded silhouettes,
  volume shading and thin selective outlines; renderer uses camera zoom for texel-perfect output.
- **No army cap at all.** Each recruit buys a squad (≥ 5; skeletons/zombies 8, archers/pikemen 6).
  Squad size grows via Mass Graves/Necropolis cards, the Legions meta node and the Ossuary Expansion Ascension.
  Random undead: a random extra squad type at campaign start, Call of the Crypt (Soul Well),
  Unbidden Dead / Forgotten Crypt cards, unit-unlock cards now include a free squad.
- Upgrade offers never show two tiers of one family (`fam` on cards; the better tier is kept, the other rerolled).
- Universal targeting: everything can hit everything (no flying/ground restrictions anywhere).
- Enemy scaling: Crusade Fervor now counts the whole host (recruits + summons) with a free allowance;
  bosses scale with √Fervor; holy adaptation retuned for hundreds of undead; the army planner keeps
  ordinary undead out of boss kill-zones far from the keep.
- Performance: 16/24 px spatial-hash cells, staggered capped crowd separation, formation depth, planner
  considers the 90 most urgent threats (~3 ms/step at 1,900 undead).
See `docs/CHECKLIST.md`.
