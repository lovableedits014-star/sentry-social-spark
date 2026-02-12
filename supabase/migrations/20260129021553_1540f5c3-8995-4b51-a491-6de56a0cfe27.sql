-- Create enum for supporter classification
CREATE TYPE public.supporter_classification AS ENUM (
  'apoiador_ativo',
  'apoiador_passivo',
  'neutro',
  'critico'
);

-- Create supporters table (unified individuals)
CREATE TABLE public.supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  classification supporter_classification DEFAULT 'neutro',
  notes TEXT,
  first_contact_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_interaction_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  engagement_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create supporter_profiles table (platform profiles linked to supporters)
CREATE TABLE public.supporter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(supporter_id, platform, platform_user_id)
);

-- Create index for faster lookups
CREATE INDEX idx_supporter_profiles_platform_user ON public.supporter_profiles(platform, platform_user_id);
CREATE INDEX idx_supporters_client ON public.supporters(client_id);
CREATE INDEX idx_supporters_classification ON public.supporters(client_id, classification);

-- Enable RLS
ALTER TABLE public.supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supporters
CREATE POLICY "Users can view their own supporters"
ON public.supporters FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own supporters"
ON public.supporters FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can update their own supporters"
ON public.supporters FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own supporters"
ON public.supporters FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()
));

-- RLS Policies for supporter_profiles
CREATE POLICY "Users can view their own supporter profiles"
ON public.supporter_profiles FOR SELECT
USING (EXISTS (
  SELECT 1 FROM supporters 
  JOIN clients ON clients.id = supporters.client_id 
  WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own supporter profiles"
ON public.supporter_profiles FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM supporters 
  JOIN clients ON clients.id = supporters.client_id 
  WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can update their own supporter profiles"
ON public.supporter_profiles FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM supporters 
  JOIN clients ON clients.id = supporters.client_id 
  WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own supporter profiles"
ON public.supporter_profiles FOR DELETE
USING (EXISTS (
  SELECT 1 FROM supporters 
  JOIN clients ON clients.id = supporters.client_id 
  WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()
));

-- Trigger for updated_at
CREATE TRIGGER update_supporters_updated_at
BEFORE UPDATE ON public.supporters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();