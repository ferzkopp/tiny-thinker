"""Local preview server for Tiny Thinker. Usage: python serve.py [--port 8000] [--bind 127.0.0.1] [--isolate]

--isolate adds COOP/COEP headers so wllama can use multithreaded WebAssembly.
"""
import argparse
import functools
import http.server
import os


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static file handler with correct JavaScript/WASM types, no caching and optional isolation headers."""

    isolate = False
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        """Adds Cache-Control (so edits show up on reload) and, if enabled, COOP/COEP before the body."""
        self.send_header("Cache-Control", "no-cache")
        if self.isolate:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    """Serves this folder until Ctrl+C."""
    parser = argparse.ArgumentParser(description="Local preview server for Tiny Thinker.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--isolate", action="store_true", help="add COOP/COEP headers for multithreaded CPU inference")
    args = parser.parse_args()
    Handler.isolate = args.isolate
    root = os.path.dirname(os.path.abspath(__file__))
    server = http.server.ThreadingHTTPServer((args.bind, args.port), functools.partial(Handler, directory=root))
    print(f"Serving {root} on http://localhost:{args.port}/ (cross-origin isolation {'ON' if args.isolate else 'off'})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
