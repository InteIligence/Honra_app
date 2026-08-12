# VISTORIA 360° — RESOLUÇÃO (27/07/2026)

> Resposta ponto-a-ponto à [VISTORIA-360-27-07](VISTORIA-360-27-07.md). Tudo repo-first (as migrações aplicam-se no SQL Editor com as credenciais do Vítor). `tsc` a 0, export web novo, paridade i18n 1083/1083, app verificada no browser (login/registo/átrio/404 + navegação).
>
> Estado: ✅ **FEITO** (código no repo) · ⏳ **APLICAR** (feito no repo, falta correr na BD/deploy) · 🧑‍⚖️ **VÍTOR** (decisão de produto/jurídica) · ⏸️ **DEFERIDO** (com razão).

## 🔴 Críticos
| # | Achado | Estado | O que se fez |
|---|---|---|---|
| 1 | Profissional fica com a honra e tranca a crítica | ↩️ RECONCILIADO | A minha correção (avaliar em `honrado`, sem tail) **chocou** com a `065_pagamento_na_entrega` que outra sessão construiu em paralelo — o tail `honrado→entregue→concluido` passou a ser o **fluxo de entrega com pagamento** (o profissional só recebe ao entregar → deixa de compensar prender a crítica; há resolver de silêncio). **Por decisão do Vítor (27/07), fica o pagamento-na-entrega.** Desfiz a minha #1: app volta a avaliar em `concluido` (a par da política da 065); bloco removido da 063 §2. Os #3/#4/#12/#13 da 063 mantêm-se (independentes, vivos). |
| 2 | Fosso repo↔BD viva sem guardrail | ✅ + ⏳ | **`docs/verificar-estado-vivo.sql`**: dump de RLS/triggers/buckets + 5 afirmações-chave (verif escopada, avaliação unidirecional, avaliação em honrado, checkpoint garantido, uma-vaga-um-aperto) que TÊM de dar `true`. Correr após cada deploy. |
| 3 | Contestação sem resolução automática → congela | ✅ + ⏳ | **063**: novo estado neutro `arquivado`. O resolver arquiva a contestação sem decisão do admin ao fim de `dias_contestacao` (7), **sem marca**, e cutuca o admin a meio do prazo. A agregação passa a fechar o negócio. |
| 4 | Agregação fecha à 1ª falha (culpa por calendário) | ✅ + ⏳ | **063**: `avaliar_checkpoints_orcamento` só declara desfecho quando NENHUM checkpoint está por resolver; soma todas as culpas de uma vez → `'ambos'` determinístico, contestação nunca atropelada. |
| 5 | `chat.tsx` engole erro e mente "sem conversas" | ✅ | Passa a ler `error` e mostrar `<Erro>` em vez do estado vazio. |
| 6 | Fuga A: apagar+recriar após suspensão | 🧑‍⚖️ | Depende do parecer jurídico (retenção de hash de documento por interesse legítimo, Q10-A do briefing). Continua no pacote do advogado. |

## 🟠 Importantes
| # | Achado | Estado | O que se fez |
|---|---|---|---|
| 7 | Buckets sem limite de tamanho/MIME (XSS armazenado) | ✅ + ⏳ | **Migração 064**: `file_size_limit` + `allowed_mime_types` por bucket (avatares/portfolio/evolucoes/cedulas/anexos). SVG/HTML deixam de ser aceites nos públicos. (Onde o ALTER for bloqueado, aplicar à mão no Dashboard.) |
| 8 | `convite-formulario` público sobrescreve cliente cross-tenant | ✅ + ⏳ | A função deixa de fazer upsert por telefone: reutiliza a linha existente **sem** reescrever nome/email; só cria quando é nova (com guarda de corrida). |
| 9 | PII de convidados sem apagamento/TTL (RGPD) | ✅ + ⏳ | **064**: `purgar_convidados_expirados()` (purga convidados sem contrato vivo, OTPs e eventos após retenção). `exportar-dados` completado com 11 gavetas em falta (infrações, contactos, denúncias, checkpoints, contratos, candidaturas, trabalhos, push…). Falta agendar o cron da purga. |
| 10 | `CONVITE_MODO_TESTE=1` colapsa a auth do convite | ✅ + ⏳ | **`_shared/modoTeste.ts`**: o modo-teste só liga com a flag **E** `MODO_TESTE_REF` a bater no project-ref atual. Um `=1` esquecido em produção não revela nada. Ligado nas 7 funções de convite. (Para testar em dev: pôr também `MODO_TESTE_REF=<ref-dev>`.) |
| 11 | Entrega final em dois sítios / checkpoint default duplica o tail | ✅ + ⏳ | Resolvido com o #1: o tail desapareceu; a entrega final é o último checkpoint. |
| 12 | Selar sem prazo = relógio oculto de 6 dias | ✅ + ⏳ | **063**: trigger `prazo_visivel_ao_selar` grava um prazo REAL (selado+7d) na linha quando não há — nada de relógios escondidos. |
| 13 | Checkpoint default best-effort fora da transação | ✅ + ⏳ | **063**: trigger `garantir_checkpoint_ao_selar` cria o checkpoint na MESMA transação do selo. `aperto-agir` deixou de o fazer à parte. |
| 14 | Cron `resolver-convites` talvez não agendado | ⏳ | Confirmar `select jobname, active from cron.job` e agendar se faltar (a fatia E inteira depende dele). Está no `verificar-estado-vivo.sql` como passo. |
| 15 | 3 vozes de erro / erros crus ao utilizador | ✅ | `lib/erros.ts` (`mensagemAuth`) mapeia os erros do Supabase Auth para PT/EN; login/registo/recuperar/redefinir/definições/editar-perfil deixam de mostrar `.message` crua. |
| 16 | `Botao` base sem acessibilidade | ✅ | `accessibilityRole="button"` + `accessibilityState{disabled,busy}` — corrige a app inteira (verificado no browser: o 404 expõe `button "Voltar ao Início"`). |
| 17 | Envio de mensagem falha em silêncio | ✅ | `conversa/[id]` mostra "Não foi possível enviar. Tenta de novo." e limpa ao reescrever. Botão de enviar ganhou rótulo a11y. |

