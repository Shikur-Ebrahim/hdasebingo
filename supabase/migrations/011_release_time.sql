-- 011_release_time.sql
-- Add release_time_s column to game_settings table
ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS release_time_s INT DEFAULT 60;
