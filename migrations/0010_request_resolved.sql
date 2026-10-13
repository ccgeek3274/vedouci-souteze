-- Manual resolution of requests whose fulfilment cannot be checked automatically
-- (other / date change / draw request without a specified condition).
ALTER TABLE requests ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0;
