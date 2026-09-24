# ORVEXA — Database Schema

**Produk:** Orvexa — AI Workforce Platform
**Database:** PostgreSQL 16 + pgvector
**Versi:** 1.0
**Dokumen terkait:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [SECURITY.md](./SECURITY.md) · [DESIGN.md](./DESIGN.md)

---

## 1. Prinsip Desain Schema

1. **Multi-tenant by `company_id`** — hampir semua tabel punya `company_id`. Isolasi ditegakkan lewat PostgreSQL Row-Level Security (RLS).
2. **Soft delete** — pakai `deleted_at timestamptz` untuk entity penting (company, agent, room, project, document). Hard delete hanya untuk data transien.
3. **Audit kolom standar** — `created_at`, `updated_at`, `created_by` di tabel utama.
4. **ID ber-prefix** — PK bertipe `text` dengan prefix + ULID (mis. `agt_01J...`) supaya sortable, debuggable, dan tidak perlu kolom publik terpisah.
5. **JSONB untuk fleksibilitas** — konfigurasi model, payload event, metadata tool disimpan sebagai `jsonb` + validasi di aplikasi.
6. **Enums sebagai tipe database** — status/task/approval pakai `ENUM` supaya konsisten.
7. **Vector search dengan filter scope** — `knowledge_chunks.embedding vector(1536)` + index HNSW.
8. **Timezone Asia/Jakarta** — semua timestamp pakai `timestamptz`, dan timezone database di-set ke `Asia/Jakarta` supaya audit via `psql` langsung terbaca waktu Jakarta.

### 1.1 Konvensi ID

| Entity | Prefix | Contoh |
|---|---|---|
| company | `cmp_` | `cmp_01JABC...` |
| user | `usr_` | `usr_01JABC...` |
| team | `tm_` | `tm_01JABC...` |
| agent | `agt_` | `agt_01JABC...` |
| room | `rm_` | `rm_01JABC...` |
| message | `msg_` | `msg_01JABC...` |
| project | `prj_` | `prj_01JABC...` |
| task | `tsk_` | `tsk_01JABC...` |
| approval | `apr_` | `apr_01JABC...` |
| run | `run_` | `run_01JABC...` |
| event | `evt_` | `evt_01JABC...` |

---

## 2. Bootstrap & Konvensi

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- full-text search fallback
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive email

-- ============================================================
-- TIMEZONE — WAJIB Asia/Jakarta
-- ============================================================
-- Diset di level database agar setiap koneksi default ke WIB.
-- Timestamptz tetap menyimpan UTC secara internal; setting ini
-- mengatur bagaimana nilai ditampilkan/di-parse (audit = waktu Jakarta).
ALTER DATABASE orvexa SET timezone TO 'Asia/Jakarta';

-- Opsional: kunci per-role aplikasi agar konsisten walau ada override client.
-- ALTER ROLE orvexa_app SET timezone TO 'Asia/Jakarta';

-- Cek hasilnya:
--   SHOW timezone;                 -- harus: Asia/Jakarta
--   SELECT now();                  -- tampil dalam WIB (+07)
--   SELECT now() AT TIME ZONE 'Asia/Jakarta';

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE member_role        AS ENUM ('owner','admin','manager','member','viewer');
CREATE TYPE agent_status       AS ENUM ('idle','thinking','working','waiting_approval','error','disabled');
CREATE TYPE agent_run_status   AS ENUM ('queued','running','waiting_approval','completed','failed','cancelled');
CREATE TYPE room_type          AS ENUM ('general','department','incident','project','war_room','direct');
CREATE TYPE message_author_type AS ENUM ('human','agent','system','tool','event');
CREATE TYPE message_kind       AS ENUM ('text','approval','decision','task','document','alert','tool_call');
CREATE TYPE task_status        AS ENUM ('backlog','in_progress','blocked','review','done','failed','cancelled');
CREATE TYPE task_priority      AS ENUM ('low','medium','high','critical');
CREATE TYPE approval_status    AS ENUM ('pending','approved','rejected','expired','cancelled');
CREATE TYPE decision_status    AS ENUM ('proposed','approved','rejected','superseded');
CREATE TYPE permission_effect  AS ENUM ('allow','approval_required','disabled');
CREATE TYPE knowledge_scope    AS ENUM ('company','team','project','room','agent');
CREATE TYPE provider_kind      AS ENUM ('openai','anthropic','gemini','openai_compatible','local');
CREATE TYPE doc_status         AS ENUM ('draft','final','archived');
CREATE TYPE mcp_transport      AS ENUM ('stdio','sse','http');

