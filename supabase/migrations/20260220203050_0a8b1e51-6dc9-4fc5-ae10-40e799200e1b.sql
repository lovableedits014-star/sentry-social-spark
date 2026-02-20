-- Enable realtime for supporters and supporter_profiles tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.supporters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supporter_profiles;