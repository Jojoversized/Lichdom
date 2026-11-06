"""Automated balance/regression bot: plays campaigns at simulation speed
(towers near roads, recruits, Soul Well purchases, spells, card picks).
Usage: python3 tools/test/bot.py [maxWave] [runs] [metaMax(0/1)]"""
import sys
from playwright.sync_api import sync_playwright
maxw = int(sys.argv[1]) if len(sys.argv) > 1 else 25
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 1
metamax = len(sys.argv) > 3 and sys.argv[3] == '1'
BOT = r"""
([maxWave, metamax]) => {
  const L = window.__LICH, G = L.G;
  if (metamax) for (const m of Object.values(L.META_BY_ID || {})) G.meta.lv[m.id] = m.max;
  L.newCampaign('haunted');
  const log = []; const t0 = performance.now(); let guard = 0, dupes = 0;
  const KEEPX = 156;
  function build() {
    const r = G.run;
    let tries = 0;
    // alternate between towers and squads (no army cap any more)
    while (r.souls > 140 && tries++ < 120) {
      if (Math.random() < 0.5) {
        const u = r.unlockedUnits[Math.floor(Math.random() * r.unlockedUnits.length)];
        if (r.souls >= L.recruitCost(u)) L.recruit(u);
        continue;
      }
      const types = r.unlockedTowers, type = types[Math.floor(Math.random() * types.length)];
      const cx = Math.floor((KEEPX + 40 + Math.random() * 300) / 16), cy = Math.floor((328 + (Math.random() - 0.5) * 380) / 16);
      let near = false;
      for (let oy = -2; oy <= 3; oy++) for (let ox = -2; ox <= 3; ox++) { const x = cx + ox, y = cy + oy; if (x >= 0 && y >= 0 && x < 96 && y < 40 && G.map.road[y * 96 + x]) near = true; }
      if (!near || !L.canBuildAt(cx, cy, 2, 2)) continue;
      const cost = L.towerCost(type); if (r.souls < cost) continue;
      r.souls -= cost; L.placeTower(type, cx, cy, 0, { invested: cost });
    }
    for (const t of G.towers) { const nx = t.def.tiers[t.tier + 1]; if (nx && r.souls > nx.cost * 1.3 && (t.tier < 1 || L.metaLv('f_evo'))) { r.souls -= nx.cost; t.tier++; t.maxHp = L.towerMaxHp(t); t.hp = t.maxHp; } }
    // incremental sinks
    for (let i = 0; i < 4; i++) { if (r.souls > 600) L.buyWell(['asc_dmg', 'asc_hp', 'asc_squad', 'legion'][i]); }
    { const lk = L.lockedUnitTypes(); if (lk.length && r.souls > L.unearthCost(r) * 1.5) L.unearthUnit(lk[Math.floor(Math.random() * lk.length)]); }
  }
  while (G.phase !== 'over' && G.run.wave < maxWave && guard++ < 400000) {
    if (G.run.pendingLevels > 0) { const c = L.rollCards(3); if (!L.offerIsClean(c)) dupes++; if (c.length) L.applyCard(c[Math.floor(Math.random() * c.length)]); G.run.pendingLevels--; continue; }
    if (G.phase === 'prep') {
      build();
      log.push({ w: G.run.wave, keep: Math.round(G.keep.hp), souls: Math.round(G.run.souls), lvl: G.run.level, towers: G.towers.length, units: G.units.length, kinds: G.run.unlockedUnits.length, kills: G.run.kills, fervor: +(G.run.fervor || 1).toFixed(2), ms: Math.round(performance.now() - t0) });
      L.startWave();
    }
    for (const s of G.run.spells) if (L.canCast(s) && G.enemies.length > 8) { const e = G.enemies[0]; L.castSpell(s, e.x, e.y); }
    L.step(1 / 30); L.stepVisual(1 / 30, 186, 416);
  }
  return { log, dupes, phase: G.phase, wave: G.run.wave, keep: Math.round(G.keep.hp), ms: Math.round(performance.now() - t0) };
}
"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for i in range(runs):
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('pageerror', lambda e: errs.append(str(e) + '\n' + (e.stack or '')[:600]))
        pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_timeout(2500)
        res = pg.evaluate(BOT, [maxw, metamax])
        for l in res['log'][-6:] if runs > 1 else res['log']: print(l)
        print({k: v for k, v in res.items() if k != 'log'})
        pg.close()
    print('ERRORS', len(errs)); print('\n'.join(errs[:5]))
    b.close()
