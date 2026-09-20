import os
import mimetypes
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading


class VideoStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/stream":
            query = parse_qs(parsed.query)
            file_path = query.get("file", [None])[0]
            if not file_path or not os.path.isfile(file_path):
                self.send_error(404, "File not found")
                return

            file_size = os.path.getsize(file_path)
            content_type, _ = mimetypes.guess_type(file_path)
            content_type = content_type or "video/mp4"

            range_header = self.headers.get("Range", None)
            if range_header:
                match = re.search(r"bytes=(\d+)-(\d*)", range_header)
                if match:
                    start = int(match.group(1))
                    end = int(match.group(2)) if match.group(2) else file_size - 1
                    end = min(end, file_size - 1)
                    length = end - start + 1

                    self.send_response(206)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()

                    with open(file_path, "rb") as f:
                        f.seek(start)
                        bytes_to_send = length
                        while bytes_to_send > 0:
                            chunk_size = min(64 * 1024, bytes_to_send)
                            data = f.read(chunk_size)
                            if not data:
                                break
                            try:
                                self.wfile.write(data)
                            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                                break
                            bytes_to_send -= len(data)
                    return

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            with open(file_path, "rb") as f:
                while True:
                    data = f.read(64 * 1024)
                    if not data:
                        break
                    try:
                        self.wfile.write(data)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                        break
            return

        self.send_error(404, "Not found")

    def log_message(self, format, *args):
        # Quiet logger
        pass


class SilentHTTPServer(HTTPServer):
    def handle_error(self, request, client_address):
        # Suppress harmless client disconnects during HTML5 video streaming/seeking
        pass


def start_stream_server(port: int = 1422):
    try:
        server = SilentHTTPServer(("127.0.0.1", port), VideoStreamHandler)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        print(f"Local media preview server running on port {port}...")
        return server
    except Exception as e:
        print(f"Preview server already running or port in use: {e}")
        return None
