-- M6: snapshot of the chess.cz record of a roster player at the time of the check (shared/roster/verify.ts CzCheck).
ALTER TABLE roster_players ADD COLUMN cz_json TEXT;
ALTER TABLE roster_players ADD COLUMN cz_checked_at INTEGER;
