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
   - `tools/test/bot.py [maxWave] [runs] [metaMax]` — automated campaigns for balance/regression

`window.__LICH` exposes the state `G` and every system function for tests.

## Pixel-art standards (do not drift)

- **World cell:** 16 px. Map 96 × 40 cells (1536 × 640 world px).
- **Rendering:** Phaser `pixelArt: true`, `roundPixels: true`, scale mode NONE with **integer zoom**:
  zoom = ⌊min(window/480, window/270)⌋ (+ user zoom). Canvas = window ÷ zoom. Camera zoom stays 1.
- **Character scale:** humanoid H = 22 px (feet at frame bottom); elites 24–26; large units 30–34; bosses 40–46; summons up to 54.
- **Palette:** `assets/data/palette.json` / `PAL` in `src/config/constants.ts`. Dark, desaturated world
  (charcoal, mud, muddy green); saturated colour is reserved for magic: necro green `#5dff7a`, fire `#ff8a1e`,
  holy `#fff3c4`/gold, frost `#9fe6ff`, arcane `#b26bff`, blood `#7a1414`.
- Every sprite gets a 1-px `#08090b` outline plus the form-shading pass (`shadeCanvas`).
- Lighting is dithered/quantized (5 bands, Bayer 4×4) — never smooth gradients.

## Asset pipeline

All art and sound are **procedurally authored** in code and exported to real files:

- `tools/assets/pixelcanvas.mjs` — dependency-free software canvas + PNG/WAV encoders.
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

## Architecture

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

v0.2 — Phaser/TypeScript port of the v1 prototype with: left-side keep, right-side crusade,
autonomous undead AI (no rally flags), uncapped permanent summon packs balanced by Crusade Fervor,
free revival of everything slain at wave end, incremental cost/strength curves, repeatable Soul Well
Ascensions, collapsible build drawer and non-overlapping popups. See `docs/CHECKLIST.md`.
