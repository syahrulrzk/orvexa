-- ============================================================
-- ORVEXA — 0003_message_threads_reactions.sql
-- Threads & reactions untuk pesan (Fase 2).
-- ============================================================

-- ============================================================
-- MESSAGE THREADS (agregat thread per root message)
-- ============================================================
CREATE TABLE message_threads (
  id              text PRIMARY KEY,
  room_id         text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  root_message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reply_count     int NOT NULL DEFAULT 0,
  last_reply_at   timestamptz,
  participant_ids text[] NOT NULL DEFAULT '{}',
  UNIQUE (root_message_id)
);
CREATE INDEX message_threads_room_idx ON message_threads (room_id, last_reply_at DESC);

-- ============================================================
-- MESSAGE REACTIONS
-- ============================================================
CREATE TABLE message_reactions (
  id         text PRIMARY KEY,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  agent_id   text REFERENCES agents(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, agent_id) = 1)
);

-- Unique per (message, actor, emoji). Partial index diperlukan karena
-- NULL tidak dianggap sama pada UNIQUE constraint biasa.
CREATE UNIQUE INDEX message_reactions_user_uq
  ON message_reactions (message_id, user_id, emoji) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX message_reactions_agent_uq
  ON message_reactions (message_id, agent_id, emoji) WHERE agent_id IS NOT NULL;
CREATE INDEX message_reactions_message_idx ON message_reactions (message_id);

-- ============================================================
-- SEARCH: index trigram untuk pencarian pesan
-- ============================================================
CREATE INDEX messages_content_trgm_idx ON messages USING gin (content gin_trgm_ops);

-- ============================================================
-- ATTACHMENTS: index tambahan
-- ============================================================
CREATE INDEX attachments_company_idx ON attachments (company_id, created_at DESC);
