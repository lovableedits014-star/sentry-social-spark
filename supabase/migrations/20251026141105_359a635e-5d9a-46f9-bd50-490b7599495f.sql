-- Add author profile picture column to comments table
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS author_profile_picture text;