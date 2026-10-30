-- Roster check findings the vedoucí accepted manually (JSON array of issue texts, shared/roster/verify.ts Issue.text):
-- an accepted finding is shown as accepted, does not count as a deficiency and does not go into the bulletin.
ALTER TABLE roster_players ADD COLUMN accepted_issues TEXT NOT NULL DEFAULT '[]';
