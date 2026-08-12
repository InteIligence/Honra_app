# Pagamento na entrega — desenho, máquina de estados e runbook

> **Fatia construída a 27/07/2026** (desenho aprovado pelo Vítor no mesmo dia — lei, não sugestão).
> Migração: `supabase/migrations/065_pagamento_na_entrega.sql` — a 063 (fecha as pontas
> do ciclo) e a 064 (endurecimento de segurança) já existiam; esta fatia é a **065**.

## O desenho (porquê assim)

O dinheiro entra no ciclo **na entrega** — isto substitui a alocação antiga do hold
(o hold de 2€ do aperto interno morreu a 15/07; `autorizar-caucao` é legado e assim fica):

1. **B (para_perfil) apresenta a entrega final** — o ficheiro real (**limpo**) + uma
   antevisão (**prova**) — e a bola passa ao cliente.
2. **A (de_perfil) paga** — **captura real via Stripe Checkout, nunca hold de
   `capture_method=manual`**: os holds expiram em 4d18h–7 dias
   (`docs/PAGAMENTOS-HOLD-METRICAS.md` §1) e o prazo de confirmação de 5 dias + uma
   disputa rebentam sempre essa janela. O dinheiro fica **retido na conta da
   plataforma** (Stripe Connect, padrão *separate charges & transfers* — sem
   `transfer_data` na cobrança; a transferência é decisão posterior, amarrada à charge
   por `transfer_group` + `source_transaction`).
3. **A tem dois — e só dois — poderes unilaterais**: **confirmar** (transfer ao Connect
   de B) ou **contestar com evidência escrita** (o dinheiro **congela**). **A devolução
   nunca é um botão do cliente** — só existe como veredito da revisão
   (`checkpoint-disputa · resolver_entrega`).
4. **Silêncio de A no prazo = liberta ao profissional** — avisado no momento do
   pagamento **e** relembrado na véspera (`pagamento_relembrado_em`); o resolver só
   liberta com o lembrete dado. Nunca emboscada (o princípio da marca por inação da
   fatia D). Prazo: **5 dias** (`PRAZO_CONFIRMACAO_DIAS` em
   `supabase/functions/_shared/pagamentos.ts` — constante única, fácil de mudar).
5. **Entrega em duas camadas, imposta por ACESSO**: a prova é visível a A desde a
   apresentação (marca de água renderizada por cima na UI); o limpo **só ganha URL para
   A com `pagamento_estado='libertado'`** (políticas do bucket privado `entregas`).
   Devolução ⇒ o cliente nunca teve acesso ao ficheiro entregue.
6. **Contestação julgada infundada** ⇒ liberta a B **e marca o carril do CONTRATANTE**
   (`registar_infracao`, escada da 048, origem `entrega:contestacao_infundada:{id}`).
7. **Fronteira**: aplica-se a negócios **com entregável digital e valor combinado**
   (`valor_proposta`, 062). Sem valor ou sem entrega, o ciclo de evidência sem dinheiro
   (checkpoints, 047) continua exatamente como estava.

A máquina do **dinheiro** (`pagamento_estado`) é **ortogonal** à máquina da **honra**
(`estado`): os checkpoints continuam a fechar o negócio em `honrado`/`incumprido`;
o pagamento corre no seu próprio carril, e cada carril tem as suas saídas.

## A máquina de estados (pagamento_estado)

```
                      ┌──────────────────────────────────────────────┐
                      │  (sessão Checkout expira → volta sozinha)    │
                      ▼                                              │
 sem_pagamento ──A abre o Checkout──▶ aguarda_pagamento ──webhook────┤
      ▲                                     │ checkout.session.      │
      │                                     │ completed              │
      │                                     ▼                        │
      │                               pago_retido ◀──────────────────┘
      │                     (pago_em; confirmar_ate = pago_em + 5d)
      │                                     │
      │              ┌──────────────────────┼──────────────────────────┐
      │              │ A confirma           │ A contesta (texto        │ silêncio no prazo
      │              │ (entrega-decidir)    │ obrigatório)             │ (resolver; avisado
      │              ▼                      ▼                          │  + relembrado)
      │         libertado              congelado                       ▼
      │    (transfer ao Connect    (NÃO ANDA — sem                 libertado
      │     de B; sem conta →       automatismo; só sai
      │     pendente, resolver      por veredito da revisão)
      │     re-tenta idempotente)       │
      │                        ┌────────┴─────────┐
      │              veredito 'profissional'  veredito 'cliente'
      │              (infundada: liberta +    (refund total)
      │               marca no contratante)       │
      │                        ▼                  ▼
      │                   libertado           devolvido
      └── (nunca se volta atrás a partir de pago_retido)
```

Transições sempre reclamadas com `UPDATE … WHERE pagamento_estado='<estado de
partida>'` — confirmar/contestar/resolver em corrida: só um ganha, o outro recebe 409.

**Entrega (colunas `entrega_*`)**: B escreve-as por RLS + `guarda_ciclo_caucao`
apenas com estado pós-selo, `pagamento_estado='sem_pagamento'`, `valor_proposta`
definido e caminhos na pasta do próprio negócio. Depois de o dinheiro entrar no
ciclo, a entrega **tranca** — A pagou o que viu.

## O que cada peça faz

