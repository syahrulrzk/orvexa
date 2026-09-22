# ORVEXA — API Specification

**Produk:** Orvexa — AI Workforce Platform
**Base URL:** `https://<host>/api/v1`
**Versi:** 1.0
**Dokumen terkait:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [SECURITY.md](./SECURITY.md)

---

## 1. Konvensi Umum

### 1.1 Transport & Format

```text
Protokol   : HTTPS (wajib)
Encoding   : JSON (application/json; charset=utf-8)
Auth       : Session cookie (httpOnly) yang di-set Auth.js
Versioning : prefix path /api/v1
Timezone   : timestamp memakai ISO-8601 UTC (…Z). Tampilan WIB dilakukan klien.
             Contoh: 2026-09-22T09:05:00.000Z  (= 16:05 WIB)
```

### 1.2 Autentikasi

- Semua endpoint (kecuali `/auth/*` dan `/health`) butuh sesi valid.
- BFF men-set `company_id` aktif dari sesi → dipakai untuk RLS.
- Request tanpa sesi valid → `401`.
- Request tanpa permission → `403`.

### 1.3 Format Error

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Anda tidak punya akses firewall.modify",
    "details": { "required": "firewall.modify" },
    "trace_id": "trc_01HX..."
  }
}
```

Kode error standar:

| HTTP | code | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query tidak valid |
| 401 | `UNAUTHENTICATED` | Belum login / sesi expired |
| 403 | `PERMISSION_DENIED` | Tidak punya izin |
| 403 | `APPROVAL_REQUIRED` | Aksi butuh approval (bukan error fatal) |
| 404 | `NOT_FOUND` | Resource tidak ada |
| 409 | `CONFLICT` | Konflik (mis. nama duplikat) |
| 422 | `UNPROCESSABLE` | Validasi domain gagal |
| 429 | `RATE_LIMITED` | Lihat header `Retry-After` |
| 500 | `INTERNAL_ERROR` | Jangan bocorkan detail internal |

### 1.4 Pagination, Filter, Sort

```text
Query umum:
  ?limit=50            (default 50, maks 200)
  ?cursor=<opaque>     (cursor-based, disarankan untuk message/activity)
  ?offset=0            (offset-based, untuk data kecil)
  ?sort=created_at:desc
  ?q=<search>

Response list:
{
  "data": [ ... ],
  "page": { "limit": 50, "next_cursor": "eyJ...", "has_more": true }
}
```

### 1.5 Idempotency

- Endpoint mutasi menerima header `Idempotency-Key` (opsional) untuk mencegah duplikasi.
- Khusus pengiriman pesan, wajib unik per `client_message_id`.

### 1.6 Rate Limit

| Cakupan | Limit default |
|---|---|
| Auth login | 5 / 15 menit / IP+email |
| API umum | 600 / menit / user |
| Kirim pesan | 120 / menit / user |
| Trigger agent | 60 / menit / room |
| Test credential | 10 / menit / company |

Header: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

---

## 2. Auth & Session

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/auth/register` | Daftar user baru |
| POST | `/auth/login` | Login (email+password) |
| POST | `/auth/logout` | Logout, invalidasi sesi |
| POST | `/auth/oauth/:provider` | Login OAuth (google/github) |
| GET | `/auth/session` | Sesi aktif + user + company aktif |
| POST | `/auth/password/reset-request` | Minta reset password |
| POST | `/auth/password/reset` | Reset dengan token |

```json
// GET /auth/session
{
  "data": {
    "user": { "id": "usr_...", "email": "lead@corp.id", "display_name": "IT Lead" },
    "active_company": { "id": "cmp_...", "name": "Nusantara Corp", "role": "owner" },
    "companies": [ { "id": "cmp_...", "name": "Nusantara Corp", "role": "owner" } ],
    "preferences": { "theme_key": "corporate_gray", "locale": "id" }
  }
}
```

---

