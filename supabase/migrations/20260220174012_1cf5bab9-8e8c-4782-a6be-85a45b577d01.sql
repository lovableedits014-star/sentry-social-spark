-- Tabela de missões de engajamento pinadas pelo gestor para exibir no portal do apoiador
CREATE TABLE public.portal_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  post_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_portal_missions_client FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.portal_missions ENABLE ROW LEVEL SECURITY;

-- Policy: gestores podem gerenciar suas missões
CREATE POLICY "Users can manage their portal missions"
  ON public.portal_missions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = portal_missions.client_id
      AND clients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = portal_missions.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Policy: apoiadores autenticados podem VER as missões do cliente (para exibir no portal)
CREATE POLICY "Authenticated users can view portal missions"
  ON public.portal_missions
  FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_portal_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_portal_missions_updated_at
  BEFORE UPDATE ON public.portal_missions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_portal_missions_updated_at();

-- Index para queries rápidas
CREATE INDEX idx_portal_missions_client_active ON public.portal_missions(client_id, is_active, display_order);
