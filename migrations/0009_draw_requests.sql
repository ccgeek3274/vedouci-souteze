-- Draw conditions become part of the requests (kind 'draw_no' = požadavek na losování), editable on the
-- Požadavky tab, the team page and the Losování tab. Incomplete specs are allowed (resolved at the meeting).
-- draw_kind: draw_no (value) | home / away (round) | meet (other_team_id, round)
--            | alternate / same (other_team_id, or ext_name + ext_no + ext_teams); NULL = not specified yet.
ALTER TABLE requests ADD COLUMN draw_kind TEXT;
ALTER TABLE requests ADD COLUMN value INTEGER;
ALTER TABLE requests ADD COLUMN other_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE requests ADD COLUMN ext_name TEXT NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN ext_no INTEGER;
ALTER TABLE requests ADD COLUMN ext_teams INTEGER;

INSERT INTO requests (competition_id, team_id, kind, text, round, status, decision, source, created_at,
                      draw_kind, value, other_team_id, ext_name, ext_no, ext_teams)
SELECT competition_id, team_id, 'draw_no', note, round, 'new', '', 'manual', created_at,
       kind, value, other_team_id, ext_name, ext_no, ext_teams
FROM draw_constraints;

-- "Požadavky na losování" from e-soupisky were imported as generic requests.
UPDATE requests SET kind = 'draw_no'
WHERE kind = 'other' AND source = 'roster'
  AND EXISTS (SELECT 1 FROM teams t WHERE t.id = requests.team_id AND t.draw_requests = requests.text);
UPDATE requests SET draw_kind = 'alternate'
WHERE kind = 'draw_no' AND draw_kind IS NULL AND (text LIKE '%protičísl%' OR text LIKE '%proti čísl%');

DROP TABLE draw_constraints;
