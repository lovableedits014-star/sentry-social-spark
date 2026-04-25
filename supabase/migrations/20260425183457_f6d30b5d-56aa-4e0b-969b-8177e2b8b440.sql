
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;

ALTER TABLE public.contratados
  ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;

ALTER TABLE public.supporter_accounts
  ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS presence_absence_days_threshold integer NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS public.presence_absence_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  person_type text NOT NULL CHECK (person_type IN ('funcionario','lider','liderado','apoiador')),
  person_id uuid NOT NULL,
  person_name text NOT NULL,
  telefone text,
  days_absent integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  whatsapp_status text NOT NULL DEFAULT 'pending',
  whatsapp_error text,
  UNIQUE (client_id, person_type, person_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_notif_client ON public.presence_absence_notifications(client_id);

ALTER TABLE public.presence_absence_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can view presence notifications"
  ON public.presence_absence_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Client owner can delete presence notifications"
  ON public.presence_absence_notifications FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE POLICY "Team members can view presence notifications"
  ON public.presence_absence_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = presence_absence_notifications.client_id AND tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.get_presence_overview(p_client_id uuid)
RETURNS TABLE (
  person_type text,
  person_id uuid,
  nome text,
  telefone text,
  email text,
  presenca_obrigatoria boolean,
  last_checkin_date date,
  days_since_checkin integer,
  notified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      'funcionario'::text AS person_type,
      f.id AS person_id,
      f.nome,
      f.telefone,
      f.email,
      f.presenca_obrigatoria,
      (SELECT MAX(c.checkin_date) FROM funcionario_checkins c WHERE c.funcionario_id = f.id) AS last_checkin_date
    FROM funcionarios f
    WHERE f.client_id = p_client_id AND f.status = 'ativo'

    UNION ALL

    SELECT
      CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END AS person_type,
      c.id AS person_id,
      c.nome,
      c.telefone,
      c.email,
      c.presenca_obrigatoria,
      (SELECT MAX(ck.checkin_date) FROM contratado_checkins ck WHERE ck.contratado_id = c.id) AS last_checkin_date
    FROM contratados c
    WHERE c.client_id = p_client_id AND c.status = 'ativo'

    UNION ALL

    SELECT
      'apoiador'::text AS person_type,
      sa.id AS person_id,
      sa.name AS nome,
      -- supporter_accounts não tem telefone; tenta achar via pessoa vinculada pelo email
      (SELECT p.telefone FROM pessoas p WHERE p.client_id = p_client_id AND p.email = sa.email LIMIT 1) AS telefone,
      sa.email,
      sa.presenca_obrigatoria,
      (SELECT MAX(sc.checkin_date) FROM supporter_checkins sc WHERE sc.supporter_account_id = sa.id) AS last_checkin_date
    FROM supporter_accounts sa
    WHERE sa.client_id = p_client_id
  )
  SELECT
    b.person_type,
    b.person_id,
    b.nome,
    b.telefone,
    b.email,
    b.presenca_obrigatoria,
    b.last_checkin_date,
    CASE
      WHEN b.last_checkin_date IS NULL THEN 9999
      ELSE (CURRENT_DATE - b.last_checkin_date)::integer
    END AS days_since_checkin,
    n.sent_at AS notified_at
  FROM base b
  LEFT JOIN presence_absence_notifications n
    ON n.client_id = p_client_id
   AND n.person_type = b.person_type
   AND n.person_id = b.person_id;
$$;
