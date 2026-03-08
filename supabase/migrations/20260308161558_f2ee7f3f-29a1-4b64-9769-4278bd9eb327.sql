
-- Create interacoes_pessoa table
CREATE TABLE public.interacoes_pessoa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo_interacao text NOT NULL,
  descricao text NOT NULL,
  criado_por uuid NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.interacoes_pessoa ENABLE ROW LEVEL SECURITY;

-- Client owner can do everything
CREATE POLICY "Client owner can select interacoes"
  ON public.interacoes_pessoa FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert interacoes"
  ON public.interacoes_pessoa FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete interacoes"
  ON public.interacoes_pessoa FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));

-- Team members can select and insert
CREATE POLICY "Team members can select interacoes"
  ON public.interacoes_pessoa FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = interacoes_pessoa.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can insert interacoes"
  ON public.interacoes_pessoa FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = interacoes_pessoa.client_id AND tm.user_id = auth.uid()));
