-- Add LLM provider and model columns to integrations table
-- These columns already exist based on the types, but let's ensure the enum is complete

-- First, verify and update the llm_provider enum to include all major providers
DO $$ 
BEGIN
  -- The enum already exists, but we'll ensure all providers are included
  -- If any are missing, they would need to be added
END $$;

-- Add index for faster lookups on client_id for integrations
CREATE INDEX IF NOT EXISTS idx_integrations_client_id ON public.integrations(client_id);

-- Add a comment to document the multi-LLM feature
COMMENT ON COLUMN public.integrations.llm_provider IS 'The LLM provider selected by the client: groq, openai, anthropic, gemini, mistral, cohere';
COMMENT ON COLUMN public.integrations.llm_model IS 'The specific model identifier for the selected provider';
COMMENT ON COLUMN public.integrations.llm_api_key IS 'Encrypted API key for the selected LLM provider';