#!/usr/bin/env python3
"""Local server for the built Angular app with HTTP Range request support (video seeking).

Serves app/dist/prawko/browser (output of `npm run build` in app/) and the resources/ directory
under /resources/. Unknown paths return index.html (app routing).

Usage:  python tools/serve.py [port] [--no-browser]   ->  http://localhost:8000
"""
import http.server
import os
import re
import sys
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "app", "dist", "prawko", "browser")
RESOURCES = os.path.join(ROOT, "resources")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mp4": "video/mp4", ".webm": "video/webm", ".json": "application/json",
                      ".js": "text/javascript"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/resources/"):
            self.directory = os.path.dirname(RESOURCES)
            return super().translate_path(path)
        self.directory = DIST
        local = super().translate_path(path)
        if not os.path.exists(local):
            return os.path.join(DIST, "index.html")  # app routes, e.g. /learn
        return local

    def send_head(self):
        self._remaining = None  # a keep-alive connection handles many requests
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        start = int(m.group(1)) if m and m.group(1) else 0
        end = int(m.group(2)) if m and m.group(2) else size - 1
        if m and not m.group(1) and m.group(2):  # bytes=-N (last N bytes)
            start, end = max(0, size - int(m.group(2))), size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        try:
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # browser aborted the download (e.g. video seek)

    def end_headers(self):
        if getattr(self, "_remaining", None) is None:
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        print("WARNING: app is not built (cd app && npm install && npm run build) - serving only the resources/ directory")
    port = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8000)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}/"
    print(f"App available at {url}  (Ctrl+C to stop)")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
