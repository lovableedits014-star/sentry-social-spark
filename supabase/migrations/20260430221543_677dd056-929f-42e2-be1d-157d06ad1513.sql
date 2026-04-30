-- ============== MATÉRIAS GERADAS ==============
CREATE TABLE IF NOT EXISTS public.materias_geradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  user_id UUID,
  tipo TEXT NOT NULL DEFAULT 'press_release',
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  corpo TEXT NOT NULL,
  tom TEXT,
  tema TEXT,
  fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'rascunho',
  prompt_input TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materias_geradas_client ON public.materias_geradas(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materias_geradas_status ON public.materias_geradas(client_id, status);

ALTER TABLE public.materias_geradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client materias"
  ON public.materias_geradas FOR SELECT
  USING ((client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) OR is_super_admin());

CREATE POLICY "Users can manage their client materias"
  ON public.materias_geradas FOR ALL
  USING ((client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) OR is_super_admin())
  WITH CHECK ((client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())) OR is_super_admin());

CREATE TRIGGER update_materias_geradas_updated_at
  BEFORE UPDATE ON public.materias_geradas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== CORINGA — CONVERSAS ==============
CREATE TABLE IF NOT EXISTS public.coringa_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  user_id UUID NOT NULL,
  titulo TEXT,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultima_mensagem_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coringa_conversations_user ON public.coringa_conversations(client_id, user_id, updated_at DESC);

ALTER TABLE public.coringa_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User views own coringa conversations"
  ON public.coringa_conversations FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "User creates own coringa conversations"
  ON public.coringa_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User updates own coringa conversations"
  ON public.coringa_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "User deletes own coringa conversations"
  ON public.coringa_conversations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_coringa_conversations_updated_at
  BEFORE UPDATE ON public.coringa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== CORINGA — MENSAGENS ==============
CREATE TABLE IF NOT EXISTS public.coringa_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.coringa_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coringa_messages_conv ON public.coringa_messages(conversation_id, created_at);

ALTER TABLE public.coringa_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User views messages of own conversations"
  ON public.coringa_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.coringa_conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR is_super_admin()))
  );

CREATE POLICY "User inserts messages in own conversations"
  ON public.coringa_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.coringa_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Service role manages messages"
  ON public.coringa_messages FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');