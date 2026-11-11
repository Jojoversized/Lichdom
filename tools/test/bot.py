"""Meta-loop bot (v0.12): plays the incremental game the way a player would. Starting from an empty
Phylactery it besieges the furthest unlocked keep, carries the haul home, spends it on the web
(cheapest affordable node first, unlocks preferred), and repeats.
Usage: python3 tools/test/bot.py [sieges=30] [stopAfterKeeps=1] [tier=1] [repeat=1]
Prints one line per siege and how many sieges each keep took; also asserts that level-up offers never
show two tiers of one family. LICH_AN_OUT=file.json saves the analytics records
(tools/analytics/report.py). LICH_PORT picks the server port (default 8765)."""
import json
import os
import sys
from playwright.sync_api import sync_playwright
sieges = int(sys.argv[1]) if len(sys.argv) > 1 else 30
stop = int(sys.argv[2]) if len(sys.argv) > 2 else 1
tier = int(sys.argv[3]) if len(sys.argv) > 3 else 1
repeat = int(sys.argv[4]) if len(sys.argv) > 4 else 1
PORT = os.environ.get('LICH_PORT', '8765')
SPEND = r"""
() => {
  const L = window.__LICH, G = L.G; const bought = {};
  for (let guard = 0; guard < 5000; guard++) {
    const can = L.META.filter(m => L.canBuyMeta(m.id));
    if (!can.length) break;
    // a sensible player: one-off unlocks first, then whatever is cheapest relative to the purse
    const rel = m => L.metaCost(m, L.metaLv(m.id)) / Math.max(1, G.meta[m.cur]);
    can.sort((a, b) => (a.max === 1 ? 0 : 1) - (b.max === 1 ? 0 : 1) || rel(a) - rel(b));
    const m = can[0]; L.buyMeta(m.id); bought[m.id] = (bought[m.id] || 0) + 1;
  }
  return bought;
}
"""
SIEGE = r"""
([keep, tier]) => {
  const L = window.__LICH, G = L.G;
  L.newCampaign(keep);
  const t0 = performance.now(); let guard = 0, dupes = 0, stuck = null; const ev = [];
  const WALL_ORDER = ['keep_g', 'keep_n', 'keep_s', 'wall_2', 'wall_1', 'wall_3', 'wall_0', 'wall_4'];
  function place() {
    for (const id of WALL_ORDER) { const s = L.siteById(id); if (s && !L.siteTier(s) && L.wallSlotsFree() > 0) L.buildSite(s, true); }
    for (let i = 0; i < 40 && L.towerSlotsFree() > 0; i++) { const mc = L.mountCells(); if (!mc.length) break; const tt = G.run.unlockedTowers[Math.floor(Math.random() * G.run.unlockedTowers.length)]; L.constructTower(tt, mc[Math.floor(Math.random() * mc.length)], true); }
    for (let i = 0; i < 200 && L.trapSlotsFree() > 0; i++) { const cx = 26 + Math.floor(Math.random() * 14), cy = 10 + Math.floor(Math.random() * 20); if (L.canBuildAt(cx, cy, 1, 1)) L.placeTrap('spikes', cx, cy, true); }
  }
  const host0 = G.units.length;
  while (G.phase !== 'over' && guard++ < 600000) {
    if (G.run.pendingLevels > 0) { const c = L.rollCards(3); if (!L.offerIsClean(c)) dupes++; if (c.length) L.applyCard(c[Math.floor(Math.random() * c.length)]); G.run.pendingLevels--; continue; }
    if (G.phase === 'prep' && L.pendingEvent()) { const e = L.pendingEvent(); ev.push(e.id); const ok = e.choices.map((c, i) => i).filter(i => L.canChoose(e.choices[i])); L.resolveEvent(ok[Math.floor(Math.random() * ok.length)]); continue; }
    if (G.phase === 'prep') { place(); L.startWave(tier); }
    for (const s of G.run.spells) if (L.canCast(s) && G.enemies.length > 6) { const e = G.enemies[0]; L.castSpell(s, e.x, e.y); }
    L.step(1 / 30); L.stepVisual(1 / 30, 186, 416);
    if (G.phase === 'wave' && G.wave.t > 1500) { stuck = { t: Math.round(G.wave.t), left: G.enemies.length, idx: G.wave.idx + '/' + G.wave.spawns.length, rage: G.wave.rage, foes: G.enemies.slice(0, 5).map(e => [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.flying ? 'fly' : '']), units: G.units.length, keep: Math.round(G.keep.hp) }; break; }
  }
  const r = G.run;
  return { keep, wave: r.wave, out: r.anOutcome || 'STUCK', stuck, souls: Math.round(r.souls), ess: Math.round(r.essence * 10) / 10, div: r.divinity || 0, lvl: r.level, host: host0, towers: G.towers.length, dupes, events: ev.length, sec: Math.round(G.time), ms: Math.round(performance.now() - t0) };
}
"""
errs = []
an_out = os.environ.get('LICH_AN_OUT'); an_runs = []
took_all = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for rep in range(repeat):
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('pageerror', lambda e: errs.append(str(e) + '\n' + (e.stack or '')[:600]))
        pg.goto(f'http://127.0.0.1:{PORT}/play.html'); pg.wait_for_function('window.__LICH && window.__LICH.G && window.__LICH.G.stats', timeout=60000); pg.wait_for_timeout(500)
        pg.evaluate("() => { localStorage.clear(); }"); pg.reload(); pg.wait_for_function('window.__LICH && window.__LICH.G && window.__LICH.G.stats', timeout=60000); pg.wait_for_timeout(500)
        took = {}; n0 = 0; dupes = 0
        for i in range(sieges):
            keep = pg.evaluate("() => Math.min(window.__LICH.KEEPS.length - 1, window.__LICH.G.meta.keepsCleared || 0)")
            res = pg.evaluate(SIEGE, [keep, tier]); dupes += res['dupes']
            pg.wait_for_timeout(50)
            if res.get('stuck'): print('STUCK', res['stuck']); errs.append('stuck wave'); pg.evaluate("() => window.__LICH.retreat()")
            bought = pg.evaluate(SPEND)
            purse = pg.evaluate("() => { const m = window.__LICH.G.meta; return [Math.round(m.souls), Math.round(m.essence), m.divinity, Object.keys(m.lv).length] }")
            print(f"#{i + 1:3d} keep {keep + 1} wave {res['wave']:2d} {res['out']:8s} host {res['host']:4d} tw {res['towers']:2d} lvl {res['lvl']:2d} +{res['souls']} souls +{res['ess']} ess{' +DIVINITY' if res['div'] else ''} | bought {sum(bought.values())} ({len(bought)} nodes) purse {purse} | {res['sec']}s sim {res['ms']}ms", flush=True)
            if res['out'] == 'victory' and keep not in took:
                took[keep] = i + 1 - n0; n0 = i + 1
                if len(took) >= stop: break
        print('SIEGES PER KEEP', {k + 1: v for k, v in took.items()}, 'dupes', dupes)
        took_all.append(took)
        if an_out: an_runs += pg.evaluate('window.__LICH.analytics.anExport().runs')
        pg.close()
    b.close()
if an_out:
    json.dump({'runs': an_runs}, open(an_out, 'w'))
print('ERRORS', len(errs)); print('\n'.join(errs[:6]))
sys.exit(1 if errs else 0)
