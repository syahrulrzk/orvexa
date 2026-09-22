# ORVEXA — Tasklist & Progress Tracker

> **Living document.** Update file ini setiap kali task selesai atau ada ide fitur baru.
> Tujuan: siapapun (termasuk agent) bisa lanjut kerja tanpa kehilangan konteks.
>
> Dokumen terkait: [PRD](./ORVEXA_Final_PRD_v1.0.md) · [docs/](./docs/README.md)

**Terakhir diupdate:** 2026-09-22
**Fase saat ini:** Fase 5 — Governance

---

## Cara Pakai

- Tandai dengan `[x]` kalau selesai, `[ ]` kalau belum, `[~]` kalau sedang dikerjakan.
- Setiap task punya **ID** supaya bisa dirujuk di chat/commit (mis. `F1-03`).
- Kalau ada fitur baru / revisi, catat di **§10 Backlog** dan **§11 Revision Log**, jangan langsung ubah PRD.
- Kalau selesai satu fase, update baris **Fase saat ini** di atas.

### Legend

```text
[x]  Selesai
[~]  Sedang dikerjakan
[ ]  Belum mulai
[!]  Diblokir / butuh keputusan
```

---

## 1. Ringkasan Progres

| Fase | Nama | Status | Progres |
|---|---|---|---|
| 0 | Perencanaan & Dokumentasi | 🟢 Selesai | 11/11 |
| 1 | Fondasi | 🟢 Selesai | 13/13 |
| 2 | Kolaborasi (Rooms & Realtime) | 🟢 Selesai | 7/7 |
| 3 | AI Infrastructure Department | 🟢 Selesai | 9/9 |
| 4 | Agent Intelligence | 🟢 Selesai | 7/7 |
| 5 | Governance | ⚪ Belum | 0/7 |
| 6 | Integrations & MCP | ⚪ Belum | 0/7 |

**Legenda status fase:** 🟢 Selesai · 🟡 Berjalan · ⚪ Belum mulai · 🔴 Blocked

---

## 2. Fase 0 — Perencanaan & Dokumentasi ✅

- [x] **F0-01** Baca & pahami PRD v1.0
- [x] **F0-02** Putuskan stack: Hybrid Next.js + Python worker
- [x] **F0-03** `docs/ARCHITECTURE.md`
- [x] **F0-04** `docs/DATABASE_SCHEMA.md`
- [x] **F0-05** `docs/SECURITY.md`
- [x] **F0-06** `docs/DESIGN.md` + indeks `docs/README.md`
- [x] **F0-07** `docs/API_SPEC.md`
- [x] **F0-08** `CONTRIBUTING.md` + root `README.md`
- [x] **F0-09** Lisensi OSS: **MIT** (`LICENSE`)
- [x] **F0-10** Keputusan migration tool: **Drizzle ORM + Drizzle Kit**
- [x] **F0-11** Konvensi timezone **Asia/Jakarta (WIB)** di seluruh stack & DB

---

## 3. Fase 1 — Fondasi 🟡

### Selesai

- [x] **F1-01** Scaffold monorepo (`apps/web`, `worker/`) + npm workspaces
- [x] **F1-02** Setup **Next.js 16** + React 19 + TypeScript + **Tailwind v4**
- [x] **F1-03** `docker-compose.yml` (web, worker, postgres+pgvector, redis) + Dockerfiles
- [x] **F1-04** `.env.example` + generator secret
- [x] **F1-05** Migrasi awal (`drizzle/0000_init.sql`) + runner migrasi
- [x] **F1-06** Seed: 5 tema, 26 skill, company demo, user demo, 5 agent infra
- [x] **F1-07** Auth.js (next-auth v5) credentials login + proteksi login
- [x] **F1-08** AppShell 3 kolom + sidebar navigasi + **theme switcher (5 tema)**
- [x] **F1-05b** Migrasi domain lanjutan (`0001_core_domains.sql`, 22 tabel) + parity Drizzle schema
- [x] **F1-02b** **shadcn/ui** (components.json, `cn()`, Button/Card/Input/Badge/Label) + mapping token Orvexa
- [x] **F1-07b** **Argon2id** + **RBAC helper** + **session database revocable** + **OAuth (Google/GitHub)**
- [x] **F1-09** **ESLint** (flat config) + **Prettier** + **CI GitHub Actions**
- [x] **F1-10** **16 halaman placeholder** untuk semua route navigasi
- [x] **F1-11** Migrasi `0002_auth_sessions.sql` (sessions + accounts)

