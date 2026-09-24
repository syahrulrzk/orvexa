# ORVEXA — Tasklist & Progress Tracker

> **Living document.** Update file ini setiap kali task selesai atau ada ide fitur baru.
> Tujuan: siapapun (termasuk agent) bisa lanjut kerja tanpa kehilangan konteks.
>
> Dokumen terkait: [PRD](./ORVEXA_Final_PRD_v1.0.md) · [docs/](./docs/README.md)

**Terakhir diupdate:** 2026-09-24
**Fase saat ini:** Fase 0–6 & Phase 10 selesai — Virtual Office live

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
| 5 | Governance | 🟢 Selesai | 7/7 |
| 6 | Integrations & MCP | 🟢 Selesai | 7/7 |

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

## 6b. Menu UI Completion (Fase 1–4) 🟢

> Menuntaskan halaman placeholder yang tersisa dari menu implementation — backend Fase 1–4 sudah ada, UI-nya menyusul.

- [x] **M-01** Agents: API CRUD (GET list + detail, POST, PATCH, DELETE) + skill/tool picker + provider & budget per agent
- [x] **M-02** Agents: halaman UI (daftar + form create + panel edit + delete)
- [x] **M-03** Providers: API CRUD (POST/PATCH/DELETE) + API key terenkripsi AES-256-GCM + rotasi + masking `last4`
- [x] **M-04** Providers: halaman UI (daftar, tambah, rotasi key, enable/disable)
- [x] **M-05** Decisions: halaman UI + API PATCH per-keputusan (approve/reject)
- [x] **M-06** Documents: halaman UI + viewer/editor Markdown + versioning otomatis (v+1 saat edit final)
- [x] **M-07** Projects: API CRUD baru (`/api/v1/projects`) + halaman UI dengan progress task
- [x] **M-08** Sidebar: flag `ready` diperbarui (Agents, Projects, Providers kini hijau)

**Perbaikan pre-existing yang ikut dikerjakan:**

```text
✓ RBAC: permission team.create/update/delete terdaftar (sebelumnya error TS)
✓ Route params Next.js 16: teams/skills/themes/members [id] → Promise<{...}> (dibaca via await)
✓ updateTeamSchema diekspor (sebelumnya diimpor tapi tidak diekspor)
✓ next.config.mjs: allowedDevOrigins ["originlabs.my.id"] untuk HMR via domain
```

**Sisa placeholder (sesuai rencana fase):** Approvals (F5-03), Settings (F5-01), MCP (F6-01), Virtual Office (Fase 10).

---

## 7. Fase 5 — Governance ✅

- [x] **F5-01** Permission matrix (RBAC + ABAC) di BFF + runtime
      — `lib/permissions.ts` (evaluator pure, fail-closed), wire ke `executeTool` +
      `/api/internal/tools/execute` (muat override `agent_permissions` + room type),
      UI panel permission per tool di halaman Agents, seed rows default,
      13 test `node:test`. Human RBAC (`rbac.ts`) ditambah permission `team.*`.
- [x] **F5-02** RLS PostgreSQL aktif di semua tabel ber-`company_id`
      — migrasi `0004_rls_company_isolation.sql`: policy `tenant_isolation` fail-closed
      (key GUC `app.company_id`) di 40 tabel tenant; tabel anak tanpa `company_id` via join parent;
      verifikasi otomatis di akhir migrasi; bukti fail-closed diuji dengan role non-superuser
      (dengan context → 1 baris, tanpa → 0); helper `withTenant()` (`lib/db/tenant.ts`) siap
      untuk aktivasi penuh (`ALTER ROLE orvexa NOSUPERUSER NOBYPASSRLS`) — staged rollout,
      runtime belum berubah.
- [x] **F5-03** Approval workflow (request → decide → resume checkpoint)
      — `lib/approvals.ts`: `requestApproval` (dari executeTool saat 202: row approvals +
      event room + agent waiting_approval), `decideApproval` (approve → tool dieksekusi SEKALI
      via override allow ter-audit + enqueue job resume `approval.resume`; reject → resume
      penolakan), `expireStaleApprovals` (24 jam, on-demand). API `/api/v1/approvals` (list)
      + `/decide`; halaman /approvals (pending + riwayat); worker `_resume_from_approval`
      menyampaikan hasil keputusan ke room tanpa loop LLM.
- [x] **F5-04** Enkripsi kredensial AES-256-GCM + rotasi + masking UI
      — sudah berjalan sejak Providers UI (AES-256-GCM via `lib/crypto.ts`, masking `last4`,
      rotasi per-API-key dengan nonaktif-otomatis versi lama); F5-04 melengkapi:
      **rotasi master key** tanpa downtime (`lib/keyring.ts` + `POST /api/v1/credentials/rotate`,
      kredensial gagal-dekripsi tidak disentuh), 6 test crypto (roundtrip, IV unik, tamper GCM,
      key version, masking), docs SECURITY §5.2.1.
