
-- Checklist items inside campaign tasks
CREATE TABLE public.campanha_tarefa_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES public.campanha_tarefas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.campanha_tarefa_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select tarefa_items" ON public.campanha_tarefa_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can insert tarefa_items" ON public.campanha_tarefa_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can update tarefa_items" ON public.campanha_tarefa_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can delete tarefa_items" ON public.campanha_tarefa_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Team members can select tarefa_items" ON public.campanha_tarefa_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanha_tarefa_items.client_id AND tm.user_id = auth.uid()));
