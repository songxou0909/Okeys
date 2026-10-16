"""Optional loopback-only launcher for OKeys. Python standard library only."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen
import argparse
import json
import os
import subprocess
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parent
APP_ID = "okeys-chord-studio-v1"
last_seen = time.monotonic()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".wasm": "application/wasm", ".bcmap": "application/octet-stream", ".gz": "application/gzip"}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        global last_seen
        path = unquote(urlsplit(self.path).path)
        if path == "/__okeys_ping":
            last_seen = time.monotonic()
            payload = json.dumps({"app": APP_ID}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        target = (ROOT / path.lstrip("/")).resolve()
        public = target == ROOT / "index.html" or (
            target.is_relative_to(ROOT / "app") and target.suffix in {".js", ".mjs", ".css", ".svg", ".wasm", ".bcmap", ".pfb", ".ttf", ".otf", ".gz"}
        )
        if path == "/":
            self.path = "/index.html"
        elif not public or not target.is_file():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        # This server has no listing, write, upload, or general filesystem endpoint.
        self.send_error(405)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' blob: data:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; frame-ancestors 'none'")
        super().end_headers()

    def log_message(self, *args):
        pass


def open_app(url):
    candidates = [
        Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    for browser in candidates:
        if browser.is_file():
            subprocess.Popen([str(browser), "--app=" + url, "--start-fullscreen", "--window-size=1440,1000"])
            return
    webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--open", action="store_true", help="Open a standalone browser window")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--keep-alive", action="store_true")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError:
        # Reuse only our own server; never open an unrelated service on a busy port.
        try:
            with urlopen(url + "__okeys_ping", timeout=2) as response:
                if json.load(response).get("app") != APP_ID:
                    raise RuntimeError("The port belongs to another application.")
        except Exception as error:
            if args.open:
                # Browser-free, visible error for the hidden Windows launcher.
                import ctypes
                ctypes.windll.user32.MessageBoxW(0, f"Port {args.port} is in use. Run serve.py --port 8766 --open.\n{error}", "OKeys", 0)
            raise
        if args.open:
            open_app(url)
        return
    if not args.keep_alive:
        def idle_shutdown():
            while time.monotonic() - last_seen < 120:
                time.sleep(10)
            server.shutdown()
        threading.Thread(target=idle_shutdown, daemon=True).start()
    if args.open:
        open_app(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