- [x] **F5-05** Audit log append-only + redaksi secret
      — migrasi `0005_audit_append_only.sql`: trigger blok UPDATE/DELETE `activity_logs`
      (diverifikasi: keduanya terbukti error); redaksi di satu pintu `logActivity()`
      via `lib/redact.ts` (pola sk-/xox/ghp_/AKIA/JWT/Bearer/Telegram + field sensitif
      api_key/secret/token/password/authorization + rekursif depth-cap); 10 test redaksi.
- [x] **F5-06** AI cost tracking
      — `lib/cost.ts` (agregasi ai_usage: summary periode, per-agent dengan posisi budget
      harian, deret harian WIB, per-model) + API `GET /api/v1/costs` + halaman /costs
      (kartu ringkasan, grafik batang 14 hari, tabel budget per agent, token 30 hari);
      menu sidebar AI Costs; 5 test estimateCost.
- [x] **F5-07** Rate limiting, CSP & security headers, webhook signature
      — `lib/ratelimit.ts` (fixed-window Redis, atomic INCR+EXPIRE, fallback open-on-fail,
      limit: login 10/15men/IP, kirim pesan 30/menit/user, webhook 60/menit/IP);
      security headers di `next.config.mjs` (CSP dengan nonce dinamis — inline script
      Next.js tetap jalan, frame-ancestors none, X-Content-Type-Options, Referrer-Policy,
      Permissions-Policy); `lib/webhook.ts` HMAC-SHA256 `t=...,v1=...` toleransi 300 dtk
      + endpoint `/webhooks/monitoring` (event monitoring → room ops); 5 test webhook.

---

## 8. Fase 6 — Integrations & MCP

- [x] **F6-01** MCP client di worker
      — `worker/mcp/client.py`: JSON-RPC 2.0, transport **http** (Streamable HTTP,
      dukung respons JSON/SSE + header `Mcp-Session-Id`) dan **stdio** (spawn proses),
      handshake `initialize` + `notifications/initialized`, `tools/call` (flatten
      konten → teks), `tools/list`, `ping`; cache `McpClient` per server antar step.
      Sisi web: `lib/mcp.ts` (pure: fn-name mapping simetris `mcp__<server>__<tool>`,
      gate fail-closed `agent_mcp_access`, sanitasi argumen audit, ekspansi deferred
      placeholder `${CREDENTIALS.<id>}`), `lib/mcp-resolver.ts` (DB: spec tool MCP
      per agent, fail-closed tanpa grant), merge ke konteks run di
      `agent-context.ts`, endpoint internal **POST /api/internal/mcp/authorize**
      (satu pintu izin + audit: server/tool enabled → grant → permission matrix
      F5-01 → 202 approval_required | 200 connection-detail + args ter-injeksi
      kredensial untuk MCP client worker). Tool sensitif (risk high/critical /
      requiresApproval / override matrix) tetap wajib approval (202) — menyentuh
      F6-06. `InternalAPI.authorize_mcp()` di worker. Seed: server MCP "demo"
      (2 tool echo/now + grant `*` ke NOC) bila `MCP_DEMO_URL` diset.
      `scripts/dev/mock-mcp-server.py` (echo/now/add) + `smoke-mcp-client.py`.
      Test: 8 unit `mcp.test.mjs` (total 51) + smoke e2e client↔mock OK.
      DB: tabel mcp_servers/mcp_tools/agent_mcp_access sudah ada sejak 0001.
- [x] **F6-02** MCP server: Prometheus / Grafana
      — `mcp-servers/`: kit reusable (`common.py` — HTTP handler JSON-RPC 2.0,
      routing initialize/tools, registry `McpTool`, health endpoint, Bearer auth
      inline opsional) + dua server konkret **read-only**:
      `prometheus_server.py` (query, query_range, alerts, targets, health →
      Prometheus API) dan `grafana_server.py` (search_dashboards, get_dashboard,
      datasources, health → Grafana API, auth service-account/basic).
      Dockerfile bersama + 2 service compose (`--profile mcp`, port 9101/9102)
      + env `MCP_PROMETHEUS_URL`/`MCP_GRAFANA_URL` (seed auto-register tools +
      grant wildcard ke NOC; bearer env dienkripsi ke `auth_cipher`).
      Error upstream dilaporkan sebagai tool isError (fail-open utk health),
      bukan crash. Test: 13 unittest (`test_mcp_servers.py`, HTTP di-mock) +
      smoke e2e `scripts/dev/smoke-mcp-servers.py` (kit ↔ MCP client worker).
