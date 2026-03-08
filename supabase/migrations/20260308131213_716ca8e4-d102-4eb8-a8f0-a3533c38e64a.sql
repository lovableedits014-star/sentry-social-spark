
-- Enums para a entidade Pessoa
CREATE TYPE public.tipo_pessoa AS ENUM (
  'eleitor', 'apoiador', 'lideranca', 'jornalista', 'influenciador', 'voluntario', 'adversario', 'cidadao'
);

CREATE TYPE public.nivel_apoio AS ENUM (
  'desconhecido', 'simpatizante', 'apoiador', 'militante', 'opositor'
);

CREATE TYPE public.origem_contato AS ENUM (
  'rede_social', 'formulario', 'evento', 'importacao', 'manual'
);

-- Tabela principal: pessoas
CREATE TABLE public.pessoas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  cidade TEXT,
  bairro TEXT,
  endereco TEXT,
  data_nascimento DATE,
  tipo_pessoa public.tipo_pessoa NOT NULL DEFAULT 'cidadao',
  nivel_apoio public.nivel_apoio NOT NULL DEFAULT 'desconhecido',
  origem_contato public.origem_contato NOT NULL DEFAULT 'manual',
  tags TEXT[] DEFAULT '{}',
  notas_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de redes sociais da pessoa
CREATE TABLE public.pessoa_social (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('facebook', 'instagram', 'twitter', 'tiktok', 'youtube')),
  usuario TEXT,
  url_perfil TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_pessoas_updated_at
  BEFORE UPDATE ON public.pessoas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: pessoas
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select pessoas"
  ON public.pessoas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert pessoas"
  ON public.pessoas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can update pessoas"
  ON public.pessoas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete pessoas"
  ON public.pessoas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));

-- RLS: pessoa_social
ALTER TABLE public.pessoa_social ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select pessoa_social"
  ON public.pessoa_social FOR SELECT
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can insert pessoa_social"
  ON public.pessoa_social FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can update pessoa_social"
  ON public.pessoa_social FOR UPDATE
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can delete pessoa_social"
  ON public.pessoa_social FOR DELETE
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));

-- Team members também podem ver pessoas do seu cliente
CREATE POLICY "Team members can select pessoas"
  ON public.pessoas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = pessoas.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Team members can select pessoa_social"
  ON public.pessoa_social FOR SELECT
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND tm.user_id = auth.uid()));
