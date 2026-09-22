# ORVEXA — Your AI Workforce

> Platform open-source untuk mengelola **tim AI agent terspesialisasi** yang berkolaborasi di ruang real-time, dengan manusia tetap sebagai pengambil keputusan.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Status: Planning](https://img.shields.io/badge/status-planning%20%2F%20phase%201-yellow)]()
[![Made with Next.js + Python](https://img.shields.io/badge/stack-Next.js%20%2B%20Python-9cf)]()

Orvexa memberi seorang IT Infrastructure Lead sebuah **AI Infrastructure Department**: virtual team berisi Infra Manager, SysAdmin, Network, Security, dan NOC agent yang bisa berkomunikasi, delegasi kerja, membuat task, memakai knowledge, dan menjalankan aksi yang disetujui manusia.

---

## ✨ Fitur Inti

- 🗂️ **Workspace & Company** — multi-tenant dengan isolasi data (RLS).
- 💬 **Rooms real-time** — kolaborasi human + agent (SSE, threads, mentions).
- 🤖 **Agent otonom** — komunikasi agent-to-agent, delegasi, dan run yang bisa diaudit.
- 🧠 **Knowledge Base & RAG** — dokumen ter-index (pgvector) dengan access control.
- 🛡️ **Governance** — permission, approval untuk aksi sensitif, audit log, cost tracking.
- 🔌 **Extensible** — multi provider LLM dan siap MCP (Prometheus, Wazuh, UniFi, Docker, dll).
- 🎨 **Corporate Gray UI** — tema enterprise dengan 5 pilihan tema

---

## 🚀 Quickstart (Docker)

```bash
git clone https://github.com/<user>/orvexa.git
cd orvexa
cp .env.example .env

# generate secret yang dibutuhkan (lihat .env.example)
docker compose up --build
```

Buka `http://localhost:3000`.

### Development lokal

```bash
docker compose up -d postgres redis
npm install
npm run db:migrate && npm run db:seed
npm run dev            # web  → http://localhost:3000
npm run dev:worker     # worker (terminal terpisah)
```

Panduan lengkap: [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 🏗️ Arsitektur (ringkas)

```text
User ──HTTPS/SSE──▶ Next.js 16 (UI + BFF + Auth)
                        │
         ┌──────────────┼───────────────┐
         ▼              ▼               ▼
   PostgreSQL 16    Redis 7        n8n (opsional)
   + pgvector    Streams+PubSub
         ▲              │
         │              ▼
         └──── Python Agent Runtime (LLM, tools, RAG, MCP)
```

- **Next.js** → UI, API/BFF, auth, SSE gateway.
- **Python worker** → agent loop, provider LLM, tool & MCP, RAG.
- **PostgreSQL + pgvector** → source of truth & vector search.
- **Redis** → job queue (Streams) + event bus (Pub/Sub).

Detail: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

**Timezone:** seluruh sistem memakai **Asia/Jakarta (WIB)** — lihat [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §10.4.

---

## 🧰 Stack

| Layer | Teknologi |
|---|---|
| Frontend + BFF | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind v4, shadcn/ui |
| Agent Runtime | Python 3.12 |
| Database | PostgreSQL 16 + pgvector |
| Queue/Realtime | Redis 7, SSE |
| Auth | Auth.js |
| Migrasi | Drizzle ORM + Drizzle Kit |
| Automation | n8n (opsional) |
| Tool Protocol | MCP (roadmap) |

---

## 📚 Dokumentasi

| Dokumen | Isi |
|---|---|
| [PRD](./ORVEXA_Final_PRD_v1.0.md) | Product Requirements Document |
| [Architecture](./docs/ARCHITECTURE.md) | Arsitektur & alur sistem |
| [Database Schema](./docs/DATABASE_SCHEMA.md) | DDL, RLS, ERD |
| [Security](./docs/SECURITY.md) | Keamanan & governance |
| [Design](./docs/DESIGN.md) | Design system Corporate Gray |
| [API Spec](./docs/API_SPEC.md) | Kontrak REST & event |
| [Tasklist](./TASKLIST.md) | Progres & backlog |

---

## 🗺️ Roadmap

```text
Fase 1  Fondasi        — Auth, workspace, UI, agent config
Fase 2  Kolaborasi     — Rooms, realtime, threads
Fase 3  AI Infra Team  — 5 agent infrastruktur
Fase 4  Intelligence   — Delegasi, tasks, memory, knowledge
Fase 5  Governance     — Permission, approval, audit, cost
Fase 6  Integrations   — n8n, Prometheus, Wazuh, UniFi, Docker, MCP
```

Status detail: [TASKLIST.md](./TASKLIST.md).

---

## 🤝 Kontribusi

Kontribusi sangat diterima! Baca [CONTRIBUTING.md](./CONTRIBUTING.md) dulu.

Untuk kerentanan keamanan, **jangan** buka issue publik — ikuti [SECURITY.md](./SECURITY.md).

---

## 📄 Lisensi

[MIT](./LICENSE) © 2026 Orvexa contributors.