## 3. Companies, Members & Teams

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/companies` | Daftar company user |
| POST | `/companies` | Buat company |
| GET | `/companies/:id` | Detail company |
| PATCH | `/companies/:id` | Update company (admin+) |
| GET | `/companies/:id/members` | Daftar member |
| POST | `/companies/:id/members/invite` | Undang member |
| PATCH | `/companies/:id/members/:memberId` | Ubah role |
| DELETE | `/companies/:id/members/:memberId` | Hapus member |
| GET | `/teams` | Daftar team |
| POST | `/teams` | Buat team |
| GET | `/teams/:id` | Detail team + members |
| PATCH | `/teams/:id` | Update team |
| DELETE | `/teams/:id` | Hapus team (soft) |
| POST | `/teams/:id/members` | Tambah agent/user ke team |
| DELETE | `/teams/:id/members/:memberId` | Hapus dari team |

```json
// POST /teams
{ "name": "Infrastructure", "description": "AI Infrastructure Department",
  "defaults": { "provider_id": "prv_...", "model_id": "mdl_..." } }
```

---

## 4. Agents & Skills

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/agents` | Daftar agent (`?status=`, `?team_id=`) |
| POST | `/agents` | Buat agent (custom) |
| GET | `/agents/:id` | Detail agent |
| PATCH | `/agents/:id` | Update konfigurasi agent |
| DELETE | `/agents/:id` | Soft delete agent |
| POST | `/agents/:id/enable` | Aktifkan/matikan agent |
| GET | `/agents/:id/skills` | Skill agent |
| PUT | `/agents/:id/skills` | Set skill agent |
| GET | `/agents/:id/knowledge` | Knowledge agent |
| PUT | `/agents/:id/knowledge` | Set knowledge agent |
| GET | `/agents/:id/tools` | Tool agent |
| PUT | `/agents/:id/tools` | Set tool agent |
| GET | `/agents/:id/permissions` | Permission agent |
| PUT | `/agents/:id/permissions` | Set permission agent |
| GET | `/agents/:id/runs` | Riwayat run agent |
| POST | `/agents/:id/run` | Jalankan agent manual |
| GET | `/skills` | Katalog skill |
| POST | `/skills` | Buat skill custom |
| PATCH | `/skills/:id` | Update skill |

```json
// POST /agents
{
  "name": "Database Agent",
  "display_name": "DB Agent",
  "role": "Database Specialist",
  "description": "Database troubleshooting specialist.",
  "objective": "Jaga reliability database produksi.",
  "system_prompt": "Kamu adalah DB specialist...",
  "provider_id": "prv_...",
  "model_id": "mdl_...",
  "credential_id": "crd_...",
  "model_params": { "temperature": 0.2, "max_tokens": 2048 },
  "max_steps": 8,
  "skills": ["skl_mysql", "skl_postgres"],
  "knowledge_base_ids": ["kb_..."],
  "tools": ["task.create", "doc.generate"]
}
```

**Catatan keamanan:** respons agent **tidak pernah** memuat secret; hanya `credential_id`, `credential_label`, `last4`.

---

## 5. AI Providers, Credentials & Models

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/providers` | Daftar provider |
| POST | `/providers` | Tambah provider (admin) |
| PATCH | `/providers/:id` | Update provider |
| DELETE | `/providers/:id` | Hapus provider (soft) |
| GET | `/providers/:id/models` | Daftar model provider |
| GET | `/credentials` | Daftar credential (metadata saja) |
| POST | `/credentials` | Tambah credential (secret terenkripsi) |
| PATCH | `/credentials/:id` | Rotasi/edit credential |
| DELETE | `/credentials/:id` | Soft delete credential |
| POST | `/credentials/:id/test` | Tes kredensial (server-side) |
| POST | `/credentials/:id/enable` | Enable/disable |

```json
// GET /credentials  → tidak ada secret
{
  "data": [
    { "id": "crd_...", "label": "Production AI Key", "provider_id": "prv_openai",
      "last4": "7F3A", "is_enabled": true, "last_used_at": "2026-09-22T09:00:00Z" }
  ]
}