**Verifikasi yang sudah dilakukan:**

```text
✓ npm run typecheck -w apps/web        → lolos
✓ npm run build -w apps/web            → Next.js 16.3.5 build sukses
✓ python -m py_compile (worker)        → lolos
✓ docker compose build worker          → image terbangun
✓ npm run db:migrate                   → 0000 + 0001 applied (41 tabel)
✓ npm run db:seed                      → 5 tema, 26 skill, 5 agent
✓ enum & index HNSW (pgvector)         → 15 enum, 2 index embedding
✓ npm run lint                        → 0 error (flat config)
✓ login credentials end-to-end        → session row dibuat, sid di JWT
✓ proteksi route                      → / tanpa cookie → 307 /login
✓ db:migrate                          → 0002_auth_sessions.sql applied
✓ SHOW timezone                        → Asia/Jakarta (now = +07)
✓ worker start                         → connect Redis, consumer group dibuat
```

---

## 4. Fase 2 — Kolaborasi (Rooms & Realtime) 🟢

- [x] **F2-01** CRUD Rooms + API `/api/v1/rooms` (tipe general/department/incident/project/war_room)
- [x] **F2-02** Room members (human + agent) + API add/remove
- [x] **F2-03** Message persistence + API list/kirim + publish event
- [x] **F2-04** SSE Gateway `/api/v1/rooms/[id]/events` (Redis Pub/Sub + keep-alive ping)
- [x] **F2-05** Composer: mention agent, **slash command** (`/help`, `/me`, `/alert`), **attachment** (upload + download terproteksi)
- [x] **F2-06** **Threads** (panel balasan + agregat `message_threads`), **reactions** (toggle emoji), **search** pesan per room
- [x] **F2-07** Agent status pill + indikator live + **typing indicator** (ephemeral via Redis)

**API baru:**

```text
POST   /api/v1/rooms/[id]/typing            typing indicator (ephemeral)
GET    /api/v1/rooms/[id]/search?q=         cari pesan di room
POST   /api/v1/rooms/[id]/attachments       upload attachment (multipart)
GET    /api/v1/attachments/[id]             download (cek company)
POST   /api/v1/messages/[id]/reactions      tambah reaksi
DELETE /api/v1/messages/[id]/reactions/[emoji]
GET    /api/v1/messages/[id]/thread         list balasan thread
POST   /api/v1/messages/[id]/thread         kirim balasan thread
```

**File baru/lain:**

```text
src/lib/redis.ts, events.ts, api.ts, validation.ts, storage.ts, messages.ts
src/lib/db/schema.ts         + messageThreads, messageReactions
drizzle/0003_message_threads_reactions.sql
src/components/rooms/room-view.tsx   (realtime + reactions + thread + search + slash + upload)
```

---

## 5. Fase 3 — AI Infrastructure Department 🟢

- [x] **F3-01** Python worker: consume Redis Streams + consumer group + ACK + concurrency
- [x] **F3-02** Provider abstraction: `openai`, `anthropic`, `gemini`, `openai_compatible`, `local`
      (+ fallback tool-call via teks untuk model yang tidak mendukung function calling)
- [x] **F3-03** Streaming token → Redis Pub/Sub → SSE (+ event `agent.message.started/completed`,
      `tool.call/result`, `agent.run.started/finished`, batching ~32 char / 50 ms)
- [x] **F3-04** Agent loop penuh + `BudgetGuard` (max step, max token, limit biaya harian, timeout)
- [x] **F3-05** Tool builtin: `room.post`, `task.create`, `doc.generate` (eksekusi di web)
- [x] **F3-06** Wire 5 agent infra: system prompt, skill (31 link), tool (15 link), provider + kredensial
- [x] **F3-07** Bridge trigger: mention `@agent` / reply ke pesan agent → enqueue job otomatis
- [x] **F3-08** Internal API `/api/internal/*` (context, runs, events, messages, usage, tools)
- [x] **F3-09** `lib/crypto.ts` AES-256-GCM untuk kredensial provider + bootstrap dari env lewat seed

**Alur satu run:**

