-- Version history of the referee nominations (karta Nominace rozhodčích): every save creates a new version with the
-- complete map; referee_assignments stays the current state (read by the bulletins and the public schedule).
CREATE TABLE referee_versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual', -- manual | auto | clear | restore
  assignments     TEXT NOT NULL DEFAULT '{}',     -- JSON { "<round>:<home team key>": name }
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (competition_id, version)
);

-- The nominations saved so far become version 1.
INSERT INTO referee_versions (competition_id, version, source, assignments, created_at)
  SELECT competition_id, 1, 'manual', json_group_object(round || ':' || home_key, name), CAST(strftime('%s', 'now') AS INTEGER)
  FROM referee_assignments GROUP BY competition_id;
