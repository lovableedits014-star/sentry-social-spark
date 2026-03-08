
-- Intelligent alerts table
CREATE TABLE public.alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'sentimento_negativo', 'queda_engajamento', 'crise', 'tarefa_atrasada', 'inatividade'
  severidade TEXT NOT NULL DEFAULT 'media', -- 'baixa', 'media', 'alta', 'critica'
  titulo TEXT NOT NULL,
  descricao TEXT,
  dados JSON,
  lido BOOLEAN NOT NULL DEFAULT false,
  descartado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_alertas_client_created ON public.alertas (client_id, created_at DESC);
CREATE INDEX idx_alertas_client_lido ON public.alertas (client_id, lido) WHERE descartado = false;

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select alertas" ON public.alertas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert alertas" ON public.alertas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can update alertas" ON public.alertas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete alertas" ON public.alertas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select alertas" ON public.alertas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = alertas.client_id AND tm.user_id = auth.uid()));

-- Service role needs to insert alerts from edge function
CREATE POLICY "Service role can insert alertas" ON public.alertas FOR INSERT
  WITH CHECK (true);
