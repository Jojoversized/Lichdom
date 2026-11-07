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
  const log = []; const t0 = performance.now(); let guard = 0, dupes = 0; const evlog = [];
  function build() {
    const r = G.run;
    let tries = 0;
    // ramparts (materials): the Curtain around the gate first, then the Bulwark; repair breaches (souls)
    const WALL_ORDER = ['keep_g', 'keep_n', 'keep_s', 'wall_2', 'wall_1', 'wall_3', 'wall_0', 'wall_4'];
    for (const s of G.map.sites || []) { const rep = L.siteRepairCost(s); if (rep && r.souls > rep * 2) L.repairSite(s); }
    // materials: walls, towers on built wall segments, keep buildings behind the walls
    for (let guardM = 0; guardM < 20; guardM++) {
      const free = G.map.plots.filter(p => L.plotFree(p));
      const opts = [];
      const nextWall = WALL_ORDER.map(id => L.siteById(id)).find(s => s && L.siteTier(s) === 0);
      if (nextWall && r.materials >= L.siteUpgradeCost(nextWall) && G.towers.length >= WALL_ORDER.indexOf(nextWall.id) / 2) opts.push(() => L.upgradeSite(nextWall));
      const weak = r.wave >= 6 ? (G.map.sites || []).find(s => L.siteTier(s) === 1) : null;
      if (weak && r.materials >= L.siteUpgradeCost(weak) + 2) opts.push(() => L.upgradeSite(weak));
      const tt = r.unlockedTowers[Math.floor(Math.random() * r.unlockedTowers.length)];
      const mc = L.mountCells(), fp = mc[Math.floor(Math.random() * mc.length)];
      if (fp && r.materials >= L.towerMatCost(tt)) opts.push(() => L.constructTower(tt, fp));
      const bp = free[0];
      for (const k of ['forge', 'vault', 'quarry', 'barracks', 'bell', 'embalm', 'cistern', 'sanctum']) {
        const lv = L.bld(k), ent = G.buildings.find(b => b.type === k);
        if (lv === 0 && bp && r.materials >= 8) { opts.push(() => L.constructBuilding(k, bp)); break; }
        if (ent && lv < 3 && r.materials >= L.buildingUpgradeCost(ent)) { opts.push(() => L.upgradeBuilding(ent)); break; }
      }
      for (const t of G.towers) if (t.def.tiers[t.tier + 1] && (t.tier < 1 || L.metaLv('f_evo')) && r.materials >= L.towerUpgradeCost(t)) { opts.push(() => L.upgradeTowerMat(t)); break; }
      if (!opts.length) break;
      opts[Math.floor(Math.random() * opts.length)]();
    }
    // souls: squads (no army cap any more)
    while (r.souls > 140 && tries++ < 200) {
      const u = r.unlockedUnits[Math.floor(Math.random() * r.unlockedUnits.length)];
      if (r.souls >= L.recruitCost(u)) L.recruit(u); else if (r.unlockedUnits.every(x => r.souls < L.recruitCost(x))) break;
    }
    // incremental sinks
    for (let i = 0; i < 4; i++) { if (r.souls > 600) L.buyWell(['asc_dmg', 'asc_hp', 'asc_souls', 'legion'][i]); }
    { const lk = L.lockedUnitTypes(); if (lk.length) { const k = lk[Math.floor(Math.random() * lk.length)]; if (r.souls > L.unearthCost(r, k) * 1.5) L.unearthUnit(k); } }
  }
  while (G.phase !== 'over' && G.run.wave < maxWave && guard++ < 400000) {
    if (G.run.pendingLevels > 0) { const c = L.rollCards(3); if (!L.offerIsClean(c)) dupes++; if (c.length) L.applyCard(c[Math.floor(Math.random() * c.length)]); G.run.pendingLevels--; continue; }
    if (G.phase === 'prep' && L.pendingEvent()) { const ev = L.pendingEvent(); evlog.push(ev.id); L.resolveEvent(Math.floor(Math.random() * 3)); continue; }
    if (G.phase === 'prep') {
      build();
      log.push({ w: G.run.wave, keep: Math.round(G.keep.hp), souls: Math.round(G.run.souls), lvl: G.run.level, towers: G.towers.length, mat: G.run.materials, blds: G.buildings.map(b => b.type + (b.tier + 1)).join(','), units: G.units.length, kinds: G.run.unlockedUnits.length, kills: G.run.kills, fervor: +(G.run.fervor || 1).toFixed(2), ms: Math.round(performance.now() - t0) });
      L.startWave();
    }
    for (const s of G.run.spells) if (L.canCast(s) && G.enemies.length > 8) { const e = G.enemies[0]; L.castSpell(s, e.x, e.y); }
    L.step(1 / 30); L.stepVisual(1 / 30, 186, 416);
  }
  return { log, dupes, events: evlog.join(','), phase: G.phase, wave: G.run.wave, keep: Math.round(G.keep.hp), ms: Math.round(performance.now() - t0) };
}
"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for i in range(runs):
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('pageerror', lambda e: errs.append(str(e) + '\n' + (e.stack or '')[:600]))
        pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_function('window.__LICH && window.__LICH.G && window.__LICH.G.stats', timeout=60000); pg.wait_for_timeout(500)
        res = pg.evaluate(BOT, [maxw, metamax])
        for l in res['log'][-6:] if runs > 1 else res['log']: print(l)
        print({k: v for k, v in res.items() if k != 'log'})
        pg.close()
    print('ERRORS', len(errs)); print('\n'.join(errs[:5]))
    b.close()
