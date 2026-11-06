"""UI flow test: real clicks through menu -> campaign -> build -> wave -> level-up
-> Soul Well summons -> drawer collapse -> info panel -> save/reload -> codex/meta.
Screenshots go to the given directory."""
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ui'
os.makedirs(OUT, exist_ok=True)
errs = []
def shot(pg, n): pg.screenshot(path=f'{OUT}/{n}.png')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 860})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e) + '\n' + (e.stack or '')[:600]))
    pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_timeout(2500)
    pg.click('#m-new'); pg.click('.fortc[data-k=haunted]'); pg.wait_for_timeout(500); pg.click('#h-ok'); pg.wait_for_timeout(300)
    def world_click(wx, wy, button='left'):
        sx, sy = pg.evaluate(f"() => {{ const s = window.__LICH.game.scene.getScene('game'); return s.worldToScreen({wx},{wy}); }}")
        pg.mouse.move(sx, sy); pg.wait_for_timeout(60); pg.mouse.down(button=button); pg.mouse.up(button=button); pg.wait_for_timeout(80)
    # build a tower with real clicks
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(100)
    sx, sy = pg.evaluate("() => window.__LICH.game.scene.getScene('game').worldToScreen(300, 260)")
    pg.mouse.move(sx, sy); pg.wait_for_timeout(200); shot(pg, 'a_ghost')
    world_click(300, 260)
    st = pg.evaluate("() => ({towers: window.__LICH.G.towers.length, sel: !!window.__LICH.G.selected})"); print('after tower click', st)
    shot(pg, 'b_info')
    # collapse the drawer via its button, then reopen with a tab
    pg.click('#b-collapse'); pg.wait_for_timeout(150)
    print('collapsed:', pg.evaluate("() => document.querySelector('#buildbar').classList.contains('collapsed')"))
    shot(pg, 'c_collapsed')
    pg.click('.tabs button[data-tab=army]'); pg.wait_for_timeout(150)
    n0 = pg.evaluate("() => { window.__LICH.G.run.souls += 3000; window.__LICH.UI.renderBuild(); return window.__LICH.G.units.length; }")
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(100)
    n1 = pg.evaluate("() => window.__LICH.G.units.length")
    print('squad recruited:', n1 - n0, 'undead (must be >= 5)'); assert n1 - n0 >= 5
    shot(pg, 'c2_army_tab')
    # ramparts: Fortify tab -> Ramparts mode -> click the keep gate site twice (palisade, stone)
    pg.click('.tabs button[data-tab=fort]'); pg.wait_for_timeout(120)
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(120)
    world_click(14 * 16 + 8, 20 * 16 + 8); world_click(14 * 16 + 8, 20 * 16 + 8)
    wl = pg.evaluate("() => window.__LICH.G.run.walls"); print('ramparts:', wl); assert wl.get('keep_g') == 2
    shot(pg, 'c3_ramparts')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.click('#b-wave'); pg.wait_for_timeout(6000); shot(pg, 'd_wave')
    # force level up, check modal covers HUD
    pg.evaluate("() => { window.__LICH.G.run.pendingLevels = 1; }"); pg.wait_for_timeout(500); shot(pg, 'e_levelup')
    pg.keyboard.press('2'); pg.wait_for_timeout(200)
    pg.evaluate("() => { window.__LICH.G.run.souls += 5000; }")
    pg.keyboard.press('e'); pg.wait_for_timeout(300); shot(pg, 'f_well')
    pg.click('.witem[data-id=legion]'); pg.wait_for_timeout(200)
    pg.click('.witem[data-id=colossus]'); pg.wait_for_timeout(200)
    k0 = pg.evaluate("() => [window.__LICH.G.units.length, window.__LICH.G.run.unlockedUnits.length]")
    pg.click('.witem[data-id=unearth]'); pg.wait_for_timeout(250)
    shot(pg, 'f2_unearth')
    pg.click('.ucard >> nth=0', button='right'); pg.wait_for_timeout(250)
    shot(pg, 'f3_unit_detail')
    pg.click('#ud-back'); pg.wait_for_timeout(200)
    pg.click('.ucard >> nth=0'); pg.wait_for_timeout(250)
    k1 = pg.evaluate("() => [window.__LICH.G.units.length, window.__LICH.G.run.unlockedUnits.length]")
    print('unearth: +units', k1[0] - k0[0], '+types', k1[1] - k0[1]); assert k1[1] == k0[1] + 1 and k1[0] - k0[0] >= 5
    pg.keyboard.press('e'); pg.wait_for_timeout(200)
    pg.click('#m-x'); pg.wait_for_timeout(200)
    print('host', pg.evaluate("() => ({units: window.__LICH.G.units.length, summons: window.__LICH.G.units.filter(u=>u.summon).length})"))
    pg.wait_for_timeout(6000); shot(pg, 'g_army')
    # finish the wave fast and check revive
    r = pg.evaluate("""() => { const L = window.__LICH, G = L.G; let n = 0; while (G.phase === 'wave' && n++ < 20000) { G.run.pendingLevels = 0; L.step(1/30); } return {phase: G.phase, units: G.units.length}; }""")
    print('after wave', r)
    pg.wait_for_timeout(500)
    pg.evaluate("() => { const L = window.__LICH; L.UI.closeModal(); }")
    shot(pg, 'h_prep2')
    pg.reload(); pg.wait_for_timeout(2500)
    print('continue button:', pg.evaluate("() => !!document.querySelector('#m-cont')"))
    pg.click('#m-cont'); pg.wait_for_timeout(800)
    print('resumed', pg.evaluate("() => { const G = window.__LICH.G; return {wave: G.run.wave, towers: G.towers.length, units: G.units.length, summons: G.units.filter(u=>u.summon).length, walls: G.run.walls, wallCells: G.forts.filter(f=>f.site).length} }"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if pg.evaluate("() => !!document.querySelector('#p-codex')"):
        pg.click('#p-codex'); pg.wait_for_timeout(300); shot(pg, 'i_codex')
    print('ERRORS', len(errs)); print('\n'.join(errs[:5]))
    b.close()
