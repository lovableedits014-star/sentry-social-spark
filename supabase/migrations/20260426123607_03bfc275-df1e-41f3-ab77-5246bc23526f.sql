-- Backfill: criar pessoas para apoiadores recentes que não têm registro em pessoas
INSERT INTO public.pessoas (client_id, nome, email, cidade, bairro, tipo_pessoa, nivel_apoio, origem_contato, supporter_id)
SELECT 
  sa.client_id,
  sa.name,
  sa.email,
  sa.city,
  sa.neighborhood,
  'apoiador'::tipo_pessoa,
  'apoiador'::nivel_apoio,
  'formulario'::origem_contato,
  sa.supporter_id
FROM public.supporter_accounts sa
WHERE sa.client_id = '6879803f-fd2e-4a43-8d0d-4417e1b1fe15'
  AND sa.created_at >= '2026-04-26'
  AND sa.supporter_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pessoas p 
    WHERE p.supporter_id = sa.supporter_id AND p.client_id = sa.client_id
  );

-- Vincular perfis sociais
INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT p.id, 'facebook', sa.facebook_username, 'https://facebook.com/' || sa.facebook_username
FROM public.supporter_accounts sa
JOIN public.pessoas p ON p.supporter_id = sa.supporter_id AND p.client_id = sa.client_id
WHERE sa.client_id = '6879803f-fd2e-4a43-8d0d-4417e1b1fe15'
  AND sa.created_at >= '2026-04-26'
  AND sa.facebook_username IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = 'facebook'
  );

INSERT INTO public.pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
SELECT p.id, 'instagram', sa.instagram_username, 'https://instagram.com/' || sa.instagram_username
FROM public.supporter_accounts sa
JOIN public.pessoas p ON p.supporter_id = sa.supporter_id AND p.client_id = sa.client_id
WHERE sa.client_id = '6879803f-fd2e-4a43-8d0d-4417e1b1fe15'
  AND sa.created_at >= '2026-04-26'
  AND sa.instagram_username IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pessoa_social ps WHERE ps.pessoa_id = p.id AND ps.plataforma = 'instagram'
  );