#!/usr/bin/env python3
"""Local server for the built Angular app with HTTP Range request support (video seeking).

Serves app/dist/prawko/browser (output of `npm run build` in app/) and the resources/ directory
under /resources/. Unknown paths return index.html (app routing).

Usage:  python tools/serve.py [port] [--no-browser]   ->  http://localhost:8000

Release packages contain this script bundled by PyInstaller into a standalone executable
(no Python needed) placed next to the app/ (built app) and resources/ directories.
"""
import http.server
import os
import re
import sys
import webbrowser

if getattr(sys, "frozen", False):
    # standalone executable from a release package: app/ and resources/ lie next to it
    ROOT = os.path.dirname(os.path.abspath(sys.executable))
    DIST = os.path.join(ROOT, "app")
else:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DIST = os.path.join(ROOT, "app", "dist", "prawko", "browser")
RESOURCES = os.path.join(ROOT, "resources")


class Handler(http.server.SimpleHTTPRequestHandler):
    # explicit types - on Windows mimetypes reads the registry, which may map e.g. .js to text/plain
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
                      ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm",
                      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}

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


def create_server(port, explicit):
    """Binds the given port; without an explicit port, tries the next ones if it is taken."""
    for p in [port] if explicit else range(port, port + 20):
        try:
            return http.server.ThreadingHTTPServer(("127.0.0.1", p), Handler), p
        except OSError:
            continue
    sys.exit(f"Port {port} is already in use")


def main():
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        print("WARNING: app is not built (cd app && npm install && npm run build) - serving only the resources/ directory")
    ports = [int(a) for a in sys.argv[1:] if a.isdigit()]
    server, port = create_server(ports[0] if ports else 8000, bool(ports))
    url = f"http://localhost:{port}/"
    print(f"App available at {url}  (Ctrl+C to stop)")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:
        # keep the console window of a double-clicked executable open, so the error can be read
        if getattr(sys, "frozen", False) and not isinstance(e, KeyboardInterrupt):
            print(e)
            input("Press Enter to exit...")
        raise
