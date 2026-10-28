-- Swiss-Manager tab: teams.short_name = short team name (SM "Zkratka"), NULL = not generated yet (the SM page
-- generates the missing ones and stores them). teams.sm_info = edited SM "Info" (max 70 chars), NULL = automatic
-- (hrací místnost + nonstandard start of home matches).
ALTER TABLE teams ADD COLUMN short_name TEXT;
ALTER TABLE teams ADD COLUMN sm_info TEXT;