```text
pesan room (mention agent)
  → web: redis XADD agent.jobs
  → worker: XREADGROUP → GET /internal/agents/:id/context
  → POST /internal/runs → LLM streaming → agent.token (SSE)
  → POST /internal/tools/execute (kalau ada tool call)
  → POST /internal/runs/:id/messages → message.created (SSE)
  → PATCH /internal/runs/:id + POST /internal/runs/:id/events
```

**File baru:**

```text
apps/web/src/lib/jobs.ts, agent-trigger.ts, agent-context.ts, credentials.ts, crypto.ts, tools.ts, internal.ts
apps/web/src/app/api/internal/**            (8 route)
apps/web/src/app/api/internal/agents/[id]/context/route.ts
worker/runtime/{api,publisher,budget,prompt}.py
worker/providers/{openai,anthropic,gemini}.py
scripts/dev/mock-openai-server.py            (mock provider untuk E2E offline)
```

**Verifikasi e2e (mock provider, tanpa API key asli):**

```text
✓ worker start            → consumer group dibuat, connect Redis + internal API
✓ mention @NOC            → job masuk agent.jobs (XLEN 1)
✓ run dibuat              → agent_runs.status = completed, step_count = 2
✓ streaming               → 8 event agent.token diterima klien
✓ tool call               → tool.call doc.generate → tool.result ok → event document.created
✓ jawaban agent          → pesan author_type=agent tersimpan + message.created (SSE)
✓ usage tercatat          → ai_usage 4 baris (400 in / 104 out token)
✓ agent_events           → step.start ×3, step.end, tool.call, tool.result, run.result
✓ status agent           → thinking → idle (terlihat via SSE agent.status)
✓ budget guard           → limit harian & max step/timeout aktif
```

---

## 6. Fase 4 — Agent Intelligence 🟢

- [x] **F4-01** Agent-to-agent delegation (+ `parent_run_id`): tool `agent.delegate`
      (web enqueue job `delegation`), worker meneruskan `parent_run_id` ke `agent_runs`,
      prompt menjelaskan sub-tugas + daftar agent yang bisa didelegasi.
- [x] **F4-02** Tasks: CRUD + dependencies (deteksi siklus BFS) + board kanban 5 kolom;
      assign ke agent memicu job `task.assigned` (worker otomatis jalan).
- [x] **F4-03** Agent memory 4 scope (`conversation`/`project`/`company`/`agent`) di
      `agent_memories`; recall otomatis di-inject ke konteks run; tool `memory.save`.
- [x] **F4-04** Knowledge Base: upload dokumen teks (md/txt/csv/json ≤5 MB) → chunk
      per-paragraf ber-overlap → embed (`text-embedding-3-small`, 1536 dim) → index
      `knowledge_chunks`; halaman `/knowledge` dengan uploader.
- [x] **F4-05** RAG retrieval **pre-filter permission di SQL** (agent_knowledge +
      knowledge_acl + scope dokumen, fail-closed); tool `kb.search` untuk agent +
      endpoint search untuk UI.
- [x] **F4-06** Decisions (kode auto `DEC-XXXX`) + Documents (MOP/SOP/RCA/report) dengan
      versioning otomatis; API + audit log + event room.
- [x] **F4-07** Activity Center: `lib/activity.ts` (log + broadcast `activity.logged`),
      API `/api/v1/activity`, halaman `/activity` dengan filter per kategori.

**File baru Fase 4:**

```text
apps/web/src/lib/{memory,embeddings,knowledge,retrieval,activity}.ts
apps/web/src/app/api/v1/tasks/**           (CRUD + dependencies)
apps/web/src/app/api/v1/knowledge/**       (KB list/create, upload+index, search)
apps/web/src/app/api/v1/decisions/route.ts
apps/web/src/app/api/v1/documents/**
apps/web/src/app/api/v1/activity/route.ts
apps/web/src/components/tasks/task-board.tsx
apps/web/src/components/knowledge/knowledge-uploader.tsx
apps/web/src/components/activity/activity-feed.tsx
halaman /tasks /knowledge /activity → ganti placeholder jadi UI nyata
worker: loop.py (parent_run_id + trigger delegation), prompt.py (memori + delegasi),
        tools/registry.py (+agent.delegate, +memory.save, +kb.search)
tools.ts: +agent.delegate, +memory.save, +kb.search
```

---

## 7. Fase 5 — Governance

