// Supabase client — apontando para Lovable Cloud (backend gerenciado).
// Mantemos o nome do arquivo para evitar refatorar todos os imports.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://qherclscaqbxytlgbunl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZXJjbHNjYXFieHl0bGdidW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NTYsImV4cCI6MjA4NjU0Nzg1Nn0.3X2TICQF5fIhuwcH2Pf46-MjeODR1A1kwXF-PUBv4k8';
export const SUPABASE_PROJECT_ID = 'qherclscaqbxytlgbunl';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});