- [x] **F6-03** MCP server: Wazuh, Docker, Kubernetes
      — tiga server MCP **read-only** di kit `mcp-servers/`:
      `wazuh_server.py` (agents, agent_summary, vulnerabilities, rules,
      manager_status — JWT Wazuh: basic → token di-cache 800 dtk, retry
      otomatis saat 401), `docker_server.py` (containers, inspect, images,
      disk_usage, version — Docker Engine API via **unix socket**, HTTP
      minimal + dechunker sendiri), `kubernetes_server.py` (pods, nodes,
      deployments, events, version — via **kubectl** dengan argumen fixed
      tanpa shell; namespace divalidasi ketat; kubeconfig di-mount read-only).
      Compose `--profile mcp` (+9103/9104/9105), seed `MCP_WAZUH_URL` /
      `MCP_DOCKER_URL` / `MCP_KUBERNETES_URL` → tools + grant NOC otomatis.
      Test: 28 unittest (mock httpx/socket/subprocess; dechunker, JWT retry,
      namespace injection) + smoke e2e 5 server vs MCP client worker.
- [x] **F6-04** MCP server: UniFi, MikroTik, Firewall
      — tiga server MCP **read-only** tambahan di kit `mcp-servers/`:
      `unifi_server.py` (sites, devices, clients, site_health — login cookie
      SESSION, otomatis pilih `/api/login` self-hosted vs `/api/auth/login`
      UniFi OS), `mikrotik_server.py` (system_resource, interfaces, routes,
      dhcp_leases, wireless — RouterOS REST API ≥ 7.1, HTTP Basic), dan
      `fortigate_server.py` (system_status, system_performance,
      firewall_policies + hit counter, firewall_addresses, interfaces —
      REST API v2 dengan API token; mewakili "Firewall" di PRD).
      Compose `--profile mcp` (9106/9107/9108), seed `MCP_UNIFI_URL` /
      `MCP_MIKROTIK_URL` / `MCP_FORTIGATE_URL` → tools + grant NOC otomatis.
      Kit `common.py` kini mendukung handler async (await di task terpisah).
      Test: 39 unittest + smoke e2e 8 server vs MCP client worker.
- [x] **F6-05** Integrasi n8n
      — `lib/n8n.ts`: outbound ter-signature (kontrak HMAC F5-07) ke
      `N8N_WEBHOOK_URL` + parser inbound 3 aksi (post_message, trigger_agent,
      ping). Route `/webhooks/n8n` (HMAC + anti-replay + rate limit):
      post_message → pesan system di room (broadcast SSE); trigger_agent →
      enqueue `agent.run` (jalur sama dengan mention, trigger `source: n8n`).
      Wire: `approval.requested` & alert monitoring diteruskan ke n8n
      (fire & forget). Multi-company webhook tercatat di Backlog.
- [x] **F6-06** Tool sensitif wajib approval
      — `evaluateMcpPermission()` (F6-06): default berbasis risiko —
      high/critical/requiresApproval → approval_required; low/medium (semua
      tool bawaan Orvexa read-only) → allow; override `agent_permissions`
      per key `mcp.<server>.<tool>` menang, kondisi gagal → fail-closed.
      Fix bug F6-01: tool MCP tidak lagi 403 sebagai unknown key.
      Alur approval F5-03 penuh untuk MCP: authorize membuat row approvals
      + event room + resume; keputusan approve TIDAK mengeksekusi di web
      (R-027) — worker mengirim `approval_id` pada authorize berikutnya,
      dikonsumsi SEKALI (colom `consumed_at` di payload), args persis
      yang diajukan. Audit guard test 5 kombinasi tool sensitif lintas
      server → approval_required.
- [x] **F6-07** Notifikasi keluar (email/Slack/Telegram)
      — `lib/notify.ts`: 3 kanal (Slack Incoming Webhook, Telegram Bot API,
      SMTP email via nodemailer opsional — dimuat `createRequire`,
      bundler-safe) dengan formatter pure per kanal + `notifyAll()`
      (Promise.allSettled, selalu resolve, fail-open: kanal tak terkonfigurasi
      → skipped, gagal → log saja). Wire: approval requested/resolved +
      alert monitoring kritis diteruskan ke semua kanal ter-set (fire &
      forget, tidak memblokir alur bisnis). Env: `SLACK_WEBHOOK_URL`,
      `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`, `SMTP_HOST/PORT/USER/PASS/FROM`.

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
## Phase 10 — Virtual Office ✅ (selesai 2026-09-24)

### Yang dibangun (MVP fungsional)

- ✅ Virtual Office navigation (sidebar, ready) + halaman SSR `/virtual-office`
- ✅ Department selection (lantai): Infrastructure / Security / Management —
  inferensi otomatis dari role agent (`inferDepartment`), ekstensible
- ✅ Isometric office visualization: grid workstation stagger CSS murni
  (tanpa canvas/3D lib — ringan & konsisten design token)
- ✅ Agent workstations + presence/status realtime (6 status PRD, lampu
  pulse saat aktif, WS-01/WS-02…)
- ✅ Agent current task (task aktif per agent) & current room (dari run
  terakhir)
