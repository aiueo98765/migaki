#!/usr/bin/env python3
"""磨 をローカルで開くための小さなサーバー。

    python scripts/serve.py            # http://localhost:8765
    python scripts/serve.py 9000       # 港を変える

file:// で開いても大体動くが、API キーを使う相談だけは
http:// で出した方が確実なので、こちらを使う。
"""
import http.server
import os
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 直したものがすぐ出るように、溜め込ませない
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/"
    with Server(("127.0.0.1", PORT), Handler) as srv:
        print(f"磨 → {url}   （Ctrl+C で止める）")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\n止めた")
