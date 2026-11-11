# Development checklist

Legend: [x] done · [~] partial / simplified · [ ] to do. Update this file at the end of every session.

## Incremental rework (v0.12)
- [x] **Nothing is bought during a siege.** Recruiting, evolving, materials, in-run buildings, the Soul Well and soul costs for spells/repairs are gone; the host, buildings, spells and defence slots all come from the Phylactery
- [x] **The Phylactery is a web** (`data/meta.ts`, ~110 nodes, six branches around a core): a node appears when its parent is owned and opens at the parent's threshold (`need`); costs grow by `mult` per level; radial auto-layout without overlaps; pan / zoom / shift-click screen (`UI.showMeta`)
- [x] **Three currencies**: Souls (kills; musters and small compounding steps), Life Essence (waves repelled, bosses; unlocks, evolutions, buildings, spells, strong passives), **Stolen Divinity** (gold; 1 per keep the first time its boss falls; 7 rites). The haul is banked on defeat, retreat and victory alike
- [x] **Keeps**: 6 keeps in a chain (5 themes + new Gates of Dawn), exactly 10 bigger waves each, the keep's boss on wave 10 (always full strength); exponential curve per keep (`KEEP_HP/DMG/SOULS/ESS` in `data/world.ts`) and per wave; enemy roster and roads by tech level (wave + 5 × keep)
- [x] Host from the web: per-type unlock (essence) → muster levels (souls, +bodies) → evolutions (essence); Endless Host / Eternal Night divinity rites
- [x] Buildings moved to the web (3 levels, essence); each stands on its own fixed foundation at the start of every siege. Barracks = +10% bodies, Quarry = durability + mending
- [x] Towers / ramparts / traps: the web grants slots and tiers; free placement between waves, demolish to move; breaches mended and traps relaid after each wave; the layout is remembered per keep and raised again next siege
- [x] Soul Well content moved: summons (now timed) and Bloodfrenzy / Ward / Necrotic Storm are spells learned on the web; ascensions are web passives
- [x] Cards: no unlock cards; deck groups (reinforcements, greater tiers, unit / tower modifiers, unique rites, legendaries) are opened on the web (`CARD_GATES`)
- [x] Events reworked: materials → fortify (keep / wall / tower durability), soul rewards are haul, soul costs are paid from the haul, squad mod → muster, unlock → squads, hordes scale with the host, story flags persist across sieges
- [x] Crusade Fervor reduced to zeal (Holy Wars, events); crusade tiers scale souls and Life Essence
- [x] Anti-stalemate: a wave that drags on 150 s after its last spawn makes the crusade hit 20% harder every 10 s
- [x] New home screen (purse, keeps, Continue), siege-over screen for defeat / retreat / conquest, HUD shows the siege's haul
- [x] `tools/test/bot.py` is now a meta-loop bot (siege → bank → spend → repeat); smoke, ui_flow and events_check rewritten; `strategy.py` and `balance.py` retired (they modelled in-run buying)
- [x] Save keys bumped (`lichdom_meta_v3`, `lichdom_run_v7`): earlier progress does not carry over
- [ ] Balance beyond keep 4 is only bot-tested lightly (late sieges simulate slowly); watch real runs
- [ ] The Legion branch is a long chain (13 rings): consider a more compact layout or a minimap
- [ ] Dedicated art: Stolen Divinity icon (CSS lozenge for now), Gates of Dawn theme tiles, web node icons for passives
- [ ] Achievements for web milestones; endless / ascension mode after keep 6
- [ ] `tools/analytics/report.py` still prints the old recruit / materials columns

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
- [x] Pipeline adopted: Dreamina (Seedream 5.0 Lite + reference; 5.0 Lite was retired in Nov 2026 → Seedream 4.6, 2 credits/image, 4 per run) → Remove BG → `import_ai_sprite.py` → `manifest_ai.json`
- [x] AI detail tier: res 4 texels/world px (same world size, 2× detail); crisp at zoom ≥ 4, smooth below
- [x] Imported: Skeleton Warriors, Zombie Horde, Necromantic Acolyte (cleric), Death Knight (haunted armor), Undead Wendigo (new)
- [ ] Tier 2/3 forms for imported units (currently tiers 2–3 keep procedural art; Wendigo reuses one sheet)
- [ ] Real animation poses (currently derived from one pose: bob, squash, lean)
- [x] **Crusaders (v0.10)**: 6 bosses (Divine Champion, United Kings, Grand Inquisitor, Archmage, Dragon-Slayer, Saint) and 7 strong units (paladin, inquisitor, angel, griffon knight, arcane construct, knight, heavy cavalry). Holy foil to the undead: ivory/tarnished gold/crimson, pale candle-gold glows (arcane violet for the mage conclave). `tools/assets/crusader_batch.py` records prompts, heights and post-processing
- [x] `tools/assets/strip_shadow.py`: removes the painted ground shadow Remove BG keeps (`--grow 0` where dark armour touches the shadow; `--black-below/--black-v` strips a near-black ground shadow fused with dark armour below the feet line, enclosed holes are refilled, `--min-piece` drops stray specks)
- [x] Fixed: United Kings and Dragon-Slayer kept a black ground-shadow blob and stray specks in their cutouts
- [x] `tools/test/showcase.py`: every crusader + boss marching, paused screenshot
- [ ] Remaining crusaders still procedural: footman, priest, crossbow, battlemage, rams/siege, etc. (they now look blocky next to the AI art). Monster Hunter prompt was flagged twice by Dreamina's guidelines (refunded) — needs a reworded prompt
- [ ] Remaining undead tiers, towers, tiles, spell FX (the Lich and the fortress are done: v0.7)

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

