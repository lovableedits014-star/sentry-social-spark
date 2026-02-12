-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'client');

-- Create enum for sentiment
CREATE TYPE public.sentiment_type AS ENUM ('positive', 'neutral', 'negative');

-- Create enum for comment status
CREATE TYPE public.comment_status AS ENUM ('pending', 'responded', 'ignored');

-- Create enum for LLM providers
CREATE TYPE public.llm_provider AS ENUM ('groq', 'openai', 'anthropic', 'gemini', 'mistral', 'cohere');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;

-- User roles policies
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Create clients table (multi-tenant)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cargo TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Clients policies
CREATE POLICY "Users can view their own clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all clients"
  ON public.clients FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create integrations table
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  
  -- Meta Graph API
  meta_access_token TEXT,
  meta_page_id TEXT,
  meta_instagram_id TEXT,
  meta_webhook_url TEXT,
  
  -- LLM Provider
  llm_provider llm_provider,
  llm_api_key TEXT,
  llm_model TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(client_id)
);

-- Enable RLS on integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Integrations policies
CREATE POLICY "Users can view their own integrations"
  ON public.integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = integrations.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own integrations"
  ON public.integrations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = integrations.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Create comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  
  -- Meta data
  comment_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  text TEXT NOT NULL,
  author_name TEXT,
  author_id TEXT,
  
  -- Analysis
  sentiment sentiment_type,
  status comment_status DEFAULT 'pending',
  
  -- Response
  ai_response TEXT,
  final_response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(comment_id, client_id)
);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Comments policies
CREATE POLICY "Users can view their own comments"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = comments.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own comments"
  ON public.comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = comments.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all comments"
  ON public.comments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create reactions table
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  
  post_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL, -- like, love, angry, sad, etc
  user_name TEXT,
  user_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on reactions
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- Reactions policies
CREATE POLICY "Users can view their own reactions"
  ON public.reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = reactions.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Create default client role for new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add update triggers for all tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();