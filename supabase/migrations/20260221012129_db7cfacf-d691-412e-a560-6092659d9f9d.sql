
-- Table to store weekly IED (Índice de Eleitorabilidade Digital) scores
CREATE TABLE public.ied_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0, -- 0 to 100
  sentiment_score INTEGER NOT NULL DEFAULT 0, -- component: sentiment analysis (0-100)
  growth_score INTEGER NOT NULL DEFAULT 0, -- component: supporter growth (0-100)
  engagement_score INTEGER NOT NULL DEFAULT 0, -- component: engagement level (0-100)
  checkin_score INTEGER NOT NULL DEFAULT 0, -- component: check-in activity (0-100)
  week_start DATE NOT NULL, -- start of the week this score represents
  details JSONB DEFAULT '{}', -- raw data used for calculation
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one score per client per week
ALTER TABLE public.ied_scores ADD CONSTRAINT ied_scores_client_week_unique UNIQUE (client_id, week_start);

-- Enable RLS
ALTER TABLE public.ied_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own IED scores"
ON public.ied_scores FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own IED scores"
ON public.ied_scores FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can update their own IED scores"
ON public.ied_scores FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()
));

-- Index for fast lookups
CREATE INDEX idx_ied_scores_client_week ON public.ied_scores (client_id, week_start DESC);
