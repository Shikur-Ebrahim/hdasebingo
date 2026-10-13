-- 013_broadcast_posts.sql
-- Admin broadcast posts system

CREATE TABLE IF NOT EXISTS broadcast_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,
  media_url     TEXT,           -- Cloudflare R2 public URL (image or video)
  media_key     TEXT,           -- R2 object key for deletion
  media_type    TEXT,           -- 'image' | 'video' | null
  send_to       TEXT NOT NULL DEFAULT 'bot',  -- 'bot' | 'channel' | 'both'
  channel_id    TEXT,           -- Optional specific channel username or ID (e.g. @adwabingo)
  status        TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  sent_count    INT DEFAULT 0,
  failed_count  INT DEFAULT 0,
  error_message TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- If table already exists, ensure columns exist
ALTER TABLE broadcast_posts ADD COLUMN IF NOT EXISTS media_url     TEXT;
ALTER TABLE broadcast_posts ADD COLUMN IF NOT EXISTS media_key     TEXT;
ALTER TABLE broadcast_posts ADD COLUMN IF NOT EXISTS media_type    TEXT;
ALTER TABLE broadcast_posts ADD COLUMN IF NOT EXISTS channel_id    TEXT;
ALTER TABLE broadcast_posts ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Disable Row Level Security completely so backend anon key can read/write without restriction
ALTER TABLE broadcast_posts DISABLE ROW LEVEL SECURITY;

-- Also add permissive policies for anon and service_role just in case RLS is manually enabled
DO $$
BEGIN
  ALTER TABLE broadcast_posts ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "anon_all" ON broadcast_posts;
  DROP POLICY IF EXISTS "public_all" ON broadcast_posts;
  DROP POLICY IF EXISTS "service_role_all" ON broadcast_posts;

  CREATE POLICY "anon_all" ON broadcast_posts FOR ALL TO anon USING (true) WITH CHECK (true);
  CREATE POLICY "public_all" ON broadcast_posts FOR ALL TO public USING (true) WITH CHECK (true);
  CREATE POLICY "service_role_all" ON broadcast_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

  ALTER TABLE broadcast_posts DISABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_broadcast_posts_status ON broadcast_posts(status, scheduled_at);
