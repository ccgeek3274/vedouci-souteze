-- Users: Google OAuth accounts (id google-<sub>) and admin-created local accounts (id local-<uuid>).
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'user',      -- user | admin
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | active | blocked
  password_hash TEXT,                              -- pbkdf2$... for local accounts, NULL for Google
  created_at    INTEGER NOT NULL
);
