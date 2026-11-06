"""Zero-dependency preview server used for automated testing (no Vite needed).
- compiles nothing itself: run `tsc -p . --outDir build --noEmit false` first
- serves repo files, resolves extension-less ES module imports to .js,
  falls back to /assets for public files (mirrors Vite's publicDir)
- serves /play.html: index.html with an import map for Phaser."""
import http.server, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PLAY = None
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def translate_path(self, path):
        p = path.split('?')[0].split('#')[0]
        full = os.path.join(ROOT, p.lstrip('/'))
        if os.path.isfile(full): return full
        if os.path.isfile(full + '.js'): return full + '.js'
        alt = os.path.join(ROOT, 'assets', p.lstrip('/'))
        if os.path.isfile(alt): return alt
        return full
    def do_GET(self):
        if self.path.startswith('/play.html') or self.path == '/':
            html = open(os.path.join(ROOT, 'index.html')).read()
            html = html.replace('<script type="module" src="./src/main.ts"></script>',
              '<script type="importmap">{"imports":{"phaser":"/node_modules/phaser/dist/phaser.esm.js"}}</script><script type="module" src="/build/main.js"></script>')
            b = html.encode(); self.send_response(200); self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
    def guess_type(self, path):
        if path.endswith('.js'): return 'application/javascript'
        return super().guess_type(path)
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
