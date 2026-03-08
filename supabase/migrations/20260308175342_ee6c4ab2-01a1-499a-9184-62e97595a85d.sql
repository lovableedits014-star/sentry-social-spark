
-- Tabela de contratados vinculados a líderes
CREATE TABLE public.contratados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lider_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  email text,
  endereco text,
  cidade text,
  bairro text,
  zona_eleitoral text,
  redes_sociais jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ativo',
  contrato_aceito boolean NOT NULL DEFAULT false,
  contrato_aceito_em timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de dispatches de missões para contratados via WhatsApp
CREATE TABLE public.contratado_missao_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.portal_missions(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  mensagem_template text NOT NULL,
  link_missao text,
  status text NOT NULL DEFAULT 'pendente',
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 10,
  delay_min_seconds integer NOT NULL DEFAULT 30,
  delay_max_seconds integer NOT NULL DEFAULT 90,
  batch_pause_seconds integer NOT NULL DEFAULT 300,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Itens individuais de cada disparo
CREATE TABLE public.contratado_missao_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.contratado_missao_dispatches(id) ON DELETE CASCADE,
  contratado_id uuid NOT NULL REFERENCES public.contratados(id) ON DELETE CASCADE,
  contratado_nome text NOT NULL,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  enviado_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.contratados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratado_missao_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratado_missao_items ENABLE ROW LEVEL SECURITY;

-- Contratados: client owner full access
CREATE POLICY "Client owner can select contratados" ON public.contratados FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert contratados" ON public.contratados FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update contratados" ON public.contratados FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete contratados" ON public.contratados FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));

-- Public insert for registration form
CREATE POLICY "Public can register contratado" ON public.contratados FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id));

-- Team members can view
CREATE POLICY "Team members can select contratados" ON public.contratados FOR SELECT USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratados.client_id AND tm.user_id = auth.uid()));

-- Dispatches: client owner full access
CREATE POLICY "Client owner can select dispatches" ON public.contratado_missao_dispatches FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert dispatches" ON public.contratado_missao_dispatches FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update dispatches" ON public.contratado_missao_dispatches FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));

-- Items: access through dispatch
CREATE POLICY "Client owner can select items" ON public.contratado_missao_items FOR SELECT USING (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can insert items" ON public.contratado_missao_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can update items" ON public.contratado_missao_items FOR UPDATE USING (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));