-- ============================================================
-- HELPER: auto update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.1 Konvensi Timezone (Asia/Jakarta / WIB)

Keputusan: **semua timestamp disimpan sebagai `timestamptz`, dan database default timezone diset ke `Asia/Jakarta`.**

### Mengapa

- `timestamptz` menyimpan momen absolut (UTC di balik layar) → tidak ada ambiguitas saat zona/DST berubah.
- Dengan default timezone `Asia/Jakarta`, hasil `SELECT` di `psql`/tools audit otomatis tampil dalam WIB (+07:00) → **audit DB tidak bikin pusing**.
- Aplikasi (Next.js & Python worker) juga di-set ke `TZ=Asia/Jakarta` supaya konsisten end-to-end.

### Aturan

```text
1. Semua kolom waktu WAJIB timestamptz (bukan timestamp tanpa zona).
2. Default value: now() (momen absolut, aman).
3. Database & role aplikasi default timezone = 'Asia/Jakarta'.
4. Aplikasi set TZ=Asia/Jakarta di env + format tampilan via Intl timezone 'Asia/Jakarta'.
5. Jangan simpan string waktu tanpa zona.
6. Kalau butuh tanggal tanpa waktu (mis. due date), pakai date — bukan timestamp.
```

### Cara tampil & konversi

```sql
-- Nilai tersimpan absolut, ditampilkan WIB karena default timezone DB:
SELECT created_at FROM messages LIMIT 1;              -- → 2026-09-22 16:05:00+07

-- SQL: konversi eksplisit bila perlu
SELECT created_at AT TIME ZONE 'Asia/Jakarta' AS created_wib FROM messages;

-- Rentang harian WIB (untuk laporan/audit):
SELECT * FROM activity_logs
WHERE created_at >= timestamptz '2026-09-22 00:00:00+07'
  AND created_at <  timestamptz '2026-09-23 00:00:00+07';
```

### Partisi & retention

Batas partisi memakai offset WIB (`+07`) agar pemisah bulan sesuai kalender Jakarta:

```sql
CREATE TABLE activity_logs_2026_09 PARTITION OF activity_logs
FOR VALUES FROM ('2026-09-01 00:00:00+07') TO ('2026-10-01 00:00:00+07');
```

> Ringkasan penerapan di aplikasi & container ada di [ARCHITECTURE.md](./ARCHITECTURE.md) §10.3.

---

## 3. Identitas & Workspace

```sql
-- ============================================================
-- USERS (global, lintas company)
-- ============================================================
CREATE TABLE users (
  id             text PRIMARY KEY,
  email          citext UNIQUE NOT NULL,
  display_name   text NOT NULL,
  avatar_url     text,
  password_hash  text,                    -- null jika login OAuth only
  is_active      boolean NOT NULL DEFAULT true,
  last_seen_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- COMPANIES (tenant/workspace)
-- ============================================================
CREATE TABLE companies (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  slug         text UNIQUE NOT NULL,
  logo_url     text,
  default_theme text NOT NULL DEFAULT 'corporate_gray',
  settings     jsonb NOT NULL DEFAULT '{}',   -- default provider, locale, dll
  created_by   text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- COMPANY MEMBERS
-- ============================================================
CREATE TABLE company_members (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'member',
  invited_by  text REFERENCES users(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
CREATE INDEX idx_company_members_user ON company_members(user_id);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  avatar_url  text,
  defaults    jsonb NOT NULL DEFAULT '{}',   -- default model/provider/perm/tool
  created_by  text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_teams_company ON teams(company_id);

-- Team berisi agent (dan opsional human)
CREATE TABLE team_members (
  id         text PRIMARY KEY,
  team_id    text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  agent_id   text,                  -- FK ditambahkan setelah tabel agents
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(agent_id, user_id) = 1)
);
```

---

## 4. AI Provider & Kredensial