// POST /credentials
{ "provider_id": "prv_openai", "label": "Production AI Key", "secret": "sk-..." }
// Response HANYA metadata (secret tidak pernah dikembalikan)
```

---

## 6. Rooms, Messages, Threads & Reactions

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/rooms` | Daftar room (`?type=`, `?project_id=`) |
| POST | `/rooms` | Buat room |
| GET | `/rooms/:id` | Detail room + members |
| PATCH | `/rooms/:id` | Update room |
| DELETE | `/rooms/:id` | Soft delete / arsip |
| GET | `/rooms/:id/members` | Member room |
| POST | `/rooms/:id/members` | Tambah member (agent/user) |
| DELETE | `/rooms/:id/members/:memberId` | Hapus member |
| GET | `/rooms/:id/messages` | List pesan (cursor) |
| POST | `/rooms/:id/messages` | Kirim pesan |
| PATCH | `/messages/:id` | Edit pesan |
| DELETE | `/messages/:id` | Hapus pesan (soft) |
| GET | `/messages/:id/thread` | Isi thread |
| POST | `/messages/:id/thread` | Balas thread |
| POST | `/messages/:id/reactions` | Tambah reaksi |
| DELETE | `/messages/:id/reactions/:emoji` | Hapus reaksi |
| POST | `/rooms/:id/attachments` | Upload lampiran |
| GET | `/rooms/:id/search` | Cari pesan (`?q=`) |
| GET | `/rooms/:id/events` | **SSE stream** event realtime |

```json
// POST /rooms/:id/messages
{
  "content": "@SysAdmin tolong cek server app-01",
  "kind": "text",
  "mentions": ["agt_sysadmin"],
  "thread_root_id": null,
  "client_message_id": "cm_01HX..."
}

// Response 201
{
  "data": {
    "id": "msg_...", "room_id": "rm_...", "author_type": "human",
    "author_user_id": "usr_...", "kind": "text",
    "content": "@SysAdmin tolong cek server app-01",
    "mentions": ["agt_sysadmin"], "created_at": "2026-09-22T09:05:00Z"
  },
  "triggered_runs": ["run_01HX..."]
}
```

### 6.1 SSE Endpoint

```text
GET /rooms/:id/events
Accept: text/event-stream
Last-Event-ID: <evt_...>   (opsional, untuk replay setelah reconnect)
```

Format event:

```text
id: evt_01HX...
event: message.delta
data: {"room_id":"rm_...","agent_id":"agt_...","run_id":"run_...","payload":{"text":"..."},"ts":"2026-09-22T09:05:01Z"}

event: agent.status
data: {"agent_id":"agt_...","status":"thinking","since":"2026-09-22T09:05:01Z"}
```

Daftar `event` yang dikirim: `message.delta`, `message.completed`, `message.updated`, `agent.status`, `tool.call`, `tool.result`, `task.created`, `task.updated`, `approval.requested`, `approval.resolved`, `decision.created`, `document.created`, `run.updated`, `presence`.

---

## 7. Projects & Tasks

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/projects` | Daftar project |
| POST | `/projects` | Buat project |
| GET | `/projects/:id` | Detail project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Soft delete |
| GET/POST | `/projects/:id/members` | Member project |
| GET | `/tasks` | Daftar task (`?status=`, `?assignee_agent_id=`, `?project_id=`) |
| POST | `/tasks` | Buat task |
| GET | `/tasks/:id` | Detail task |
| PATCH | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Soft delete |
| POST | `/tasks/:id/assign` | Assign ke agent/team/user |
| POST | `/tasks/:id/status` | Ubah status |
| GET/POST | `/tasks/:id/dependencies` | Dependency task |
| POST | `/tasks/:id/comments` | Komentar task |

```json
// POST /tasks
{ "title": "Remediasi PHP-FPM saturation",
  "description": "Naikkan pm.max_children dan restart service.",
  "project_id": "prj_...", "room_id": "rm_...",
  "priority": "high", "assigned_agent_id": "agt_sysadmin",
  "due_date": "2026-09-23T17:00:00+07:00" }
```

> `due_date` boleh memakai offset WIB. Server menormalkan ke UTC.

---

## 8. Approvals & Decisions

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/approvals` | Daftar approval (`?status=pending`) |
| GET | `/approvals/:id` | Detail approval |
| POST | `/approvals/:id/approve` | Setujui |
| POST | `/approvals/:id/reject` | Tolak |
| POST | `/approvals/:id/cancel` | Batalkan (requester) |
| GET | `/decisions` | Daftar decision |
| GET | `/decisions/:id` | Detail decision |
| POST | `/decisions` | Buat decision manual |

