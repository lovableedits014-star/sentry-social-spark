
-- Table for dispatch batches (one per "send to supporters" click)
CREATE TABLE public.message_dispatches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  post_permalink_url TEXT,
  post_platform TEXT NOT NULL DEFAULT 'facebook',
  message_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'error')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 20,
  batch_delay_seconds INTEGER NOT NULL DEFAULT 180,
  message_delay_min_seconds INTEGER NOT NULL DEFAULT 15,
  message_delay_max_seconds INTEGER NOT NULL DEFAULT 45,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for individual message items in a dispatch
CREATE TABLE public.dispatch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id UUID NOT NULL REFERENCES public.message_dispatches(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  supporter_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for message_dispatches
CREATE POLICY "Users can view their own dispatches"
  ON public.message_dispatches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their own dispatches"
  ON public.message_dispatches FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their own dispatches"
  ON public.message_dispatches FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()
  ));

-- RLS Policies for dispatch_items
CREATE POLICY "Users can view their own dispatch items"
  ON public.dispatch_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM message_dispatches md
    JOIN clients c ON c.id = md.client_id
    WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert their own dispatch items"
  ON public.dispatch_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM message_dispatches md
    JOIN clients c ON c.id = md.client_id
    WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users can update their own dispatch items"
  ON public.dispatch_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM message_dispatches md
    JOIN clients c ON c.id = md.client_id
    WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_dispatch_items_dispatch_id ON public.dispatch_items(dispatch_id);
CREATE INDEX idx_dispatch_items_status ON public.dispatch_items(status);
CREATE INDEX idx_message_dispatches_client_id ON public.message_dispatches(client_id);
CREATE INDEX idx_message_dispatches_status ON public.message_dispatches(status);

-- Trigger for updated_at
CREATE TRIGGER update_message_dispatches_updated_at
  BEFORE UPDATE ON public.message_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
