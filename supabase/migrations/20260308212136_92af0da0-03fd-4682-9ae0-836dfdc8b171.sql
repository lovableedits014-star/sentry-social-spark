
-- Table for registered telemarketing operators
CREATE TABLE public.telemarketing_operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  senha text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.telemarketing_operadores ENABLE ROW LEVEL SECURITY;

-- Client owner full access
CREATE POLICY "Client owner can manage operadores"
  ON public.telemarketing_operadores FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = telemarketing_operadores.client_id AND clients.user_id = auth.uid()));

-- Team members can view
CREATE POLICY "Team members can select operadores"
  ON public.telemarketing_operadores FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = telemarketing_operadores.client_id AND tm.user_id = auth.uid()));

-- Public can read for login validation (only active)
CREATE POLICY "Public can read operadores for login"
  ON public.telemarketing_operadores FOR SELECT
  USING (ativo = true);
