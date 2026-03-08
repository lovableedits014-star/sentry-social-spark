CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  nome text NOT NULL,
  descricao text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, nome)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select tags" ON public.tags
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert tags" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete tags" ON public.tags
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select tags" ON public.tags
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = tags.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can insert tags" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = tags.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.pessoas_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(pessoa_id, tag_id)
);

ALTER TABLE public.pessoas_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select pessoas_tags" ON public.pessoas_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id
    WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Client owner can insert pessoas_tags" ON public.pessoas_tags
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id
    WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Client owner can delete pessoas_tags" ON public.pessoas_tags
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id
    WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Team members can select pessoas_tags" ON public.pessoas_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id
    WHERE p.id = pessoas_tags.pessoa_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "Team members can insert pessoas_tags" ON public.pessoas_tags
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id
    WHERE p.id = pessoas_tags.pessoa_id AND tm.user_id = auth.uid()
  ));

CREATE INDEX idx_pessoas_tags_pessoa_id ON public.pessoas_tags(pessoa_id);
CREATE INDEX idx_pessoas_tags_tag_id ON public.pessoas_tags(tag_id);
CREATE INDEX idx_tags_client_id ON public.tags(client_id);