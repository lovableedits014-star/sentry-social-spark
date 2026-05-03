CREATE OR REPLACE FUNCTION public._tmp_export_auth_users()
RETURNS TABLE(id uuid, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz, email_confirmed_at timestamptz, phone text, phone_confirmed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id, email::text, raw_user_meta_data, raw_app_meta_data, created_at, email_confirmed_at, phone::text, phone_confirmed_at
  FROM auth.users ORDER BY created_at;
$$;
GRANT EXECUTE ON FUNCTION public._tmp_export_auth_users() TO authenticated, anon, service_role;