-- M6: result of the separate (competition-wide, approximate) V check: entries of the player on rosters of
-- higher competitions + the club's teams found there (shared/roster/verify.ts VCheck).
ALTER TABLE roster_players ADD COLUMN v_json TEXT;
ALTER TABLE roster_players ADD COLUMN v_checked_at INTEGER;