```json
// POST /approvals/:id/approve
{ "note": "Disetujui, jalankan di maintenance window." }

// Response
{ "data": { "approval": { "id":"apr_...","status":"approved","decided_at":"2026-09-22T09:20:00Z" },
            "decision": { "id":"dec_...","code":"DEC-0042","status":"approved" },
            "resumed_run": "run_..." } }
```

Immutable: approval `approved`/`rejected` tidak bisa diubah.

---

## 9. Documents & Attachments

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/documents` | Daftar dokumen (`?doc_type=`, `?project_id=`) |
| POST | `/documents` | Buat dokumen |
| GET | `/documents/:id` | Detail dokumen |
| PATCH | `/documents/:id` | Update dokumen |
| DELETE | `/documents/:id` | Soft delete |
| POST | `/documents/:id/generate` | Minta agent generate/regenerate |
| GET | `/documents/:id/export` | Export (md/pdf/docx) |
| GET | `/attachments/:id` | Unduh lampiran (presigned/stream) |

---

## 10. Knowledge Base

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/knowledge/bases` | Daftar knowledge base (tree) |
| POST | `/knowledge/bases` | Buat KB/folder |
| PATCH/DELETE | `/knowledge/bases/:id` | Update/hapus KB |
| GET | `/knowledge/documents` | Daftar dokumen (`?kb_id=`, `?status=`) |
| POST | `/knowledge/documents` | Upload/daftarkan sumber |
| GET | `/knowledge/documents/:id` | Detail + status indexing |
| PATCH | `/knowledge/documents/:id` | Update metadata/scope |
| DELETE | `/knowledge/documents/:id` | Hapus (soft) + chunk |
| POST | `/knowledge/documents/:id/reindex` | Re-index |
| GET/PUT | `/knowledge/documents/:id/acl` | ACL dokumen |
| POST | `/knowledge/search` | Uji retrieval (debug, admin) |

```json
// POST /knowledge/documents  (multipart atau JSON untuk URL)
{ "knowledge_base_id": "kb_...", "source_type": "pdf",
  "title": "Network SOP", "scope": "team", "scope_id": "tm_network" }
```

---

## 11. Activity, Notifications, Preferences, Themes

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/activity` | Feed aktivitas (`?room_id=`, `?actor_type=`) |
| GET | `/notifications` | Notifikasi user |
| POST | `/notifications/:id/read` | Tandai dibaca |
| POST | `/notifications/read-all` | Tandai semua |
| GET | `/me/preferences` | Preferensi user |
| PATCH | `/me/preferences` | Update (theme, locale, notifikasi) |
| GET | `/themes` | Daftar tema tersedia |
| POST | `/themes` | Buat tema custom (admin, roadmap) |

---

## 12. Runs & Usage / Cost

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/runs` | Daftar run (`?agent_id=`, `?status=`, `?room_id=`) |
| GET | `/runs/:id` | Detail run + timeline event |
| POST | `/runs/:id/cancel` | Batalkan run |
| GET | `/usage` | Ringkasan biaya (`?group_by=agent|model|project`) |
| GET | `/usage/timeseries` | Deret waktu (`?from=`, `?to=`, `?bucket=day`) |

```json
// GET /usage?group_by=agent&from=2026-09-01&to=2026-09-30
{ "data": [ { "agent_id": "agt_infra_mgr", "input_tokens": 120000,
              "output_tokens": 45000, "estimated_cost": 12.34 } ],
  "currency": "USD", "range": { "from": "2026-09-01", "to": "2026-09-30" } }
```

---

## 13. MCP

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/mcp/servers` | Daftar MCP server |
| POST | `/mcp/servers` | Tambah server |
| PATCH/DELETE | `/mcp/servers/:id` | Update/hapus |
| POST | `/mcp/servers/:id/test` | Tes koneksi + list tool |
| GET | `/mcp/servers/:id/tools` | Tool yang tersedia |
| PUT | `/agents/:id/mcp` | Set akses MCP agent |

---

## 14. Webhooks (Masuk)

Endpoint publik dengan verifikasi signature, untuk n8n / monitoring / sistem eksternal.

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/webhooks/monitoring` | Alert dari Prometheus/Wazuh/dll |
| POST | `/webhooks/n8n` | Event dari n8n |
| POST | `/webhooks/generic/:companySlug` | Webhook generik ter-scope |

