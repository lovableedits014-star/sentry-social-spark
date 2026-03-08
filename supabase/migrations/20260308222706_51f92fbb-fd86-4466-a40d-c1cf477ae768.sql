
-- Allow funcionários to read tags for their client
CREATE POLICY "Funcionario can read tags" ON public.tags FOR SELECT
USING (EXISTS (
  SELECT 1 FROM funcionarios f
  WHERE f.client_id = tags.client_id AND f.user_id = auth.uid()
));

-- Security definer function to tag a pessoa from an ação externa
CREATE OR REPLACE FUNCTION public.tag_pessoa_acao_externa(
  p_client_id uuid,
  p_pessoa_id uuid,
  p_tag_nome text,
  p_tag_descricao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tag_id uuid;
BEGIN
  -- Find or create the tag
  SELECT id INTO v_tag_id FROM tags WHERE client_id = p_client_id AND nome = p_tag_nome;
  IF v_tag_id IS NULL THEN
    INSERT INTO tags (client_id, nome, descricao) VALUES (p_client_id, p_tag_nome, p_tag_descricao)
    RETURNING id INTO v_tag_id;
  END IF;

  -- Link tag to pessoa (ignore if already linked)
  INSERT INTO pessoas_tags (pessoa_id, tag_id) VALUES (p_pessoa_id, v_tag_id)
  ON CONFLICT DO NOTHING;
END;
$$;
