-- Migration 042: System Players Standard Operating Schedule (06:00 - 24:00)
-- Night Rest Interval (00:00 - 05:59) is strictly OFF across all rooms unless explicitly unlocked by Admin.

-- 1. Ensure system_players_night_unlocked column exists on rooms table
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS system_players_night_unlocked BOOLEAN DEFAULT false;

-- 2. Update column defaults on rooms table
ALTER TABLE public.rooms
  ALTER COLUMN system_players_schedule_start SET DEFAULT '06:00',
  ALTER COLUMN system_players_schedule_end SET DEFAULT '24:00';

-- 3. Migrate existing rooms from 00:00 to 06:00 standard start
UPDATE public.rooms
SET 
  system_players_schedule_start = '06:00',
  system_players_schedule_end = CASE 
    WHEN system_players_schedule_end = '00:00' OR system_players_schedule_end IS NULL THEN '24:00'
    ELSE system_players_schedule_end
  END,
  updated_at = NOW()
WHERE system_players_schedule_start = '00:00' 
   OR system_players_schedule_start IS NULL 
   OR system_players_schedule_start < '06:00';