```text
Header wajib:
  X-Orvexa-Signature: sha256=<hmac_hex>
  X-Orvexa-Timestamp: <unix_seconds>

Aturan:
  - HMAC = HMAC-SHA256(secret, timestamp + "." + raw_body)
  - Tolak jika |now - timestamp| > 300 detik (anti-replay)
  - Simpan event id unik untuk deduplikasi
```

```json
// POST /webhooks/monitoring
{ "source": "prometheus", "severity": "warning",
  "title": "High CPU on app-01", "labels": { "instance": "app-01" },
  "started_at": "2026-09-22T09:00:00Z" }
```

---

## 15. Internal API (Next.js ↔ Python worker)

**Tidak diekspos ke publik.** Hanya di network internal + header `X-Internal-Token`.

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/internal/agent/run` | Jalankan agent (sync kickoff) |
| POST | `/internal/provider/test` | Tes kredensial provider |
| POST | `/internal/knowledge/index` | Mulai indexing dokumen |
| POST | `/internal/knowledge/search` | Retrieval internal |
| GET | `/internal/health` | Health worker |

---

## 16. Event & Job Schema (Redis)

### 16.1 Job — `agent.jobs` (Stream)

```json
{
  "job_id": "job_01HX...",
  "type": "agent.run",
  "company_id": "cmp_...",
  "agent_id": "agt_...",
  "room_id": "rm_...",
  "trigger": { "kind": "mention|message|task|schedule|webhook|approval_resolved", "ref_id": "msg_..." },
  "resume_from_run_id": null,
  "budget": { "max_steps": 8, "max_tokens": 12000 },
  "trace_id": "trc_...",
  "created_at": "2026-09-22T09:05:00Z"
}
```

### 16.2 Event — `room.events.{room_id}` (Pub/Sub)

```json
{
  "event_id": "evt_01HX...",
  "room_id": "rm_...",
  "type": "message.delta",
  "agent_id": "agt_...",
  "run_id": "run_...",
  "payload": { "text": "CPU dan memory normal." },
  "ts": "2026-09-22T09:05:01.123Z"
}
```

**Aturan:** `event_id` unik & idempotent; urutan per room monotonik via `event_id` (ULID).

---

## 17. Permission Key (Referensi)

```text
room.read              room.write             room.manage
message.send           message.delete
task.create            task.assign            task.delete
knowledge.read         knowledge.write        knowledge.delete
document.create        document.approve
agent.create           agent.configure        agent.delete
provider.configure     credential.manage
approval.decide
server.read            server.restart
firewall.read          firewall.modify
database.read          database.write
production.deploy
member.invite          settings.manage
```

Default: baca = `allow`, sensitif = `approval_required`, destruktif = `disabled`.

---

## 18. Contoh Skenario End-to-End

```text
1. POST /auth/login                                  → sesi
2. GET  /rooms?type=incident                         → daftar room
3. GET  /rooms/rm_x/events   (SSE)                   → subscribe realtime
4. POST /rooms/rm_x/messages {content:"@SysAdmin ..."}→ pesan tersimpan + trigger run
5. ← SSE: message.delta / agent.status               → streaming jawaban agent
6. ← SSE: approval.requested                         → agent minta approval
7. POST /approvals/apr_x/approve                     → disetujui → run resume
8. ← SSE: task.created, document.created             → hasil kerja agent
9. GET  /activity?room_id=rm_x                        → audit aktivitas
```

---

## 19. Status Implementasi

```text
[x] Spesifikasi kontrak (dokumen ini)
[~] Implementasi route handlers
      [x] /api/v1/rooms            (list, create)
      [x] /api/v1/rooms/:id        (detail, patch, delete)
      [x] /api/v1/rooms/:id/members
      [x] /api/v1/rooms/:id/messages
      [x] /api/v1/rooms/:id/events (SSE)
      [x] /api/v1/agents           (list)
      [ ] sisanya → Fase 3+
[ ] OpenAPI schema otomatis
[ ] SDK client (opsional, komunitas)
```
