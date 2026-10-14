-- Migration 018: Support Videos Table
-- Stores admin-uploaded help/tutorial videos served from Cloudflare R2

CREATE TABLE IF NOT EXISTS public.support_videos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT        NOT NULL CHECK (category IN ('how_to_use', 'how_to_play', 'deposit', 'withdraw')),
  title        TEXT        NOT NULL,
  description  TEXT,
  video_url    TEXT        NOT NULL,
  video_key    TEXT        NOT NULL,
  thumbnail_url TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable RLS so service-role key can access directly
ALTER TABLE public.support_videos DISABLE ROW LEVEL SECURITY;

-- Grant access to all roles
GRANT ALL ON TABLE public.support_videos TO anon, authenticated, service_role;

-- Index for fast category + active queries
CREATE INDEX IF NOT EXISTS idx_support_videos_category ON public.support_videos(category, is_active, sort_order);
