
CREATE TABLE public.contract_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'liderado',
  titulo text NOT NULL,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage contract_templates"
ON public.contract_templates FOR ALL
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contract_templates.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can view contract_templates"
ON public.contract_templates FOR SELECT
USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contract_templates.client_id AND tm.user_id = auth.uid()));
