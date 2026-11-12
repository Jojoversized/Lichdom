"""UI flow test (v0.12), real clicks: menu -> Phylactery web (buy, shift-buy, locked node, building) ->
besiege keep 1 -> host and building present -> ramparts and a tower in their slots -> crusade -> wave ->
level-up -> spell -> wave summary -> save/reload -> end the siege (haul banked) -> web again -> the layout
is raised again on the next siege. Screenshots go to the given directory."""
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
    ev = lambda js: pg.evaluate(js)
    shot(pg, 'a_home')
    assert ev("() => document.querySelectorAll('.keepc').length") == 6 and ev("() => document.querySelectorAll('.keepc.locked').length") == 5
    # a purse to spend (as if several sieges had been fought)
    ev("() => { const m = window.__LICH.G.meta; m.souls = 4000; m.essence = 300; m.divinity = 0; }")
    pg.click('#m-meta'); pg.wait_for_timeout(400); shot(pg, 'b_web_start')
    lv = lambda i: ev(f"() => window.__LICH.metaLv('{i}')")
    vis = lambda: ev("() => document.querySelectorAll('.wnode').length")
    def node(i, shift=False):
        # centre the web on the node (it may be off-screen), then click it for real
        pg.evaluate("(i) => { const L = window.__LICH, m = L.META_BY_ID[i]; L.UI.webView = { x: -m.x, y: -m.y, z: 1 }; L.UI.showMeta(); }", i); pg.wait_for_timeout(60)
        pg.click(f'.wnode[data-id={i}]', modifiers=['Shift'] if shift else []); pg.wait_for_timeout(80)
    v0 = vis()
    node('n_skeleton')
    assert lv('n_skeleton') == 1 and vis() > v0, 'buying a node reveals its children'
    node('u_archer')
    assert lv('u_archer') == 0, 'a node below its parent threshold cannot be bought'
    pg.evaluate("() => { const L = window.__LICH, m = L.META_BY_ID.u_archer; L.UI.webView = { x: -m.x, y: -m.y, z: 1 }; L.UI.showMeta(); }"); pg.hover('.wnode[data-id=u_archer]'); pg.wait_for_timeout(150); tip = ev("() => document.querySelector('#tooltip').textContent"); print('locked tip:', tip[-70:]); assert 'Requires' in tip
    node('n_skeleton'); node('n_skeleton')
    node('u_archer'); assert lv('u_archer') == 1, 'threshold reached: unlock bought with Life Essence'
    s0 = ev("() => window.__LICH.G.meta.souls")
    node('f_keep'); node('f_keep')
    node('f_walls'); node('f_walls')
    node('f_towers')
    node('b_forge')
    node('n_dmg', True)
    st = ev("() => { const L = window.__LICH, m = L.G.meta; return { souls: m.souls, ess: m.essence, walls: L.wallSlots(), towers: L.towerSlots(), forge: L.metaLv('b_forge'), dmg: L.metaLv('n_dmg') }; }")
    print('web after buying:', st, 'souls before the Fortress buys', s0); assert st['walls'] == 2 and st['towers'] == 1 and st['forge'] == 1 and st['dmg'] >= 3 and not ev("() => window.__LICH.canBuyMeta('n_dmg')")
    shot(pg, 'c_web_bought')
    # pan and zoom the web
    box = pg.query_selector('#web').bounding_box()
    pg.mouse.move(box['x'] + 80, box['y'] + 80); pg.mouse.down(); pg.mouse.move(box['x'] + 200, box['y'] + 160, steps=4); pg.mouse.up()
    pg.mouse.wheel(0, 400); pg.wait_for_timeout(150); shot(pg, 'c2_web_zoomed')
    # show the whole web once (every node owned at level 1) for a layout screenshot, then restore
    ev("() => { const L = window.__LICH; window.__lv = JSON.stringify(L.G.meta.lv); for (const m of L.META) L.G.meta.lv[m.id] = Math.max(1, L.G.meta.lv[m.id] || 0); L.UI.webView = { x: 0, y: 0, z: 0.3 }; L.UI.showMeta(); }")
    pg.wait_for_timeout(500); shot(pg, 'c3_web_full')
    ev("() => { const L = window.__LICH; L.G.meta.lv = JSON.parse(window.__lv); L.UI.webView = { x: 0, y: 0, z: 1 }; L.UI.showMeta(); }")
    pg.click('#mt-back'); pg.wait_for_timeout(200)
    pg.click('.keepc[data-k="1"]'); pg.wait_for_timeout(100); assert ev("() => window.__LICH.G.phase") == 'menu', 'a locked keep cannot be besieged'
    pg.click('.keepc[data-k="0"]'); pg.wait_for_timeout(600);
    st = ev("() => { const L = window.__LICH, G = L.G; return { units: G.units.length, expect: L.musterCount('skeleton') + L.musterCount('archer'), forge: L.bld('forge'), blds: G.buildings.length, spells: G.run.spells, souls: G.run.souls }; }")
    print('siege begins:', st); assert st['units'] == st['expect'] and st['forge'] == 1 and st['blds'] == 1 and st['souls'] == 0
    def world_click(wx, wy, button='left'):
        sx, sy = pg.evaluate(f"() => {{ const s = window.__LICH.game.scene.getScene('game'); return s.worldToScreen({wx},{wy}); }}")
        pg.mouse.move(sx, sy); pg.wait_for_timeout(60); pg.mouse.down(button=button); pg.mouse.up(button=button); pg.wait_for_timeout(80)
    # ramparts: two segments allowed, the third click is refused
    assert ev("() => window.__LICH.UI.tab") == 'fort'  # the drawer opens on Ramparts & Traps when the web grants any
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(120)
    for sid in ['keep_g', 'keep_n', 'keep_s']:
        gx, gy = pg.evaluate("(id) => { const s = window.__LICH.G.map.sites.find(s => s.id === id); const c = s.cells[0]; return [c[0] * 16 + 8, c[1] * 16 + 8]; }", sid)
        world_click(gx, gy)
    wl = ev("() => window.__LICH.G.run.walls"); print('ramparts:', wl); assert wl == {'keep_g': 1, 'keep_n': 1}
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.click('.tabs button[data-tab=towers]'); pg.wait_for_timeout(120)
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(100)
    cells = pg.evaluate("() => window.__LICH.mountCells().filter(p => p.mount === 'keep_g').map(p => [p.x, p.y])")
    sx, sy = pg.evaluate(f"() => window.__LICH.game.scene.getScene('game').worldToScreen({cells[0][0]}, {cells[0][1]})")
    pg.mouse.move(sx, sy); pg.wait_for_timeout(200); shot(pg, 'd_tower_ghost')
    world_click(*cells[0]); world_click(*cells[-1])
    assert ev("() => window.__LICH.G.towers.length") == 1, 'one tower slot: the second tower is refused'
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.click('.tabs button[data-tab=army]'); pg.wait_for_timeout(150); shot(pg, 'e_host_tab')
    pg.click('#buildlist .bitem >> nth=0'); pg.wait_for_timeout(200); shot(pg, 'e2_unit_detail'); pg.click('#ud-back'); pg.wait_for_timeout(150)
    pg.click('#b-collapse'); pg.wait_for_timeout(150)
    assert ev("() => document.querySelector('#buildbar').classList.contains('collapsed')")
    pg.click('#b-wave'); pg.wait_for_timeout(400); shot(pg, 'f_crusade')
    print('crusade offer:', ev("() => window.__LICH.G.crusadeOffer.waves.map(w => w.total)"))
    pg.click('.card.crusade >> nth=2'); pg.wait_for_timeout(5000); shot(pg, 'g_wave')
    assert ev("() => window.__LICH.G.wave.tier") == 2 and ev("() => window.__LICH.rogue().zeal") == 1
    ev("() => { window.__LICH.G.run.pendingLevels = 1; }"); pg.wait_for_timeout(500); shot(pg, 'h_levelup')
    pg.keyboard.press('2'); pg.wait_for_timeout(200)
    pg.keyboard.press('1'); pg.wait_for_timeout(300)
    assert ev("() => (window.__LICH.G.run.spellCd.deathwave || 0) > 0"), 'spells cast without souls'
    r = ev("""() => { const L = window.__LICH, G = L.G; G.keep.hp = G.keep.maxHp = 1e7; let n = 0; while (G.phase === 'wave' && n++ < 30000) { G.run.pendingLevels = 0; L.step(1/30); } return {phase: G.phase, units: G.units.length, souls: G.run.souls, ess: G.run.essence, towers: G.towers.length}; }""")
    print('after wave 1:', r); assert r['phase'] == 'prep' and r['souls'] > 0 and r['ess'] > 0
    pg.wait_for_timeout(700); shot(pg, 'i_summary')
    ev("() => window.__LICH.UI.closeModal()")
    ev("() => window.__LICH.saveRun()")
    pg.reload(); pg.wait_for_timeout(2500)
    assert ev("() => !!document.querySelector('#m-cont')"); shot(pg, 'j_home_continue')
    pg.click('#m-cont'); pg.wait_for_timeout(800)
    rs = ev("() => { const G = window.__LICH.G; return {wave: G.run.wave, towers: G.towers.length, units: G.units.length, walls: G.run.walls, blds: G.buildings.length, souls: G.run.souls}; }")
    print('resumed:', rs); assert rs['wave'] == 1 and rs['towers'] == 1 and rs['blds'] == 1 and rs['souls'] == r['souls'] and rs['units'] == r['units']
    m0 = ev("() => window.__LICH.G.meta.souls")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); shot(pg, 'k_pause')
    pg.click('#p-abandon'); pg.click('#p-abandon'); pg.wait_for_timeout(500); shot(pg, 'l_siege_over')
    m1 = ev("() => window.__LICH.G.meta.souls"); print('haul banked:', m1 - m0); assert m1 - m0 == round(r['souls'])
    pg.click('#d-meta'); pg.wait_for_timeout(400); assert vis() > 5
    pg.click('#mt-go'); pg.wait_for_timeout(700)
    again = ev("() => { const G = window.__LICH.G; return {walls: G.run.walls, towers: G.towers.length, wave: G.run.wave}; }")
    print('next siege, remembered layout:', again); assert again['walls'] == {'keep_g': 1, 'keep_n': 1} and again['towers'] == 1 and again['wave'] == 0
    shot(pg, 'm_second_siege')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if ev("() => !!document.querySelector('#p-codex')"):
        pg.click('#p-codex'); pg.wait_for_timeout(300); shot(pg, 'n_codex')
    print('ERRORS', len(errs)); print('\n'.join(errs[:5]))
    b.close()
sys.exit(1 if errs else 0)
