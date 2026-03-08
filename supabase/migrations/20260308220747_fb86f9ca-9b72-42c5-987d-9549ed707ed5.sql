
-- Create funcionarios table
CREATE TABLE public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  user_id uuid,
  nome text NOT NULL,
  telefone text NOT NULL,
  email text,
  cidade text,
  bairro text,
  endereco text,
  redes_sociais jsonb DEFAULT '[]'::jsonb,
  referral_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  referral_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  supporter_id uuid REFERENCES public.supporters(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage funcionarios" ON public.funcionarios FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionarios.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Funcionario can view own record" ON public.funcionarios FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Funcionario can update own record" ON public.funcionarios FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Team members can select funcionarios" ON public.funcionarios FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = funcionarios.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Public can read funcionarios for registration" ON public.funcionarios FOR SELECT
  USING (true);

-- Create funcionario_checkins table
CREATE TABLE public.funcionario_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funcionario_id, checkin_date)
);

ALTER TABLE public.funcionario_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select funcionario_checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionario_checkins.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Funcionario can checkin" ON public.funcionario_checkins FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_checkins.funcionario_id AND funcionarios.user_id = auth.uid()));

CREATE POLICY "Funcionario can view own checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_checkins.funcionario_id AND funcionarios.user_id = auth.uid()));

CREATE POLICY "Team members can select funcionario_checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = funcionario_checkins.client_id AND tm.user_id = auth.uid()));

-- Create funcionario_referrals table (tracks who each funcionario recruited)
CREATE TABLE public.funcionario_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  pessoa_id uuid REFERENCES public.pessoas(id),
  supporter_account_id uuid REFERENCES public.supporter_accounts(id),
  referred_name text NOT NULL,
  referred_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionario_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage funcionario_referrals" ON public.funcionario_referrals FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionario_referrals.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Funcionario can view own referrals" ON public.funcionario_referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_referrals.funcionario_id AND funcionarios.user_id = auth.uid()));

CREATE POLICY "Public can insert funcionario_referrals" ON public.funcionario_referrals FOR INSERT
  WITH CHECK (true);

-- Add funcionario role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'funcionario';

-- Trigger to update updated_at
CREATE TRIGGER update_funcionarios_updated_at
  BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
