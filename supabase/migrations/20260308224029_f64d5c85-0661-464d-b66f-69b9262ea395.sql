
-- Platform config table for super admin settings (UAZAPI token, etc.)
CREATE TABLE public.platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access" ON public.platform_config FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- WhatsApp instances per client (one per client, managed via UAZAPI)
CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  instance_token text,
  status text NOT NULL DEFAULT 'disconnected',
  phone_number text,
  qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage own instance" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Super admin can manage all instances" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Unified WhatsApp dispatch queue
CREATE TABLE public.whatsapp_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo text NOT NULL DEFAULT 'manual',
  titulo text NOT NULL,
  mensagem_template text NOT NULL,
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  tag_filtro text,
  batch_size integer NOT NULL DEFAULT 10,
  delay_min_seconds integer NOT NULL DEFAULT 5,
  delay_max_seconds integer NOT NULL DEFAULT 15,
  batch_pause_seconds integer NOT NULL DEFAULT 60,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage dispatches" ON public.whatsapp_dispatches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_dispatches.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can view dispatches" ON public.whatsapp_dispatches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = whatsapp_dispatches.client_id AND tm.user_id = auth.uid()));

-- Individual dispatch items (one per recipient)
CREATE TABLE public.whatsapp_dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.whatsapp_dispatches(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  enviado_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage dispatch items" ON public.whatsapp_dispatch_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM whatsapp_dispatches d JOIN clients c ON c.id = d.client_id
    WHERE d.id = whatsapp_dispatch_items.dispatch_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM whatsapp_dispatches d JOIN clients c ON c.id = d.client_id
    WHERE d.id = whatsapp_dispatch_items.dispatch_id AND c.user_id = auth.uid()
  ));

-- Enable realtime for dispatch monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_dispatches;
