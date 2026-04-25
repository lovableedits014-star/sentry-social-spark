ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS presence_absence_message_template text NOT NULL DEFAULT
'Olá, {nome}! 👋

Notamos que você não acessou o portal da campanha *{campanha}* há {dias} dias.

O seu acesso diário é muito importante: é nele que você confirma sua presença e recebe as missões para interagir nas redes sociais. 🙌

Lembre-se: o registro precisa ser feito *todos os dias*. Conto com você!';