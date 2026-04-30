CREATE TABLE public.quick_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  phone TEXT NOT NULL,
  context_message TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_quick_contacts_client ON public.quick_contacts(client_id, display_order);

ALTER TABLE public.quick_contacts ENABLE ROW LEVEL SECURITY;

-- SELECT: dono do cliente OU membro da equipe vinculado ao cliente
CREATE POLICY "quick_contacts_select"
ON public.quick_contacts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quick_contacts.client_id
      AND (c.user_id = auth.uid() OR public.is_super_admin())
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = quick_contacts.client_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "quick_contacts_insert"
ON public.quick_contacts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quick_contacts.client_id
      AND (c.user_id = auth.uid() OR public.is_super_admin())
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = quick_contacts.client_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "quick_contacts_update"
ON public.quick_contacts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quick_contacts.client_id
      AND (c.user_id = auth.uid() OR public.is_super_admin())
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = quick_contacts.client_id
      AND tm.user_id = auth.uid()
  )
);

CREATE POLICY "quick_contacts_delete"
ON public.quick_contacts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = quick_contacts.client_id
      AND (c.user_id = auth.uid() OR public.is_super_admin())
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.client_id = quick_contacts.client_id
      AND tm.user_id = auth.uid()
  )
);

CREATE TRIGGER update_quick_contacts_updated_at
BEFORE UPDATE ON public.quick_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();