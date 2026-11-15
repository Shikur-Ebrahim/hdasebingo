-- Migration 037: Allow 'welcome' and 'system_player' categories in support_videos

-- 1. Drop existing category check constraint
ALTER TABLE public.support_videos
  DROP CONSTRAINT IF EXISTS support_videos_category_check;

-- 2. Re-create constraint allowing welcome and system_player
ALTER TABLE public.support_videos
  ADD CONSTRAINT support_videos_category_check
  CHECK (category IN (
    'welcome',
    'system_player',
    'how_to_use',
    'how_to_play',
    'deposit',
    'withdraw',
    'invite',
    'transfer'
  ));

-- 3. Also make sure show_on_home and popup_max_views exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'support_videos' AND column_name = 'show_on_home'
  ) THEN
    ALTER TABLE public.support_videos ADD COLUMN show_on_home BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'support_videos' AND column_name = 'popup_max_views'
  ) THEN
    ALTER TABLE public.support_videos ADD COLUMN popup_max_views INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;
