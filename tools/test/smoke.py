"""Headless smoke test: boots the game, opens the Phylactery web, starts a siege of the first keep, runs
a wave, captures screenshots and fails on any page error. Usage: python3 tools/test/smoke.py [outdir]"""
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8765/play.html'
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e) + '\n' + (e.stack or '')[:800]))
    pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_timeout(3000)
    pg.screenshot(path=f'{OUT}/01_menu.png')
    pg.click('#m-meta'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/01b_web.png')
    print('web nodes shown:', pg.evaluate("() => document.querySelectorAll('.wnode').length"))
    pg.click('#mt-back'); pg.wait_for_timeout(200)
    pg.click('.keepc[data-k="0"]'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/02_prep.png')
    print(pg.evaluate("() => { const G = window.__LICH.G; return {phase: G.phase, units: G.units.length, keep: G.run.keep} }"))
    pg.click('#b-wave'); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/02b_crusade.png'); pg.click('.card.crusade >> nth=1'); pg.wait_for_timeout(9000)
    pg.screenshot(path=f'{OUT}/03_wave.png')
    st = pg.evaluate("() => { const G = window.__LICH.G; return {phase: G.phase, wave: G.run.wave, enemies: G.enemies.length, units: G.units.length, kills: G.run.kills, souls: G.run.souls, keep: Math.round(G.keep.hp)} }")
    print(st); assert st['wave'] == 1
    print('ERRORS', len(errs)); print('\n'.join(errs[:8]))
    b.close()
sys.exit(1 if errs else 0)
