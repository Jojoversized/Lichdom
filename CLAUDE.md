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

`window.__LICH` exposes the state `G` and every system function for tests.

## Pixel-art standards (do not drift)

- **World cell:** 16 px. Map 96 × 40 cells (1536 × 640 world px). All gameplay coordinates are world px.
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
- `tools/assets/gen-audio.mjs` — synthesizes SFX into `assets/audio/sfx/*.wav` (+ `assets/data/sfx.json`).
- Output is deterministic (seeded). Commit regenerated assets.

Sheet layout: one horizontal strip per character: `idle(2) walk(4) atk(3) cast(2)` (dragons 4/4/3/4);
the manifest stores `fw, fh, anims{name:[start,count]}, H`. Towers: 12 frames = 3 tiers × 4.
Runtime-only textures (light falloff, enemy ground rings) are made in `src/render/textures.ts`.

```
assets/
  sprites/units | enemies | bosses | summons | towers | fortifications | environment(/props) | effects
  ui/icons
  audio/sfx | audio/music (ambient score is synthesized live — drop tracks here later)
  data/manifest.json, palette.json, sfx.json
```

## AI-assisted art (Dreamina) — the adopted art pipeline

Imported AI art never overwrites generated assets. It is layered at boot:
- **Generate** in Dreamina (Seedream 5.0 Lite, 6 credits/image, the original style reference attached).
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
- **Imported so far:** skeleton (Skeleton Warriors), zombie, acolyte (skeleton cleric), deathknight (haunted
  armor), wendigo (new unit). Credits remaining after this session: ~204.



```
src/
  main.ts                 Phaser game config, debug handle
  config/                 constants (map, keep, lanes, palette), zoom, manifest registry
  core/                   util (rng, math, SpatialHash, MinHeap, Pool), state (G), events (hooks)
  data/                   pure game data: units/summons, enemies/bosses, towers/forts, spells/Soul Well, meta tree/achievements/dialogue, fortresses
  world/mapgen.ts         seeded map gen (roads right→left), runtime terrain painting, flow fields, build checks
  systems/                SIMULATION (no Phaser/DOM):
    stats.ts              derived stats, incremental cost & wave curves, Crusade Fervor
    combat.ts             spawning, damage, deaths, corpses, projectiles, hazards, status effects
    ai.ts                 mortal AI, autonomous undead army planner, towers, forts, the Lich
    campaign.ts           new/load campaign, wave generation, wave-end revival, spells, Soul Well, step()
    cards.ts              level-up card pool
    progression.ts        XP, codex, achievements, bosses slain, defeat/essence, meta purchases
    bosses.ts             boss abilities/intros
    fx.ts                 particle/ring/bolt/text data (+ visual step)
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
