-- Referee assignments (karta Nasazení rozhodčích): one referee per match, keyed by round + home team key
-- (app team id, or 'cz:<chess.cz team id>' for a chess.cz team not in the app). The bulletins take them from here.
-- competitions.published = the public schedule page /rozpis/<id> is on.
CREATE TABLE referee_assignments (
  competition_id  TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  home_key        TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (competition_id, round, home_key)
);
ALTER TABLE competitions ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
