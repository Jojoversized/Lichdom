# Development checklist

Legend: [x] done · [~] partial / simplified · [ ] to do. Update this file at the end of every session.

## Foundation
- [x] Phaser 3.80 + TypeScript + Vite project, GitHub Pages workflow
- [x] Pixel-perfect rendering at 2× texel density (even screen zoom, camera zoom × canvas zoom), pixelArt/roundPixels
- [x] Hi-res finishing pass for all art (`tools/assets/hires.mjs`): silhouette Scale2x, form shading, selective outline, unblocking of huge sprites
- [x] Terrain and decals painted at texel resolution (rounded cobbles, 1-texel grass, dithered soil)
- [x] Asset pipeline: procedural painters → PNG sheets + manifest; synthesized SFX → WAV
- [x] Folder structure: `assets/sprites/{units,enemies,bosses,summons,towers,fortifications,environment,effects}`, `assets/ui/icons`, `assets/audio/{sfx,music}`, `assets/data`
- [x] CLAUDE.md, checklist, test harness (smoke, ui_flow, bot)
- [ ] Enable `strict` TypeScript and type the entity model fully
- [ ] Unit tests for pure systems (stats curves, card pool, flow field)

## AI-assisted art (Dreamina)
- [x] Pipeline adopted: Dreamina (Seedream 5.0 Lite + reference) → Remove BG → `import_ai_sprite.py` → `manifest_ai.json`
- [x] AI detail tier: res 4 texels/world px (same world size, 2× detail); crisp at zoom ≥ 4, smooth below
- [x] Imported: Skeleton Warriors, Zombie Horde, Necromantic Acolyte (cleric), Death Knight (haunted armor), Undead Wendigo (new)
- [ ] Tier 2/3 forms for imported units (currently tiers 2–3 keep procedural art; Wendigo reuses one sheet)
- [ ] Real animation poses (currently derived from one pose: bob, squash, lean)
- [ ] Remaining undead tiers, crusaders, towers, keep, tiles, spell FX

## Roster
- [x] Random starting roster per campaign: 1 front-line + 1 ranged + 1 wild card (`startingRoster` in campaign.ts)
- [x] Undead Wendigo: fastest undead, lifesteal, hunts ranged/caster/healer mortals first
- [x] Unit unlocks: Soul Well "Unearth a Crypt" opens a picker (choose the type; a squad rises). Cost (450 + 400×opened) × 1.07^wave
- [x] Unit details: hover = summary with roster comparison bars; right-click (Army cards, crypt picker) or "Unit details" on a selected undead = full sheet (squad totals, value per 100 souls, abilities, evolutions)
- [x] `UNIT_ORDER` auto-appends any unit missing from the preferred order (fixed: Wendigo was unlockable but not recruitable)
- [ ] Wendigo-specific card modifiers

## Army behaviour & animation
- [x] Field-filling formation: stable R2 posts per unit id, grows with the host up to midfield; melee front, ranged rear, flyers over the front; collapses to the gate while a boss is on the field
- [x] Post hysteresis (arrive ≤3 px, march again only when >12 px away) + slow drift: no walk/idle flicker
- [x] Per-unit animation phase; AI sprites: 4-frame breathing idle, striding walk, wind-up/lunge attack
- [x] Fixed: zooming out left part of the screen black (canvas CSS size / camera viewport)

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
- [x] Autonomous army AI: guard line weighted to hot roads (with formation depth for big hosts), urgency/travel/crowding target assignment, ranged kiting, wounded retreat-and-mend at the keep, flyers hunt flyers, taunters dive, no piecemeal charges into distant boss kill-zones
- [x] 20 mortal types across 4 factions; 6 bosses with abilities; champions every 5 waves; adaptive crusade
- [x] Walls/barricades/lava/runes/cauldrons/wards; climbers, rams, catapults, flyers
- [x] All slain undead (recruits and summons) revive free at wave end
- [x] **No army cap**: recruits come in squads of ≥ 5 (squad-size upgrades: cards, Legions, Ossuary Expansion); summons permanent
- [x] Crusade Fervor scales enemies to the whole host (recruits + summons) beyond a free allowance; bosses use √Fervor
- [x] Universal targeting — every unit, tower and enemy can hit flyers and ground alike
- [x] Random undead: random starting squad type, Call of the Crypt, Unbidden Dead, Forgotten Crypt, unlock cards grant a squad
- [ ] Per-unit "stance" hints (optional, no micromanagement) — e.g. favour a road

## Progression
- [x] Three-choice level-ups, 5 rarities, ~80 cards incl. modifiers and legendaries
- [x] Offers never contain two tiers of the same upgrade family (better tier kept, worse rerolled; checked by the bot)
- [x] Soul Well: Ascensions (repeatable ×1.12 dmg/hp, ×1.08 souls, +1 squad size), insight, mend, revive, frenzy, Call of the Crypt, summons, emergencies
- [x] Incremental curves: enemy HP ×1.135/wave, bounty ×1.08/wave, per-copy cost scaling (towers ×1.2, squads ×1.12 per squad bought)
- [x] 8 spells, Life Essence, 49-node Phylactery tree, 5 fortresses, 20 achievements, codex
- [x] Save/continue (localStorage), resume mid-wave at that wave's prep
- [ ] Prestige layer beyond Life Essence (e.g. "Dread" multiplier per boss tier cleared)
- [ ] Offline/idle progress between sessions (classic incremental feature)
- [ ] Balance pass with human playtests (v0.3 bot baseline: no meta dies at wave 10 boss ~¼ of runs, otherwise ~18–24; maxed meta reaches ~wave 53 with ~6,700 undead)
- [ ] Squad formations / banner per squad (squads currently dissolve into the host)

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
- Painters still author shapes on the 1× grid; the 2× pass adds rounding and shading but not new hand-placed detail. Next art step: native 2× painters for the most-seen units (skeleton, footman, knight).
- Uncapped hosts reach 2,000+ undead by wave 30 with max meta (~3 ms/step simulation); rendering that many sprites + shadows on weak GPUs needs an effects-quality preset (e.g. drop shadows/lights for small units).
