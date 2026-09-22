-- ============================================================
-- ORVEXA — 0002_auth_sessions.sql
-- Session yang bisa direvokasi + linkage akun OAuth.
-- ============================================================

-- ============================================================
-- SESSIONS (revocable, database-backed)
-- ============================================================
CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_active_idx ON sessions (expires_at)
  WHERE revoked_at IS NULL;

-- ============================================================
-- ACCOUNTS (linkage OAuth; token provider TIDAK disimpan di sini)
-- ============================================================
CREATE TABLE accounts (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  provider_account_id text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX accounts_user_idx ON accounts (user_id);
