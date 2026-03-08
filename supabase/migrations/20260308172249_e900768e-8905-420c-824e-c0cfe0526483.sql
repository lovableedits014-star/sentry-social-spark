
-- Campanhas table
CREATE TABLE public.campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  status TEXT NOT NULL DEFAULT 'planejamento',
  meta_principal TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Campaign tasks table
CREATE TABLE public.campanha_tarefas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  responsavel_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade TEXT NOT NULL DEFAULT 'media',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_tarefas ENABLE ROW LEVEL SECURITY;

-- RLS policies for campanhas
CREATE POLICY "Client owner can select campanhas" ON public.campanhas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert campanhas" ON public.campanhas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can update campanhas" ON public.campanhas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete campanhas" ON public.campanhas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select campanhas" ON public.campanhas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanhas.client_id AND tm.user_id = auth.uid()));

-- RLS policies for campanha_tarefas
CREATE POLICY "Client owner can select campanha_tarefas" ON public.campanha_tarefas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert campanha_tarefas" ON public.campanha_tarefas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can update campanha_tarefas" ON public.campanha_tarefas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete campanha_tarefas" ON public.campanha_tarefas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select campanha_tarefas" ON public.campanha_tarefas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanha_tarefas.client_id AND tm.user_id = auth.uid()));

-- Updated_at triggers
CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campanha_tarefas_updated_at BEFORE UPDATE ON public.campanha_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
