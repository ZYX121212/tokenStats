import json
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional, Tuple

import httpx

from .config import AppConfig
from .parsers import parse_usage
from .storage import TokenStore


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


class ProxyServer:
    def __init__(self, config: AppConfig, store: TokenStore) -> None:
        self.config = config
        self.store = store
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._server:
            return
        handler = self._make_handler()
        self._server = ThreadingHTTPServer((self.config.proxy_host, self.config.proxy_port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def _make_handler(self):
        config = self.config
        store = self.store

        class TokenStatsHandler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self) -> None:
                if self.path == "/health":
                    self._write_json(200, {"ok": True})
                    return
                self._forward()

            def do_POST(self) -> None:
                self._forward()

            def do_PUT(self) -> None:
                self._forward()

            def do_DELETE(self) -> None:
                self._forward()

            def log_message(self, fmt: str, *args) -> None:
                return

            def _forward(self) -> None:
                provider, upstream_url = self._resolve_upstream()
                if not upstream_url:
                    self._write_json(404, {"error": "Unknown provider path. Use /openai, /anthropic, /gemini, or /compatible."})
                    return

                body = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
                request_json = self._safe_json(body)
                headers = self._forward_headers(provider)

                try:
                    with httpx.Client(timeout=120) as client:
                        upstream = client.request(
                            self.command,
                            upstream_url,
                            content=body or None,
                            headers=headers,
                        )
                except httpx.HTTPError as exc:
                    self._write_json(502, {"error": f"Upstream request failed: {exc}"})
                    return

                response_body = upstream.content
                response_json = self._safe_json(response_body)
                provider_cfg = config.providers.get(provider)
                parser_provider = provider_cfg.provider_type if provider_cfg else provider
                usage = parse_usage(parser_provider, request_json, response_json)
                if usage:
                    usage.provider = provider
                    store.record(usage)

                self.send_response(upstream.status_code)
                for key, value in upstream.headers.items():
                    if key.lower() not in HOP_BY_HOP_HEADERS:
                        self.send_header(key, value)
                self.send_header("Content-Length", str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)

            def _resolve_upstream(self) -> Tuple[str, str]:
                parsed = urllib.parse.urlsplit(self.path)
                parts = [part for part in parsed.path.split("/") if part]
                if not parts:
                    return "", ""
                provider = parts[0].lower()
                provider_cfg = config.providers.get(provider)
                if not provider_cfg:
                    return provider, ""
                if not provider_cfg.enabled:
                    return provider, ""
                suffix = "/" + "/".join(parts[1:])
                base = provider_cfg.base_url.rstrip("/")
                query = f"?{parsed.query}" if parsed.query else ""
                return provider, f"{_join_upstream_url(base, suffix)}{query}"

            def _forward_headers(self, provider: str) -> Dict[str, str]:
                headers = {
                    key: value
                    for key, value in self.headers.items()
                    if key.lower() not in HOP_BY_HOP_HEADERS
                }
                provider_cfg = config.providers.get(provider)
                if provider_cfg and provider_cfg.api_key:
                    auth_mode = provider_cfg.auth_mode
                    if auth_mode == "pass_through":
                        return headers
                    if auth_mode == "none":
                        headers.pop("Authorization", None)
                        headers.pop("x-api-key", None)
                        headers.pop("x-goog-api-key", None)
                    elif auth_mode == "gemini":
                        headers["x-goog-api-key"] = provider_cfg.api_key
                    elif auth_mode == "anthropic":
                        headers["x-api-key"] = provider_cfg.api_key
                        headers.pop("Authorization", None)
                    elif auth_mode == "x-api-key":
                        headers["x-api-key"] = provider_cfg.api_key
                    else:
                        headers["Authorization"] = f"Bearer {provider_cfg.api_key}"
                return headers

            def _safe_json(self, body: bytes):
                if not body:
                    return None
                try:
                    return json.loads(body.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    return None

            def _write_json(self, code: int, payload: Dict[str, object]) -> None:
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        return TokenStatsHandler


def _join_upstream_url(base: str, suffix: str) -> str:
    if not suffix or suffix == "/":
        return base
    base_parts = urllib.parse.urlsplit(base)
    base_path = base_parts.path.rstrip("/")
    suffix_path = suffix if suffix.startswith("/") else f"/{suffix}"
    if base_path.endswith("/v1") and suffix_path.startswith("/v1/"):
        suffix_path = suffix_path[3:]
    joined_path = f"{base_path}{suffix_path}"
    return urllib.parse.urlunsplit(
        (
            base_parts.scheme,
            base_parts.netloc,
            joined_path,
            base_parts.query,
            base_parts.fragment,
        )
    )
