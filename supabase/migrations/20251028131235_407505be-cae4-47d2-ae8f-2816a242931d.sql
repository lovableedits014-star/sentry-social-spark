-- Add post context fields to comments table
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS post_message TEXT,
  ADD COLUMN IF NOT EXISTS post_permalink_url TEXT,
  ADD COLUMN IF NOT EXISTS post_full_picture TEXT,
  ADD COLUMN IF NOT EXISTS post_media_type TEXT,
  ADD COLUMN IF NOT EXISTS comment_created_time TIMESTAMPTZ;