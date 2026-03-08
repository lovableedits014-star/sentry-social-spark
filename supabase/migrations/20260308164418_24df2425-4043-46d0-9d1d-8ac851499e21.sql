CREATE TABLE public.timeline_pessoa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo_evento text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  criado_por uuid NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.timeline_pessoa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select timeline" ON public.timeline_pessoa
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert timeline" ON public.timeline_pessoa
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete timeline" ON public.timeline_pessoa
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select timeline" ON public.timeline_pessoa
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = timeline_pessoa.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can insert timeline" ON public.timeline_pessoa
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = timeline_pessoa.client_id AND tm.user_id = auth.uid()));

CREATE INDEX idx_timeline_pessoa_pessoa_id ON public.timeline_pessoa(pessoa_id);
CREATE INDEX idx_timeline_pessoa_criado_em ON public.timeline_pessoa(criado_em DESC);