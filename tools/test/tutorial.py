"""First-run onboarding, start to finish with real clicks: the welcome card over the menu, the guided first siege
(top bar, host, spells, wave button, the O.R.B and the Skirmish, the Death Wave pause), the quiet gift after the first
loss, the guided Phylactery visit (first muster, Zombie Horde, the refund button) and the release of every clamp.
Usage: python3 tools/test/tutorial.py [outdir]   (the page is opened with ?tut: test browsers skip the tutorial otherwise)"""
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tut'
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/play.html?tut'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e) + '\n' + (e.stack or '')[:800]))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    n = [0]
    def shot(name): n[0] += 1; pg.screenshot(path=f'{OUT}/{n[0]:02d}_{name}.png')
    def bubble(): return pg.evaluate("() => { const b = document.querySelector('#tut:not(.hidden) .tbub'); return b ? b.innerText : null }")
    tut = lambda: pg.evaluate("() => window.__LICH.G.stats.tut")
    pg.goto(URL); pg.wait_for_timeout(3000)
    assert 'Welcome to Lich - Eternal Dominion!' in bubble(), bubble(); shot('welcome')
    # the menu under the card is blocked
    blocked = pg.evaluate("() => { const r = document.querySelector('.keepc').getBoundingClientRect(); return !document.querySelector('.keepc').contains(document.elementFromPoint(r.x + 20, r.y + 20)) }")
    assert blocked, 'menu reachable under the welcome card'
    pg.click('#tut-next'); pg.wait_for_timeout(200); assert bubble() is None and tut()['welcome']
    pg.click('.keepc[data-k="0"]'); pg.wait_for_timeout(900)
    for key in ('glance', 'host', 'spells'):
        assert key in bubble().lower(), (key, bubble()); shot('siege_' + key); pg.click('#tut-next'); pg.wait_for_timeout(250)
    assert 'Call the crusade' in bubble(); shot('siege_wave')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150); assert 'Call the crusade' in bubble(), 'a shortcut skipped a step'
    pg.click('#b-wave'); pg.wait_for_timeout(500)
    assert 'O.R.B' in bubble(); shot('orb'); pg.click('#tut-next'); pg.wait_for_timeout(250)
    assert 'Skirmish' in bubble(); shot('skirmish'); pg.click('#tut-next'); pg.wait_for_timeout(250)
    assert bubble() is None
    pg.click('.card.crusade >> nth=0')
    for _ in range(120):
        pg.wait_for_timeout(500)
        if bubble(): break
    assert 'Death Wave' in bubble(), bubble(); assert pg.evaluate("() => window.__LICH.G.paused"); shot('deathwave')
    pg.click('#spellbar [data-spell="deathwave"]'); pg.wait_for_timeout(400)
    st = pg.evaluate("() => { const G = window.__LICH.G; return { paused: G.paused, cd: G.run.spellCd.deathwave > 0 } }")
    assert bubble() is None and not st['paused'] and st['cd'], st
    # lose the siege
    before = pg.evaluate("() => { const G = window.__LICH.G; G.run.souls = 7; G.run.essence = 2; return { s: G.meta.souls, e: G.meta.essence } }")
    pg.evaluate("() => { window.__LICH.G.keep.hp = 1; }")
    for _ in range(240):
        pg.wait_for_timeout(500)
        if pg.evaluate("() => window.__LICH.G.phase") == 'over' and bubble(): break
    after = pg.evaluate("() => { const G = window.__LICH.G; return { s: G.meta.souls, e: G.meta.essence } }")
    print('purse after the first loss', before, '->', after)
    assert after['s'] >= before['s'] + 50 and after['e'] >= 15, after
    assert 'Phylactery' in bubble(); shot('defeat')
    pg.click('#d-meta'); pg.wait_for_timeout(500)
    assert 'Souls' in bubble() and 'first upgrade' in bubble(), bubble(); shot('web_skeleton')
    pg.click('.wnode[data-id="n_skeleton"]'); pg.wait_for_timeout(500)
    assert 'Try buying Zombie Horde now' in bubble(), bubble(); shot('web_zombie')
    pg.click('.wnode[data-id="u_zombie"]'); pg.wait_for_timeout(500)
    assert 'beautiful button' in bubble(), bubble(); shot('web_refund')
    lv = pg.evaluate("() => window.__LICH.G.meta.lv")
    assert lv.get('n_skeleton') == 1 and lv.get('u_zombie') == 1, lv
    pg.click('#tut-next'); pg.wait_for_timeout(300)
    t = tut(); print('tutorial state', t); assert t['done'] and bubble() is None
    shot('free')
    print('ERRORS', len(errs)); print('\n'.join(errs[:8]))
    b.close()
sys.exit(1 if errs else 0)
