
UPDATE public.whatsapp_dispatches
SET status = 'pausado_timeout',
    paused_until = now(),
    error_message = NULL,
    completed_at = NULL,
    updated_at = now()
WHERE id IN (
  SELECT DISTINCT d.id
  FROM public.whatsapp_dispatches d
  JOIN public.whatsapp_dispatch_items i ON i.dispatch_id = d.id
  WHERE d.status IN ('concluido','falhou')
    AND d.error_message LIKE 'Tempo limite%'
    AND i.status = 'pendente'
);