```sql
-- ============================================================
-- AI PROVIDERS (definisi jenis provider, per company)
-- ============================================================
CREATE TABLE ai_providers (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        provider_kind NOT NULL,
  label       text NOT NULL,                 -- "OpenAI Production"
  base_url    text,                          -- untuk openai_compatible/local
  is_enabled  boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}',    -- org id, region, extra headers
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX idx_ai_providers_company ON ai_providers(company_id);

-- ============================================================
-- AI CREDENTIALS (secret terenkripsi)
-- ============================================================
CREATE TABLE ai_credentials (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id   text NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  label         text NOT NULL,               -- "Production AI Key"
  -- ciphertext AES-256-GCM. Format: base64(iv || ciphertext || tag)
  secret_cipher text NOT NULL,
  secret_iv     text NOT NULL,
  key_version   int  NOT NULL DEFAULT 1,     -- untuk rotasi master key
  last4         text,                        -- tampilkan 4 karakter terakhir di UI
  is_enabled    boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_ai_credentials_company ON ai_credentials(company_id);
-- CATATAN: kolom secret TIDAK PERNAH boleh ditampilkan via API publik.

-- ============================================================
-- AI MODELS (katalog model per provider)
-- ============================================================
CREATE TABLE ai_models (
  id            text PRIMARY KEY,
  provider_id   text NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_key     text NOT NULL,               -- "gpt-4o", "claude-3-5-sonnet"
  display_name  text NOT NULL,
  capabilities  text[] NOT NULL DEFAULT '{}',-- {chat,tools,vision,embedding}
  context_window int,
  input_cost_per_1k  numeric(12,6),
  output_cost_per_1k numeric(12,6),
  is_default    boolean NOT NULL DEFAULT false,
  is_enabled    boolean NOT NULL DEFAULT true,
  UNIQUE (provider_id, model_key)
);
```

---

## 5. Skills

```sql
CREATE TABLE skills (
  id           text PRIMARY KEY,
  company_id   text REFERENCES companies(id) ON DELETE CASCADE, -- null = built-in global
  name         text NOT NULL,                -- "VLAN Analysis"
  category     text,                         -- network, security, sysadmin
  description  text,
  prompt_hint  text,                         -- instruksi tambahan saat skill aktif
  is_builtin   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_skills_company ON skills(company_id);
```

---

## 6. Agents (inti produk)

```sql
CREATE TABLE agents (
  id              text PRIMARY KEY,
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,              -- "Network Agent"
  display_name    text,
  avatar_url      text,
  role            text,                       -- "Network Infrastructure Engineer"
  description     text,                       -- WAJIB diisi sesuai PRD §16
  objective       text,
  system_prompt   text,                       -- system instructions
  status          agent_status NOT NULL DEFAULT 'idle',
  is_builtin      boolean NOT NULL DEFAULT false,

  -- provider & model binding
  provider_id     text REFERENCES ai_providers(id),
  model_id        text REFERENCES ai_models(id),
  credential_id   text REFERENCES ai_credentials(id),
  fallback_credential_id text REFERENCES ai_credentials(id),
  model_params    jsonb NOT NULL DEFAULT '{}',-- temperature, top_p, max_tokens

  -- runtime config
  max_steps       int NOT NULL DEFAULT 8,
  daily_cost_limit numeric(12,4),
  settings        jsonb NOT NULL DEFAULT '{}',

  created_by      text REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (company_id, name)
);
CREATE INDEX idx_agents_company ON agents(company_id);
CREATE INDEX idx_agents_status  ON agents(status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK balik untuk team_members.agent_id
ALTER TABLE team_members
  ADD CONSTRAINT fk_team_members_agent
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- Agent ↔ Skills
CREATE TABLE agent_skills (
  agent_id   text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id   text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);

-- Agent ↔ Knowledge scope eksplisit (opsional; ACL utama di knowledge_documents)
CREATE TABLE agent_knowledge (
  id            text PRIMARY KEY,
  agent_id      text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  knowledge_base_id text NOT NULL,
  can_read      boolean NOT NULL DEFAULT true,
  can_write     boolean NOT NULL DEFAULT false
);

-- Agent ↔ Tools (tool internal)
CREATE TABLE agent_tools (
  id          text PRIMARY KEY,
  agent_id    text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_key    text NOT NULL,                   -- "task.create", "doc.generate"
  config      jsonb NOT NULL DEFAULT '{}',
  is_enabled  boolean NOT NULL DEFAULT true,
  UNIQUE (agent_id, tool_key)
);

-- Agent ↔ MCP
CREATE TABLE agent_mcp_access (
  id          text PRIMARY KEY,
  agent_id    text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mcp_server_id text NOT NULL,
  allowed_tools text[] NOT NULL DEFAULT '{}',  -- whitelist tool MCP
  UNIQUE (agent_id, mcp_server_id)
);

-- ============================================================
-- PERMISSIONS (RBAC/ABAC per agent, extensible multi-scope)
-- ============================================================
CREATE TABLE agent_permissions (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id    text REFERENCES agents(id) ON DELETE CASCADE,
  scope_type  text NOT NULL DEFAULT 'agent',   -- company|team|agent|project|room|tool|mcp
  scope_id    text,
  permission  text NOT NULL,                   -- "firewall.modify"
  effect      permission_effect NOT NULL DEFAULT 'approval_required',
  conditions  jsonb NOT NULL DEFAULT '{}',     -- mis. { "target_env": "staging" }
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_permissions_agent ON agent_permissions(agent_id, permission);
```

