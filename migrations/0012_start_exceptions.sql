-- Start-time exceptions limited to some rounds: requests.skip_rounds = rounds where the approved exception does not
-- apply ("3,7"); copied to teams.start_home_skip / start_away_skip together with the time (syncTeamStart).
-- The last round never uses exceptions; competitions.last_start = its own start if it differs from default_start.
ALTER TABLE requests ADD COLUMN skip_rounds TEXT NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN start_home_skip TEXT NOT NULL DEFAULT '';
ALTER TABLE teams ADD COLUMN start_away_skip TEXT NOT NULL DEFAULT '';
ALTER TABLE competitions ADD COLUMN last_start TEXT NOT NULL DEFAULT '';
