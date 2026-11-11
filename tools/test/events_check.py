"""Story-event check: resolves every choice of every event several times (gambles both ways) in a live
campaign and reports runtime errors, unfilled {placeholders} and broken state (NaN souls, dead keep).
Usage: python3 tools/test/events_check.py [reps]"""
import sys, json
from playwright.sync_api import sync_playwright
REPS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8765/play.html'); pg.wait_for_timeout(2500)
    out = pg.evaluate("""async (reps) => {
      const L = window.__LICH, G = L.G; const D = await import('/build/data/events.js');
      L.newCampaign(0); if (G.modal) L.UI.closeModal();
      const bad = [], seen = {};
      for (const ev of D.EVENTS) for (let c = 0; c < ev.choices.length; c++) for (let k = 0; k < reps; k++) {
        G.run.wave = 9; G.run.souls = 50000; G.keep.hp = G.keep.maxHp; G.phase = 'prep';
        const ro = L.rogue(); ro.event = ev.id;
        let t;
        try { t = L.resolveEvent(c); } catch (e) { bad.push(ev.id + '#' + c + ' threw ' + e); continue; }
        if (!t) bad.push(ev.id + '#' + c + ' empty result');
        if (/\\{\\w+\\}/.test(t)) bad.push(ev.id + '#' + c + ' placeholder: ' + t);
        if (!isFinite(G.run.souls) || !isFinite(G.run.essence) || !isFinite(G.keep.hp) || !isFinite(G.keep.maxHp)) bad.push(ev.id + '#' + c + ' NaN state');
        seen[ev.id + '#' + c] = t;
        if (G.units.length > 1500) G.units.splice(0, G.units.length - 400);
      }
      // pool / chains
      G.run.wave = 3; L.rogue().seen = []; const r1 = L.eventPool().map(e => e.id); G.run.wave = 9; const r1b = L.eventPool().map(e => e.id); G.run.keep = 2; const r1c = L.eventPool().map(e => e.id); G.run.keep = 0;
      L.rogue().flags.courier = true; G.run.wave = 9; L.rogue().seen = []; const r2 = L.eventPool().map(e => e.id);
      return { n: D.EVENTS.length, bad, sample: Object.entries(seen).slice(0, 6), early: r1.length, keep1wave9: r1b.length, keep3wave9: r1c.length, hasGambit: r2.includes('bishopgambit'), courierExcluded: !r2.includes('courier'), zeal: L.rogue().zeal };
    }""", REPS)
    print(json.dumps(out, indent=1)[:4000])
    print('ERRORS', len(errs), errs[:5])
    assert not out['bad'] and not errs
    b.close()
