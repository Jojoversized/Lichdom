"""Unit balance harness: plays campaigns where the army is restricted to a fixed set of
undead types (one type = solo test, two or more = synergy test). No towers or walls, so
results measure the army itself; every configuration uses the same policy:
  - recruit squads of the allowed types (the least-bought type first), evolve when cheap
  - Soul Well Ascensions (damage / health) and spells, identically for all configs
  - level-up cards picked at random, except cards that would unlock other unit types
Output: one JSON line per run: {"cfg": [...], "wave": reached, "keep": hp, "army": n}
Usage: python3 tools/test/balance.py '<json list of configs>' [runs] [maxWave]
  e.g. python3 tools/test/balance.py '[["skeleton"],["archer"],["skeleton","archer"]]' 4 30
"""
import sys, json
from playwright.sync_api import sync_playwright

cfgs = json.loads(sys.argv[1])
runs = int(sys.argv[2]) if len(sys.argv) > 2 else 4
maxw = int(sys.argv[3]) if len(sys.argv) > 3 else 30
import os
PORT = os.environ.get('LICH_PORT', '8765')

SIM = r"""
([cfg, maxWave, seed]) => {
  const L = window.__LICH, G = L.G;
  // deterministic-ish: seed Math.random so the same config/run index sees the same map & rolls
  let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  L.newCampaign('haunted');
  const r = G.run;
  for (const u of G.units) { u.hp = 0; u.dead = true; }
  G.units.length = 0;
  r.unlockedUnits = cfg.slice();
  r.souls += 650; // the value of the usual starting squads, spent on the configured types instead
  let guard = 0;
  const bought = {};
  function build() {
    // evolve a type when it is affordable relative to the bank
    for (const t of cfg) { const tier = r.unitTier[t] || 0, nx = L.UNITS[t].tiers[tier + 1]; if (nx && tier < 1 && r.souls > nx.cost * 2) { r.souls -= nx.cost; r.unitTier[t] = tier + 1; L.recalcAllStats(); } }
    if (r.souls > 900) L.buyWell('asc_dmg');
    if (r.souls > 900) L.buyWell('asc_hp');
    let tries = 0;
    while (tries++ < 200) {
      const t = cfg.slice().sort((a, b) => (bought[a] || 0) - (bought[b] || 0))[0];
      if (r.souls < L.recruitCost(t)) break;
      L.recruit(t); bought[t] = (bought[t] || 0) + 1;
    }
  }
  while (G.phase !== 'over' && r.wave < maxWave && guard++ < 600000) {
    if (r.pendingLevels > 0) {
      const c = L.rollCards(3).filter(x => !(x.id.startsWith('unlock_u') || x.id === 'army_new'));
      if (c.length) L.applyCard(c[Math.floor(Math.random() * c.length)]);
      r.unlockedUnits = r.unlockedUnits.filter(u => cfg.includes(u));
      r.pendingLevels--; continue;
    }
    if (G.phase === 'prep') { build(); L.startWave(); }
    for (const sp of r.spells) if (L.canCast(sp) && G.enemies.length > 8) { const e = G.enemies[0]; L.castSpell(sp, e.x, e.y); }
    L.step(1 / 30);
  }
  return { cfg, wave: G.phase === 'over' ? r.wave : maxWave, keep: Math.round(G.keep.hp), army: G.units.length };
}
"""
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 360})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    for cfg in cfgs:
        for i in range(runs):
            pg.goto('http://127.0.0.1:' + PORT + '/play.html'); pg.wait_for_timeout(1800)
            res = pg.evaluate(SIM, [cfg, maxw, 1000 + i * 7919])
            print(json.dumps(res), flush=True)
    if errs: print('ERRORS', errs[:3], flush=True)
    b.close()
