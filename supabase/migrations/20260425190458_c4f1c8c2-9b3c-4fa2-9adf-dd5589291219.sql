-- Limpeza geral de dados operacionais (preserva clients e configurações)
BEGIN;

-- Filhos de comments / comentários
DELETE FROM public.reactions;
DELETE FROM public.comments;
DELETE FROM public.social_profiles;

-- Engajamento
DELETE FROM public.engagement_actions;
DELETE FROM public.engagement_score_history;
DELETE FROM public.ied_scores;

-- Alertas
DELETE FROM public.alertas;

-- Disparos WhatsApp
DELETE FROM public.dispatch_items;
DELETE FROM public.message_dispatches;
DELETE FROM public.contratado_missao_items;
DELETE FROM public.contratado_missao_dispatches;

-- Push
DELETE FROM public.push_subscriptions;
DELETE FROM public.push_dispatch_jobs;

-- Notificações de presença
DELETE FROM public.presence_absence_notifications;

-- Check-ins
DELETE FROM public.funcionario_checkins;
DELETE FROM public.contratado_checkins;
DELETE FROM public.supporter_checkins;

-- Ações externas (filhos antes do pai)
DELETE FROM public.acao_externa_funcionarios;
DELETE FROM public.acoes_externas;

-- Tarefas de campanha
DELETE FROM public.campanha_tarefa_items;
DELETE FROM public.campanha_tarefas;
DELETE FROM public.campanhas;

-- Missões portal
DELETE FROM public.portal_missions;

-- Referrals e códigos
DELETE FROM public.recurring_notification_tokens;
DELETE FROM public.referrals;
DELETE FROM public.referral_codes;
DELETE FROM public.funcionario_referrals;

-- Apoiadores
DELETE FROM public.supporter_profiles;
DELETE FROM public.supporter_accounts;
DELETE FROM public.supporters;

-- CRM Pessoas
DELETE FROM public.interacoes_pessoa;
DELETE FROM public.pessoas_tags;
DELETE FROM public.pessoa_social;
DELETE FROM public.pessoas;

-- Indicados / Contratados / Funcionários
DELETE FROM public.contratado_indicados;
DELETE FROM public.contratados;
DELETE FROM public.funcionarios;

-- Logs e convites
DELETE FROM public.action_logs;
DELETE FROM public.lider_invite_tokens;

-- Temas customizados (mantém defaults do sistema)
DELETE FROM public.custom_themes;

COMMIT;