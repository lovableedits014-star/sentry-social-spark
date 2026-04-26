-- Vincular a conta da Marluce ao supporter
UPDATE public.supporter_accounts
SET supporter_id = '658741da-fe42-479d-aa7f-58443053edbc'
WHERE id = 'be71513f-bb2e-46b5-9b5e-7abe1b916eae'
  AND supporter_id IS NULL;

-- Criar pessoa para Marluce
INSERT INTO public.pessoas (client_id, nome, email, cidade, bairro, tipo_pessoa, nivel_apoio, origem_contato, supporter_id)
SELECT 
  '6879803f-fd2e-4a43-8d0d-4417e1b1fe15',
  'Marluce Maria',
  'mariamarluce9880@gmail.com',
  'CAMPO GRANDE',
  'Cristo Redentor',
  'apoiador'::tipo_pessoa,
  'apoiador'::nivel_apoio,
  'formulario'::origem_contato,
  '658741da-fe42-479d-aa7f-58443053edbc'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pessoas 
  WHERE supporter_id = '658741da-fe42-479d-aa7f-58443053edbc' 
    AND client_id = '6879803f-fd2e-4a43-8d0d-4417e1b1fe15'
);