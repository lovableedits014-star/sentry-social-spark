-- Corrige o handle do Facebook do supporter Mayer Rodrigues Baclan
-- que ficou como "share" porque foi extraído errado de uma URL.
UPDATE public.supporter_profiles
SET platform_user_id = 'mayer.baclan',
    platform_username = 'mayer.baclan'
WHERE supporter_id = '5096b291-4425-45f7-832e-f6985e957828'
  AND platform = 'facebook'
  AND platform_user_id = 'share';

UPDATE public.pessoa_social
SET usuario = 'mayer.baclan'
WHERE pessoa_id = '16b08f9f-419d-4fd6-b35c-75e31e258770'
  AND plataforma = 'facebook'
  AND usuario = 'share';

-- Re-vincula interações órfãs do cliente para o ranking pegar o Facebook
SELECT public.link_orphan_engagement_actions(
  (SELECT client_id FROM public.pessoas WHERE id = '16b08f9f-419d-4fd6-b35c-75e31e258770')
);