-- Bulletin drafts (M8/M9): only what is not generated from chess.cz — texts, referees per match, options.
-- Generated documents are not stored. Save points are named copies of the config that can be restored.
CREATE TABLE bulletins (
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,              -- 'initial' (úvodní zpravodaj), later 'round-N'
  config          TEXT NOT NULL DEFAULT '{}', -- JSON, shared/bulletin/config.ts
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (competition_id, key)
);

CREATE TABLE bulletin_savepoints (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  config          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_bulletin_savepoints ON bulletin_savepoints(competition_id, key, created_at);
