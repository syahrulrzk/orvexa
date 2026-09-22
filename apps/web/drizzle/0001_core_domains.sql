-- ============================================================
-- ORVEXA — 0001_core_domains.sql
-- Domain tabel lanjutan: projects, tasks, approvals, decisions,
-- documents, knowledge, agent runtime, MCP, usage.
-- Sumber acuan: docs/DATABASE_SCHEMA.md
-- ============================================================

-- ============================================================
-- ENUM BARU
-- ============================================================
CREATE TYPE task_status       AS ENUM ('backlog','in_progress','blocked','review','done','failed','cancelled');
CREATE TYPE task_priority     AS ENUM ('low','medium','high','critical');
CREATE TYPE approval_status   AS ENUM ('pending','approved','rejected','expired','cancelled');
CREATE TYPE decision_status   AS ENUM ('proposed','approved','rejected','superseded');
CREATE TYPE permission_effect AS ENUM ('allow','approval_required','disabled');
CREATE TYPE knowledge_scope   AS ENUM ('company','team','project','room','agent');
CREATE TYPE doc_status        AS ENUM ('draft','final','archived');
CREATE TYPE mcp_transport     AS ENUM ('stdio','sse','http');
CREATE TYPE agent_run_status  AS ENUM ('queued','running','waiting_approval','completed','failed','cancelled');

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active',
  owner_team_id text REFERENCES teams(id),
  start_date    date,
  target_date   date,
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX projects_company_idx ON projects (company_id);
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK balik untuk rooms.project_id (rooms dibuat di 0000 tanpa FK)
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
CREATE INDEX project_members_project_idx ON project_members (project_id);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id                 text PRIMARY KEY,
  company_id         text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id         text REFERENCES projects(id) ON DELETE SET NULL,
  room_id            text REFERENCES rooms(id) ON DELETE SET NULL,
  title              text NOT NULL,
  description        text,
  status             task_status NOT NULL DEFAULT 'backlog',
  priority           task_priority NOT NULL DEFAULT 'medium',
  assigned_team_id   text REFERENCES teams(id),
  assigned_agent_id  text REFERENCES agents(id),
  assigned_user_id   text REFERENCES users(id),
  due_date           timestamptz,
  result             text,
  created_by_type    text NOT NULL DEFAULT 'human',
  created_by_user_id text REFERENCES users(id),
  created_by_agent_id text REFERENCES agents(id),
  parent_task_id     text REFERENCES tasks(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  deleted_at         timestamptz
);
CREATE INDEX tasks_company_status_idx ON tasks (company_id, status);
CREATE INDEX tasks_assignee_agent_idx ON tasks (assigned_agent_id);
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_dependencies (
  task_id       text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

-- ============================================================
-- AGENT RUNTIME (dibuat sebelum dipakai FK oleh approvals)
-- ============================================================
CREATE TABLE agent_runs (
  id             text PRIMARY KEY,
  company_id     text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  room_id        text REFERENCES rooms(id) ON DELETE SET NULL,
  project_id     text REFERENCES projects(id) ON DELETE SET NULL,
  trigger_kind   text NOT NULL,
  trigger_ref_id text,
  status         agent_run_status NOT NULL DEFAULT 'queued',
  parent_run_id  text REFERENCES agent_runs(id) ON DELETE SET NULL,
  step_count     int NOT NULL DEFAULT 0,
  tool_calls     jsonb NOT NULL DEFAULT '[]',
  state          jsonb NOT NULL DEFAULT '{}',
  result         text,
  error          text,
  duration_ms    int,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX runs_agent_time_idx ON agent_runs (agent_id, created_at DESC);
CREATE INDEX runs_room_idx ON agent_runs (room_id, created_at DESC);
CREATE INDEX runs_status_idx ON agent_runs (status)
  WHERE status IN ('queued','running','waiting_approval');

-- ============================================================
-- APPROVALS & DECISIONS
-- ============================================================
CREATE TABLE approvals (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id       text REFERENCES rooms(id) ON DELETE SET NULL,
  agent_id      text REFERENCES agents(id) ON DELETE SET NULL,
  run_id        text REFERENCES agent_runs(id) ON DELETE SET NULL,
  task_id       text REFERENCES tasks(id) ON DELETE SET NULL,
  title         text NOT NULL,
  action        text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  risk_level    text NOT NULL DEFAULT 'medium',
  rollback_plan text,
  status        approval_status NOT NULL DEFAULT 'pending',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    text REFERENCES users(id),
  decision_note text,
  expires_at    timestamptz
);
CREATE INDEX approvals_pending_idx ON approvals (company_id, status) WHERE status = 'pending';

CREATE TABLE decisions (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   text REFERENCES projects(id) ON DELETE SET NULL,
  room_id      text REFERENCES rooms(id) ON DELETE SET NULL,
  approval_id  text REFERENCES approvals(id) ON DELETE SET NULL,
  code         text,
  title        text NOT NULL,
  rationale    text,
  status       decision_status NOT NULL DEFAULT 'proposed',
  participants jsonb NOT NULL DEFAULT '[]',
  approved_by  text REFERENCES users(id),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX decisions_company_code_uq ON decisions (company_id, code);

-- ============================================================
-- DOCUMENTS & ATTACHMENTS
-- ============================================================
CREATE TABLE documents (
  id                  text PRIMARY KEY,
  company_id          text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id          text REFERENCES projects(id) ON DELETE SET NULL,
  room_id             text REFERENCES rooms(id) ON DELETE SET NULL,
  task_id             text REFERENCES tasks(id) ON DELETE SET NULL,
  decision_id         text REFERENCES decisions(id) ON DELETE SET NULL,
  author_agent_id     text REFERENCES agents(id),
  author_user_id      text REFERENCES users(id),
  doc_type            text NOT NULL,
  title               text NOT NULL,
  content_md          text,
  content_json        jsonb,
  status              doc_status NOT NULL DEFAULT 'draft',
  version             int NOT NULL DEFAULT 1,
  generated_by_run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX documents_company_idx ON documents (company_id, doc_type);
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attachments (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id  text REFERENCES messages(id) ON DELETE CASCADE,
  document_id text REFERENCES documents(id) ON DELETE SET NULL,
  file_name   text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  storage_key text NOT NULL,
  checksum    text,
  uploaded_by text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_message_idx ON attachments (message_id);

-- ============================================================
-- KNOWLEDGE BASE & RAG
-- ============================================================
CREATE TABLE knowledge_bases (
  id              text PRIMARY KEY,
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  parent_id       text REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  embedding_model text,
  embedding_dim   int NOT NULL DEFAULT 1536,
  created_by      text REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX kb_company_idx ON knowledge_bases (company_id);

CREATE TABLE agent_knowledge (
  id                text PRIMARY KEY,
  agent_id          text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  can_read          boolean NOT NULL DEFAULT true,
  can_write         boolean NOT NULL DEFAULT false,
  UNIQUE (agent_id, knowledge_base_id)
);

CREATE TABLE knowledge_documents (
  id                text PRIMARY KEY,
  company_id        text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  knowledge_base_id text NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title             text NOT NULL,
  source_type       text NOT NULL,
  source_uri        text,
  storage_key       text,
  checksum          text,
  status            text NOT NULL DEFAULT 'pending',
  scope             knowledge_scope NOT NULL DEFAULT 'company',
  scope_id          text,
  metadata          jsonb NOT NULL DEFAULT '{}',
  token_count       int,
  indexed_at        timestamptz,
  created_by        text REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX kdoc_kb_idx ON knowledge_documents (knowledge_base_id, status);

CREATE TABLE knowledge_chunks (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content     text NOT NULL,
  token_count int,
  embedding   vector(1536),
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kchunks_doc_idx ON knowledge_chunks (document_id, chunk_index);
CREATE INDEX kchunks_embedding_idx ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE knowledge_acl (
  id           text PRIMARY KEY,
  document_id  text NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id   text,
  can_read     boolean NOT NULL DEFAULT true,
  can_write    boolean NOT NULL DEFAULT false,
  UNIQUE (document_id, subject_type, subject_id)
);

-- ============================================================
-- AGENT TOOLS & PERMISSIONS
-- ============================================================
CREATE TABLE agent_tools (
  id         text PRIMARY KEY,
  agent_id   text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_key   text NOT NULL,
  config     jsonb NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE (agent_id, tool_key)
);

CREATE TABLE agent_permissions (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id   text REFERENCES agents(id) ON DELETE CASCADE,
  scope_type text NOT NULL DEFAULT 'agent',
  scope_id   text,
  permission text NOT NULL,
  effect     permission_effect NOT NULL DEFAULT 'approval_required',
  conditions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_permissions_agent_idx ON agent_permissions (agent_id, permission);

-- ============================================================
-- AGENT EVENTS, MEMORY, USAGE
-- ============================================================
CREATE TABLE agent_events (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id     text REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id   text REFERENCES agents(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_run_idx ON agent_events (run_id, created_at);

CREATE TABLE agent_memories (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id   text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  scope      text NOT NULL,
  scope_id   text,
  content    text NOT NULL,
  embedding  vector(1536),
  importance numeric(4,2) NOT NULL DEFAULT 0.5,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memories_agent_scope_idx ON agent_memories (agent_id, scope, scope_id);
CREATE INDEX memories_embedding_idx ON agent_memories
  USING hnsw (embedding vector_cosine_ops);

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
CREATE INDEX usage_company_time_idx ON ai_usage (company_id, created_at);
CREATE INDEX usage_agent_idx ON ai_usage (agent_id, created_at);

-- ============================================================
-- MCP
-- ============================================================
CREATE TABLE mcp_servers (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  transport     mcp_transport NOT NULL DEFAULT 'http',
  endpoint      text,
  command       text,
  auth_cipher   text,
  auth_iv       text,
  is_enabled    boolean NOT NULL DEFAULT true,
  config        jsonb NOT NULL DEFAULT '{}',
  health_status text NOT NULL DEFAULT 'unknown',
  last_check_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_servers_company_idx ON mcp_servers (company_id);
CREATE TRIGGER trg_mcp_servers_updated BEFORE UPDATE ON mcp_servers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE mcp_tools (
  id                text PRIMARY KEY,
  mcp_server_id     text NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name         text NOT NULL,
  description       text,
  input_schema      jsonb NOT NULL DEFAULT '{}',
  risk_level        text NOT NULL DEFAULT 'low',
  requires_approval boolean NOT NULL DEFAULT false,
  is_enabled        boolean NOT NULL DEFAULT true,
  UNIQUE (mcp_server_id, tool_name)
);

CREATE TABLE agent_mcp_access (
  id            text PRIMARY KEY,
  agent_id      text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mcp_server_id text NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  allowed_tools text[] NOT NULL DEFAULT '{}',
  UNIQUE (agent_id, mcp_server_id)
);

-- ============================================================
-- FK untuk kolom yang sebelumnya tanpa referensi
-- ============================================================
ALTER TABLE messages
  ADD CONSTRAINT fk_messages_run
  FOREIGN KEY (author_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

-- ============================================================
-- CATATAN
-- Row-Level Security (RLS) untuk semua tabel ber-`company_id`
-- diaktifkan pada Fase 5 (F5-02), bukan sekarang.
-- ============================================================
