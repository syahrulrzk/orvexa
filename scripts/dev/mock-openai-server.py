#!/usr/bin/env python3
"""Mock server OpenAI-compatible untuk menguji agent loop tanpa API key.

Dipakai untuk verifikasi Fase 3 secara offline: worker → provider → tool →
pesan ke room.

Jalankan:
    python3 scripts/dev/mock-openai-server.py --port 8089

Lalu di `.env`:
    OPENAI_COMPATIBLE_API_KEY=mock-key
    OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:8089/v1

Perilaku mock:
- Pesan mengandung "TOOLTEST"  → balas dengan tool call `doc.generate`,
  lalu pada turn berikutnya membalas teks penutup.
- Selain itu                   → streaming teks pendek.

Endpoint: POST /v1/chat/completions, POST /v1/embeddings, GET /health
"""

from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = "mock-gpt"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:  # noqa: A003
        print(f"[mock] {fmt % args}", flush=True)

    # ------------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json({"status": "ok"})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path.endswith("/embeddings"):
            self._json({"data": [{"index": 0, "embedding": [0.0] * 1536}]})
            return
        if not self.path.endswith("/chat/completions"):
            self._json({"error": "not found"}, 404)
            return

        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        messages = payload.get("messages") or []
        tools = payload.get("tools") or []
        last_user = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), ""
        )
        if isinstance(last_user, list):
            last_user = " ".join(str(p.get("text", "")) for p in last_user)

        wants_tool = (
            "TOOLTEST" in last_user
            and bool(tools)
            and "Hasil `" not in last_user  # sudah dapat hasil tool → jangan ulang
        )

        if wants_tool:
            # Pilih tool bernama `doc__generate` bila ada, agar argumen contoh cocok.
            names = [t["function"]["name"] for t in tools]
            tool_name = next((n for n in names if "doc" in n), names[0])
            if "doc" in tool_name:
                tool_args = {
                    "title": "Laporan Bandwidth NOC",
                    "doc_type": "report",
                    "content_md": "## Ringkasan\nBandwidth uplink normal pada 20 menit terakhir.",
                }
            else:
                tool_args = {"content": "Laporan bandwidth selesai disusun."}

            self._stream(
                [
                    {"choices": [{"delta": {"role": "assistant", "content": ""}}]},
                    {
                        "choices": [
                            {
                                "delta": {
                                    "tool_calls": [
                                        {
                                            "index": 0,
                                            "id": "call_mock_1",
                                            "type": "function",
                                            "function": {"name": tool_name, "arguments": ""},
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    {
                        "choices": [
                            {
                                "delta": {
                                    "tool_calls": [
                                        {
                                            "index": 0,
                                            "function": {
                                                "arguments": json.dumps(tool_args)
                                            },
                                        }
                                    ]
                                }
                            }
                        ]
                    },
                    {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]},
                    {
                        "choices": [],
                        "usage": {"prompt_tokens": 120, "completion_tokens": 30},
                    },
                ]
            )
            return

        if "TOOLTEST" in last_user:
            text = "Laporan sudah aku simpan sebagai draft dokumen. Ada lagi yang perlu dicek?"
        else:
            text = (
                "Analisis awal: pemakaian bandwidth uplink 78% pada 20 menit terakhir.\n"
                "- Cek top talker: `show ip accounting`\n"
                "- Rekomendasi: terapkan QoS sementara"
            )

        chunks: list[dict] = [{"choices": [{"delta": {"role": "assistant", "content": ""}}]}]
        for word in text.split(" "):
            chunks.append({"choices": [{"delta": {"content": word + " "}}]})
        chunks.append({"choices": [{"delta": {}, "finish_reason": "stop"}]})
        chunks.append(
            {
                "choices": [],
                "usage": {"prompt_tokens": 80, "completion_tokens": len(text.split())},
            }
        )
        self._stream(chunks)

    # ------------------------------------------------------------------
    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _stream(self, events: list[dict]) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        for event in events:
            event.setdefault("model", MODEL)
            chunk = f"data: {json.dumps(event)}\n\n".encode()
            self.wfile.write(f"{len(chunk):X}\r\n".encode() + chunk + b"\r\n")
            self.wfile.flush()
            time.sleep(0.02)

        done = b"data: [DONE]\n\n"
        self.wfile.write(f"{len(done):X}\r\n".encode() + done + b"\r\n")
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8089)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"mock OpenAI-compatible server di http://{args.host}:{args.port}/v1", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
