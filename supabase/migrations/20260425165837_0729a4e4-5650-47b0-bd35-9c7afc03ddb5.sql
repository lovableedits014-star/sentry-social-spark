
CREATE TABLE public.lider_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  used_by_contratado_id uuid REFERENCES public.contratados(id) ON DELETE SET NULL,
  note text
);

CREATE INDEX idx_lider_invite_tokens_client ON public.lider_invite_tokens(client_id);
CREATE INDEX idx_lider_invite_tokens_token ON public.lider_invite_tokens(token);

ALTER TABLE public.lider_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Admins do cliente podem ver e gerenciar
CREATE POLICY "Client owners manage own invite tokens"
ON public.lider_invite_tokens
FOR ALL
USING (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
)
WITH CHECK (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);

-- Qualquer um (incluindo anônimo) pode ler para validar o token na tela de cadastro
CREATE POLICY "Anyone can validate token"
ON public.lider_invite_tokens
FOR SELECT
USING (true);
