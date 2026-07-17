-- D1 initial schema for GitAll persistent profiles
-- Run via: wrangler d1 migrations apply gitall

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                  -- ulid (generated in app code)
  handle TEXT UNIQUE NOT NULL,
  display_name TEXT,
  primary_provider TEXT NOT NULL,       -- 'github' | 'gitlab' | 'bitbucket'
  handle_changed_at INTEGER,            -- unix ms; NULL = never changed (first change always allowed)
  created_at INTEGER NOT NULL,          -- unix ms
  updated_at INTEGER NOT NULL           -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_users_handle ON users(handle);

CREATE TABLE IF NOT EXISTS connections (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,               -- 'github' | 'gitlab' | 'bitbucket'
  account_id TEXT NOT NULL,             -- stable platform-side id
  username TEXT NOT NULL,
  avatar_url TEXT,
  verified_at INTEGER NOT NULL,         -- unix ms
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, account_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_connections_provider_username ON connections(provider, username);
