"""Enemy art showcase: spawns every crusader type and boss in rows near the camera, pauses the
simulation and saves a screenshot (for reviewing imported AI art in-game).
Usage: python3 tools/test/showcase.py [outfile] [zoomSetting] [w] [h]"""
import sys
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/showcase.png'
Z = int(sys.argv[2]) if len(sys.argv) > 2 else 3
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
H = int(sys.argv[4]) if len(sys.argv) > 4 else 900
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_timeout(2500)
    pg.evaluate("""async (z) => { const L = window.__LICH, G = L.G; const D = await import('/build/data/enemies.js');
      L.newCampaign('haunted'); G.settings.zoom = z; window.dispatchEvent(new Event('resize'));
      const units = ['footman','knight','paladin','inquisitor','cavalry','angel','griffon','construct','priest','crossbow','battlemage'];
      units.forEach((k, i) => { if (!D.ENEMIES[k]) return; const e = L.spawnEnemy(k, 'E'); e.x = 420 + i * 34; e.y = 250; e.face = -1; });
      D.BOSSES.forEach((d, i) => { const e = L.spawnEnemy(null, 'E', { boss: d }); e.x = 440 + i * 72; e.y = 360; e.face = -1; });
      G.camera.x = 600; G.camera.y = 310; }""", Z)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => { const L = window.__LICH, G = L.G; if (G.modal) L.UI.closeModal(); G.camera.x = 600; G.camera.y = 310; }")
    pg.wait_for_timeout(600)
    pg.wait_for_timeout(int(sys.argv[5]) if len(sys.argv) > 5 else 0); pg.evaluate("() => { window.__LICH.G.paused = true; }")
    pg.wait_for_timeout(800)
    pg.screenshot(path=OUT)
    print('ERRORS', len(errs), errs[:3])
    b.close()