- ✅ Clickable agents → panel detail (status, task, room, aksi)
- ✅ Enter room / Lihat task / Kelola agent actions
- ✅ Department overview (jumlah agent + yang aktif per lantai)
- ✅ Floor switching (tab departemen)
- ✅ Live activity feed via SSE global `orvexa.office` (agent.status +
  activity.logged realtime; fallback snapshot)

### API

```text
GET /api/v1/office          snapshot denah (departments, agents, summary, activity)
GET /api/v1/office/events   SSE channel global (agent.status, activity.logged)
```

State tidak diduplikasi: Virtual Office hanya lapisan presentasi di atas
`agents.status`, `tasks`, `agent_runs`, `activity_logs` yang sudah ada.
Publish ke channel dilakukan dari PATCH internal status agent + `logActivity()`.

### Yang belum (catat ke Backlog bila dibutuhkan)

- Mini map / floor map multi-lantai, camera controls, zoom/pan — butuh
  canvas/WebGL; MVP CSS grid sudah cukup untuk observasi.
- Department rooms visual (klik room di denah) — room tetap diakses via
  panel agent.

---

## Rencana awal Phase 10 (arsip)

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
| NB-21 | Webhook n8n multi-company (company_id di payload) | Multi-tenant | Rendah | Ide |
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

### 2026-09-24 (sesi 26 — OQ-09 retry + dead-letter)

- **R-093** — **OQ-09 selesai — utang keputusan terakhir lunas**: sebelumnya
  job gagal di-ACK selalu (hilang diam-diam, diakui komen di `main.py`). Kini:
  job gagal **tetap di PEL** → `_reclaim_stale()` memakai `XAUTOCLAIM` (Redis
  ≥ 6.2) mengambil entry terlantar (consumer mati/gagal, idle > 60 dtk) →
  di-retry; setelah `WORKER_MAX_DELIVERIES` (default 3) gagal → dipindah ke
  stream **`agent.jobs.dead`** (+ `source_id`, `deliveries`, `failed_at`) dan
  run terkait ditutup `failed/dead_lettered` (best-effort).
- **R-094** — `Orchestrator.handle()` kini mengembalikan bool sukses; hanya
  job sukses di-ACK. Payload rusak (tanpa `data`) langsung di-ACK (tidak
  berguna di-retry). Graceful degradation: Redis < 6.2 tanpa `XAUTOCLAIM` →
  fallback perilaku lama (log debug), tidak crash.
- **R-095** — Terbukti dengan **Redis asli** (`scripts/dev/test-retry-deadletter.py`,
  orchestrator tiruan): 4 skenario lulus — sukses→ACK kosong PEL; gagal→tetap
  PEL; reclaim→retry sukses→ACK; gagal 4x→dead-letter+ACK stream utama.

### 2026-09-24 (sesi 25 — Phase 10 Virtual Office)

- **R-089** — **Virtual Office selesai (MVP fungsional)**: denah isometric CSS
  murni (stagger workstation, lampu status pulse) per departemen —
  Infrastructure / Security / Management dengan inferensi otomatis dari role
  agent. Panel detail agent (status/task/room + aksi Enter Room / Lihat Task /
  Kelola Agent) dan feed aktivitas live.
- **R-090** — **State tidak diduplikasi**: snapshot dibaca langsung dari
  `agents.status` + `tasks` aktif + `agent_runs` terakhir + `activity_logs`;
  realtime via SSE channel global `orvexa.office` (publish dari PATCH status
  internal + `logActivity`). API: `GET /api/v1/office` + `/office/events`.
- **R-091** — Tanpa canvas/WebGL: MVP memakai CSS grid + transform sehingga
  ringan, konsisten design token 5 tema, dan tidak menambah dependency.
  Mini map/camera controls dicatat sebagai backlog bila dibutuhkan.
- **R-092** — Sidebar: Virtual Office & MCP kini ready. Semua fase PRD
  (0–6, Phase 10) selesai.

### 2026-09-24 (sesi 24 — F6-05/06/07 — Fase 6 selesai)

- **R-085** — **F6-05 selesai**: integrasi n8n dua arah. Outbound memakai
  kontrak signature yang SAMA dengan webhook masuk (R-064) sehingga n8n bisa
  memverifikasi asal event; inbound mendukung 3 aksi — `post_message`
  (pesan system + SSE), `trigger_agent` (enqueue job agent.run; agent
  mengerjakan tugas & melapor ke room), `ping` (health check workflow).
- **R-086** — **F6-06 selesai + fix bug F6-01**: sebelumnya SEMUA tool MCP
  ditolak 403 di authorize karena `evaluatePermission()` memperlakukan key
  `mcp.*` sebagai unknown (matrix builtin tidak memuatnya). Kini
  `evaluateMcpPermission()`: default dari `mcp_tools.risk_level`/
  `requires_approval` (fail-closed), override per agent tetap dihormati.
  Tool MCP sensitif kini masuk alur approval F5-03 SUNGGUHAN — bukan
  sekadar 202 tanpa row approval (sebelumnya resume tidak pernah terjadi).
  Eksekusi sekali dijaga `consumed_at`; `decideApproval` tidak mengeksekusi
  `mcp.*` di web (konsisten R-027).
