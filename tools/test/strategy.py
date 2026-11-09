"""Strategy bot: plays campaigns with a configurable *player model* to test specific strategies
(e.g. the ones seen in real-run analytics) against each other.
Usage: python3 tools/test/strategy.py '<json list of configs>' [runs] [maxWave]
Config keys (all optional):
  name      label
  tier      crusade tier every wave: 0 Skirmish, 1 Crusade, 2 Holy War (default 1)
  focus     unit type to stack and spam ('' = spread souls over the roster)
  focusShare share of souls spent on the focus unit (default 0.85)
  cards     'focus' (focus-unit drills/mods, squad size, souls first) | 'random'
  econ      true: Soul Tithe at once, Bone Quarry and Soul Cistern first; false: Forge / Vault / Bell first
  forts     true: build ramparts and towers like bot.py; false: no walls, no towers
  events    'first' (always the first choice) | 'random'
  meta      meta levels dict (default: the levels of the analysed real run)
LICH_PORT picks the server (default 8765)."""
import json
import os
import sys
from playwright.sync_api import sync_playwright

configs = json.loads(sys.argv[1])
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 2
maxw = int(sys.argv[3]) if len(sys.argv) > 3 else 35
port = os.environ.get('LICH_PORT', '8765')
USER_META = {'s_gain': 2, 's_well': 2, 's_summon': 1, 's_dragon': 1, 's_start': 1, 'n_hp': 2}

BOT = r"""
([cfg, maxWave]) => {
  const L = window.__LICH, G = L.G;
  G.meta.lv = Object.assign({}, cfg.meta);
  L.newCampaign('haunted');
  const r0 = G.run;
  const focus = cfg.focus || '';
  if (focus && !r0.unlockedUnits.includes(focus)) { r0.unlockedUnits.push(focus); L.spawnSquad(focus, 300, 410); }
  const tier = cfg.tier ?? 1;
  let guard = 0;
  const rr = (a) => a[Math.floor(Math.random() * a.length)];
  function cardScore(c) {
    if (cfg.cards !== 'focus') return Math.random();
    if (focus && c.id === 'udmg_' + focus) return 100;
    if (focus && c.unit === focus) return 90;
    if (c.id === 'cap2') return 80; if (c.id === 'cap1') return 70;
    if (cfg.econ && (c.id === 'soul2' || c.id === 'soul1')) return 60;
    if (c.id === 'crit2' || c.id === 'udm1' || c.id === 'army_new') return 50;
    return Math.random() * 40;
  }
  function spendMaterials() {
    const r = G.run;
    const order = cfg.econ ? ['quarry', 'cistern', 'forge', 'vault', 'bell', 'barracks'] : ['forge', 'vault', 'bell', 'barracks', 'embalm', 'cistern'];
    for (let g = 0; g < 20; g++) {
      const opts = [];
      if (cfg.forts) {
        const WALL_ORDER = ['keep_g', 'keep_n', 'keep_s', 'wall_2', 'wall_1', 'wall_3', 'wall_0'];
        const nextWall = WALL_ORDER.map(id => L.siteById(id)).find(s => s && L.siteTier(s) === 0);
        if (nextWall && r.materials >= L.siteUpgradeCost(nextWall) && G.towers.length >= WALL_ORDER.indexOf(nextWall.id) / 2) opts.push(() => L.upgradeSite(nextWall));
        const tt = rr(r.unlockedTowers), mc = L.mountCells(), fp = mc[Math.floor(Math.random() * mc.length)];
        if (fp && r.materials >= L.towerMatCost(tt)) opts.push(() => L.constructTower(tt, fp));
      }
      const free = G.map.plots.filter(p => L.plotFree(p) && !p.mount);
      for (const k of order) {
        const ent = G.buildings.find(b => b.type === k);
        if (!ent && free[0] && r.materials >= L.buildingCost(k, 0)) { opts.push(() => L.constructBuilding(k, free[0])); break; }
        if (ent && L.buildingUpgradeCost(ent) && r.materials >= L.buildingUpgradeCost(ent)) { opts.push(() => L.upgradeBuilding(ent)); break; }
        if (!ent || L.buildingUpgradeCost(ent)) break; // save up for the next building in order
      }
      if (!opts.length) break;
      opts[cfg.forts ? Math.floor(Math.random() * opts.length) : 0]();
    }
  }
  function spendSouls() {
    const r = G.run;
    if (cfg.econ && !r.asc.souls) L.buyWell('asc_souls');
    let tries = 0;
    while (tries++ < 300) {
      const types = r.unlockedUnits;
      const t = focus && Math.random() < (cfg.focusShare ?? 0.85) ? focus : rr(types);
      if (r.souls >= L.recruitCost(t)) L.recruit(t);
      else if (types.every(x => r.souls < L.recruitCost(x))) break;
    }
  }
  while (G.phase !== 'over' && G.run.wave < maxWave && guard++ < 600000) {
    if (G.run.pendingLevels > 0) { const c = L.rollCards(3); if (c.length) L.applyCard(c.sort((a, b) => cardScore(b) - cardScore(a))[0]); G.run.pendingLevels--; continue; }
    if (G.phase === 'prep' && L.pendingEvent()) { { const ev = L.pendingEvent(), ok = ev.choices.map((c, i) => i).filter(i => L.canChoose(ev.choices[i])); L.resolveEvent(cfg.events === 'random' ? ok[Math.floor(Math.random() * ok.length)] : ok[0]); } continue; }
    if (G.phase === 'prep') { spendMaterials(); spendSouls(); L.startWave(tier); }
    for (const s of G.run.spells) if (L.canCast(s) && G.enemies.length > 8) { const e = G.enemies[0]; L.castSpell(s, e.x, e.y); }
    L.step(1 / 30);
  }
  const a = G.run.an, dmg = {}; let tot = 0;
  for (const w of a.waves) for (const [k, d] of w.src) { dmg[k] = (dmg[k] || 0) + d; tot += d; }
  const top = Object.entries(dmg).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, d]) => k.slice(2) + ' ' + Math.round(100 * d / tot) + '%');
  const w10 = a.waves.find(w => w.n === 10) || {};
  return { wave: G.phase === 'over' ? G.run.wave - 1 : G.run.wave, over: G.phase === 'over', souls: Math.round(G.run.soulsEarned), soulsW10: w10.bank ? Math.round(a.waves.filter(w => w.n <= 10).reduce((s, w) => s + w.souls + w.bonus, 0)) : null,
    host: G.units.length, keepLost: a.waves.reduce((s, w) => s + w.keepLost, 0), top, mats: G.run.materials,
    squad: G.run.m.squad, focusBuff: focus ? (G.run.unitBuff[focus] || 0) : 0 };
}
"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for cfg in configs:
        cfg.setdefault('meta', USER_META)
        res = []
        for i in range(runs):
            pg = b.new_page(viewport={'width': 800, 'height': 500})
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(f'http://127.0.0.1:{port}/play.html'); pg.wait_for_function('window.__LICH && window.__LICH.G && window.__LICH.G.stats', timeout=60000); pg.wait_for_timeout(300)
            res.append(pg.evaluate(BOT, [cfg, maxw]))
            print(f"   run {i + 1}: {cfg.get('name', '')}: {res[-1]}", flush=True)
            pg.close()
        waves = [x['wave'] for x in res]
        print(f"== {cfg.get('name', cfg)}: waves {waves} (mean {sum(waves) / len(waves):.1f}{', capped' if any(not x['over'] for x in res) else ''})", flush=True)
    print('ERRORS', len(errs)); print('\n'.join(errs[:5]))
    b.close()
