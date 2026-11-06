"""Close-up render check: spawns a skirmish next to the keep at a given zoom and saves screenshots.
Usage: python3 tools/test/closeup.py [outdir] [zoomSetting] [w] [h]"""
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/closeup'
Z = int(sys.argv[2]) if len(sys.argv) > 2 else 2
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
H = int(sys.argv[4]) if len(sys.argv) > 4 else 860
os.makedirs(OUT, exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_timeout(2500)
    pg.evaluate("""(z) => { const L = window.__LICH, G = L.G; L.newCampaign('haunted'); G.settings.zoom = z; window.dispatchEvent(new Event('resize'));
      L.placeTower('brimstone', 17, 15); L.placeTower('tesla', 17, 24); L.placeTower('necrotic', 22, 19);
      for (let i = 0; i < 3; i++) for (const t of ['vampire','deathknight','golem','wraith','banshee','bonemage','skeleton','archer','zombie','pikeman']) L.spawnSquad(t, 260 + Math.random() * 80, 250 + Math.random() * 160);
      L.buyWell && (G.run.souls = 99999, L.buyWell('colossus'), L.buyWell('dragon'));
      for (const k of ['footman','knight','paladin','cavalry','priest','angel','griffon','crossbow','battlemage']) for (let i = 0; i < 3; i++) { const e = L.spawnEnemy(k, 'E'); e.x = 380 + Math.random() * 60; e.y = 300 + Math.random() * 60; }
      G.camera.x = 300; G.camera.y = 320; document.querySelector('.modal') }""", Z)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("() => { const G = window.__LICH.G; if (G.modal) window.__LICH.UI.closeModal(); G.camera.x = 300; G.camera.y = 320; }")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/closeup.png')
    print('ERRORS', len(errs), errs[:3])
    b.close()