- **R-087** — **F6-07 selesai**: notifikasi keluar 3 kanal dengan prinsip
  fail-open total — env kosong → skipped (bukan error), gagal kirim → log;
  `notifyAll()` pakai `Promise.allSettled` sehingga satu kanal mati tidak
  menahan lainnya. nodemailer dibuat opsional via `createRequire` (Turbopack
  tidak mencoba bundle dependency yang belum terpasang — ditemukan saat build).
- **R-088** — **FASE 6 SELESAI (7/7)**: 8 MCP server bawaan (prometheus,
  grafana, wazuh, docker, kubernetes, unifi, mikrotik, fortigate) + client
  worker + gate izin satu pintu + approval + n8n + notifikasi. Test total
  68 web (node:test) + 39 Python (unittest) + smoke e2e 8 server.
  Selanjutnya: Phase 10 Virtual Office.

### 2026-09-24 (sesi 23 — F6-04 MCP server UniFi, MikroTik, FortiGate)

- **R-082** — **F6-04 selesai**: tiga server MCP jaringan/firewall read-only —
  UniFi (4 tool, cookie SESSION dengan fallback endpoint login UniFi OS),
  MikroTik (5 tool via RouterOS REST, Basic auth), FortiGate (5 tool via
  REST API v2 + API token; implementasi konkret "Firewall" di PRD yang
  selama ini hanya matrix permission).
- **R-083** — **Kit `common.py` kini mendukung handler async**: handler
  coroutine di-`asyncio.run()` di thread request masing-masing sehingga
  ThreadingHTTPServer tetap responsif — dipakai UniFi yang perlu login
  cookie dua endpoint. Ditemukan saat smoke (isError async tidak tertangkap
  → tool membalas ok palsu); sekarang teruji oleh smoke e2e 8 server.
- **R-084** — Kredensial perangkat (UNIFI/MIKROTIK/FORTIGATE) hanya di env
  service, tidak pernah dikirim ke LLM; bearer inline server tetap opsional
  via `MCP_*_BEARER` (dienkripsi saat seed).

### 2026-09-24 (sesi 22 — F6-03 MCP server Wazuh, Docker, Kubernetes)

- **R-078** — **F6-03 selesai**: tiga server MCP read-only kembali memakai kit
  `common.py` — Wazuh (5 tool via REST API JWT), Docker (5 tool via Docker
  Engine API unix socket dengan HTTP minimal + dechunker sendiri — tanpa
  dependency tambahan), Kubernetes (5 tool via kubectl).
- **R-079** — **Keamanan eksekusi**: kubectl dipanggil dengan daftar argumen
  fixed (tanpa shell), namespace divalidasi `[a-zA-Z0-9.-]`, binary di-resolve
  via `shutil.which`; docker.sock di-mount read-only; semua tool tetap
  risk=low tapi tetap lolos gate authorize F6-01 (grant + matrix) per panggilan.
- **R-080** — **Auth Wazuh**: basic → `POST /security/user/authenticate` →
  JWT di-cache 800 dtk; respons 401 otomatis reset token & retry sekali.
  Kredensial dari env service, bukan dari LLM.
- **R-081** — Test 28 unittest (nambah Wazuh JWT cache/retry, Docker dechunk
  + shape, Kubernetes validasi namespace & ready count) + smoke e2e kini
  mencakup 5 server MCP (F6-02+F6-03) melawan MCP client worker, termasuk
  jalur upstream-down → `isError` yang rapi (bukan crash).

### 2026-09-24 (sesi 21 — F6-02 MCP server Prometheus & Grafana)

- **R-074** — **F6-02 selesai**: dua server MCP bawaan Orvexa dibangun di
  `mcp-servers/` memakai kit JSON-RPC 2.0 shared — Prometheus (5 tool read-only:
  query, query_range, alerts, targets, health) dan Grafana (4 tool: search,
  detail dashboard, datasources, health). Semua tool memakai kredensial
  server-side (env service), tidak pernah dikirim ke LLM.
- **R-075** — **Error upstream ≠ crash**: kegagalan HTTP Prometheus/Grafana
  dilaporkan sebagai `isError: true` content MCP (fail-open khusus tool
  `health`) sehingga agent menerima jawaban yang bisa direasoning, bukan run
  gagal. Deteksi down target tetap tampil per-target di tool `targets`.
- **R-076** — **Registrasi via seed + auth terenkripsi**: set
  `MCP_PROMETHEUS_URL`/`MCP_GRAFANA_URL` lalu `db:seed` → server + tools +
  grant wildcard ke NOC otomatis; `MCP_PROM_BEARER`/`MCP_GRAFANA_BEARER`
  dienkripsi AES-256-GCM ke `mcp_servers.auth_cipher` (jalur sama dengan MCP
  client worker). Compose: `--profile mcp` menjalankan kedua server.
