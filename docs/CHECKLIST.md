# Development checklist

Legend: [x] done · [~] partial / simplified · [ ] to do. Update this file at the end of every session.

## Foundation
- [x] Phaser 3.80 + TypeScript + Vite project, GitHub Pages workflow
- [x] Fixed integer-zoom pixel rendering (480×270 target view), pixelArt/roundPixels
- [x] Asset pipeline: procedural painters → PNG sheets + manifest; synthesized SFX → WAV
- [x] Folder structure: `assets/sprites/{units,enemies,bosses,summons,towers,fortifications,environment,effects}`, `assets/ui/icons`, `assets/audio/{sfx,music}`, `assets/data`
- [x] CLAUDE.md, checklist, test harness (smoke, ui_flow, bot)
- [ ] Enable `strict` TypeScript and type the entity model fully
- [ ] Unit tests for pure systems (stats curves, card pool, flow field)

## Battlefield
- [x] Keep on far left; crusade enters from the right (3 roads → 5 at waves 12 and 20)
- [x] Seeded map: roads, obstacles (trees, rocks, ruins), braziers/crystals, graves, debris
- [x] Dithered localized lighting, additive glow, persistent blood/scorch/corpse decal layer
- [x] Camera pan (drag/WASD) and integer zoom (wheel)
- [ ] Hand-authored map variants per fortress (currently one generator with themed palettes)
- [ ] Drifting fog layer (existed in v1 prototype; not yet ported to Phaser)

## Combat & entities
- [x] 8 towers × 3 tiers with distinct behaviours and evolved abilities
- [x] 13 recruitable undead (3 forms each), 6 summon packs (Legion ×12, Wraiths ×8, Colossus ×2, Abomination ×2, Devourer ×2, Dragon ×1)
- [x] Autonomous army AI: guard line weighted to hot roads, urgency/travel/crowding target assignment, ranged kiting, wounded retreat-and-mend at the keep, flyers hunt flyers, taunters dive
- [x] 20 mortal types across 4 factions; 6 bosses with abilities; champions every 5 waves; adaptive crusade
- [x] Walls/barricades/lava/runes/cauldrons/wards; climbers, rams, catapults, flyers
- [x] All slain undead (recruits and summons) revive free at wave end
- [x] Summons are permanent and uncapped; Crusade Fervor scales enemies to the summoned host
- [ ] Per-unit "stance" hints (optional, no micromanagement) — e.g. favour a road

## Progression
- [x] Three-choice level-ups, 5 rarities, ~80 cards incl. modifiers and legendaries
- [x] Soul Well: Ascensions (repeatable ×1.12 dmg/hp, ×1.08 souls), insight, mend, revive, frenzy, summons, emergencies
- [x] Incremental curves: enemy HP ×1.135/wave, bounty ×1.08/wave, per-copy cost scaling (towers ×1.2, recruits ×1.05)
- [x] 8 spells, Life Essence, 49-node Phylactery tree, 5 fortresses, 20 achievements, codex
- [x] Save/continue (localStorage), resume mid-wave at that wave's prep
- [ ] Prestige layer beyond Life Essence (e.g. "Dread" multiplier per boss tier cleared)
- [ ] Offline/idle progress between sessions (classic incremental feature)
- [ ] Balance pass with human playtests (bot baseline: no meta dies ~wave 14–28; maxed meta reaches 70+)

## UI
- [x] Collapsible build drawer (▼ Hide / B key / click active tab)
- [x] Modals dim and hide the HUD; ✕ close buttons; Esc closes; tooltips topmost
- [x] Info panel inside the right column (cannot overlap other HUD)
- [x] Unit inspection (click an undead) shows its current AI orders
- [ ] Settings: save export/import code (existed in v1 prototype)
- [ ] Controller / touch polish

## Audio
- [x] 39 synthesized SFX as WAV assets; live ambient score with war drums during waves
- [ ] Recorded/composed music tracks in `assets/audio/music`

## Repository / workflow
- [x] GitHub repo `Jojoversized/Lichdom`; CI build verified on GitHub Actions (npm install → assets → tsc → vite build)
- [ ] **Enable GitHub Pages** (repo Settings → Pages → Source: *GitHub Actions*) so the deploy job can publish the playable build
- [ ] Link the local folder `C:\Games\Lich Claude` to git (Claude's tools cannot write `.git/`): see README "Local setup"

## Known issues
- Fonts load from Google Fonts; offline they fall back to Georgia/Courier.
- Large summons and bosses use a scaled humanoid painter and look chunkier than small units.
- Very late waves (60+) with 200+ undead are heavy on low-end CPUs; consider effect-quality presets.
