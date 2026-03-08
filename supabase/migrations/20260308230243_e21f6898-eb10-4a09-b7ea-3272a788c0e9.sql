
-- Birthday config per client
CREATE TABLE public.whatsapp_birthday_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mensagem_template text NOT NULL DEFAULT 'Feliz aniversário, {nome}! 🎂🎉 Desejamos muita saúde, paz e realizações!',
  image_url text,
  hora_envio time NOT NULL DEFAULT '08:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.whatsapp_birthday_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage birthday config"
  ON public.whatsapp_birthday_config FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_config.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_config.client_id AND clients.user_id = auth.uid()));

-- Birthday send log
CREATE TABLE public.whatsapp_birthday_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  pessoa_nome text NOT NULL,
  telefone text NOT NULL,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_birthday_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can view birthday log"
  ON public.whatsapp_birthday_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_log.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Service can insert birthday log"
  ON public.whatsapp_birthday_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_log.client_id AND clients.user_id = auth.uid()));

-- Storage bucket for birthday images
INSERT INTO storage.buckets (id, name, public) VALUES ('birthday-images', 'birthday-images', true);

CREATE POLICY "Client owners can upload birthday images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'birthday-images');

CREATE POLICY "Anyone can view birthday images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'birthday-images');

CREATE POLICY "Client owners can delete birthday images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'birthday-images');