| Peça | Papel |
|---|---|
| `migrations/065_pagamento_na_entrega.sql` | Colunas + guarda + avisos (notificar_ciclo) + bucket `entregas` com as políticas das duas camadas |
| `functions/entrega-pagamento` | A pede o Checkout (captura real, plataforma, metadata `pagamento_entrega`) → `aguarda_pagamento` |
| `functions/stripe-webhook` (estendido) | `checkout.session.completed` → `pago_retido` + relógio; `checkout.session.expired` → volta a `sem_pagamento` |
| `functions/entrega-decidir` | Os dois poderes de A: confirmar (transfer; sem conta → pendente sem bloquear) / contestar (congela; texto obrigatório) |
| `functions/checkpoint-disputa` (estendido) | `listar` inclui entregas congeladas; `resolver_entrega` = a ÚNICA saída do congelado (libertar+marca / devolver) |
| `functions/resolver-caucoes` (estendido) | Secção 4: véspera → lembrete; vencido+relembrado → liberta; re-tenta transferências pendentes (Idempotency-Key); **nunca toca no congelado** |
| `functions/cancelar-mutuo` (estendido) | Com dinheiro retido/congelado, o cancelamento mútuo espera pela decisão da entrega |
| `src/lib/projeto.tsx` | `apresentarEntrega` (upload limpo+prova), `pagarEntrega` (Checkout), `decidirEntrega` — com tolerância de migração em escada |
| `src/components/Entrega.tsx` | O bloco da entrega: prova com marca de água (A), pagar, confirmar/contestar com relógio, limpo só em libertado |
| `src/components/Checkpoints.tsx` | O marco "Apresentação final" reflete o pagamento (Por apresentar → Entregue → Confirmada/Em revisão/Devolvida) — sem duplicar botões |
| `src/components/LinhaTempo.tsx` | Passos novos: entrega apresentada, pagamento retido, libertado/congelado/devolvido |
| `src/app/revisao-disputas.tsx` | Secção "Entregas — pagamento congelado" com os dois vereditos |

## O que fica pendente para ir ao ar (por ordem)

Precisa de um **token Supabase fresco** (`sbp_…`) — o desta sessão está morto.

### 1) Migração 065
Correr `supabase/migrations/065_pagamento_na_entrega.sql` no **SQL Editor** do Supabase
(cria colunas, guarda, avisos, bucket `entregas` + políticas).

### 2) Deploy das funções
```bash
export SUPABASE_ACCESS_TOKEN=<sbp_... fresco>
cd ~/honra-app
# novas (chamadas pelo cliente autenticado → COM JWT):
npx supabase functions deploy entrega-pagamento --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy entrega-decidir   --project-ref haqynnhstjgzgtnnwqsi
# estendidas (redeploy):
npx supabase functions deploy stripe-webhook    --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
npx supabase functions deploy checkpoint-disputa --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy cancelar-mutuo    --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy resolver-caucoes  --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
```

### 3) Stripe (modo teste)
- No endpoint do webhook (o mesmo do `stripe-webhook`), garantir os eventos
  **`checkout.session.completed`** e **`checkout.session.expired`**.
- Segredos já existentes chegam (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `PAG_RETURN_URL` opcional). **Sem segredos novos.**
- O cron diário (`cron-resolver.sql`) já chama o `resolver-caucoes` — nada a agendar.

### 4) Prova ao vivo (test mode, cartão `4242 4242 4242 4242`)
1. Num negócio selado com valor: B apresenta a entrega → A vê a prova com marca de água.
2. A paga no Checkout → webhook marca `pago_retido` (avisos aos dois; relógio a A).
3. A confirma → `libertado`; sem conta Connect de B → aviso "falta a tua conta" e
   `resolver-caucoes` (corpo `{"forcar_pagamentos":true}` para testar) re-tenta.
4. Caminho da contestação → `congelado` → `revisao-disputas` → os dois vereditos.
5. Confirmar que A **não** consegue URL assinado do `limpa-…` antes de `libertado`
   (a política de Storage recusa) — e que consegue depois.

## Lacunas deliberadas (documentadas, não esquecidas)

- **Destino do dinheiro congelado**: SEM automatismo — o estado `congelado` só sai por
  veredito manual da revisão. É deliberado: a decisão final (prazos, repartições,
  enquadramento legal do congelamento) está **pendente com o advogado**.
- **Marca de água = dissuasão, não DRM**: a prova é uma antevisão (na web, reduzida por
  canvas a ≤1280px/JPEG 0.55; no nativo, sem módulo de manipulação instalado, leva o
  mesmo conteúdo) e a marca de água é um overlay da UI. A imposição REAL é o acesso: o
  **limpo** está trancado por política de Storage até `libertado`. Reforço futuro
  (dev build): `expo-image-manipulator` para reduzir/carimbar a prova também no nativo.
- **Entregável = imagem, por agora**: o upload usa o seletor de imagens (o padrão da
  casa). Outros formatos (PDF/ZIP/vídeo) são extensão natural — o modelo prova/limpo e
  as políticas já os suportam (a prova torna-se opcional; a UI mostra nome/tipo).
- **Plataforma cobra 0% neste fluxo**: a receita do Honra é a subscrição; os custos
  Stripe da cobrança ficam na plataforma no piloto (medir; rever com pricing).
- **Retenção na plataforma ≠ modelo do contrato-convite**: o contrato-convite usa
  direct charges na conta de P precisamente para o Honra não ter posse de fundos
  (BdP/DL 91/2018 — ver `connect-onboarding`). Este fluxo retém na plataforma por
  desenho aprovado (27/07) — **confirmar o enquadramento com o advogado** faz parte do
  mesmo dossier do congelado.