- [ ] **F5-01** Permission matrix (RBAC + ABAC) di BFF + runtime
- [ ] **F5-02** RLS PostgreSQL aktif di semua tabel ber-`company_id`
- [ ] **F5-03** Approval workflow (request → decide → resume checkpoint)
- [ ] **F5-04** Enkripsi kredensial AES-256-GCM + rotasi + masking UI
- [ ] **F5-05** Audit log append-only + redaksi secret
- [ ] **F5-06** AI cost tracking
- [ ] **F5-07** Rate limiting, CSP & security headers, webhook signature

---

## 8. Fase 6 — Integrations & MCP

- [ ] **F6-01** MCP client di worker
- [ ] **F6-02** MCP server: Prometheus / Grafana
- [ ] **F6-03** MCP server: Wazuh, Docker, Kubernetes
- [ ] **F6-04** MCP server: UniFi, MikroTik, Firewall
- [ ] **F6-05** Integrasi n8n
- [ ] **F6-06** Tool sensitif wajib approval
- [ ] **F6-07** Notifikasi keluar (email/Slack/Telegram)

---

## 9. Struktur Repo Saat Ini

```text
orvexa/
├── apps/web/                     Next.js 16 (UI + BFF API + internal API)
│   ├── src/app/
│   │   ├── (pages)               dashboard, login, rooms, agents, tasks, ...
│   │   └── api/
│   │       ├── auth/[...nextauth]/   Auth.js
│   │       ├── health/               health check
│   │       ├── internal/             API worker (8 route, bearer token)
│   │       └── v1/                   REST publik (rooms, messages, ...)
│   ├── src/components/           app-shell, sidebar, topbar, theme-*, rooms/, ui/
│   ├── src/lib/                  env, time (WIB), auth, session, rbac, password, ids
│   │   └── db/                   schema.ts (Drizzle) + client
│   │   └── jobs.ts               producer Redis Streams → worker
│   │   └── agent-context.ts      perakit konteks run agent
│   │   └── credentials.ts        resolusi provider + kredensial
│   │   └── crypto.ts             AES-256-GCM untuk kredensial
│   │   └── tools.ts              definisi & eksekutor tool builtin
│   ├── drizzle/                  0000–0003 migrasi SQL
│   └── scripts/                  migrate.ts, seed.ts
├── worker/                       Python agent runtime
│   ├── main.py                   consume Redis Streams (consumer group)
│   ├── config.py                 settings dari env
│   ├── orchestrator/loop.py      siklus hidup run
│   ├── orchestrator/strategy.py  agent loop (pluggable via ADR-007)
│   ├── runtime/                  api (internal), publisher (Redis), budget, prompt
│   ├── providers/                openai, anthropic, gemini, factory
│   └── tools/registry.py         cermin metadata tool
├── scripts/dev/                  mock-openai-server.py (uji offline)
├── docs/                         arsitektur, db, security, design, API
├── docker-compose.yml · Caddyfile
├── README.md · CONTRIBUTING.md · LICENSE · TASKLIST.md
└── ORVEXA_Final_PRD_v1.0.md
```

---
## Phase 10 — Virtual Office

### Objective

Create an interactive visual workspace where users can
observe and interact with the Orvexa AI workforce across
multiple departments.

### Core Features

- Virtual Office navigation
- Department selection
- 3D/isometric office visualization
- Department rooms
- Agent workstations
- Agent presence/status
- Real-time agent activity
- Agent current task
- Agent current room
- Clickable agents
- Agent detail panel
- Enter room action
- Open task action
- Open agent action
- Department overview
- Mini map / floor map
- Camera controls
- Zoom / pan
- Floor switching
- Live activity feed

### Department Structure

Virtual Office must support multiple departments:

- Infrastructure
- Sales
- Marketing
- Finance
- Project Management
- HR
- Customer Support
- Technology

Infrastructure is the initial department.

### Agent Visualization

Each agent may be represented as a
workstation/person/avatar inside the office.

Example:

Network Agent
    ↓
Workstation
    ↓
🟢 Online
    ↓
"Analyzing network traffic"
    ↓
Task: INC-1042
    ↓
Room: #incident-network-002

### Agent Interaction

When the user clicks an agent:

┌─────────────────────────────┐
│ Network Agent          🟢   │
│ Network Engineer            │
├─────────────────────────────┤
│ Currently Working           │
│ Analyzing network traffic   │
│                             │
│ Current Task                │
│ INC-1042                    │
│                             │
│ Room                        │
│ #incident-network-002       │
│                             │
│ [Open Agent]                │
│ [View Task]                 │
│ [Enter Room]                │
└─────────────────────────────┘

