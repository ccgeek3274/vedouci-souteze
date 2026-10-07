-- chess.cz proxy: global rate gate (single row) + response cache.
CREATE TABLE chesscz_rate (
  id             INTEGER PRIMARY KEY,
  last_fetch_at  INTEGER NOT NULL DEFAULT 0,
  blocked_until  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO chesscz_rate (id, last_fetch_at, blocked_until) VALUES (1, 0, 0);

CREATE TABLE chesscz_cache (
  cache_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  ttl_ms      INTEGER NOT NULL,
  fetched_at  INTEGER NOT NULL
);

-- Personal API tokens (Claude Code skills, scripts). Only the SHA-256 hash is stored.
CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

-- One competition = one group (e.g. RP B 2026/2027), owned by the user who created it.
CREATE TABLE competitions (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season           TEXT NOT NULL,             -- '2026/2027'
  region           TEXT NOT NULL DEFAULT '',  -- 'Středočeský šachový svaz (SŠS)'
  level            TEXT NOT NULL,             -- KP | KS | RP | RS | other
  group_code       TEXT NOT NULL DEFAULT '',  -- 'B', '' for a single-group level
  short            TEXT NOT NULL,             -- 'RPB'
  name             TEXT NOT NULL,             -- 'Regionální přebor B'
  boards           INTEGER NOT NULL DEFAULT 8,
  default_start    TEXT NOT NULL DEFAULT '09:00',
  time_control     TEXT NOT NULL DEFAULT '',
  manager_name     TEXT NOT NULL DEFAULT '',
  manager_email    TEXT NOT NULL DEFAULT '',
  manager_phone    TEXT NOT NULL DEFAULT '',
  mutual_deadline  TEXT,                      -- ISO date: same-club teams must meet by then
  chesscz_comp_id  INTEGER,
  phase            TEXT NOT NULL DEFAULT 'preparation',  -- preparation | draw | running | finished
  notes            TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (owner_id, season, short)
);

CREATE TABLE competition_rounds (
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  date            TEXT NOT NULL,              -- ISO date
  note            TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (competition_id, round)
);

-- Teams; removed teams are kept with status='reserve' (may come back at the draw meeting).
CREATE TABLE teams (
  id               TEXT PRIMARY KEY,
  competition_id   TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  club_name        TEXT NOT NULL DEFAULT '',
  club_code        TEXT,
  chesscz_team_id  INTEGER,
  position         INTEGER NOT NULL,          -- order in the list (1-based)
  draw_no          INTEGER,                   -- losovací číslo
  status           TEXT NOT NULL DEFAULT 'active',  -- active | reserve
  venue            TEXT NOT NULL DEFAULT '',
  shoes            TEXT NOT NULL DEFAULT '',
  start_pref       TEXT NOT NULL DEFAULT '',
  draw_requests    TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_teams_competition ON teams(competition_id, status, position);

CREATE TABLE team_contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role      TEXT NOT NULL,                    -- kapitan | zastupce | komunikace | rozhodci
  position  INTEGER NOT NULL DEFAULT 1,
  name      TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_team_contacts_team ON team_contacts(team_id);

CREATE TABLE import_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id  TEXT REFERENCES competitions(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,              -- competition-json | roster-xlsx | roster-json
  filename        TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',   -- JSON
  created_at      INTEGER NOT NULL
);
