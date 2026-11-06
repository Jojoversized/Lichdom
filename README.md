# LICH — Eternal Dominion

A dark-fantasy **incremental roguelite tower defense** where you are the final boss.
Defend your keep on the western edge of the world against the united crusade of humanity,
harvest souls, command an autonomous undead host and grow an ever more apocalyptic fortress.

Built with **Phaser 3 + TypeScript + Vite**. All pixel art and sound effects are generated
by the project's own asset pipeline (`npm run assets`).

## Play / develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Pushes to `main` deploy automatically to GitHub Pages (enable *Settings → Pages → Source: GitHub Actions* once).

### Local setup (folder copied without git metadata)
If your project folder was populated by Claude, turn it into a working copy of this repo:

```bash
cd "C:\Games\Lich Claude"
git init -b main
git remote add origin https://github.com/Jojoversized/Lichdom.git
git fetch origin
git reset origin/main      # keeps the files, adopts the repo history
git restore .github        # restores the deploy workflow
npm install && npm run dev
```

### Updating an existing local copy
When Claude has written a new version into the folder and pushed it to GitHub:

```bash
git fetch origin
git reset origin/main      # local files already match; this just syncs git's view
```
(Or, if Claude only pushed: `git pull`.)

## Highlights
- 2× texel-density pixel art: rounded silhouettes, volume shading, thin selective outlines
- No army cap: every recruit raises a squad of 5+; random undead from the crypts; 6 permanent summon packs
- 8 evolving towers, 13 undead troop types; everything can target everything (no air/ground rules)
- Undead fight on their own — no flags, no micromanagement
- 20 mortal unit types in 4 factions, 6 bosses, an adaptive crusade
- Three-choice roguelite level-ups, repeatable Soul Well Ascensions, a 49-node permanent Phylactery tree
- Dithered pixel lighting, persistent battlefield carnage

See `CLAUDE.md` for architecture and `docs/CHECKLIST.md` for progress.
