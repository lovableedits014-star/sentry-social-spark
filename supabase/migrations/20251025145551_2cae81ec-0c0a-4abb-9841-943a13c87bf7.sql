-- Add platform column to comments table
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS platform text DEFAULT 'facebook';