## Necropolis fortress & the Lich (v0.7)
- [x] **The Lich** (Dreamina, Seedream 4.6, 1 of 4): overrides `lich`, H 32, stands on the gatehouse battlements (`LICH_POS`)
- [x] **Fortress art** (Dreamina, 9:16 = exactly map height at res 4): curtain wall from the top edge to the bottom edge, gatehouse with green portcullis, citadel cut off by the map's left edge (`assets/sprites/buildings/ai/fortress.png`, `images` in manifest_ai.json)
- [x] v0.7.1: **no warping** — the art is placed at x = 0 with its original proportions (v0.7 bent the wall onto an arc and it looked stretched); `tools/assets/import_fortress.py` only measures it: wall face per row (cutout opened so banners/chains don't count) → `src/data/fortress_fit.ts`, solid cells follow the painted wall exactly
- [x] v0.7.1 lights: torches detected by flame colour (g/r < 0.65, no blue) — v0.7 also lit the yellowed bones; every lit window of the citadel now gets a small necro-green glow, the portcullis a big one
- [x] **Gate-centred defence** (`src/data/fortress.ts`): two preset rampart lines are arcs around the gatehouse face — the **Curtain** (R 112, 3 segments `keep_n/g/s`) and the **Bulwark** (R 232, 5 segments `wall_0..4`); their ends run into the fortress wall / off the map edge, so each fully closes off the gate. The old straight field lines are gone
- [x] Pathing fix: diagonal moves may not squeeze between two diagonal wall cells (arcs are staircases; enemies used to slip through)
- [x] **Army holds the gate**: guard posts are arcs around the gate (ranged behind/on the Curtain, melee between the walls, flyers over the Bulwark; tighter with a boss on the field); ground undead plan only against foes within `DEFENSE_R` (Bulwark + 48 px) and never chase out of it — no more marching up one road
- [x] Building plots (14) behind the Bulwark, around the gate; Soul Well between the walls north of the gate; save v6
- [ ] Per-theme fortress variants (all keep themes currently share the one fortress; the old keep sprites remain as fallback)
- [ ] Keep damage states on the fortress art (cracks/fires as keep HP drops)
- [x] Enemy art (Dreamina) — bosses and strong units done in v0.10

## Roguelite layer (v0.8)
- [x] **Crusade choice before every wave** (`data/events.ts` `CRUSADE_TIERS`, `crusadeOffer`/`startWave(tier)` in campaign.ts): Skirmish (×0.6 soldiers, ×0.6 souls, −1 material), Crusade (baseline), Holy War (×1.5 soldiers, +15% health, ×1.8 souls, +3 materials). Each option is its own rolled wave (theme, top enemy types shown with counts, boss); kills and the wave bonus pay ×reward. Auto-start, Enter-less starts and the bot use the last choice (default Crusade)
- [x] **Story events every 3 waves** (`EVENTS`, `systems/events.ts`): 6 events × 3 choices — A Village Burns (materials / soul tithe over 5 waves / massacre: a random horde split body-by-body across your undead types), The Forsaken Chapel, Deserters at the Crossroads, A Rival Necromancer, The Plague Wagon, An Abandoned Siege Camp. Effects: materials, souls, tithes, random hordes, spirits, level-ups, curses on the crusade (smaller / weaker for N waves), war buffs, permanent boons with a price, unit unlocks. Unseen events first; numbers scale with the wave; the result text is shown before play resumes
- [x] Run state `run.rogue` (tithes, curses, buffs, last tier, pending event) — saved with the run; older saves get defaults
- [x] Bot (no meta, baseline crusades, random event choices): waves 30 / 29 / 30 (v0.7.2 without events: 23–27)
- [x] **v0.11: 42 story events** (Slay-the-Spire scale) in three acts — borderlands (any wave), the war deepens (wave 5–6+), end of days (wave 14+) — every 3 waves plus a 20% chance of an extra event on other waves (`EXTRA_EVENT_CHANCE`). Not repeated within a campaign until the pool runs dry
- [x] New effect kinds (`systems/events.ts`): costs (`paySouls`/`payMats`, choice disabled and the cost shown when unaffordable; every event keeps a free choice), **gambles** (`gamble`: chance, win/lose effects and texts), `sacrifice` (part of the host, optionally one type), permanent `mod`s (crit, crit damage, unit hp/dmg/attack speed/speed, squad size, keep, walls, spell damage), `towerDmg`, `unitBuff` (random type), free `evolve`, specific `squad`s, `summon` (e.g. two Bone Colossi), `mirror` (duplicate the largest undead type), `heal`, `rerolls`, `xp`, `zeal` ±, `bossHp` (next boss weakened; applied in spawnEnemy), curses that change the crusade's soul `reward`
- [x] **Story chains** via flags (`flag` effect, `requires`/`excludes`, `weight` 3 so follow-ups come back): Blind Pilgrim → The Pilgrim Returns; Bishop's Courier (forge a reply) → The Bishop's Gambit; Countess of Ashen Hall (accept) → The Countess's Price
- [x] **Scene art for all 42 events** (Dreamina Seedream 4.6, 16:9, 1 image per event = 84 credits): `tools/assets/event_scenes.json` (prompt preamble + one scene per event), `tools/assets/import_event_art.py` (badge-free 89% crop, 384×216 box downsample, 48-colour quantize → `assets/ui/events/<id>.png`, `src/data/event_art.ts`; originals + meta in `art_source/dreamina/events/<id>/`). Shown at exact 2× above the event text
- [x] `tools/test/events_check.py [reps]`: resolves every choice of every event (gambles both ways), checks errors, unfilled placeholders, NaN state, chain gating. Bot/strategy bots only pick affordable choices
- [x] Bot (random event choices, v0.11 events): waves 30 / 28 / 30 / 30 (old 6 events: 30 / 29 / 30)
- [ ] More chains (3–4 step stories), act-specific bosses' omens, events that offer a fight (a special wave) instead of a choice
- [x] v0.8.1 HUD: modifier strip under the top bar (crusade tier being fought / last picked, soul tithes, curses on the crusade, war buffs, each with waves left and a tooltip); floating "+N" on the souls and materials counters for every gain (kills, wave bonus, tithes, events), merged per 0.35 s
- [x] v0.8.1 **End-of-wave summary** (`G.waveSummary`, `UI.showWaveSummary`): souls this wave (bonus, interest), materials, kills, undead fallen (and risen again), keep damage, towers rebuilt; per source (each undead type, each tower type, the Lich, spells/hazards): damage dealt with a bar, kills as enemy sprites ×count; fallen undead as sprites ×count. Per-wave tracking in `combat.ts` (`waveReport`); can be turned off in the popup ("Show after every wave")
- [x] v0.8.1 materials: income 3 + 1 per 5 waves (+5 for a boss); Skirmish no longer costs a material. Bot (no meta): waves 28 / 30 / 29

## Balance from real-run analytics (v0.9.1)
- [x] First real run analysed (wave 13, Holy War every wave, archer stacking): archers 82% of damage with 2 losses in 13 waves; squad cards (Mass Graves/Necropolis ×6) took archer squads 6 → 18 at the same price; keep never damaged. Holy War ≈ 2× the souls of Crusade at no cost; early soul/material buildings only ≈ +20% (left as is)
- [x] `tools/test/strategy.py`: player-model bot (crusade tier, focus unit + focus share, card policy, econ-first, walls/towers, event policy, meta levels) to test strategies seen in analytics
- [x] **Fervor = schedule × zeal × host pressure** (`fervorParts` in stats.ts): every Holy War adds a lasting +3.5% (zeal, `run.rogue.zeal`); a host worth more souls than `1200 + 60·wave²` raises Fervor by (value/allowance)^0.4, max ×2.5 (the baseline bot stays under it). Tooltip shows the breakdown; a message when the host part rises
- [x] Repeat picks: each earlier pick of a card family multiplies its draw weight by 0.55, and a repeat that wins the draw may be rerolled (≤ 2 times)
- [x] 8 unique cards: Unholy Covenant (+5% dmg/hp per undead type raised), Ossuary Rites (evolutions −40% souls), Martyr's Pyre, Phylactery Bond (keep regen during waves), Reaper's Mark (first blow ×2), Death Knell (gate nova every 15 s), Bone Vanguard (melee), Grave Marksmen (ranged)
- [x] Analytics: evolutions logged; report counts waves correctly when the run ends after a repelled wave
- [ ] More real runs to confirm the host-pressure curve (allowance and exponent are first guesses calibrated on bot hosts)

## Analytics, performance, shorter field (v0.9)
- [x] **Run analytics** (`systems/analytics.ts`): every campaign is recorded wave by wave in localStorage (`lichdom_analytics_v1`, last 20 runs): crusade tier/theme/boss, duration, souls/bonus/materials, bank, level, Fervor, keep damage and HP, host and summons by type, unit tiers, towers, buildings, walls, fallen per type, per-source damage/kills/kills-by-enemy-type, recruits and souls spent per type, spells cast; every decision (cards, events + choice, crusade tier, crypts, Soul Well, towers, buildings, ramparts) with wave and phase; start meta levels and roster; end (defeat/abandoned, essence, the unfinished last wave). The run save only stores `anId`; resuming reattaches the record (decisions of an aborted mid-wave attempt are dropped)
- [x] Settings → Run analytics: count, **Export JSON**, Clear. `tools/analytics/report.py <export.json> [--last N] [--csv dir]` → Markdown report (runs, damage sources with share / kills / fallen / damage per 1k souls invested, who kills what, crusade tiers, events/cards/Well/crypts/buildings/towers/ramparts with mean waves of runs that took them, economy by wave). `LICH_AN_OUT=f.json tools/test/bot.py` dumps bot runs in the same format
- [x] **Performance** (aimed at ~3k undead on real hardware): off-screen actors hidden and skipped; sprite properties only written when changed; shadows are Blitter bobs (display list 6.3k → 3.6k objects, renderer JS 6.9 → 3.8 ms at 3k undead); undead HP bars only below 60 % HP when the host is > 800; army planner sliced over 3 steps with per-pass formation context and precomputed threat zones; Necrotic Wards cached per step. Median sim step ≈ 3.1 ms at 3k undead vs 320 mortals
- [x] **Shorter field**: map 64 × 40 cells (was 96): the crusade reaches the gate about a third sooner; props scaled with the width
- [x] **Escorts**: fast mortals (not bosses, not flyers, not charging, outside the defence zone) keep pace with the nearest slow / siege unit within 130 px on their road (wait when > 3 cells ahead, match its speed when just ahead)
- [ ] Gather real-play exports and retune from them (unit efficiency per soul, tier choice rates, event picks)

## Defence & economy tuning (v0.7.2)
- [x] Wider rings: Curtain R 140, Bulwark R 290 (4 segments; the south one leaves the map); defence zone = Bulwark + 64 px
- [x] **Ranged foes can't snipe the host**: a foe is engaged when it stands in the zone *or its attack range reaches into it* (`threatensZone`); units may chase such foes 40 px further
- [x] **Towers anywhere on a built rampart**: any wall cell of a built segment can take a tower (mounts made on demand, `mountAt`/`mountCells`, id `m_<cx>_<cy>`), at least 2 cells from another tower; mounted towers are selectable by their sprite
- [x] Materials: income 2 + 1 per 6 waves (+4 for a boss); towers ≈ 40% cheaper (3–5 to build, 5–7 / 8–11 upgrades); buildings ≈ 60% dearer (10–15 / 17–24 / 27–35)
- [x] **Soul Well**: Unearth a Crypt is priced per type — (120 + 1.7 × the unit's squad cost + 250 per crypt opened) × 1.07^wave (zombies ≈ 340, golems ≈ 1,480 at wave 1); the picker shows each price. Ossuary Expansion (+1 per squad) removed from the Well — that bonus comes only from the Mass Graves / Necropolis level-up cards
- [x] Bot (no meta, 3 runs): waves 23–27 (v0.7.1: 30+) — hosts are ~40% smaller by wave 25 without Ossuary Expansion and cheap elite crypts; the bot now spends materials mostly on towers (10–13 by wave 25)
- [ ] Watch difficulty after the snowball nerfs; if early-mid game feels too hard, ease Fervor growth or wave size rather than restoring the Well

## Towers on the ramparts (v0.7.1)
- [x] Towers on built rampart segments (v0.7.2: on any section, see above) (materials, same `TOWER_MAT` costs and upgrades). Mounted towers claim no pathing cells (the wall blocks), draw on the battlements above the wall blocks, and fall to a ruin that is rebuilt after the wave as before
- [x] Buildings only on the foundations behind the walls; towers only on mounts (Towers tab shows mounts, Buildings tab shows foundations)
- [x] **Ramparts cost materials** (flat per segment: Palisade 2, Stone 3, Bone Rampart 5); repairs still cost souls. Start materials 6 → 10 (a wall segment and a tower before wave 1)
- [x] Regression: smoke + ui_flow pass; bot (no meta, 3 runs) all reach wave 30 with the keep intact (towers on walls + the host holding the gate)
- [x] Phylactery "free tower" perk: a Palisade on the Curtain's gate segment with a Necrotic Spire on top
- [ ] Mounted towers are not hit by wall-battering mobs (only by things that target towers); consider sharing the segment's damage

## Golem vs Abomination (v0.7)
- [x] Bone Golem was strictly worse on paper (cost 880 vs 640, HP 500 vs 560, armor .35); its old sim lead came from the Tremor stun-lock (fixed in v0.5) → cost 800, HP 620, dmg 28, armor 0.35, cleave 26: slower and pricier than the Abomination but sturdier and harder-hitting (Abomination keeps taunt)
- [x] Sims (cap 70): Abomination solo 60/51; Golem solo 62/70 (final stats; 2 runs — at HP 640–760 / armor 0.4 it capped at 70 every run). The Golem now edges the Abomination for 25% more souls per squad; trim dmg first if it proves too strong in real play

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

## AI art (v0.6.1)
- [x] Dreamina sprites for every allied unit: archer, pikeman, bone mage, wraith, banshee, vampire, wyvern, abomination, golem (base-tier overrides; procedural art kept, `manifest_ai.json` `overrides`)
- [x] Importer ignores detached specks far from the subject (corner badge) when cropping
- [ ] Evolved tiers (tier 2/3 names) still reuse the base AI sprite; consider tinted/upgraded variants
- [x] Bosses and strong crusaders imported (v0.10); weaker mortals still procedural

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
- Uncapped hosts reach 3,000+ undead late (~3 ms/step simulation, v0.9 render culling/batching); if weak GPUs still struggle, next steps: an effects-quality preset dropping lights for small units, and simulation LOD for idle posted undead.
