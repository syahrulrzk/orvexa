-- ============================================================
-- ORVEXA — 0000_init.sql
-- Tabel inti Fase 1. Sumber acuan: docs/DATABASE_SCHEMA.md
-- ============================================================

-- --- Extensions ---
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --- Timezone: wajib Asia/Jakarta (audit DB terbaca WIB) ---
-- Pakai nama database dinamis agar tetap aman bila nama DB berbeda.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''Asia/Jakarta''', current_database());
END
$$;

-- --- Enums ---
CREATE TYPE member_role         AS ENUM ('owner','admin','manager','member','viewer');
CREATE TYPE agent_status        AS ENUM ('idle','thinking','working','waiting_approval','error','disabled');
CREATE TYPE room_type           AS ENUM ('general','department','incident','project','war_room','direct');
CREATE TYPE message_author_type AS ENUM ('human','agent','system','tool','event');
CREATE TYPE message_kind        AS ENUM ('text','approval','decision','task','document','alert','tool_call');
CREATE TYPE provider_kind       AS ENUM ('openai','anthropic','gemini','openai_compatible','local');

-- --- Helper: auto update updated_at ---
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- IDENTITY
-- ============================================================
CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  display_name  text NOT NULL,
  avatar_url    text,
  password_hash text,
  is_active     boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX users_email_uq ON users (email);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE companies (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  logo_url      text,
  default_theme text NOT NULL DEFAULT 'corporate_gray',
  settings      jsonb NOT NULL DEFAULT '{}',
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE company_members (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       member_role NOT NULL DEFAULT 'member',
  invited_by text REFERENCES users(id),
  joined_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX company_members_uq ON company_members (company_id, user_id);
CREATE INDEX company_members_user_idx ON company_members (user_id);

-- ============================================================
-- PROVIDER & CREDENTIAL
-- ============================================================
CREATE TABLE ai_providers (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       provider_kind NOT NULL,
  label      text NOT NULL,
  base_url   text,
  is_enabled boolean NOT NULL DEFAULT true,
  config     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ai_providers_company_idx ON ai_providers (company_id);
CREATE TRIGGER trg_ai_providers_updated BEFORE UPDATE ON ai_providers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_credentials (
  id           text PRIMARY KEY,
  company_id   text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id  text NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  label        text NOT NULL,
  secret_cipher text NOT NULL,
  secret_iv    text NOT NULL,
  key_version  int NOT NULL DEFAULT 1,
  last4        text,
  is_enabled   boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at   timestamptz,
  created_by   text REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX ai_credentials_company_idx ON ai_credentials (company_id);
CREATE TRIGGER trg_ai_credentials_updated BEFORE UPDATE ON ai_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ai_models (
  id                  text PRIMARY KEY,
  provider_id         text NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_key           text NOT NULL,
  display_name        text NOT NULL,
  capabilities        text[] NOT NULL DEFAULT '{}',
  context_window      int,
  input_cost_per_1k   numeric(12,6),
  output_cost_per_1k  numeric(12,6),
  is_default          boolean NOT NULL DEFAULT false,
  is_enabled          boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ai_models_uq ON ai_models (provider_id, model_key);

-- ============================================================
-- SKILLS & AGENTS
-- ============================================================
CREATE TABLE skills (
  id          text PRIMARY KEY,
  company_id  text REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text,
  description text,
  prompt_hint text,
  is_builtin  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skills_company_idx ON skills (company_id);

CREATE TABLE agents (
  id                     text PRIMARY KEY,
  company_id             text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  display_name           text,
  avatar_url             text,
  role                   text,
  description            text,
  objective              text,
  system_prompt          text,
  status                 agent_status NOT NULL DEFAULT 'idle',
  is_builtin             boolean NOT NULL DEFAULT false,
  provider_id            text REFERENCES ai_providers(id),
  model_id               text REFERENCES ai_models(id),
  credential_id          text REFERENCES ai_credentials(id),
  fallback_credential_id text REFERENCES ai_credentials(id),
  model_params           jsonb NOT NULL DEFAULT '{}',
  max_steps              int NOT NULL DEFAULT 8,
  daily_cost_limit       numeric(12,4),
  settings               jsonb NOT NULL DEFAULT '{}',
  created_by             text REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE UNIQUE INDEX agents_company_name_uq ON agents (company_id, name);
CREATE INDEX agents_company_idx ON agents (company_id);
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE agent_skills (
  agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id text NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id          text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  avatar_url  text,
  defaults    jsonb NOT NULL DEFAULT '{}',
  created_by  text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX teams_company_name_uq ON teams (company_id, name);
CREATE TRIGGER trg_teams_updated BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE team_members (
  id       text PRIMARY KEY,
  team_id  text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  agent_id text REFERENCES agents(id) ON DELETE CASCADE,
  user_id  text REFERENCES users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(agent_id, user_id) = 1)
);

-- ============================================================
-- ROOMS & MESSAGES
-- ============================================================
CREATE TABLE rooms (
  id            text PRIMARY KEY,
  company_id    text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          room_type NOT NULL DEFAULT 'general',
  topic         text,
  project_id    text,
  incident_meta jsonb,
  is_archived   boolean NOT NULL DEFAULT false,
  created_by    text REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX rooms_company_idx ON rooms (company_id);
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE room_members (
  id           text PRIMARY KEY,
  room_id      text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id      text REFERENCES users(id) ON DELETE CASCADE,
  agent_id     text REFERENCES agents(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  CHECK (num_nonnulls(user_id, agent_id) = 1)
);
CREATE INDEX room_members_room_idx ON room_members (room_id);

CREATE TABLE messages (
  id              text PRIMARY KEY,
  company_id      text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  room_id         text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  thread_root_id  text,
  author_type     message_author_type NOT NULL,
  author_user_id  text REFERENCES users(id),
  author_agent_id text REFERENCES agents(id),
  author_run_id   text,
  kind            message_kind NOT NULL DEFAULT 'text',
  content         text,
  content_json    jsonb,
  mentions        text[] NOT NULL DEFAULT '{}',
  reply_to_id     text,
  meta            jsonb NOT NULL DEFAULT '{}',
  is_edited       boolean NOT NULL DEFAULT false,
  is_deleted      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz
);
CREATE INDEX messages_room_time_idx ON messages (room_id, created_at DESC);
CREATE INDEX messages_mentions_idx ON messages USING gin (mentions);

-- ============================================================
-- ACTIVITY & NOTIFICATIONS
-- ============================================================
CREATE TABLE activity_logs (
  id             text PRIMARY KEY,
  company_id     text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_type     text NOT NULL,
  actor_user_id  text REFERENCES users(id),
  actor_agent_id text REFERENCES agents(id),
  action         text NOT NULL,
  target_type    text,
  target_id      text,
  room_id        text REFERENCES rooms(id) ON DELETE SET NULL,
  project_id     text,
  summary        text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  ip_address     text,
  user_agent     text,
  trace_id       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_company_time_idx ON activity_logs (company_id, created_at DESC);

CREATE TABLE notifications (
  id         text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link_url   text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read);

-- ============================================================
-- THEMES & PREFERENCES
-- ============================================================
CREATE TABLE themes (
  id         text PRIMARY KEY,
  company_id text REFERENCES companies(id) ON DELETE CASCADE,
  key        text NOT NULL,
  name       text NOT NULL,
  tokens     jsonb NOT NULL DEFAULT '{}',
  is_builtin boolean NOT NULL DEFAULT false
);
CREATE INDEX themes_company_idx ON themes (company_id);

CREATE TABLE user_preferences (
  user_id               text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_company_id     text REFERENCES companies(id) ON DELETE SET NULL,
  theme_id              text REFERENCES themes(id) ON DELETE SET NULL,
  theme_key             text NOT NULL DEFAULT 'corporate_gray',
  locale                text NOT NULL DEFAULT 'id',
  notification_settings jsonb NOT NULL DEFAULT '{}',
  ui_state              jsonb NOT NULL DEFAULT '{}',
  updated_at            timestamptz NOT NULL DEFAULT now()
);