- **R-077** — 13 unittest baru (HTTP di-mock; katalog seed ⇄ handler ⇄ kit
  selalu konsisten) + smoke e2e `scripts/dev/smoke-mcp-servers.py` membuktikan
  kit ↔ `worker/mcp/client.py` kompatibel (initialize, tools/list, tools/call,
  isError path, health fail-open).

### 2026-09-24 (sesi 20 — F6-01 MCP client di worker)

- **R-069** — **F6-01 selesai**: MCP client di worker (`worker/mcp/client.py`) dengan
  dua transport — **http** (Streamable HTTP; JSON atau SSE, header `Mcp-Session-Id`
  dipertahankan antar panggilan) dan **stdio** (spawn proses via `shlex.split`,
  satu proses dipertahankan per client). Handshake `initialize` + notification
  `notifications/initialized`; hasil `tools/call` di-flatten (text/json/resource →
  teks ≤8000 char) siap dimakan LLM.
- **R-070** — **Izin tetap satu pintu di web** (konsisten R-027/R-048): eksekusi tool
  MCP diawali `POST /api/internal/mcp/authorize` — urutan fail-closed: server/tool
  enabled → grant `agent_mcp_access` (`["*"]` wildcard) → permission matrix F5-01
  (permission key `mcp.<server>.<tool>`, unknown → disabled) → `approval_required`
  dijawab **HTTP 202** (pola F5-03), `allow` dijawab **200** berisi connection
  detail + args yang sudah ter-injeksi kredensial. Web tidak pernah menjadi
  proksi transport MCP; worker yang memanggil server lewat client-nya.
- **R-071** — **Kredensial deferred injection**: argumen tool boleh memuat placeholder
  `${CREDENTIALS.<id>}`; plaintext hanya di-resolve di authorize (lookup
  `ai_credentials` per company, AES-256-GCM) dan TIDAK PERNAH masuk konteks run,
  prompt, tool.call event, maupun audit log (args di-sanitasi `sanitizeMcpToolArgs`:
  field secret/token/password → `[redacted]`, string panjang dipotong).
- **R-072** — **Fn-name simetris web↔worker**: `mcpFnName()` (TS) dan `_safe_fn_part()`
  (Python) sama-sama sanitasi `[a-zA-Z0-9_]` → `mcp__<server>__<tool>`; worker mengenali
  tool MCP dari pattern fn-name (bukan parsing key `mcp.<server>.<tool>` yang
  ambigu) lalu lookup spec di konteks run. Lookup gagal → tool ditolak
  (`not_in_context`) — agent tidak bisa memanggil tool MCP yang tidak di-grant.
- **R-073** — Test 51 (tambah 8 `mcp.test.mjs`): key/permission konsisten, fn-name
  roundtrip, gate fail-closed, sanitasi argumen, placeholder kredensial
  (deteksi/koleksi/ekspansi + fail-visible), spec builder (tanpa grant/disabled →
  null, risk high → approval), dekripsi auth fail-closed. Smoke e2e client↔mock
  (tools/list, echo, now, add) lulus.

### 2026-09-23 (sesi 19 — Halaman Settings + fix agregasi cost)

- **R-067** — **Halaman /settings fungsional** (menu terakhir Fase 5 yang masih placeholder —
  label "Fase 5 (F5-01)" di placeholder-nya adalah rencana awal yang tidak pernah masuk scope
  F5-01…F5-07): 4 tab — Company (nama, tema default, timezone, 3 toggle kebijakan via
  `companies.settings` jsonb merge, permission `settings.manage`), Preferensi (tema persist
  ke `user_preferences.theme_key` + cookie, bahasa, 4 toggle notifikasi), Keamanan (daftar
  sesi aktif dari tabel `sessions`, revoke per-sesi, logout semua perangkat + audit log),
  dan Integrasi (status live AI provider/kredensial/Redis/webhook secret; MCP ditandai
  planned untuk Fase 6). API baru: `GET/PATCH /api/v1/preferences`,
  `PATCH /api/v1/company/settings`, `GET/DELETE /api/v1/security/sessions`,
  `GET /api/v1/integrations/status`. Sidebar: Settings → ready.
