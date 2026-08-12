#!/usr/bin/env python3
"""Serve a build web (dist) com CACHE DESLIGADA — mata o problema do service
worker/cache do browser a agarrar código antigo. SPA fallback para index.html."""
import http.server
import os
import socketserver
import sys

# Porta: argumento explícito > $PORT (atribuída pelo harness) > 8095.
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT") or 8095)
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIST, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        alvo = self.translate_path(self.path)
        if not os.path.exists(alvo) and "." not in os.path.basename(self.path):
            self.path = "/index.html"  # rotas SPA → index
        return super().do_GET()


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("", PORT), H) as httpd:
    print(f"serve-dist (no-cache) em {PORT}")
    httpd.serve_forever()
