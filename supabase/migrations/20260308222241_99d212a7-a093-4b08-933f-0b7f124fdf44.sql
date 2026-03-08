
-- Ações Externas table
CREATE TABLE public.acoes_externas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  local text,
  data_inicio timestamp with time zone NOT NULL,
  data_fim timestamp with time zone NOT NULL,
  meta_cadastros integer NOT NULL DEFAULT 0,
  tag_nome text NOT NULL,
  status text NOT NULL DEFAULT 'planejada',
  cadastros_coletados integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Assignment pivot table
CREATE TABLE public.acao_externa_funcionarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao_id uuid NOT NULL REFERENCES public.acoes_externas(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cadastros_coletados integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(acao_id, funcionario_id)
);

-- Enable RLS
ALTER TABLE public.acoes_externas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acao_externa_funcionarios ENABLE ROW LEVEL SECURITY;

-- RLS for acoes_externas
CREATE POLICY "Client owner can manage acoes_externas" ON public.acoes_externas FOR ALL USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = acoes_externas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select acoes_externas" ON public.acoes_externas FOR SELECT USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = acoes_externas.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Funcionario can view assigned acoes" ON public.acoes_externas FOR SELECT USING (EXISTS (SELECT 1 FROM acao_externa_funcionarios aef JOIN funcionarios f ON f.id = aef.funcionario_id WHERE aef.acao_id = acoes_externas.id AND f.user_id = auth.uid()));

-- RLS for acao_externa_funcionarios
CREATE POLICY "Client owner can manage acao_externa_funcionarios" ON public.acao_externa_funcionarios FOR ALL USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = acao_externa_funcionarios.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Funcionario can view own assignments" ON public.acao_externa_funcionarios FOR SELECT USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = acao_externa_funcionarios.funcionario_id AND f.user_id = auth.uid()));
CREATE POLICY "Funcionario can update own assignment" ON public.acao_externa_funcionarios FOR UPDATE USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = acao_externa_funcionarios.funcionario_id AND f.user_id = auth.uid()));

-- Ensure the tag exists in tags table when action is created
-- We'll handle tag creation in application code

-- Add updated_at trigger
CREATE TRIGGER update_acoes_externas_updated_at BEFORE UPDATE ON public.acoes_externas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
