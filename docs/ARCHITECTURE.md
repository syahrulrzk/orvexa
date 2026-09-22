# ORVEXA — Architecture Document

**Produk:** Orvexa — AI Workforce / Autonomous AI Collaboration Platform
**Versi:** 1.0
**Status:** Final / MVP Planning
**Dokumen terkait:** [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [SECURITY.md](./SECURITY.md) · [DESIGN.md](./DESIGN.md)

---

## 1. Ringkasan

Orvexa adalah platform kolaborasi AI workforce. Arsitektur dirancang supaya:

1. **Real-time first** — chat, status agent, dan streaming token harus terasa instan.
2. **Extensible** — nambah agent, department, provider, dan MCP integration tanpa redesign.
3. **Human in control** — aksi sensitif wajib lewat approval.
4. **Self-hostable & open-source friendly** — bisa jalan di satu VPS atau laptop dev dengan `docker compose up`.

Dokumen ini menjelaskan pilihan stack, pembagian tanggung jawab antar service, alur data, kontrak antar komponen, dan jalur deployment.

---

## 2. Stack Teknologi (Final)

### 2.1 Keputusan

| Layer | Teknologi | Alasan |
|---|---|---|
| **Frontend + BFF** | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript | UI enterprise, SSR, route handlers sebagai API/BFF, satu bahasa untuk FE |
| **Styling** | Tailwind CSS v4 (CSS-first) + shadcn/ui | Sesuai arahan UI Corporate Gray, komponen accessible |
| **ORM / Migrasi** | Drizzle ORM + Drizzle Kit | Schema-as-code, migrasi SQL kustom (RLS, pgvector) |
| **API utama** | Next.js Route Handlers (`/api/*`) | REST untuk CRUD, server actions untuk mutasi |
| **Agent Runtime** | Python 3.12 worker (FastAPI opsional) | Ekosistem LLM/RAG/orchestration paling matang |
| **Database** | PostgreSQL 16 + pgvector | Satu DB untuk relasional + vector search |
| **Queue & Event Bus** | Redis 7 (Streams + Pub/Sub) | Job queue agent + fanout realtime |
| **Realtime transport** | SSE (server → client) + WebSocket fallback | Simpel, scalable, cocok di belakang reverse proxy |
| **Automation** | n8n (opsional) | Integrasi eksternal & scheduled jobs |
| **Tool Protocol** | MCP (roadmap) | Ekstensibilitas tool agent |
| **Reverse proxy** | Caddy / Nginx | TLS, routing |

### 2.2 Alasan memilih Hybrid (bukan full-TypeScript)

- **TypeScript** kuat untuk UI, tipe data end-to-end, dan DX frontend.
- **Python** unggul untuk: provider LLM (OpenAI/Anthropic/Gemini SDK), embedding & RAG, framework agent, eksekusi tool.
- Pemisahan ini membuat **agent runtime bisa di-scale horizontal terpisah** dari web tier, dan kontributor bisa kerja di layer sesuai keahlian.

> **Prinsip pembatas:** Python worker **tidak boleh** jadi satu-satunya jalur data. Semua state persisten tetap di PostgreSQL; Redis hanya transien.

---

## 3. Diagram Arsitektur High-Level

```text
                         👤 USER (Browser)
                                │
                    HTTPS + SSE / WebSocket
                                │
                  ┌─────────────▼─────────────┐
                  │        Next.js 16          │
                  │  ┌──────────────────────┐  │
                  │  │  UI (React/App Router)│  │
                  │  ├──────────────────────┤  │
                  │  │  BFF / Route Handlers │  │
                  │  │  Auth.js (RBAC)       │  │
                  │  │  SSE Gateway          │  │
                  │  └──────────────────────┘  │
                  └───────┬─────────────┬──────┘
                          │             │
             SQL (Prisma/ │             │ Redis PUBLISH/SUBSCRIBE
             Drizzle/Kysely)            │ + Redis Streams (enqueue)
                          │             │
              ┌───────────▼───┐   ┌─────▼──────────┐
              │ PostgreSQL 16 │   │    Redis 7     │
              │  + pgvector   │   │ Streams + PubSub│
              └───────▲───────┘   └─────▲──────────┘
                      │                 │
                      │ SQL             │ consume jobs / publish events
                      │                 │
                  ┌───┴─────────────────┴───┐
                  │   Python Agent Runtime   │
                  │  ┌────────────────────┐  │
                  │  │ Orchestrator        │  │
                  │  │ Provider Abstraction│  │
                  │  │ Tool / MCP Executor │  │
                  │  │ RAG / Embedding     │  │
                  │  │ Approval Gate       │  │
                  │  └────────────────────┘  │
                  └───────┬───────────┬──────┘
                          │           │
                  External APIs   ┌───▼────────────┐
                  (LLM providers) │  MCP Servers    │
                                  │ Prometheus, Wazuh│
                                  │ UniFi, Docker…  │
                                  └────────────────┘

                  ┌──────────────────────┐
                  │   n8n (opsional)      │  Webhook, cron,
                  │  Automation Layer     │  integrasi eksternal
                  └──────────────────────┘
```

---

## 4. Pembagian Tanggung Jawab (Separation of Concerns)

### 4.1 Next.js — Web + BFF

**Bertanggung jawab atas:**

- Rendering UI (Dashboard, Rooms, Agents, Teams, dst).
- Autentikasi & sesi (Auth.js).
- Otorisasi kasar (RBAC) sebelum request masuk.
- CRUD resource lewat Route Handlers.
- **SSE Gateway**: meneruskan event dari Redis Pub/Sub ke browser.
- Upload file ke object storage lokal (volume) / S3-compatible.
- Menulis `activity_logs` untuk aksi human.
- Menerima webhook dari n8n & provider eksternal.

**Tidak bertanggung jawab atas:**

- Memanggil LLM secara langsung.
- Menjalankan agent loop.
- Menyimpan API key provider dalam bentuk plaintext.

### 4.2 Python Agent Runtime — Otak

**Bertanggung jawab atas:**

- Consume job dari Redis Streams (`agent.jobs`).
- Menyusun konteks agent (room history, memory, knowledge retrieval).
- Memanggil provider LLM lewat abstraksi provider.
- Menjalankan tool & MCP.
- Streaming token & event balik ke Redis (`room.events`).
- Menulis `agent_runs`, `agent_events`, `agent_memories`, `messages` (sebagai agent).
- Mengajukan approval (`approvals`) dan **berhenti menunggu**.
- Menghitung usage token & biaya (`ai_usage`).
- Indexing dokumen knowledge (chunk + embedding ke pgvector).

**Tidak bertanggung jawab atas:**

- Auth user.
- Rendering.
- Kebijakan akses final (selalu minta Next.js/DB sebagai source of truth).

### 4.3 PostgreSQL — Source of Truth

Semua state persisten. Tidak ada business state yang hidup hanya di Redis. Kalau Redis di-flush, sistem harus recover dari DB.

### 4.4 Redis — Transien & Transport

- **Streams**: `agent.jobs` (work queue), `knowledge.jobs` (indexing).
- **Pub/Sub**: `room.events.{room_id}`, `agent.status`, `user.notifications`.
- **Cache**: session hot data, permission cache (dengan TTL + invalidasi).
- **Lock**: distributed lock per room/agent (cegah double-run).
- **Rate limit**: token bucket per user/agent/credential.

### 4.5 n8n — Integrasi (Opsional, Fase 6)

- Webhook masuk dari sistem eksternal (alert Prometheus, Wazuh, dll).
- Cron & scheduled workflow.
- Routing event ke Orvexa API.
- Notifikasi keluar (email/Slack/Telegram).

---

## 5. Kontrak Antar Komponen

### 5.1 Format Job (Next.js → Python via Redis Stream `agent.jobs`)

```json
{
  "job_id": "job_01HX...",
  "type": "agent.run",
  "company_id": "cmp_...",
  "agent_id": "agt_...",
  "room_id": "room_...",
  "trigger": {
    "kind": "mention | message | task | schedule | webhook | approval_resolved",
    "ref_id": "msg_... | task_... | evt_..."
  },
  "budget": { "max_steps": 8, "max_tokens": 12000 },
  "trace_id": "trc_...",
  "created_at": "2026-09-22T09:00:00Z"
}
```

### 5.2 Format Event (Python → Browser via Redis Pub/Sub `room.events.{room_id}`)

```json
{
  "event_id": "evt_...",
  "room_id": "room_...",
  "type": "message.delta | message.completed | agent.status | tool.call | approval.requested | task.created",
  "agent_id": "agt_...",
  "run_id": "run_...",
  "payload": { },
  "ts": "2026-09-22T09:00:01.123Z"
}
```

**Aturan:** event idempotent, punya `event_id` unik. Client boleh reconnect dan replay dari `Last-Event-ID` (SSE).

### 5.3 Panggilan Sinkron (Next.js → Python, opsional)

Untuk operasi yang butuh hasil langsung (mis. "test credential", "preview embedding"), Python worker mengekspos **internal HTTP API** (FastAPI) di network internal saja, tidak diekspos ke publik.

```text
POST /internal/agent/run        (jalankan agent, streaming via callback)
POST /internal/provider/test    (tes kredensial provider)
POST /internal/knowledge/search (debug retrieval)
GET  /internal/health
```

Dilindungi shared secret internal (`X-Internal-Token`), bukan JWT user.

---

## 6. Alur Data Kunci

### 6.1 Mengirim pesan & memicu agent

```text
1. User kirim pesan di Room
2. Next.js: validasi auth + permission (room.write)
3. Next.js: INSERT message (author=human) + INSERT activity_log
4. Next.js: PUBLISH message.completed ke room.events.{room_id}  → SSE ke semua client
5. Next.js: parse mention → XADD job ke agent.jobs
6. Python worker: consume job
7. Python: susun konteks (history + memory + RAG knowledge)
8. Python: panggil LLM (streaming) → PUBLISH message.delta per token
9. SSE Gateway Next.js: teruskan delta ke browser (typing effect)
10. Python: finalisasi → INSERT message (author=agent) + INSERT agent_run
11. Python: kalau agent mendelegasikan → XADD job baru untuk agent target
12. Python: kalau butuh aksi sensitif → INSERT approval + PUBLISH approval.requested
```

### 6.2 Incident otomatis (dari alert monitoring)

```text
Alert dari Prometheus/Wazuh
   ↓ (webhook ke n8n atau langsung ke /api/webhooks/monitoring)
Next.js API: verifikasi signature → INSERT event
   ↓
XADD job type=agent.run (NOC Agent)
   ↓
NOC → analisa → create incident room + task
   ↓
NOC mendelegasikan ke Infra Manager
   ↓
Infra Manager mendelegasikan ke SysAdmin/Network/Security
   ↓ (paralel, masing-masing dapat job)
Consolidate hasil → root cause → task remediasi
   ↓
Butuh approval? → approval.requested → tunggu human
   ↓
Eksekusi (tool/MCP) → verifikasi → generate RCA document
```

### 6.3 Approval flow (blocking)

```text
Agent butuh aksi sensitif (mis. firewall.modify)
   ↓
Python: INSERT approval (status=pending) → agent run status=waiting_approval
   ↓ (worker RELEASE, tidak blocking thread)
Human klik Approve/Reject di UI
   ↓
Next.js: UPDATE approval → INSERT decision → PUBLISH approval.resolved
   ↓
Python: XADD job type=agent.resume dengan approval_ref
   ↓
Agent melanjutkan dari checkpoint (state tersimpan di agent_runs.state)
```

**Penting:** worker tidak menahan resource saat menunggu approval. Semua approval bersifat async & resume-able.

---

## 7. Realtime Strategy

### 7.1 SSE vs WebSocket

| Aspek | SSE (dipilih utama) | WebSocket |
|---|---|---|
| Arah | Server → client | Bidirectional |
| Kompleksitas infra | Rendah (HTTP biasa) | Perlu sticky session / connection manager |
| Auto-reconnect | Native (`Last-Event-ID`) | Manual |
| Kirim pesan | Lewat HTTP POST | Lewat socket |

**Keputusan:** **SSE untuk server→client** (streaming token, event room) dan **HTTP POST untuk client→server** (kirim pesan). WebSocket hanya diaktifkan kalau nanti butuh presence/collab editing real-time.

### 7.2 Fanout

- Setiap instance Next.js subscribe ke Redis Pub/Sub.
- Satu channel per room: `room.events.{room_id}`.
- Untuk scalability multi-instance, gunakan Redis Pub/Sub (fanout ke semua instance), lalu filter per koneksi.
- Presence (siapa online) disimpan di Redis key dengan TTL, bukan Pub/Sub.

### 7.3 Backpressure

- Streaming token dibuffer (~50ms) sebelum di-flush ke SSE untuk hindari ribuan event kecil.
- Batas maksimal koneksi SSE aktif per user (mis. 5) untuk cegah abuse.

---

## 8. Agent Runtime (Python) — Desain Internal

### 8.1 Komponen

```text
worker/
├── main.py                 # Entry: consume Redis Streams
├── orchestrator/           # Loop: observe → plan → act → reflect
│   ├── loop.py
│   ├── delegation.py       # Agent-to-agent handoff
│   └── checkpoint.py       # Simpan/resume state (untuk approval & retry)
├── providers/              # Abstraksi provider LLM
│   ├── base.py             # Interface Provider
│   ├── openai.py
│   ├── anthropic.py
│   ├── gemini.py
│   ├── openai_compatible.py
│   └── local.py
├── tools/                  # Tool internal
│   ├── registry.py
│   ├── builtin/            # task.create, doc.generate, room.post
│   └── mcp/                # MCP client
├── rag/                    # Retrieval & embedding
│   ├── ingest.py
│   ├── chunker.py
│   └── search.py
├── guardrails/             # Approval gate, permission check, budget
└── telemetry/              # usage tokens, cost, tracing
```

### 8.2 Agent Loop

```text
Event masuk
  ↓
Muat konteks (room history, memory, knowledge terfilter permission)
  ↓
Evaluate goal (apakah perlu delegasi / tool / jawab)
  ↓
Cek permission & budget (guardrails)
  ↓
[Butuh approval?] → ya → simpan checkpoint → ajukan approval → STOP
  ↓ tidak
Pilih tool / agent target → eksekusi
  ↓
Evaluasi hasil
  ↓
Lanjut / Delegasi / Selesai
  ↓
Persist run + events + memory
```

### 8.3 Provider Abstraction

Semua provider implement interface seragam:

```python
class Provider(Protocol):
    async def chat(
        self,
        messages: list[Message],
        model: str,
        tools: list[ToolSpec] | None,
        stream: bool,
    ) -> AsyncIterator[ChatChunk]: ...

    async def embed(self, texts: list[str], model: str) -> list[list[float]]: ...

    def supports(self, capability: str) -> bool: ...
```

**Keuntungan:** ganti provider/fallback tanpa ubah kode agent. Fallback chain dikonfigurasi per agent (`ai_credentials.fallback_id`).

### 8.4 Budget & Guardrails

- `max_steps` per run (cegah loop tak terbatas).
- `max_tokens` / `max_cost` per run, per agent, per hari.
- Timeout per tool call.
- Tool call ke aksi sensitif **selalu** lewat approval gate.

---

## 9. RAG / Knowledge Pipeline

```text
Upload (PDF/DOCX/XLSX/CSV/MD/TXT/URL)
   ↓
Extract text (unstructured/tika)
   ↓
Chunk (semantic, ~512–1024 token, overlap 15%)
   ↓
Embed (provider embedding) → vector(1536)
   ↓
INSERT knowledge_chunks (content, embedding, metadata, scope)
   ↓
pgvector ivfflat/hnsw index
   ↓
Query: filter scope (company/team/project/room/agent) → cosine similarity
```

**Aturan akses:** retrieval **wajib** menerapkan filter permission sebelum similarity search (lihat [SECURITY.md](./SECURITY.md) §Knowledge ACL), bukan setelahnya.

---

## 10. Deployment

### 10.1 Topologi self-host (docker compose)

```text
docker compose up
├── web            (Next.js)          :3000
├── worker         (Python)           (no public port)
├── postgres       (pgvector)         :5432
├── redis          (Redis 7)          :6379
├── n8n (opsional)                    :5678
├── caddy          (TLS + reverse)    :80/:443
└── minio (opsional, object storage)
```

### 10.2 Scaling

| Beban | Aksi |
|---|---|
| Banyak koneksi SSE | Tambah instance `web` + Redis Pub/Sub fanout |
| Banyak agent run | Tambah replika `worker` (Redis Streams consumer group) |
| DB berat | Read replica, index tuning, partisi `messages` per bulan |
| Vector besar | HNSW index, atau pindah ke dedicated vector DB nanti |

### 10.3 Environment

Semua konfigurasi lewat environment variable. Lihat [SECURITY.md](./SECURITY.md) untuk daftar secret & cara manajemennya. Tidak ada secret yang di-commit ke repo.

### 10.4 Timezone — Wajib Asia/Jakarta (WIB)

Seluruh stack di-set ke **Asia/Jakarta** agar konsisten end-to-end dan audit DB langsung terbaca waktu Jakarta.

**Aturan:**

```text
1. Semua timestamp di API/event/DB memakai timestamptz (momen absolut).
2. Container & process di-set TZ=Asia/Jakarta.
3. PostgreSQL default timezone = 'Asia/Jakarta' (lihat DATABASE_SCHEMA.md §2.1).
4. Format tampilan user pakai Intl dengan timeZone 'Asia/Jakarta'.
5. Kontrak JSON antar service memakai ISO-8601 (boleh UTC, mis. ...Z);
   konversi ke WIB dilakukan di layer presentasi.
```

**Penerapan:**

```yaml
# docker-compose.yml
services:
  web:
    environment:
      TZ: Asia/Jakarta
  worker:
    environment:
      TZ: Asia/Jakarta
  postgres:
    environment:
      TZ: Asia/Jakarta
      PGTZ: Asia/Jakarta
  redis:
    environment:
      TZ: Asia/Jakarta
```

```ts
// apps/web — format tanggal tampilan
new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(createdAt);   // → "22 Sep 2026, 16.05"
```

**Verifikasi cepat:**

```bash
date                                        # harus menunjukkan WIB (+07)
docker compose exec postgres psql -U orvexa -c "SHOW timezone;"   # → Asia/Jakarta
```

---

## 11. Observability

- **Structured logging** (JSON) dengan `trace_id` yang mengalir Next.js → Redis → Python.
- **Metrics**: run count, latency per provider, token usage, queue depth, SSE connection count.
- **Health endpoints**: `/api/health` (web), `/internal/health` (worker).
- **Tracing** (opsional, OpenTelemetry): satu trace per agent run.

---

## 12. Batasan & Non-Goals (MVP)

- Belum ada collaborative document editing real-time.
- Belum ada full MCP marketplace (roadmap fase 6).
- Belum ada multi-region.
- Belum ada fine-grained UI permission builder (pakai preset dulu).
- n8n bersifat opsional; sistem harus tetap berfungsi tanpanya.

---

## 13. Roadmap Arsitektur

| Fase | Fokus |
|---|---|
| 1 | Fondasi: Auth, workspace, Next.js + worker skeleton, DB |
| 2 | Realtime: Rooms, SSE, message persistence |
| 3 | Agent: 5 agent infra, loop, provider abstraction |
| 4 | Intelligence: delegation, memory, RAG, tasks, decisions |
| 5 | Governance: permission, approval, audit, cost tracking |
| 6 | Integrations: n8n, MCP servers, monitoring tools |

---

## 14. Keputusan Arsitektur (ADR Ringkas)

| # | Keputusan | Alasan | Konsekuensi |
|---|---|---|---|
| ADR-001 | Hybrid Next.js + Python worker | Kekuatan terbaik dua ekosistem | Perlu 2 runtime + kontrak jelas |
| ADR-002 | Postgres+pgvector sebagai satu-satunya datastore persisten | Simpel untuk self-host | Butuh tuning untuk skala besar |
| ADR-003 | Redis Streams sebagai job queue | Ringan, sudah ada untuk pub/sub | Perlu idempotency & consumer group |
| ADR-004 | SSE untuk realtime | Sederhana, auto-reconnect | Client→server tetap HTTP |
| ADR-005 | Agent run async & checkpoint-based | Approval tidak blocking | Perlu state machine run |
| ADR-006 | Multi-tenant via `company_id` + RLS | Isolasi data kuat | Setiap query harus scoped |
