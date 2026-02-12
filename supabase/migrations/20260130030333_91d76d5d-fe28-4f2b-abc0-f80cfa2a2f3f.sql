-- Tabela para registrar ações de engajamento (curtidas, compartilhamentos, comentários)
CREATE TABLE public.engagement_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  supporter_id UUID REFERENCES public.supporters(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'facebook',
  action_type TEXT NOT NULL CHECK (action_type IN ('like', 'comment', 'share', 'reaction')),
  post_id TEXT,
  comment_id TEXT,
  reaction_type TEXT,
  action_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Dados do usuário da plataforma (para casos onde o apoiador ainda não foi vinculado)
  platform_user_id TEXT,
  platform_username TEXT
);

-- Índices para performance
CREATE INDEX idx_engagement_client_id ON public.engagement_actions(client_id);
CREATE INDEX idx_engagement_supporter_id ON public.engagement_actions(supporter_id);
CREATE INDEX idx_engagement_action_date ON public.engagement_actions(action_date);
CREATE INDEX idx_engagement_platform_user ON public.engagement_actions(platform_user_id);

-- Enable RLS
ALTER TABLE public.engagement_actions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own engagement actions"
ON public.engagement_actions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_actions.client_id
  AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own engagement actions"
ON public.engagement_actions
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_actions.client_id
  AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can update their own engagement actions"
ON public.engagement_actions
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_actions.client_id
  AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own engagement actions"
ON public.engagement_actions
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_actions.client_id
  AND clients.user_id = auth.uid()
));

-- Tabela de configuração de score de engajamento por cliente
CREATE TABLE public.engagement_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  like_points INTEGER NOT NULL DEFAULT 1,
  comment_points INTEGER NOT NULL DEFAULT 3,
  share_points INTEGER NOT NULL DEFAULT 5,
  reaction_points INTEGER NOT NULL DEFAULT 1,
  inactivity_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.engagement_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para engagement_config
CREATE POLICY "Users can view their own engagement config"
ON public.engagement_config
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_config.client_id
  AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can insert their own engagement config"
ON public.engagement_config
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_config.client_id
  AND clients.user_id = auth.uid()
));

CREATE POLICY "Users can update their own engagement config"
ON public.engagement_config
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = engagement_config.client_id
  AND clients.user_id = auth.uid()
));

-- Função para calcular score de engajamento de um apoiador
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(
  p_supporter_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_score INTEGER := 0;
  v_config RECORD;
BEGIN
  -- Obter client_id do apoiador
  SELECT client_id INTO v_client_id FROM supporters WHERE id = p_supporter_id;
  
  IF v_client_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Obter configuração de pontos (ou usar defaults)
  SELECT 
    COALESCE(like_points, 1) as like_points,
    COALESCE(comment_points, 3) as comment_points,
    COALESCE(share_points, 5) as share_points,
    COALESCE(reaction_points, 1) as reaction_points
  INTO v_config
  FROM engagement_config
  WHERE client_id = v_client_id;
  
  -- Se não há config, usar defaults
  IF v_config IS NULL THEN
    v_config := ROW(1, 3, 5, 1);
  END IF;
  
  -- Calcular score baseado nas ações no período
  SELECT COALESCE(SUM(
    CASE action_type
      WHEN 'like' THEN v_config.like_points
      WHEN 'comment' THEN v_config.comment_points
      WHEN 'share' THEN v_config.share_points
      WHEN 'reaction' THEN v_config.reaction_points
      ELSE 0
    END
  ), 0)
  INTO v_score
  FROM engagement_actions
  WHERE supporter_id = p_supporter_id
  AND action_date >= NOW() - (p_days || ' days')::INTERVAL;
  
  -- Atualizar score no registro do apoiador
  UPDATE supporters 
  SET engagement_score = v_score,
      updated_at = NOW()
  WHERE id = p_supporter_id;
  
  RETURN v_score;
END;
$$;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_engagement_config_updated_at
  BEFORE UPDATE ON public.engagement_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();