## 🟡 Menores / decisões
| Item | Estado | Nota |
|---|---|---|
| `perfis` INSERT não defende is_admin/reputação | ✅ + ⏳ | **064**: `with check` fixa is_admin=false, contadores 0, semente false. |
| `is_admin`/`semente` legíveis por anónimos | ✅ (parcial) + ⏳ | **064**: RPC `sou_admin()` — a app deixa de puxar a coluna is_admin (3 sítios trocados, fail-closed). |
| `perfis using(true)` expõe nif/is_admin/semente/suspensão | ✅ + ⏳ | **Migração 065**: corte por COLUNA — revoga-se o SELECT amplo de `perfis` a anon/authenticated e concede-se só a MONTRA (15 colunas). As 5 confidenciais (nif, is_admin, semente, suspenso_ate, nivel_suspensao) deixam de ser legíveis. O próprio lê as suas por RPC (`sou_admin()` + `meu_perfil_reservado()`); a app (suspensão, editar-perfil) foi ligada à RPC. Os embeds `perfis!de_perfil(nome)` continuam a funcionar. Postura fail-closed: coluna nova nasce privada. Guardrail atualizado com a afirmação `perfis_sem_select_amplo_anon`. |
| `orc_partes_atualizam` sem with check (trabalho_id mutável) | ✅ + ⏳ | **064**: `guarda_ciclo_caucao` passa a tratar `trabalho_id` como imutável. |
| `exportar-dados` incompleto (RGPD) | ✅ + ⏳ | 11 gavetas acrescentadas (ver #9). |
| Código-morto do template Expo | ✅ | 13 ficheiros apagados (animated-icon, themed-*, collapsible, use-theme, constants/theme…); `tsc` a 0. |
| `+not-found` com marca | ✅ | Criado (verificado no browser). |
| `back()` encrava na web | ✅ | `lib/navegar.ts` (`voltar()`): sem histórico → cai no Início. Ligado em honra-card/avisos. |
| Token `erroSuave` / wordmark `pago` / a11y estrelas | ✅ | Token no tema (2 usos), wordmark `honra.`, estrelas de avaliação com rótulo a11y. |
| Escalão do contratante incomputável | 🧑‍⚖️ | Exige avaliações recebidas, que o contratante nunca recebe. Decisão: aceitar que o escalão é só de quem presta, ou criar um sinal de rank de contratante (o 2º carril da memória `honra-merito-contratante`). |
| Confiança (sem decay) vs Escalão (com decay) | 🧑‍⚖️ | Podem contar histórias opostas ("Verificado · 95%"). A memória já marca "coerência c/ o rank" como aberto. Recomendação: alinhar a barra ao decay ou assumir a diferença na UI. |
| Estado `em_curso` legado sem produtor | ⏸️ | Nenhuma transição o escreve, mas é referenciado em 060/061/`umaPastaPorPar`. Deixado como legado documentado (removê-lo arriscava o tratamento de dados antigos). |
| Pull-to-refresh ausente | ⏸️ | As tabs já recarregam ao ganhar foco (`useFocusEffect`); o gesto fica como polimento menor. |

## Ordem de aplicação (para o Vítor)
1. **Aplicar no SQL Editor, por ordem:** 060 → 061 → 062 → **063** → **064** → **065**. (Pacote pronto a colar: `docs/APLICAR-060-a-065.sql`.)
2. **Redeploy das Edge Functions** tocadas: `aperto-agir`, `agir-checkpoint`, `resolver-caucoes`, `convite-formulario`, `exportar-dados`, e as 7 de convite (modoTeste).
3. **Correr `docs/verificar-estado-vivo.sql`** — todas as afirmações-chave têm de dar `true`.
4. **Agendar os crons** em falta (purga de convidados; confirmar `resolver-convites`).
5. **Dashboard:** confirmar os limites de MIME/tamanho dos buckets (se o ALTER da 064 foi bloqueado).
6. **Decisões 🧑‍⚖️:** fuga A (advogado), escalão do contratante, Confiança×decay.
