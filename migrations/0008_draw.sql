-- Draw-meeting conditions (M7): structured counterparts of the free-text requests, checked against the Berger draw.
-- kind: draw_no (value) | home / away (round) | meet (other_team_id, round)
--       | alternate / same (other_team_id, or an external team: ext_name + ext_no + ext_teams)
CREATE TABLE draw_constraints (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  team_id         TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  round           INTEGER,
  value           INTEGER,
  other_team_id   TEXT REFERENCES teams(id) ON DELETE CASCADE,
  ext_name        TEXT NOT NULL DEFAULT '',
  ext_no          INTEGER,
  ext_teams       INTEGER,
  note            TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_draw_constraints_competition ON draw_constraints(competition_id);