---

## 7. Rooms & Messaging

```sql
CREATE TABLE rooms (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,                 -- "incident-server-001"
  type         room_type NOT NULL DEFAULT 'general',
  topic        text,
  project_id   text,                          -- FK setelah projects
  incident_meta jsonb,                        -- severity, source alert, dll
  is_archived  boolean NOT NULL DEFAULT false,
  created_by   text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX idx_rooms_company ON rooms(company_id);
CREATE INDEX idx_rooms_type    ON rooms(company_id, type) WHERE deleted_at IS NULL;

-- Member manusia & agent dalam room
CREATE TABLE room_members (
  id          text PRIMARY KEY,
  room_id     text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     text REFERENCES users(id) ON DELETE CASCADE,
  agent_id    text REFERENCES agents(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member', -- member|observer|lead
  joined_at   timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  CHECK (num_nonnulls(user_id, agent_id) = 1),
  UNIQUE (room_id, user_id),
  UNIQUE (room_id, agent_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id       text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  thread_root_id text REFERENCES messages(id) ON DELETE CASCADE, -- null = top level
  author_type   message_author_type NOT NULL,
  author_user_id text REFERENCES users(id),
  author_agent_id text REFERENCES agents(id),
  author_run_id  text,                        -- FK agent_runs (agent message dari run mana)
  kind          message_kind NOT NULL DEFAULT 'text',
  content       text,                         -- markdown
  content_json  jsonb,                        -- structured blocks (rich)
  mentions      text[] NOT NULL DEFAULT '{}',  -- agent_id / user_id yang di-mention
  reply_to_id   text REFERENCES messages(id) ON DELETE SET NULL,
  meta          jsonb NOT NULL DEFAULT '{}',
  is_edited     boolean NOT NULL DEFAULT false,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  edited_at     timestamptz
);
CREATE INDEX idx_messages_room_time ON messages(room_id, created_at DESC) WHERE is_deleted = false;
CREATE INDEX idx_messages_thread    ON messages(thread_root_id, created_at);
CREATE INDEX idx_messages_mentions  ON messages USING gin(mentions);
CREATE INDEX idx_messages_search    ON messages USING gin(to_tsvector('simple', coalesce(content,'')));

-- ============================================================
-- MESSAGE THREADS (agregat thread)
-- ============================================================
CREATE TABLE message_threads (
  id             text PRIMARY KEY,
  room_id        text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  root_message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reply_count    int NOT NULL DEFAULT 0,
  last_reply_at  timestamptz,
  participant_ids text[] NOT NULL DEFAULT '{}',
  UNIQUE (root_message_id)
);

-- ============================================================
-- REACTIONS
-- ============================================================
CREATE TABLE message_reactions (
  id          text PRIMARY KEY,
  message_id  text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     text REFERENCES users(id) ON DELETE CASCADE,
  agent_id    text REFERENCES agents(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, agent_id) = 1),
  UNIQUE (message_id, user_id, agent_id, emoji)
);

-- ============================================================
-- ATTACHMENTS (file upload & generated docs)
-- ============================================================
CREATE TABLE attachments (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id   text REFERENCES messages(id) ON DELETE CASCADE,
  document_id  text,                          -- FK documents
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   bigint NOT NULL,
  storage_key  text NOT NULL,                 -- path di volume/minio
  checksum     text,
  uploaded_by  text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

---

## 8. Projects & Tasks

```sql
CREATE TABLE projects (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'active', -- active|paused|completed|archived
  owner_team_id text REFERENCES teams(id),
  start_date   date,
  target_date  date,
  created_by   text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX idx_projects_company ON projects(company_id);

-- FK rooms.project_id → projects.id
ALTER TABLE rooms
  ADD CONSTRAINT fk_rooms_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE project_members (
  id         text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  agent_id   text REFERENCES agents(id) ON DELETE CASCADE,
  team_id    text REFERENCES teams(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',
  CHECK (num_nonnulls(user_id, agent_id, team_id) = 1)
);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    text REFERENCES projects(id) ON DELETE SET NULL,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  status        task_status NOT NULL DEFAULT 'backlog',
  priority      task_priority NOT NULL DEFAULT 'medium',
  assigned_team_id  text REFERENCES teams(id),
  assigned_agent_id text REFERENCES agents(id),
  assigned_user_id  text REFERENCES users(id),
  due_date      timestamptz,
  result        text,
  created_by_type text NOT NULL DEFAULT 'human', -- human|agent
  created_by_user_id  text REFERENCES users(id),
  created_by_agent_id text REFERENCES agents(id),
  parent_task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  deleted_at    timestamptz
);
CREATE INDEX idx_tasks_company_status ON tasks(company_id, status);
CREATE INDEX idx_tasks_assignee_agent ON tasks(assigned_agent_id);
CREATE INDEX idx_tasks_project        ON tasks(project_id);

CREATE TABLE task_dependencies (
  task_id       text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
```

---

## 9. Approvals, Decisions, Documents

```sql
-- ============================================================
-- APPROVALS
-- ============================================================
CREATE TABLE approvals (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  agent_id      text REFERENCES agents(id) ON DELETE SET NULL,
  run_id        text,                          -- FK agent_runs
  task_id       text REFERENCES tasks(id) ON DELETE SET NULL,
  title         text NOT NULL,
  action        text NOT NULL,                 -- permission key: "firewall.modify"
  payload       jsonb NOT NULL DEFAULT '{}',   -- detail perubahan
  risk_level    text NOT NULL DEFAULT 'medium',-- low|medium|high|critical
  rollback_plan text,
  status        approval_status NOT NULL DEFAULT 'pending',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    text REFERENCES users(id),
  decision_note text,
  expires_at    timestamptz
);
CREATE INDEX idx_approvals_pending ON approvals(company_id, status) WHERE status = 'pending';

-- ============================================================
-- DECISIONS
-- ============================================================
CREATE TABLE decisions (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    text REFERENCES projects(id) ON DELETE SET NULL,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  approval_id   text REFERENCES approvals(id) ON DELETE SET NULL,
  code          text,                          -- "DEC-0042"
  title         text NOT NULL,
  rationale     text,
  status        decision_status NOT NULL DEFAULT 'proposed',
  participants  jsonb NOT NULL DEFAULT '[]',    -- [{type,id,name}]
  approved_by   text REFERENCES users(id),
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- ============================================================
-- DOCUMENTS (MOP/SOP/RCA/report)
-- ============================================================
CREATE TABLE documents (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    text REFERENCES projects(id) ON DELETE SET NULL,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  task_id       text REFERENCES tasks(id) ON DELETE SET NULL,
  decision_id   text REFERENCES decisions(id) ON DELETE SET NULL,
  author_agent_id text REFERENCES agents(id),
  author_user_id  text REFERENCES users(id),
  doc_type      text NOT NULL,                 -- MOP|SOP|RCA|incident_report|plan|...
  title         text NOT NULL,
  content_md    text,
  content_json  jsonb,
  status        doc_status NOT NULL DEFAULT 'draft',
  version       int NOT NULL DEFAULT 1,
  generated_by_run_id text,                    -- FK agent_runs
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_documents_company ON documents(company_id, doc_type);
ALTER TABLE attachments
  ADD CONSTRAINT fk_attachments_document
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
```

---

## 10. Knowledge Base & RAG

```sql
CREATE TABLE knowledge_bases (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- "Infrastructure"
  description   text,
  parent_id     text REFERENCES knowledge_bases(id) ON DELETE CASCADE, -- hierarki folder
  embedding_model text,                        -- model yang dipakai untuk index
  embedding_dim int NOT NULL DEFAULT 1536,
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_kb_company ON knowledge_bases(company_id);

-- Agent ↔ Knowledge base
ALTER TABLE agent_knowledge
  ADD CONSTRAINT fk_agent_knowledge_kb
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE;

CREATE TABLE knowledge_documents (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title         text NOT NULL,
  source_type   text NOT NULL,                 -- pdf|docx|xlsx|csv|md|txt|url|api|db
  source_uri    text,
  storage_key   text,
  checksum      text,
  status        text NOT NULL DEFAULT 'pending',-- pending|indexing|ready|failed
  scope         knowledge_scope NOT NULL DEFAULT 'company',
  scope_id      text,                           -- team/project/room/agent id
  metadata      jsonb NOT NULL DEFAULT '{}',
  token_count   int,
  indexed_at    timestamptz,
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_kdoc_kb ON knowledge_documents(knowledge_base_id, status);

-- Chunks + embedding (pgvector)
CREATE TABLE knowledge_chunks (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id   text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index   int NOT NULL,
  content       text NOT NULL,
  token_count   int,
  embedding     vector(1536),                  -- sesuaikan dim dengan model embed
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Index HNSW untuk similarity search
CREATE INDEX idx_kchunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_kchunks_doc ON knowledge_chunks(document_id, chunk_index);

-- ============================================================
-- KNOWLEDGE ACL (access control per dokumen)
-- ============================================================
CREATE TABLE knowledge_acl (
  id            text PRIMARY KEY,
  document_id   text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  subject_type  text NOT NULL,                 -- user|team|agent|role|company
  subject_id    text,                          -- null untuk subject_type=company
  can_read      boolean NOT NULL DEFAULT true,
  can_write     boolean NOT NULL DEFAULT false,
  UNIQUE (document_id, subject_type, subject_id)
);
```

---

## 11. Agent Runtime, Memory, Events

```sql
-- ============================================================
-- AGENT RUNS (setiap eksekusi agent)
-- ============================================================
CREATE TABLE agent_runs (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id      text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  project_id    text REFERENCES projects(id) ON DELETE SET NULL,
  trigger_kind  text NOT NULL,                 -- mention|message|task|schedule|webhook|approval_resolved
  trigger_ref_id text,
  status        agent_run_status NOT NULL DEFAULT 'queued',
  parent_run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,  -- delegasi
  step_count    int NOT NULL DEFAULT 0,
  tool_calls    jsonb NOT NULL DEFAULT '[]',   -- [{tool, args, result, ts}]
  state         jsonb NOT NULL DEFAULT '{}',   -- checkpoint untuk resume
  result        text,
  error         text,
  duration_ms   int,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_agent_time ON agent_runs(agent_id, created_at DESC);
CREATE INDEX idx_runs_room       ON agent_runs(room_id, created_at DESC);
CREATE INDEX idx_runs_status     ON agent_runs(status) WHERE status IN ('queued','running','waiting_approval');

-- ============================================================
-- AGENT EVENTS (log granular per run)
-- ============================================================
CREATE TABLE agent_events (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id        text REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id      text REFERENCES agents(id) ON DELETE SET NULL,
  event_type    text NOT NULL,                 -- thinking|tool_call|tool_result|delegate|status
  payload       jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_events_run ON agent_events(run_id, created_at);

-- ============================================================
-- AGENT MEMORIES (4 jenis sesuai PRD §23)
-- ============================================================
CREATE TABLE agent_memories (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id      text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  scope         text NOT NULL,                 -- conversation|project|company|agent
  scope_id      text,                          -- room_id / project_id / null
  content       text NOT NULL,
  embedding     vector(1536),
  importance    numeric(4,2) NOT NULL DEFAULT 0.5,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_agent_scope ON agent_memories(agent_id, scope, scope_id);
CREATE INDEX idx_memories_embedding ON agent_memories
  USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- AI USAGE / COST TRACKING (PRD §38)
-- ============================================================
CREATE TABLE ai_usage (
  id             text PRIMARY KEY,
  company_id     text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id    text REFERENCES ai_providers(id) ON DELETE SET NULL,
  model_id       text REFERENCES ai_models(id) ON DELETE SET NULL,
  credential_id  text REFERENCES ai_credentials(id) ON DELETE SET NULL,
  agent_id       text REFERENCES agents(id) ON DELETE SET NULL,
  run_id         text REFERENCES agent_runs(id) ON DELETE SET NULL,
  project_id     text REFERENCES projects(id) ON DELETE SET NULL,
  input_tokens   int NOT NULL DEFAULT 0,
  output_tokens  int NOT NULL DEFAULT 0,
  cached_tokens  int NOT NULL DEFAULT 0,
  estimated_cost numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms     int,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_company_time ON ai_usage(company_id, created_at);
CREATE INDEX idx_usage_agent        ON ai_usage(agent_id, created_at);
```

---

## 12. MCP

```sql
CREATE TABLE mcp_servers (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,                 -- "Prometheus MCP"
  transport    mcp_transport NOT NULL DEFAULT 'http',
  endpoint     text,
  command      text,                          -- untuk stdio
  auth_cipher  text,                          -- secret terenkripsi
  auth_iv      text,
  is_enabled   boolean NOT NULL DEFAULT true,
  config       jsonb NOT NULL DEFAULT '{}',
  health_status text NOT NULL DEFAULT 'unknown',
  last_check_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mcp_servers_company ON mcp_servers(company_id);

CREATE TABLE mcp_tools (
  id            text PRIMARY KEY,
  mcp_server_id text NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name     text NOT NULL,
  description   text,
  input_schema  jsonb NOT NULL DEFAULT '{}',
  risk_level    text NOT NULL DEFAULT 'low',  -- low|medium|high|critical
  requires_approval boolean NOT NULL DEFAULT false,
  is_enabled    boolean NOT NULL DEFAULT true,
  UNIQUE (mcp_server_id, tool_name)
);

ALTER TABLE agent_mcp_access
  ADD CONSTRAINT fk_agent_mcp_server
  FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE;
```

---

## 13. Activity, Notifications, Preferences

```sql
-- ============================================================
-- ACTIVITY LOGS (audit trail — PRD §31, §39)
-- ============================================================
CREATE TABLE activity_logs (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_type    text NOT NULL,                 -- human|agent|system
  actor_user_id  text REFERENCES users(id),
  actor_agent_id text REFERENCES agents(id),
  action        text NOT NULL,                 -- "agent.started_investigation"
  target_type   text,                          -- room|task|approval|agent|document
  target_id     text,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  project_id    text REFERENCES projects(id) ON DELETE SET NULL,
  summary       text,
  metadata      jsonb NOT NULL DEFAULT '{}',
  ip_address    inet,
  user_agent    text,
  trace_id      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_company_time ON activity_logs(company_id, created_at DESC);
CREATE INDEX idx_activity_actor        ON activity_logs(actor_user_id, actor_agent_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL,                 -- approval|mention|alert|task
  title         text NOT NULL,
  body          text,
  link_url      text,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- THEMES & USER PREFERENCES
-- ============================================================
CREATE TABLE themes (
  id            text PRIMARY KEY,
  company_id    text REFERENCES companies(id) ON DELETE CASCADE, -- null = built-in
  key           text NOT NULL,                 -- corporate_gray|light|dark|midnight|high_contrast
  name          text NOT NULL,
  tokens        jsonb NOT NULL DEFAULT '{}',    -- CSS variables
  is_builtin    boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, key)
);

CREATE TABLE user_preferences (
  user_id              text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_company_id    text REFERENCES companies(id) ON DELETE SET NULL,
  theme_id             text REFERENCES themes(id) ON DELETE SET NULL,
  locale               text NOT NULL DEFAULT 'en',
  notification_settings jsonb NOT NULL DEFAULT '{}',
  ui_state             jsonb NOT NULL DEFAULT '{}',
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

---

## 14. Row-Level Security (Multi-Tenancy)

> **Status (F5-02):** RLS + policy `tenant_isolation` sudah terpasang di **40 tabel tenant**
> (migrasi `0004_rls_company_isolation.sql`). Tabel ber-`company_id` memakai policy seragam;
> tabel anak tanpa `company_id` (ai_models, team_members, room_members, message_threads,
> message_reactions, project_members, task_dependencies, agent_skills/tools/knowledge/mcp_access,
> knowledge_acl, mcp_tools) dilindungi via **join ke parent**.
>
> Key GUC yang dipakai implementasi: **`app.company_id`** (bukan `app.current_company_id`).

Isolasi tenant ditegakkan di level database. Aplikasi harus men-set variabel sesi sebelum query:

```sql
-- Setiap transaksi request (lokal transaksi — otomatis reset):
select set_config('app.company_id', 'cmp_...', true);

-- Contoh policy (sudah dipasang migrasi 0004, pola seragam):
CREATE POLICY tenant_isolation ON agents
  FOR ALL
  USING (company_id = nullif(current_setting('app.company_id', true), ''))
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), ''));
```

**Fail-closed:** `current_setting(..., true)` mengembalikan NULL saat belum diset → policy NULL →
**0 baris**, bukan seluruh data. Statement tanpa context aman secara default.

**Helper di aplikasi:** `withTenant(companyId, (tx) => ...)` di `src/lib/db/tenant.ts` —
transaksi + set GUC lokal untuk setiap statement di dalamnya.

**Staged rollout (penting):** role aplikasi saat ini masih superuser `orvexa` (BYPASSRLS) agar
perilaku runtime tidak berubah selama BFF belum sepenuhnya memakai `withTenant`. Aktivasi penuh
setelah semua query path di-wire:

```sql
ALTER ROLE orvexa NOSUPERUSER NOBYPASSRLS;
```

Verifikasi gagal-aman sudah diuji: role non-superuser **dengan** context melihat datanya, **tanpa**
context melihat 0 baris.

**Aturan:** semua tabel baru yang punya `company_id` wajib enable RLS + policy `tenant_isolation`
(migrasi 0004 menyertakan verifikasi otomatis yang melempar error bila ada tabel terlewat).
Role aplikasi **bukan** superuser setelah aktivasi, dan RLS **tidak** di-bypass kecuali oleh role
migrasi/admin khusus.

> Detail kebijakan keamanan ada di [SECURITY.md](./SECURITY.md).

---

## 15. Diagram ER (ringkas)

```text
users ──< company_members >── companies ──< teams ──< team_members >── agents
                                 │                                        │
                                 ├──< projects ──< tasks ──< task_dependencies
                                 │        │
                                 ├──< rooms >──< room_members            │
                                 │        │                              │
                                 │        └──< messages ──< message_threads
                                 │                 └──< message_reactions
                                 │                 └──< attachments
                                 │
                                 ├──< ai_providers ──< ai_credentials
                                 │        └──< ai_models >── agents
                                 │
                                 ├──< knowledge_bases ──< knowledge_documents
                                 │        └──< knowledge_chunks (vector)
                                 │        └──< knowledge_acl
                                 │
                                 ├──< approvals ──< decisions
                                 ├──< documents
                                 ├──< mcp_servers ──< mcp_tools
                                 └──< activity_logs / notifications / themes

agents ──< agent_runs ──< agent_events
       ──< agent_memories (vector)
       ──< agent_permissions
       ──< agent_skills >── skills
       ──< agent_tools / agent_mcp_access
       ──< ai_usage
```

---

## 16. Strategi Migrasi & Tooling

### 16.1 Keputusan (final)

- **Migration tool: Drizzle ORM + Drizzle Kit** (TypeScript, di `apps/web`).
  - Alasan: schema-as-code yang ringan, dukungan PostgreSQL + pgvector yang baik, cocok dengan Next.js, tanpa codegen berat, dan mudah menulis migrasi SQL kustom (RLS, trigger, extension).
- **Schema dimiliki satu sumber:** Drizzle di `apps/web`. **Python worker hanya membaca/menulis** via SQL/ORM read-model — tidak punya migrasi sendiri (mencegah konflik).
- Alembic/Prisma **tidak dipakai** agar tidak ada dua sumber schema.
- Setiap migrasi **harus** idempotent dan punya jalur `down`.

### 16.2 Praktik migrasi

```text
- File migrasi SQL di apps/web/drizzle/ (dihasilkan Drizzle Kit).
- Migrasi yang melibatkan extension/policy/trigger (RLS, HNSW, set_updated_at)
  ditulis sebagai migrasi SQL kustom.
- Jalankan: npm run db:generate → npm run db:migrate
- Timezone: migrasi awal menyertakan ALTER DATABASE ... SET timezone 'Asia/Jakarta'.
```

### 16.3 Seed

Data seed awal (idempotent):

```text
themes            → corporate_gray, light, dark, midnight, high_contrast
skills            → Linux, Docker, Routing, VLAN, Firewall, Wazuh, Prometheus, dll
agents (builtin)  → Infra Manager, SysAdmin, Network, Security, NOC
```

### 16.1 Seed yang dibutuhkan MVP

```text
themes            → corporate_gray, light, dark, midnight, high_contrast
skills            → Linux, Docker, Routing, VLAN, Firewall, Wazuh, Prometheus, dll
agents (builtin)  → Infra Manager, SysAdmin, Network, Security, NOC
```

---

## 17. Retention & Maintenance

| Data | Kebijakan |
|---|---|
| `messages` | Partisi bulanan; arsip setelah 1 tahun (configurable) |
| `agent_events` | Retensi 90 hari (default), lalu agregasi |
| `activity_logs` | Retensi ≥ 1 tahun (audit) |
| `ai_usage` | Retensi 2 tahun (untuk laporan biaya) |
| `notifications` | Hapus read > 30 hari |
| `knowledge_chunks.embedding` | Re-index saat ganti model embedding |

---

## 18. Catatan Skala

- Index HNSW dibangun **setelah** bulk insert untuk hasil terbaik.
- Untuk perusahaan besar, pertimbangkan partisi `messages` dan `ai_usage` berdasarkan `created_at`.
- `messages.content` full-text search: untuk skala besar, pertimbangkan kolom `tsvector` terpisah + GIN index (contoh sudah disertakan inline).
