
-- =============================================
-- FASE 1: Rede de Multiplicadores
-- =============================================

-- Tabela referral_codes: código único por apoiador
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (code)
);

-- Índice para busca rápida por código
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referral_codes_client ON public.referral_codes(client_id);

-- Tabela referrals: registro de cada indicação
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  referrer_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  referred_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_account_id);
CREATE INDEX idx_referrals_client ON public.referrals(client_id);

-- Coluna nova em supporter_accounts
ALTER TABLE public.supporter_accounts ADD COLUMN referred_by UUID REFERENCES public.supporter_accounts(id);

-- Coluna nova em supporters
ALTER TABLE public.supporters ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0;

-- =============================================
-- FASE 2: Mapa de Calor Territorial
-- =============================================

-- Colunas de localização em supporter_accounts
ALTER TABLE public.supporter_accounts ADD COLUMN city TEXT;
ALTER TABLE public.supporter_accounts ADD COLUMN neighborhood TEXT;
ALTER TABLE public.supporter_accounts ADD COLUMN state TEXT;

-- Tabela territorial_zones
CREATE TABLE public.territorial_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'bairro',
  supporter_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_territorial_zones_client ON public.territorial_zones(client_id);

-- =============================================
-- RLS POLICIES
-- =============================================

-- referral_codes RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can view referral codes"
ON public.referral_codes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = referral_codes.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Supporter can view own referral code"
ON public.referral_codes FOR SELECT
USING (EXISTS (
  SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referral_codes.supporter_account_id AND supporter_accounts.user_id = auth.uid()
));

CREATE POLICY "Supporter can insert own referral code"
ON public.referral_codes FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referral_codes.supporter_account_id AND supporter_accounts.user_id = auth.uid()
));

-- Anon pode ler referral codes (para validar no registro público)
CREATE POLICY "Anyone can read referral codes for validation"
ON public.referral_codes FOR SELECT
USING (true);

-- referrals RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can view referrals"
ON public.referrals FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = referrals.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Supporter can view own referrals"
ON public.referrals FOR SELECT
USING (EXISTS (
  SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referrals.referrer_account_id AND supporter_accounts.user_id = auth.uid()
));

CREATE POLICY "Supporter can insert referrals"
ON public.referrals FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referrals.referrer_account_id AND supporter_accounts.user_id = auth.uid()
));

-- territorial_zones RLS
ALTER TABLE public.territorial_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage territorial zones"
ON public.territorial_zones FOR ALL
USING (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = territorial_zones.client_id AND clients.user_id = auth.uid()
));

CREATE POLICY "Client owner can insert territorial zones"
ON public.territorial_zones FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients WHERE clients.id = territorial_zones.client_id AND clients.user_id = auth.uid()
));
