-- ============================================================
-- HONRA — Migração 021: MENSAGENS SAEM DO SINO
-- ------------------------------------------------------------
-- Decisão (Vítor, 12/07): o Sino é para assuntos "relevantes" (orçamentos,
-- caução, entregas…). As MENSAGENS de chat vivem só no ícone do Chat (badge de
-- não-lidas, migração 020). Portanto removemos o aviso-de-mensagem do Sino.
--
-- Reverte a 014. (Se um dia quisermos push de mensagens, será por um caminho
-- próprio que NÃO cria aviso no Sino.)
--
-- Correr no SQL Editor DEPOIS da 020.
-- ============================================================

-- 1) Deixar de criar avisos de mensagem.
drop trigger if exists after_mensagem_notifica on public.mensagens;
drop function if exists public.notificar_mensagem();

-- 2) Limpar os avisos de mensagem que já lá estão (o Sino passa a não os mostrar).
delete from public.notificacoes where tipo = 'mensagem';
