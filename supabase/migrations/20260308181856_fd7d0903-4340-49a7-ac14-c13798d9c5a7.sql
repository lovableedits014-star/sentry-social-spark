
-- Add user_id and quota to contratados
ALTER TABLE contratados ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE contratados ADD COLUMN quota_indicados integer NOT NULL DEFAULT 10;

-- Contratado check-ins
CREATE TABLE contratado_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratado_id uuid NOT NULL REFERENCES contratados(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contratado_id, checkin_date)
);
ALTER TABLE contratado_checkins ENABLE ROW LEVEL SECURITY;

-- Contratado indicados (voter referrals)
CREATE TABLE contratado_indicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratado_id uuid NOT NULL REFERENCES contratados(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text NOT NULL,
  endereco text,
  cidade text,
  bairro text,
  status text NOT NULL DEFAULT 'pendente',
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contratado_indicados ENABLE ROW LEVEL SECURITY;

-- RLS: Contratado checkins
CREATE POLICY "Contratado can checkin" ON contratado_checkins FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_checkins.contratado_id AND user_id = auth.uid()));

CREATE POLICY "Contratado can view own checkins" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_checkins.contratado_id AND user_id = auth.uid()));

CREATE POLICY "Client owner can select checkins" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE id = contratado_checkins.client_id AND user_id = auth.uid()));

CREATE POLICY "Team members can select checkins" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratado_checkins.client_id AND tm.user_id = auth.uid()));

-- RLS: Contratado indicados
CREATE POLICY "Contratado can insert indicados" ON contratado_indicados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_indicados.contratado_id AND user_id = auth.uid()));

CREATE POLICY "Contratado can view own indicados" ON contratado_indicados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_indicados.contratado_id AND user_id = auth.uid()));

CREATE POLICY "Client owner can manage indicados" ON contratado_indicados FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE id = contratado_indicados.client_id AND user_id = auth.uid()));

CREATE POLICY "Team members can select indicados" ON contratado_indicados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratado_indicados.client_id AND tm.user_id = auth.uid()));
