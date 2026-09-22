# ORVEXA — Tasklist & Progress Tracker

> **Living document.** Update file ini setiap kali task selesai atau ada ide fitur baru.
> Tujuan: siapapun (termasuk agent) bisa lanjut kerja tanpa kehilangan konteks.
>
> Dokumen terkait: [PRD](./ORVEXA_Final_PRD_v1.0.md) · [docs/](./docs/README.md)

**Terakhir diupdate:** 2026-09-22
**Fase saat ini:** Fase 2 — Kolaborasi (Rooms & Realtime)

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
| 2 | Kolaborasi (Rooms & Realtime) | 🟡 Berjalan | 4/7 + 2 partial |
| 3 | AI Infrastructure Department | ⚪ Belum | 0/6 |
| 4 | Agent Intelligence | ⚪ Belum | 0/7 |
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

## 4. Fase 2 — Kolaborasi (Rooms & Realtime) 🟡

- [x] **F2-01** CRUD Rooms + API `/api/v1/rooms` (tipe general/department/incident/project/war_room)
- [x] **F2-02** Room members (human + agent) + API add/remove
- [x] **F2-03** Message persistence + API list/kirim + publish event
- [x] **F2-04** SSE Gateway `/api/v1/rooms/[id]/events` (Redis Pub/Sub + keep-alive ping)
- [~] **F2-05** Composer + mention agent ✅ · slash command & attachment ⬜
- [ ] **F2-06** Threads + reactions + search pesan
- [~] **F2-07** Agent status pill + indikator live ✅ · typing indicator ⬜

**File baru Fase 2:**

```text
src/lib/redis.ts            publisher + pub/sub hub
src/lib/events.ts           publishRoomEvent()
src/lib/api.ts              helper auth/permission/response
src/lib/validation.ts       skema zod
src/app/api/v1/rooms/...    6 route (CRUD, members, messages, events SSE)
src/app/api/v1/agents/...   list agent
src/app/rooms/page.tsx      daftar room (data nyata)
src/app/rooms/[id]/page.tsx detail room
src/components/rooms/...    create-room-form, room-view (SSE), types
```

---

## 5. Fase 3 — AI Infrastructure Department

- [ ] **F3-01** Python worker: consume Redis Streams (skeleton sudah ada)
- [ ] **F3-02** Provider abstraction (OpenAI, Anthropic, Gemini, OpenAI-compatible, local)
- [ ] **F3-03** Streaming token → Redis → SSE
- [ ] **F3-04** Agent loop penuh + budget guard
- [ ] **F3-05** Tools builtin handler: `task.create`, `room.post`, `doc.generate`
- [ ] **F3-06** Wire 5 agent infra (prompt & skill assignment)

---

## 6. Fase 4 — Agent Intelligence

- [ ] **F4-01** Agent-to-agent delegation (+ `parent_run_id`)
- [ ] **F4-02** Tasks (CRUD, assign, dependency, board)
- [ ] **F4-03** Agent memory 4 jenis
- [ ] **F4-04** Knowledge Base: upload, extract, chunk, embed, index
- [ ] **F4-05** RAG retrieval dengan filter permission (pre-filter)
- [ ] **F4-06** Decisions + Documents generator (MOP/SOP/RCA)
- [ ] **F4-07** Activity Center (feed realtime)

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
├── apps/web/                     Next.js 16 (UI + BFF API)
│   ├── src/app/                  layout, dashboard, login, api/health, api/auth
│   ├── src/components/           app-shell, sidebar, topbar, theme-*
│   ├── src/lib/                  env, time (WIB), password, auth, ids, db/
│   ├── drizzle/0000_init.sql     migrasi awal (19 tabel)
│   └── scripts/                  migrate.ts, seed.ts
├── worker/                       Python agent runtime
│   ├── main.py                   consume Redis Streams
│   ├── providers/                abstraksi provider (base + registry)
│   ├── orchestrator/             agent loop skeleton
│   └── tools/                    registry tool + guardrail
├── docs/                         arsitektur, db, security, design, API
├── docker-compose.yml
├── README.md · CONTRIBUTING.md · LICENSE · TASKLIST.md
└── ORVEXA_Final_PRD_v1.0.md
```

---

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

---

## 11. Revision Log

> Catat perubahan penting, keputusan yang direvisi, atau fitur baru. Terbaru di atas.

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
| OQ-04 | Provider default untuk seed agent | 🟡 Belum ditentukan (butuh kredensial saat Fase 3) |
| ~~OQ-07~~ | UI primitives | ✅ **shadcn/ui** (di-mapping ke token Orvexa) |
| OQ-08 | Orkestrasi worker: Redis Streams consumer group vs arq/Celery | 🟡 Usul: **Redis Streams** (sudah dipakai) |

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
2. Lanjutkan **Fase 2**: F2-05 (slash command + attachment), F2-06 (threads/reactions/search), F2-07 (typing indicator).
3. Lalu **Fase 3**: worker menjalankan agent dan mengirim balasan ke room (provider abstraction + streaming token).
4. Putuskan **OQ-03 / OQ-04 / OQ-07** sebelum menyentuh storage, provider, dan UI kit.

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
