
-- Table for supporter accounts (portal login)
CREATE TABLE public.supporter_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  facebook_username text,
  instagram_username text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

ALTER TABLE public.supporter_accounts ENABLE ROW LEVEL SECURITY;

-- Supporter can view/update their own account
CREATE POLICY "Supporter can view own account"
  ON public.supporter_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Supporter can update own account"
  ON public.supporter_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Supporter can insert own account"
  ON public.supporter_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin (client owner) can view all accounts for their client
CREATE POLICY "Client owner can view supporter accounts"
  ON public.supporter_accounts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = supporter_accounts.client_id
    AND clients.user_id = auth.uid()
  ));

-- Table for daily check-ins
CREATE TABLE public.supporter_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supporter_account_id uuid NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(supporter_account_id, checkin_date)
);

ALTER TABLE public.supporter_checkins ENABLE ROW LEVEL SECURITY;

-- Supporter can insert and view their own check-ins
CREATE POLICY "Supporter can insert own checkin"
  ON public.supporter_checkins FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = supporter_checkins.supporter_account_id
    AND supporter_accounts.user_id = auth.uid()
  ));

CREATE POLICY "Supporter can view own checkins"
  ON public.supporter_checkins FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.supporter_accounts
    WHERE supporter_accounts.id = supporter_checkins.supporter_account_id
    AND supporter_accounts.user_id = auth.uid()
  ));

-- Client owner can view all check-ins for their client
CREATE POLICY "Client owner can view checkins"
  ON public.supporter_checkins FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = supporter_checkins.client_id
    AND clients.user_id = auth.uid()
  ));

-- Trigger to update supporter_accounts.updated_at
CREATE OR REPLACE FUNCTION public.update_supporter_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_supporter_accounts_updated_at
  BEFORE UPDATE ON public.supporter_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supporter_accounts_updated_at();