### Department Interaction

User can:

- Select department
- Enter department
- View all agents
- View active agents
- View department activity
- View active tasks
- View alerts
- Enter specific room
- Inspect individual agents

### Real-Time State

Virtual Office should reflect existing Orvexa state:

Agent
→ Status
→ Current Task
→ Current Room
→ Activity
→ Tool Usage
→ Approval State

Example statuses:

🟢 Idle
🔵 Thinking
🟡 Working
🟠 Waiting Approval
🔴 Error
⚫ Disabled

These statuses already exist in the PRD and can become the
visual state of the agents inside the Virtual Office.

## 10. Backlog Fitur Baru (Belum masuk PRD)

> Catat ide di sini dulu. Setelah disetujui, pindahkan ke fase yang sesuai + update PRD.

| ID | Fitur | Nilai | Prioritas | Status |
|---|---|---|---|---|
| NB-01 | MFA / TOTP untuk owner & admin | Keamanan | Tinggi | Ide |
| NB-02 | SSO (SAML / OIDC) | Enterprise | Sedang | Ide |
| NB-03 | Custom Brand Theme (logo, warna company) | PRD §29 future | Sedang | Ide |
| NB-04 | Agent marketplace / template agent shareable | OSS community | Sedang | Ide |
| NB-05 | Marketplace MCP server | Ekstensibilitas | Sedang | Ide |
| NB-06 | Voice input di room | UX | Rendah | Ide |
| NB-07 | Mobile app / PWA | Aksesibilitas | Sedang | Ide |
| NB-08 | Export audit log & laporan biaya (CSV/PDF) | Compliance | Sedang | Ide |
| NB-09 | Multi-bahasa UI (i18n, EN + ID) | OSS reach | Sedang | Ide |
| NB-10 | Agent evaluation / benchmark harness | Kualitas | Sedang | Ide |
| NB-11 | Run replay & "time travel" debugging | Observability | Rendah | Ide |
| NB-12 | Budget & quota per team/project | Cost control | Tinggi | Ide |
| NB-13 | Approval delegation (proxy approver) | Ops | Rendah | Ide |
| NB-14 | Scheduled agent (cron / recurring task) | Otomasi | Sedang | Ide |
| NB-15 | Departemen baru (Sales, HR, Finance, dll) | Ekspansi produk | Rendah | Ide |
| NB-16 | Grafik & dashboard metrik agent | Insight | Sedang | Ide |
| NB-17 | Plugin system untuk tool kustom (non-MCP) | Ekstensibilitas | Rendah | Ide |
| NB-18 | Impersonation / view-as (admin debug) | Support | Rendah | Ide |
| NB-19 | Timezone per-user override (default tetap WIB) | UX global | Rendah | Ide |
| NB-20 | Adopsi LangGraph (atau Pydantic AI / LlamaIndex Workflows) sebagai strategi orkestrasi | Kekuatan graph/HITL | Rendah (trigger-based) | Ide |

---

## 11. Revision Log

> Catat perubahan penting, keputusan yang direvisi, atau fitur baru. Terbaru di atas.

### 2026-09-22 (sesi 10 — Fase 4 selesai)

- **R-034** — **Fase 4 selesai (7/7)**: delegasi antar agent, tasks + board, memory 4 scope,
  Knowledge Base + RAG, decisions + documents, Activity Center.
- **R-035** — **Delegasi tetap satu arah web→worker**: tool `agent.delegate` yang dieksekusi
  web memanggil `enqueueAgentJob` (bukan worker langsung XADD), konsisten dengan R-027.
  Run anak otomatis mencatat `parent_run_id` sehingga rantai delegasi bisa diaudit.
- **R-036** — **Embedding default mengikuti OQ-05**: `text-embedding-3-small` (1536 dim).
  Resolver kredensial embedding memakai pola yang sama dengan provider chat
  (agent → company → env). File: `lib/embeddings.ts`.
- **R-037** — **RAG fail-closed**: pre-filter permission dievaluasi **di dalam SQL**
  (agent_knowledge + knowledge_acl + scope), bukan difilter di aplikasi setelah query —
  chunk yang tidak berhak tidak pernah keluar dari database. Tanpa grant khusus,
  agent hanya melihat dokumen scope `company`.
