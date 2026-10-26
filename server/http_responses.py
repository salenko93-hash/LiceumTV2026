"""Shared response helpers for the HTTP router."""
from api_utils import encode_json

class ResponseMixin:
    def _send_json(self, code: int, payload) -> None:
        raw = encode_json(payload)
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _send_raw(self, code: int, raw: bytes, ctype: str, cache: str = "no-store") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(raw)

