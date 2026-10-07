-- Local dev only: fixed user for POST /api/v1/auth/dev-login.
INSERT OR IGNORE INTO users (id, email, name, role, status, created_at)
VALUES ('dev-user-001', 'dev@localhost', 'Vývojář', 'admin', 'active', unixepoch());