- **R-038** — **KB MVP hanya dokumen teks** (md/txt/csv/json ≤5 MB). PDF/DOCX butuh parser
  biner; ekstraksi akan dipindah ke worker Python (Fase 6) sesuai arah arsitektur.
- **R-039** — **Dokumen final ber-versioning**: edit konten dokumen berstatus `final`
  otomatis menaikkan versi dan mengembalikan status ke `draft` (jejak revisi).
- **R-040** — **Activity Center satu pintu**: `logActivity()` mencatat ke `activity_logs`
  sekaligus broadcast SSE `activity.logged`; API CRUD task/decision/document memakai helper
  ini sehingga audit trail dan feed realtime tidak berbeda sumber.

### 2026-09-22 (sesi 9 — Fase 3 selesai)

- **R-026** — **Fase 3 selesai (6/6 + 3 tambahan)**: worker Python benar-benar menjalankan agent. Provider konkret (OpenAI/Anthropic/Gemini/OpenAI-compatible/lokal), streaming token ke Redis → SSE, agent loop penuh dengan `BudgetGuard`, dan tool builtin (`room.post`, `task.create`, `doc.generate`).
- **R-027** — **Keputusan arsitektur: tool dieksekusi di web**, bukan di Python. Worker menerima JSON Schema tool lewat konteks lalu memanggil `/api/internal/tools/execute`. Alasan: validasi, RBAC, dan publikasi event tetap satu pintu; tidak ada duplikasi logika DB di dua bahasa. Worker juga **tidak** menulis PostgreSQL langsung.
- **R-028** — **Internal API dibalik arahnya menjadi Python → Next.js** (`/api/internal/*`, `Authorization: Bearer INTERNAL_API_TOKEN`, constant-time, fail-closed 503). Detail di [API_SPEC](./docs/API_SPEC.md) §15 & [SECURITY](./docs/SECURITY.md) §9.2.
- **R-029** — **Kredensial provider**: `lib/crypto.ts` (AES-256-GCM, key version, masking `last4`). Resolusi berjenjang: kredensial agent → kredensial company → env. Seed mem-bootstrap `ai_providers`/`ai_credentials`/`ai_models` dari env dan menautkannya ke 5 agent infra.
- **R-030** — **Perbaikan bug yang ditemukan saat verifikasi**:
  - `apps/web/next.config.mjs` kini memuat `.env` **root monorepo** — sebelumnya `npm run dev -w apps/web` hanya membaca `apps/web/.env` sehingga `INTERNAL_API_TOKEN`/`DATABASE_URL` diabaikan secara senyap.
  - `apps/web/Dockerfile` gagal build karena `COPY apps/web/node_modules` (npm workspaces menaruh dependency di root). Image web kini terverifikasi terbangun.
  - `next.config.mjs` ikut disalin ke image runtime.
- **R-031** — Kontrak konteks worker memakai **snake_case** (`base_url`, `api_key`) konsisten dengan API_SPEC; sebelumnya campur camelCase dan membuat provider selalu dianggap tanpa kredensial.
- **R-032** — Ditambahkan `scripts/dev/mock-openai-server.py`: mock provider OpenAI-compatible untuk menguji seluruh rantai (streaming, tool call, usage) **tanpa API key** — dipakai untuk verifikasi e2e Fase 3.
- **R-033** — Login: hash seed lama (scrypt) di-upgrade transparan ke **Argon2id** saat login pertama berhasil.

### 2026-09-22 (sesi 7 — Fase 2 selesai)

- **R-022** — **Fase 2 selesai (7/7)**: slash command, attachment (upload + download terproteksi, allowlist ekstensi + batas ukuran), threads, reactions, pencarian pesan (trigram index), dan typing indicator. Migrasi `0003_message_threads_reactions.sql`. Diverifikasi end-to-end via HTTP + SSE: `message.created`, `reaction.added`, `typing`, thread reply, upload.

### 2026-09-22 (sesi 6 — keputusan LangGraph + HTTPS)

- **R-020** — **ADR-007**: MVP **tidak** memakai LangGraph. Orkestrator worker dibuat **swappable** lewat `orchestrator/strategy.py` (`Strategy` protocol + `DefaultStrategy`) agar LangGraph/alternatif bisa ditambah tanpa rewrite. Trigger tinjau ulang didokumentasikan di ARCHITECTURE §10.6.
- **R-021** — **ADR-008**: **Caddy** ditambahkan sebagai reverse proxy opsional (`--profile proxy`) untuk `originlabs.my.id` dengan HTTPS otomatis + `flush_interval -1` agar SSE tidak di-buffer. Env `ORVEXA_DOMAIN` + `AUTH_URL` ditambahkan ke `.env.example`. Konfigurasi diverifikasi dengan `caddy validate`.

