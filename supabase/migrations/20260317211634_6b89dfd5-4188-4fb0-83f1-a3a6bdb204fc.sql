CREATE TABLE public.custom_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage custom_themes"
ON public.custom_themes
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = custom_themes.client_id AND clients.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = custom_themes.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can view custom_themes"
ON public.custom_themes
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = custom_themes.client_id AND tm.user_id = auth.uid()));