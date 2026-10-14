-- Migration 019: Add invite and transfer categories to support_videos

-- Drop old constraint and recreate with new categories
ALTER TABLE public.support_videos
  DROP CONSTRAINT IF EXISTS support_videos_category_check;

ALTER TABLE public.support_videos
  ADD CONSTRAINT support_videos_category_check
  CHECK (category IN ('how_to_use', 'how_to_play', 'deposit', 'withdraw', 'invite', 'transfer'));