### 2026-09-22 (sesi 5 — Fase 2 dimulai)

- **R-018** — **Fase 2 (F2-01…F2-04) selesai**: API Rooms + members + messages, SSE gateway realtime berbasis Redis Pub/Sub, halaman `/rooms` dan `/rooms/[id]` dengan composer & mention. Diverifikasi end-to-end: create room → buka SSE → kirim pesan → event `message.created` diterima klien, pesan tersimpan di DB.

### 2026-09-22 (sesi 4 — Fase 1 selesai)

- **R-014** — **F1-02b** selesai: shadcn/ui terpasang (Button, Card, Input, Badge, Label) dengan variabel shadcn dipetakan ke token Orvexa sehingga 5 tema tetap berlaku.
- **R-015** — **F1-07b** selesai: password **Argon2id**, **RBAC** (`lib/rbac.ts`), **session database revocable** (`sessions` + `accounts`, migrasi `0002`), **OAuth Google/GitHub** opsional. Login credentials diuji end-to-end; route terproteksi redirect ke `/login`.
- **R-016** — **F1-09** selesai: ESLint flat config (`eslint-config-next`), Prettier, dan CI GitHub Actions (web: lint/typecheck/build; worker: compile/import).
- **R-017** — **F1-10** selesai: 16 halaman placeholder untuk seluruh route navigasi (tidak ada 404).

### 2026-09-22 (sesi 3 — migrasi domain lanjutan)

- **R-013** — **F1-05b selesai**: migrasi `0001_core_domains.sql` (22 tabel: projects, tasks, approvals, decisions, documents, knowledge + pgvector, agent runs/events/memory, permissions, MCP, usage) + parity Drizzle schema. DB total **41 tabel, 15 enum, 2 index HNSW**. Diverifikasi typecheck, build, dan query `information_schema`.

### 2026-09-22 (sesi 2 — scaffold)

- **R-012** — Scaffold **Fase 1**: monorepo, Next.js 16, worker Python, Docker, migrasi awal (19 tabel), seed, auth credentials, AppShell + 5 tema. Semua diverifikasi (typecheck, build, migrate, seed, timezone, worker).
- **R-011** — **Upgrade ke Next.js 16.3.5** (dari 15) + React 19.3 + **Tailwind v4** (konfigurasi CSS-first). Diminta oleh maintainer.
- **R-010** — Lisensi diputuskan **MIT** (maksimal adopsi). Alternatif AGPL-3.0 dipertimbangkan bila kelak perlu melindungi dari hosting tertutup.
- **R-009** — Keputusan **Drizzle ORM** sebagai satu-satunya sumber schema & migrasi.
- **R-008** — **Timezone Asia/Jakarta (WIB)** diterapkan end-to-end: DB (`ALTER DATABASE ... SET timezone`), env `TZ`, format tampilan `Intl`. Terverifikasi `SHOW timezone = Asia/Jakarta`.
- **R-007** — Menambah `docs/API_SPEC.md`, `CONTRIBUTING.md`, root `README.md`.

### 2026-09-22 (sesi 1 — dokumentasi)

- **R-006** — Finalisasi stack: Hybrid Next.js + Python worker.
- **R-005** — Konvensi ID ber-prefix (ULID-like) + `timestamptz` untuk semua kolom waktu.
- **R-004** — Menambahkan dokumen arsitektur, database, keamanan, dan desain.
- **R-003** — Keputusan schema ownership: Drizzle di `apps/web` (worker read/write saja).
- **R-002** — Database self-host only (PostgreSQL + pgvector).
- **R-001** — Bahasa dokumentasi: **Indonesia**.
- **Base** — PRD v1.0 dijadikan acuan final.

---

## 12. Keputusan Terbuka (Butuh Diambil)

