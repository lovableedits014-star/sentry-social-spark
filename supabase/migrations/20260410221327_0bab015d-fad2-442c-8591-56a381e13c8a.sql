
-- Fix funcionario record with missing user_id
UPDATE public.funcionarios 
SET user_id = 'ad8f6c94-8109-4ab0-87d3-60847aad41c3'
WHERE id = '38e5ecad-ca28-46e6-9315-8462fa7b72b8' 
AND user_id IS NULL;
