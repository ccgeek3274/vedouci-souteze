-- Roster versions: every confirmed import (or manual edit) creates a new version; the latest is current.
CREATE TABLE roster_versions (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  source      TEXT NOT NULL,                  -- xlsx | json | manual
  filename    TEXT NOT NULL DEFAULT '',
  base_count  INTEGER NOT NULL DEFAULT 8,     -- size of the starting line-up (Z)
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (team_id, version)
);

CREATE TABLE roster_players (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  roster_version_id  TEXT NOT NULL REFERENCES roster_versions(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,
  name               TEXT NOT NULL,
  birth_year         INTEGER,
  lok                INTEGER,
  fide               INTEGER,
  flags              TEXT NOT NULL DEFAULT '',  -- space-joined subset of K ZK H V C
  base               INTEGER NOT NULL DEFAULT 0, -- in the starting line-up (Z)
  guest_permit       INTEGER NOT NULL DEFAULT 0, -- povolení hostování doloženo
  struck             INTEGER NOT NULL DEFAULT 0, -- vyškrtnut (definitive bulletin)
  struck_reason      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_roster_players_version ON roster_players(roster_version_id, position);

-- Requests for the draw meeting (start time, draw number, date change, ...).
CREATE TABLE requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_id         TEXT REFERENCES teams(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,              -- start_time | draw_no | date_change | other
  text            TEXT NOT NULL,
  round           INTEGER,
  status          TEXT NOT NULL DEFAULT 'new',  -- new | accepted | rejected
  decision        TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'manual', -- manual | roster
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_requests_competition ON requests(competition_id);