- **R-068** — **Bugfix `costByDay`**: parameter bind `$1` pada `AT TIME ZONE $1` membuat
  Postgres gagal inferensi tipe (ambiguous `text`/`interval` → "could not determine data
  type of parameter") saat dipakai di GROUP BY/ORDER BY. Fix: cast eksplisit
  `AT TIME ZONE $1::text` di SELECT/GROUP BY/ORDER BY.

### 2026-09-23 (sesi 18 — F5-07 Rate Limit, CSP & Webhook)
- **R-064** — **Fase 5 selesai (7/7)**: penutupan berupa hardening — rate limiting fixed-window
  Redis dengan fallback open-on-fail (kegagalan Redis tidak memblokir user), CSP nonce dinamis
  (script inline Next.js tetap berjalan; style inline dipilih karena Tailwind runtime),
  dan webhook HMAC dengan toleransi replay 5 menit sesuai API_SPEC.
- **R-065** — Endpoint webhook pertama `/webhooks/monitoring`: alert monitoring diteruskan ke
  room ops perusahaan sebagai pesan system (policy `monitoring.alert` + rate limit 60/menit).
- **R-066** — Rate limit hanya di titik untrusted & mahal: login, kirim pesan, webhook —
  API v1 internal (sudah terlindungi RBAC + budget) sengaja tidak dibatasi untuk menghindari
  menahan workflow agent.

### 2026-09-22 (sesi 17 — F5-06 AI Cost Tracking)

- **R-062** — **F5-06 selesai**: sumber data `ai_usage` (tercatat worker sejak F3) kini punya
  lapisan agregasi (`lib/cost.ts`) + API `/api/v1/costs` + halaman **/costs**: ringkasan
  hari ini/7/30/total, grafik harian 14 hari (CSS bar, zona waktu WIB), tabel per-agent dengan
  progress budget harian (hijau/merah saat >70%/100%), rincian per model, rekap token 30 hari.
- **R-063** — `estimateCost()` pure + teruji (5 test); pembulatan 6 desimal konsisten dengan
  kolom `numeric(12,6)`. Total test 34.

### 2026-09-22 (sesi 16 — F5-05 Audit Append-Only & Redaksi)

- **R-059** — **Append-only di level DB**: trigger `forbid_audit_mutation()` memblok UPDATE &
  DELETE pada `activity_logs` (bukan sekadar konvensi aplikasi). Diverifikasi langsung: keduanya
  terbukti error `check_violation`. Retensi (export lalu purge) jadi ranah admin DB, di luar app.
- **R-060** — **Redaksi satu pintu**: `logActivity()` kini menjalankan `redactSecrets()` pada
  `summary` & `metadata` sehingga 28+ call site otomatis bebas secret — pola dikenali dari nilai
  (sk-, xoxb/p, ghp_, AKIA, JWT, Bearer, token Telegram) dan dari nama field (api_key, secret,
  token, password, authorization, cookie, session). Rekursif dengan depth cap.
- **R-061** — Total test 29 (permissions 13, crypto 6, redact 10).

### 2026-09-22 (sesi 15 — F5-04 Credential Encryption & Rotation)

- **R-057** — **F5-04 selesai**: fondasi (AES-256-GCM, masking last4, rotasi per-API-key) sudah
  dibangun saat Providers UI; sesi ini menambahkan **rotasi master key tanpa downtime**
  (`lib/keyring.ts`, API `POST /api/v1/credentials/rotate` admin-only dengan laporan
  re-encrypt per kredensial; gagal dekripsi → tidak disentuh).
- **R-058** — **Test runner pindah ke tsx** (`node --import tsx --test`): import extensionless
  di modul lib tidak bisa diresep Node ESM murni; tsx (sudah devDep) menyelesaikannya.
  Total test kini 19 (permissions 13 + crypto 6: roundtrip, IV unik, tamper GCM, key version,
  masking last4, format kunci).

### 2026-09-22 (sesi 14 — F5-03 Approval Workflow)

- **R-053** — **F5-03 selesai**: siklus lengkap request → decide → resume. `executeTool` yang
  mendapat `approval_required` (F5-01) kini membuat baris `approvals` + event `approval.requested`
  + status agent `waiting_approval`; worker tetap menerima HTTP 202.
- **R-054** — **Approval = kredensial sekali eksekusi**: menyetujui TIDAK mengubah matrix
  permission; tool dieksekusi sekali lewat override allow yang ter-audit, lalu matrix kembali
  berlaku untuk panggilan berikutnya. Keputusan selalu meng-enqueue job resume (`approval.resume`)
  sehingga agent tidak dangling; worker menyampaikan hasil keputusan ke room tanpa loop LLM
  (manusia yang memutuskan, agent tidak menegosiasi ulang).
- **R-055** — **Expire on-demand**: approval pending >24 jam ditandai `expired` saat halaman/API
  dibaca (tanpa scheduler di MVP); agent yang menunggu dikembalikan ke idle. Argumen tool dalam
  payload approval disanitasi (kunci bernama secret/token/password di-redact, string panjang dipotong).
- **R-056** — Halaman **/approvals** kini fungsional (pending dengan args preview + catatan keputusan,
  riwayat), sidebar ready. API: `GET /api/v1/approvals`, `POST /api/v1/approvals/:id/decide`
  (permission `approval.decide`, idempotency via cek status → 409 bila sudah diputuskan).

### 2026-09-22 (sesi 13 — F5-02 RLS)

- **R-051** — **F5-02 selesai (staged rollout)**: RLS + policy `tenant_isolation` di 40 tabel tenant.
  Tabel anak tanpa `company_id` (ai_models, *_members, message_threads/reactions, task_dependencies,
  agent_skills/tools/knowledge/mcp_access, knowledge_acl, mcp_tools) dilindungi via join parent.
  Policy fail-closed: `current_setting('app.company_id', true)` NULL → 0 baris, bukan seluruh data.
- **R-052** — **Role app masih superuser (BYPASSRLS)** sengaja dipertahankan agar runtime tidak berubah
  selama BFF belum memakai `withTenant()` di semua path. Aktivasi penuh satu perintah:
  `ALTER ROLE orvexa NOSUPERUSER NOBYPASSRLS`. Fail-closed diverifikasi dengan role probe non-superuser:
  dengan GUC → 1 baris, tanpa GUC → 0 baris. GUC key implementasi: `app.company_id`
  (dok §14 DATABASE_SCHEMA.md + §10 SECURITY.md disesuaikan).

### 2026-09-22 (sesi 12 — F5-01 Permission Matrix)

- **R-046** — **F5-01 selesai**: permission matrix dua lapis — RBAC human (`rbac.ts`, role → permission)
  + ABAC agent (`lib/permissions.ts`): efek default per tool (**deny-by-default untuk tool sensitif**:
  firewall/deploy/restart/database write → `approval_required`), override per agent via `agent_permissions`
  dengan kondisi `room_types` / `max_risk_level` / `project_id`.
- **R-047** — **Evaluator fail-closed & pure**: tool tak dikenal → `disabled`; kondisi yang tidak bisa
  dievaluasi (room type tak diketahui) → `approval_required`; effect tak dikenal → `approval_required`.
  13 test `node:test` (`npm run test -w apps/web`) mengunci perilaku ini.
- **R-048** — **Eksekusi tool satu pintu**: `executeTool()` kini menerima `ToolPermissionContext`
  (override rows + room type); `/api/internal/tools/execute` memuat override + tipe room dari DB sebelum
  eksekusi; `approval_required` → HTTP 202 (checkpoint siap disambung F5-03). Worker sudah memeriksa
  `permissions` dari payload konteks sejak F3 — tidak berubah.
- **R-049** — **UI**: panel permission per tool di halaman Agents (Default / Selalu izinkan / Wajib approval /
  Nonaktif) — disimpan sebagai override `agent_permissions` lewat PATCH `/api/v1/agents/:id` dengan audit log.
- **R-050** — **Seed**: tool yang ditautkan ke agent infra kini juga mendapat baris `agent_permissions`
  dengan efek mengikuti matrix default (bukan blind `allow`).

### 2026-09-22 (sesi 11 — Menu UI Completion)

- **R-041** — **5 menu placeholder jadi fungsional sebelum Fase 5**: Agents (CRUD + skill/tool/provider/budget),
  AI Providers (API key terenkripsi AES-256-GCM, rotasi, masking last4 — memenuhi catatan handoff "simpan kredensial
  lewat menu Providers"), Decisions (approve/reject), Documents (editor + versioning), Projects (API + UI baru).
- **R-042** — **Konvensi halaman**: server component membaca DB langsung via Drizzle (pola `/tasks`), aksi mutasi
  lewat client component ke `/api/v1/*` — tidak ada lagi fetch-self via `NEXT_PUBLIC_APP_URL` untuk menu baru.
- **R-043** — **RBAC dilengkapi**: `team.create/update/delete` kini ada di PERMISSIONS + role ADMIN (sebelumnya
  dipakai route teams tapi tidak terdaftar → type error). Route params `[id]` yang masih pola lama diseragamkan ke
  `Promise<{...}>` sesuai kontrak Next.js 16.
- **R-044** — **Dev via domain**: `allowedDevOrigins: ["originlabs.my.id"]` di `next.config.mjs` agar HMR websocket
  tidak diblokir cross-origin saat akses dev server lewat Caddy.
- **R-045** — **Polish UI menyeluruh**: semua halaman menu kini konsisten memakai design token Orvexa
  (`text-fg`/`bg-surface`/`border-line`) alih-alih alias shadcn yang kontrasnya kurang di 5 tema; header halaman
  seragam; form 2 kolom; context panel kanan (statistik/penjelasan) seperti dashboard. Halaman Members, Teams,
  Skills, Themes berhenti fetch-self via `NEXT_PUBLIC_APP_URL` (rawan gagal via domain) dan membaca DB langsung;
  Themes kini menampilkan preview swatch warna dari tokens.

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
| ~~OQ-09~~ | Retry berjenjang + dead-letter untuk job gagal | ✅ **Diterapkan (2026-09-24)**: job gagal tetap di PEL → `XAUTOCLAIM` reclaim setelah idle 60 dtk → retry s.d. 3 delivery → dead-letter `agent.jobs.dead` (+ run ditutup) |

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

Sisa keputusan terbuka yang relevan: **OQ-03** (object storage) — satu-satunya;
OQ-09 (retry + dead-letter) sudah selesai 2026-09-24.

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
