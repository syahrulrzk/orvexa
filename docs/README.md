# ORVEXA — Dokumentasi Teknis

**Orvexa — Your AI Workforce.**
Platform kolaborasi AI workforce enterprise: sekumpulan AI agent terspesialisasi yang bekerja bersama di ruang kolaborasi real-time, dengan manusia tetap sebagai pengambil keputusan.

> Dokumen produk utama: [`../ORVEXA_Final_PRD_v1.0.md`](../ORVEXA_Final_PRD_v1.0.md)
> Progres & backlog: [`../TASKLIST.md`](../TASKLIST.md)

---

## Daftar Dokumen

| Dokumen | Isi | Untuk siapa |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Stack, pembagian service, alur data, job/event contract, deployment, ADR | Engineer, kontributor |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | DDL lengkap PostgreSQL + pgvector, RLS, ERD, migrasi, retention | Backend engineer |
| [SECURITY.md](./SECURITY.md) | Threat model, auth, RBAC/ABAC, enkripsi kredensial, isolasi agent, approval, audit | Security, maintainer |
| [DESIGN.md](./DESIGN.md) | Design system Corporate Gray, token, tema, komponen, layout, a11y | Frontend, designer |

---

## Ringkasan Keputusan Arsitektur

```text
Stack        : Hybrid — Next.js 16 (web + BFF) + Python worker (agent runtime)
ORM/Migrasi  : Drizzle ORM + Drizzle Kit (schema-as-code)
Database     : PostgreSQL 16 + pgvector (self-host via Docker Compose)
Queue/Event  : Redis 7 (Streams + Pub/Sub)
Realtime     : SSE (server→client) + HTTP POST (client→server)
Auth         : Auth.js (RBAC) + session server-side
Secrets      : AES-256-GCM at rest, tidak pernah ke browser
Automation   : n8n (opsional)
Tool protocol: MCP (roadmap fase 6)
Docs bahasa  : Indonesia
```

### Aliran data inti

```text
User → Next.js (validasi + persist + publish)
     → Redis (Streams job, Pub/Sub event)
     → Python worker (agent loop, LLM, tool, RAG)
     → PostgreSQL (source of truth)
     → SSE → Browser (streaming realtime)
```

---

## Cara Baca

- **Baru di project?** Mulai dari [ARCHITECTURE.md](./ARCHITECTURE.md) §1–4, lalu [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) §3–6.
- **Mau kontribusi frontend?** [DESIGN.md](./DESIGN.md).
- **Mau kontribusi worker/AI?** [ARCHITECTURE.md](./ARCHITECTURE.md) §8–9.
- **Mau audit keamanan?** [SECURITY.md](./SECURITY.md).
- **Mau setup lokal?** Lihat roadmap deployment di [ARCHITECTURE.md](./ARCHITECTURE.md) §10.

---

## Roadmap MVP (dari PRD §46)

```text
Fase 1  Fondasi      — Auth, workspace, UI, agent config
Fase 2  Kolaborasi   — Rooms, realtime, threads, status
Fase 3  AI Infra     — Infra Manager, SysAdmin, Network, Security, NOC
Fase 4  Intelligence — Delegasi, tasks, memory, knowledge, decisions
Fase 5  Governance   — Permission, approval, audit, cost tracking
Fase 6  Integrations — n8n, Prometheus, Grafana, Wazuh, UniFi, Docker, MCP
```
