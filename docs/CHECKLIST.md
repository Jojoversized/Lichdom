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
- [x] 8 towers × 3 tiers with distinct behaviours and evolved abilities (v0.6: built with materials on the keep's foundations)
- [x] 13 recruitable undead (3 forms each), 6 summon packs (Legion ×12, Wraiths ×8, Colossus ×2, Abomination ×2, Devourer ×2, Dragon ×1)
- [x] Autonomous army AI: guard line weighted to hot roads (with formation depth for big hosts), urgency/travel/crowding target assignment, ranged kiting, wounded retreat-and-mend at the keep, flyers hunt flyers, taunters dive, no piecemeal charges into distant boss kill-zones
- [x] 20 mortal types across 4 factions; 6 bosses with abilities; champions every 5 waves; adaptive crusade
- [x] **Ramparts (v0.5)**: walls are built on preset sites, click to build/upgrade (Bone Palisade → Stone Wall → Bone Rampart with spurs). Sites: keep ring (North / Gate / South, closes on the map edge, encloses the Soul Well) and two full-height lines (Inner x=24, Outer x=36, 5 segments each). A closed line must be breached; gaps funnel the crusade. Destroyed sections stay rubble until the site is repaired. Site cells are reserved (no towers/decor). `systems/ramparts.ts`, `makeWallSites` in mapgen
- [x] Barricades/lava/runes/cauldrons/wards still painted freely; climbers, rams, catapults, flyers
- [x] All slain undead (recruits and summons) revive free at wave end
- [x] **No army cap**: recruits come in squads of ≥ 5 (squad-size upgrades: cards, Legions, Ossuary Expansion); summons permanent
- [x] **Crusade Fervor is a fixed schedule (v0.5)**: ×1.03 per wave (compounding), independent of the host, so every upgrade is real strength over the crusade (bosses use √Fervor)
- [x] Universal targeting — every unit, tower and enemy can hit flyers and ground alike
- [x] Random undead: random starting squad type, Call of the Crypt, Unbidden Dead, Forgotten Crypt, unlock cards grant a squad
- [ ] Per-unit "stance" hints (optional, no micromanagement) — e.g. favour a road

## Progression
- [x] Three-choice level-ups, 5 rarities, ~80 cards incl. modifiers and legendaries
- [x] Offers never contain two tiers of the same upgrade family (better tier kept, worse rerolled; checked by the bot)
- [x] Soul Well: Ascensions (repeatable ×1.12 dmg/hp, ×1.08 souls, +1 squad size), insight, mend, revive, frenzy, Call of the Crypt, summons, emergencies
- [x] Incremental curves: enemy HP ×1.135/wave, bounty ×1.08/wave, per-copy cost scaling (towers ×1.2; squads: ×1.12 per 300 souls of base cost per squad bought, i.e. by souls invested — cheap hordes +6%, golems +31%)
- [x] 8 spells, Life Essence, 49-node Phylactery tree, 5 fortresses, 20 achievements, codex
- [x] Save/continue (localStorage), resume mid-wave at that wave's prep
- [ ] Prestige layer beyond Life Essence (e.g. "Dread" multiplier per boss tier cleared)
- [ ] Offline/idle progress between sessions (classic incremental feature)
- [ ] Balance pass with human playtests (see the Balance section for the v0.5 bot baselines)
- [ ] Squad formations / banner per squad (squads currently dissolve into the host)

## Keep construction (v0.6)
- [x] **Materials**: slow currency, earned after each wave (1, +1 per 10 waves, +3 for a boss, +1 per Bone Quarry level); start with 6. HUD counter + tooltip
- [x] **Fixed foundations** (2×2 plots, reserved = 5): front cluster flanking the gate approach, rear clusters hugging the keep ring; candidates on roads are dropped (≈20–24 per map). `makePlots` in mapgen
- [x] **Towers cost materials only** (`TOWER_MAT`, 5–8 to build, 9–18 per upgrade), are built only on foundations, scale +7%/wave, and a tower that falls leaves a ruin that is rebuilt free after the wave. Dismantle refunds 50% materials
- [x] **8 keep buildings** (3 levels each, `data/buildings.ts`, `systems/keep.ts`): Bone Forge (+10% dmg), Ossuary Vault (+12% undead HP), Soul Cistern (+10% souls), Barrow Barracks (+1 per squad, existing squads gain theirs), Lich Sanctum (+15% spell dmg, −8% cd), Embalmer's Hall (0.8%/s regen), War Bell (+8% attack speed), Bone Quarry (+1 materials/wave). Effects live in `stats.ts` (`bld()`), so every present and future undead gets them
- [x] Procedural building sprites (`buildBuildingArt` in painters.mjs → `sprites/buildings/*`, 3 tiers × 4 frames) and a materials icon
- [x] Drawer tabs: Towers / Buildings / Fortify / Army; foundations overlay while placing; building info panel with upgrade; save v4
- [x] Bot baseline: no meta mostly waves 10–48 (5/6 runs pass wave 15); max meta wave 53 with ~7k undead (v0.5 was 34–39)
- [ ] Building/tower lights (forge glow, sanctum window) in the light buffer
- [ ] Re-run `balance.py` solo sweep with buildings in the policy (unit balance itself is unchanged)

## UI fonts
- [x] **Lich Numerals** (`assets/fonts/LichNumerals.ttf`, built by `tools/assets/gen-font.py`): pixel digits and number signs only, loaded with a `unicode-range` ahead of every font stack (Pixelify Sans / Jacquard 24), so every number in the DOM UI uses it (flat-topped 5, open 4/9)

## Balance (v0.5)
- [x] `tools/test/balance.py`: campaigns restricted to a fixed set of undead types (solo / combo), identical spending policy, no towers/walls; `LICH_PORT` env picks the server
- [x] Solo sweep (3 runs, cap 60) → fixes: investment-based squad cost escalation (elites were snowballing), Vampire/Golem nerfs, Pikeman/Skeleton buffs
- [x] Boss fixes found by the sweep: Purge/Sunburst capped per target (were wiping melee hosts), host commits to a boss that can already shell the guard line (melee waited it out and died)
- [x] Outlier mechanics fixed: Blood Feast (healed every undead nearby on each hit → 2 most wounded at 30%), lifesteal no longer feeds on overkill, Tremor stuns only the struck foe (golem crowds stun-locked the field), boss summons scale 3→6 with boss wave
- [x] Final solo results (cap 70, excluding wave-10 losses): all 14 types between waves ~42–61; combos 49–58 (frontline + ranged pairs a little above their solos)
- [x] Bot baseline (Fervor ×1.03/wave): no meta waves 10–23; max meta waves 34–39+ with 3–4k undead
- [ ] The wave-10 Inquisitor still ends ~15–30% of solo cheap-melee runs without towers (towers fix it in real play)
- [ ] Late max-meta runs end around wave 35–40 (v0.3 reached ~53 with rubber-banded Fervor); revisit late boss/elite scaling

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
- World-space numbers use texel-resolution digit glyphs (`PX_DIGITS`, 5×10 texels, flat-topped 5); letters still use the 3×5 font.
- Painters still author shapes on the 1× grid; the 2× pass adds rounding and shading but not new hand-placed detail. Next art step: native 2× painters for the most-seen units (skeleton, footman, knight).
- Uncapped hosts reach 2,000+ undead by wave 30 with max meta (~3 ms/step simulation); rendering that many sprites + shadows on weak GPUs needs an effects-quality preset (e.g. drop shadows/lights for small units).
