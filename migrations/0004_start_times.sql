-- Start-time exceptions per team (HH:MM), as in uvodni-zpravodaj cfg.home / cfg.away.
-- NULL = the competition's default start. The last round never uses them (Rozpis).
ALTER TABLE teams ADD COLUMN start_home TEXT;
ALTER TABLE teams ADD COLUMN start_away TEXT;

-- Structured start-time requests: time (HH:MM) and side (home | away).
ALTER TABLE requests ADD COLUMN time TEXT;
ALTER TABLE requests ADD COLUMN side TEXT;
