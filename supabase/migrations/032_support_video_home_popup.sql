-- Migration 032: Add home popup columns to support_videos and default settings
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

-- Insert default settings into settings table
INSERT INTO settings (key, value)
VALUES 
  ('home_popup_video_enabled', 'true'),
  ('home_popup_video_views', '1')
ON CONFLICT (key) DO NOTHING;