| ID | Pertanyaan | Status |
|---|---|---|
| ~~OQ-01~~ | Schema ownership & migration tool | ✅ **Drizzle** |
| ~~OQ-02~~ | Lisensi OSS | ✅ **MIT** |
| ~~OQ-05~~ | Embedding model default | ✅ **OpenAI text-embedding-3-small (1536)** — sesuai dim di schema |
| ~~OQ-06~~ | Auth session | ✅ **JWT (MVP)** → roadmap DB session |
| OQ-03 | Object storage default | 🟡 Usul: **volume lokal** (MinIO/S3 opsional) |
| ~~OQ-04~~ | Provider default untuk seed agent | ✅ **Dari env** (`OPENAI_COMPATIBLE_API_KEY` dst.) → dienkripsi ke `ai_credentials` saat seed; agent lain bisa diatur dari UI Providers |
| ~~OQ-07~~ | UI primitives | ✅ **shadcn/ui** (di-mapping ke token Orvexa) |
| ~~OQ-08~~ | Orkestrasi worker: Redis Streams consumer group vs arq/Celery | ✅ **Redis Streams** (dipakai sejak F1, sudah terbukti di F3) |
| OQ-09 | Retry berjenjang + dead-letter untuk job gagal | 🟡 Usul: `XPENDING` + retry counter + stream `agent.jobs.dead` (Fase 5) |

---

## 13. Catatan untuk Sesi Berikutnya (Handoff)

Urutan yang disarankan:

1. **Quickstart dev:**
   ```bash
   docker compose up -d postgres redis
   npm install
   npm run db:migrate && npm run db:seed
   npm run dev            # http://localhost:3000  (login: lead@orvexa.dev / orvexa12345)
   npm run dev:worker     # butuh: cd worker && python -m venv .venv && pip install -r requirements.txt
   ```
2. Mulai **Fase 4 — Agent Intelligence**: delegasi antar agent (`parent_run_id`), Tasks (CRUD + board), agent memory, Knowledge Base + RAG, generator dokumen, Activity Center.
3. **Agar agent bisa membalas**, isi salah satu API key provider di `.env` lalu jalankan seed:
   ```bash
   # .env
   OPENAI_API_KEY=sk-...            # atau ANTHROPIC_API_KEY / GEMINI_API_KEY
   # provider lokal (Ollama):
   # LOCAL_LLM_API_KEY=ollama
   # LOCAL_LLM_BASE_URL=http://host.docker.internal:11434/v1
   npm run db:seed -w apps/web      # bootstrap ai_providers + ai_credentials (terenkripsi)
   ```
   Alternatif: simpan kredensial lewat menu **Providers** (belum ada UI-nya).
4. **Uji tanpa API key** (mock provider):
   ```bash
   python3 scripts/dev/mock-openai-server.py --port 8089
   docker run -d --name orvexa-mock-llm --network orvexa_default \
     -v "$PWD/scripts/dev:/app:ro" python:3.12-slim \
     python /app/mock-openai-server.py --port 8089
   # set base_url provider ke http://orvexa-mock-llm:8089/v1, lalu kirim pesan yang
   # menyebut kata TOOLTEST untuk menguji jalur tool call.
   ```

**Deployment (domain + HTTPS):**

```bash
# dev di server (langsung)
AUTH_URL=http://<IP-SERVER>:3000 docker compose up -d --build

# prod via domain
# .env: AUTH_URL=https://originlabs.my.id, ORVEXA_DOMAIN=originlabs.my.id
docker compose --profile proxy up -d --build
```

Panduan lengkap: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §10.5.

**Catatan worker:** `docker compose up -d --build` sudah menjalankan worker sebagai
service. Untuk menjalankan satu kali saja (debug/memproses antrean lalu berhenti):

```bash
docker compose run --rm --no-deps -T worker
```

Sisa keputusan terbuka yang relevan: **OQ-03** (object storage) dan **OQ-09**
(retry + dead-letter) — keduanya menyentuh Fase 5/6.

**Catatan penting:** `.env` sudah dibuat dengan secret ter-generate (gitignored). Jangan commit.

**File kunci untuk konteks cepat:**

```text
ORVEXA_Final_PRD_v1.0.md      → produk & scope
TASKLIST.md                   → file ini (progres & backlog)
docs/ARCHITECTURE.md          → cara sistem dibangun
docs/DATABASE_SCHEMA.md       → model data (DDL lengkap)
docs/SECURITY.md              → aturan keamanan wajib
docs/DESIGN.md                → design system & komponen
docs/API_SPEC.md              → kontrak REST & event
CONTRIBUTING.md               → cara setup & kontribusi
```
