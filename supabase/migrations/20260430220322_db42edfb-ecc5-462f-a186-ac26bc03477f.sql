-- =========================================================
-- FASE 1: candidate_knowledge — memória viva do candidato
-- =========================================================
CREATE TABLE IF NOT EXISTS public.candidate_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('transcription','post','comment','manual')),
  source_id text,                          -- id da transcrição, post, comentário (text p/ aceitar string ids da Meta)
  source_url text,                         -- link p/ post/comentário quando aplicável
  source_date timestamptz,                 -- data do conteúdo original
  tipo text NOT NULL CHECK (tipo IN ('promessa','proposta','bandeira','bairro','pessoa','adversario','historia','bordao','numero','evento','dado','outro')),
  tema text,                               -- normalizado: saude, seguranca, mobilidade, educacao, etc.
  texto text NOT NULL,                     -- a frase/fato extraído
  contexto text,                           -- trecho original em volta
  entidades jsonb DEFAULT '{}'::jsonb,     -- { bairros: [], pessoas: [], valores: [], datas: [] }
  confidence numeric DEFAULT 0.7,
  aprovado boolean NOT NULL DEFAULT true,  -- humano pode rejeitar
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ck_client ON public.candidate_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_ck_tipo ON public.candidate_knowledge(client_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ck_tema ON public.candidate_knowledge(client_id, tema);
CREATE INDEX IF NOT EXISTS idx_ck_source ON public.candidate_knowledge(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ck_entidades ON public.candidate_knowledge USING gin(entidades);
CREATE INDEX IF NOT EXISTS idx_ck_created ON public.candidate_knowledge(client_id, created_at DESC);

-- evita re-inserir o mesmo fato em re-extrações
CREATE UNIQUE INDEX IF NOT EXISTS uq_ck_dedup
  ON public.candidate_knowledge(client_id, source_type, COALESCE(source_id,''), tipo, lower(texto));

ALTER TABLE public.candidate_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client knowledge"
  ON public.candidate_knowledge FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin());

CREATE POLICY "Users can manage their client knowledge"
  ON public.candidate_knowledge FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin());

CREATE TRIGGER trg_ck_updated_at
  BEFORE UPDATE ON public.candidate_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- FASE 2: disparo_sugestoes — oportunidades sugeridas pelo motor
-- =========================================================
CREATE TABLE IF NOT EXISTS public.disparo_sugestoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('territorial','pessoal','tematico','ativacao','aniversario_visita')),
  titulo text NOT NULL,                    -- "Disparo para Aero Rancho — propostas de creches"
  bairro text,                             -- quando territorial
  cidade text,
  tema text,
  pessoa_alvo_nome text,                   -- quando tipo=pessoal
  mensagem_sugerida text NOT NULL,         -- texto pronto, com [primeiro_nome], [bairro] etc.
  total_estimado integer DEFAULT 0,        -- contagem prévia de destinatários
  destinatarios_filtro jsonb DEFAULT '{}'::jsonb,  -- { bairro?, cidade?, tag?, nivel_apoio? }
  fonte_knowledge_id uuid REFERENCES public.candidate_knowledge(id) ON DELETE SET NULL,
  fonte_url text,                          -- link p/ a transcrição/post original
  score integer DEFAULT 50,                -- 0-100 oportunidade
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','descartado','enviado','expirado')),
  whatsapp_dispatch_id uuid,               -- preenchido quando o usuário aprova e gera o disparo real
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ds_client_status ON public.disparo_sugestoes(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ds_created ON public.disparo_sugestoes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ds_score ON public.disparo_sugestoes(client_id, score DESC);

ALTER TABLE public.disparo_sugestoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their dispatch suggestions"
  ON public.disparo_sugestoes FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin());

CREATE POLICY "Users can manage their dispatch suggestions"
  ON public.disparo_sugestoes FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
         OR public.is_super_admin());

CREATE TRIGGER trg_ds_updated_at
  BEFORE UPDATE ON public.disparo_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper de contagem rápida (evita join custoso no frontend)
CREATE OR REPLACE FUNCTION public.count_pessoas_by_bairro(p_client_id uuid, p_bairro text, p_only_whatsapp boolean DEFAULT true)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.pessoas p
  WHERE p.client_id = p_client_id
    AND p.telefone IS NOT NULL
    AND length(public.only_digits(p.telefone)) >= 10
    AND (NOT p_only_whatsapp OR p.whatsapp_confirmado = true)
    AND (
      lower(public.unaccent(COALESCE(p.bairro,''))) = lower(public.unaccent(p_bairro))
      OR lower(public.unaccent(COALESCE(p.bairro,''))) ILIKE '%' || lower(public.unaccent(p_bairro)) || '%'
    );
$$;