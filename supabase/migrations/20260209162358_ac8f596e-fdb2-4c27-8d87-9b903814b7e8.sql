-- Add parent_comment_id to track reply threading
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_comment_id text;

-- Add is_page_owner flag to identify page/account owner comments
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_page_owner boolean NOT NULL DEFAULT false;

-- Index for efficient parent-child lookups
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- Index for page owner filtering
CREATE INDEX IF NOT EXISTS idx_comments_is_page_owner ON public.comments(is_page_owner) WHERE is_page_owner = true;