
-- Add new tipo_pessoa enum values
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'contratado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'liderado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'indicado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'lider';
