# PAGAMENTOS — Hold de Caução, Cobranças MIT e Métricas (investigação para a Fatia D)

> **Data:** 17/07/2026 · **Âmbito:** parâmetros técnico-financeiros do hold de caução (~25% a D−X), cobranças off-session (MIT) de penalizações, dunning, riscos de rede e métricas — tudo em **direct charges** na conta Stripe Connect do profissional, com `application_fee_amount` da plataforma.
> **Método:** pesquisa web 17/07/2026, priorizando docs.stripe.com, regras públicas Visa/Mastercard, Banco de Portugal e fontes 2025–2026; ≥2 fontes por afirmação estrutural. Fontes no fim de cada secção.
> **Regra de leitura:** cada secção termina com **"O que isto decide no desenho"** e um **nível de confiança** honesto. O que só se sabe medindo está marcado como tal.

---

## SUMÁRIO EXECUTIVO — os 8 parâmetros decididos

| # | Parâmetro | Decisão proposta |
|---|-----------|------------------|
| 1 | **Dia do arme do hold** | **D−2** (não D−3). Aviso pré-hold ao cliente a **D−4/D−3**. O arme é MIT → a Visa só dá **4 dias e 18 horas** de validade; armar a D−2 deixa ~2 dias pós-evento para decidir a captura. Ler sempre `capture_before` em runtime e agendar a decisão final para `capture_before − 12h`; sem decisão → libertar e cair para cobrança MIT posterior. |
| 2 | **Débito vs crédito** | **Hold só em cartões de crédito** (`payment_method.card.funding == "credit"`). Em **débito/pré-pago: modelo Fresha** — sem hold, cartão gravado, cobrança MIT apenas na quebra. Portugal é ~90% débito nas operações em estabelecimentos: a maioria dos clientes PT nunca verá dinheiro bloqueado; os casais estrangeiros (tipicamente crédito) terão o hold clássico. |
| 3 | **Cadência de dunning** | Tentativa inicial + retries a **D+1, D+3, D+7** (máx. 4 tentativas — muito abaixo do limite de 15/30 dias da Visa). Gating por decline code: hard declines e MAC 03/21 → parar já; `authentication_required` → **nunca re-tentar MIT**, mudar para fluxo SCA on-session; `insufficient_funds` → cadência normal (retry de D+7 idealmente perto do dia 1 ou 15 do mês). Smart Retries **não** cobre PaymentIntents avulsos → dunning é nosso. |
| 4 | **Fee da plataforma na penalização** | **3% com mínimo 0,60 €**, definida na captura via `application_fee_amount` (cobre o custo Stripe de ~1,5% + 0,25 € em cartões EEA + margem fina). **Penalização perdoada (data reocupada) → fee 0 €.** Benchmarks: Booking.com cobra comissão plena sobre fees de no-show cobradas (0 se perdoadas), OpenTable 2%, StyleSeat fee fixa, Fresha ~0. O Honra não lucra com quebras — a receita é a subscrição. |
| 5 | **Métricas mínimas** | 8 métricas núcleo (secção 6) em tabela `metricas_pagamento` de **eventos imutáveis** + views agregadas. Instrumentar desde o primeiro contrato do piloto — os números PT reais não existem publicamente. |
| 6 | **Thresholds de alerta por profissional** | Espelhar o VAMP: **amarelo** a partir de 2 disputas+fraudes/90 dias ou ratio ≥ 0,3%; **vermelho** (suspender holds do profissional, rever conta) a ≥ 5 ocorrências e ratio ≥ 0,5% — o limiar "non-compliant" da Visa. Excessive (multas): 1,5% na UE desde 04/2026. Descritor claro `HONRA* <PRO>` + email pré-captura em TODAS as penalizações. |
| 7 | **Fallback SCA** | `authentication_required` off-session → notificação push/email → o cliente abre a app e confirma **a mesma PaymentIntent** on-session com 3DS. Prazo 72h; sem pagamento → escalar para o aperto de reputação (coerente com a decisão de 14/07: a reputação É a caução). |
| 8 | **Plano de teste** | Cartões de teste dedicados para cada cenário (secção 8): `4000003800000446` (MIT ok), `4000008260003178` (insufficient_funds off-session), `4000002500003155`/`...3184` (authentication_required), `4000000000000259` (disputa). Expiração de auth **não é acelerável** em test mode → simular com `stripe trigger charge.expired` + relógio injetado no scheduler. |

**A promessa ao profissional:** não prometer números antes do piloto. Benchmarks globais apontam para ~80–90% de cobrança efetiva em crédito após dunning completo (menos em débito). Dizer "a grande maioria" e substituir por o nosso número real medido ao fim de 90 dias.

---

## 1. Janelas e regras de autorização (2026)

**Nível de confiança: ALTO** (docs.stripe.com atuais, corroborados).

### 1.1 Validade das autorizações por rede (card-not-present)

Confirmado na documentação Stripe atual ("Place a hold on a payment method"):

| Rede | MIT (off-session — o nosso arme a D−X) | CIT (cliente presente) |
|------|------|------|
| **Visa** | **5 dias** — na prática **4 dias e 18 horas** ("to allow time for clearing processes") | 7 dias |
| **Mastercard** | **7 dias** | 7 dias |
| **American Express** | 7 dias | 7 dias |
| **Discover** | 7 dias | 7 dias |

- O hold do Honra armado a D−X **é um MIT** (o cliente não está presente; usamos o cartão gravado no SetupIntent). Logo o pior caso é **Visa: 4d18h**.
- Se a autorização expira sem captura, os fundos libertam-se e a PaymentIntent passa a `canceled`. A Stripe emite **`charge.expired`** quando uma charge não capturada expira — subscrever este webhook é obrigatório na Fatia D.

### 1.2 Validação runtime — `capture_before`

- O campo **`latest_charge.payment_method_details.card.capture_before`** (timestamp Unix) diz exatamente quando a autorização expira. A própria Stripe recomenda confiar neste campo e não nas tabelas, porque as regras de rede mudam.
- **Regra de desenho:** ao armar, guardar `capture_before` no contrato; agendar a "decisão final de captura" para `capture_before − 12h`; se a quebra ainda estiver em disputa interna nessa altura → **libertar o hold** e recuperar por MIT depois (nunca capturar "por precaução" — é combustível para chargebacks).

### 1.3 Extended authorization (30 dias) — não contar com ela

- Duração real: Visa **29d18h**, Mastercard/Amex/Discover **30d**.
- **Exige pricing IC+** (interchange plus) — o Honra arranca em pricing blended standard, portanto **indisponível sem negociação com a Stripe**.
- Pior: na Visa, fora das MCCs de viagem (hotel, rent-a-car, cruzeiros), a extended auth para "todas as outras categorias" custa **+0,08% por transação** e **só se aplica a CIT** — o nosso arme é MIT, logo nem com IC+ serviria na Visa. Na Mastercard aplica-se a todas as categorias.
- **Conclusão:** desenhar a Fatia D para viver dentro dos 4d18h da Visa. Extended auth fica como otimização futura (se um dia houver IC+, só ajudaria em Mastercard).

### 1.4 Incremental auth, over/under-capture, multicapture (em direct charges)

| Capacidade | Disponibilidade real | Nota para o Honra |
|---|---|---|
| **Under-capture (captura parcial)** | **Nativa, sem requisitos** — `amount_to_capture` < autorizado; o resto liberta-se automaticamente | É o nosso caso normal: hold 25%, captura da penalização devida (que pode ser inferior). Funciona em direct charges. |
| **Incremental auth** | Exige **IC+**; máx. 10 incrementos; **não estende a validade** (`capture_before` não muda) | Inútil para nós — não resolve o prazo, só o montante. |
| **Overcapture** | Exige IC+ e **a Visa exclui empresas do EEE** | **Na prática indisponível em Portugal para Visa.** Nunca desenhar nada que capture acima do autorizado. |
| **Multicapture** | Exige IC+; até 50 capturas parciais + 1 final (`final_capture=false/true`); suporta Connect exceto separate charges & transfers com `source_transaction` | Em Connect, se `application_fee_amount` for definido na 1.ª captura, é obrigatório em todas as seguintes. Sem IC+, uma captura parcial normal **encerra** a autorização — só temos **um tiro por hold**. |

### 1.5 Estratégia de re-autorização

- Evento adiado / hold a expirar sem decisão: **cancelar a PaymentIntent** (liberta já os fundos, melhor UX do que deixar expirar) **e re-armar** um novo hold mais perto da nova data. Cada re-arme é um novo MIT — sem SCA adicional, ao abrigo do acordo inicial.
- Se o re-arme falhar (cartão morreu entretanto), tratá-lo como falha de arme (secção 2) — é exatamente por isto que o arme a D−2 com aviso a D−4 dá tempo de pedir outro cartão antes do evento.

### O que isto decide no desenho
**Armar a D−2** (aviso pré-hold a D−4/D−3, com CTA para atualizar cartão). D−3 daria só ~D+1¾ pós-evento na Visa; D−2 dá ~D+2¾ — margem para no-show verificado na manhã seguinte + decisão humana. Nunca prometer captura depois de `capture_before`; a partir daí é sempre MIT + dunning.

**Fontes:** [Stripe — Place a hold](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) · [Stripe — Extended authorization](https://docs.stripe.com/payments/extended-authorization) · [Stripe — Incremental authorization](https://docs.stripe.com/payments/incremental-authorization) · [Stripe — Overcapture](https://docs.stripe.com/payments/overcapture) · [Stripe — Multicapture](https://docs.stripe.com/payments/multicapture) · [Stripe API — capture](https://docs.stripe.com/api/payment_intents/capture)

---

## 2. Taxas de sucesso/recusa de MIT na prática

**Nível de confiança: MÉDIO** (benchmarks globais sólidos e convergentes; **não existe** benchmark público para MIT em cartões portugueses — isto só se sabe medindo).

### 2.1 Benchmarks públicos (2025–2026)

- Pagamentos recorrentes/off-session: **~15%** das tentativas recusadas (dados agregados Visa/Mastercard citados na imprensa de pagamentos); negócios de subscrição reportam **18–20%** de decline rate em 2025.
- **Débito vs crédito:** crédito recusa **~4,5–7,5%**; débito **~7–12%** consoante o emissor — débito é consistentemente **2–3× pior**. Um estudo PYMNTS/2025: 52% de todos os declines são cartões de débito.
- **Europa:** declines 15–20% acima da América do Norte, sobretudo por SCA/PSD2 — mas os **MITs bem marcados estão isentos de SCA**, desde que o SetupIntent inicial tenha tido SCA (o nosso tem) e a cobrança leve `off_session=true` + `confirm=true`.
- **Razões típicas** (distribuição global de declines): `insufficient_funds` **~47%** (a razão n.º 1, e a mais recuperável: 60–70% recupera em 24–48h); suspeita de fraude/falsos positivos ~20%; cartão expirado ~12%; dados errados ~8%; limites ~8%. `do_not_honor`/`generic_decline` são o "caixote" dos emissores — razão real desconhecida.
- **Comportamento dos emissores PT:** não há dados públicos por emissor português. Nota estrutural: os grandes emissores PT (CGD, Millennium, Santander, Novobanco) emitem sobretudo débito Visa/MC sobre contas à ordem — o decline por saldo insuficiente em MIT de débito será a nossa falha dominante. **Medir no piloto** (secção 6).

### 2.2 O fallback `authentication_required`

- Significado: o emissor exige 3DS apesar de a transação ser MIT (acontece; na UE alguns emissores são agressivos).
- Stripe (decline codes): *"In some cases, such as off-session payments, you might need to request the customer to retry"* — ou seja, **não é retryável por máquina**. O fluxo correto:
  1. Apanhar o erro (`error.code == "authentication_required"`; a PaymentIntent fica em `requires_action`/`requires_payment_method`).
  2. Notificar o cliente (push + email): "confirma o pagamento da penalização".
  3. Na app, confirmar **a mesma PaymentIntent** on-session com 3DS (o client_secret já existe).
  4. Prazo 72h; sem ação → escalar para o aperto de reputação (marca → suspensão), conforme decidido a 14/07.

### 2.3 O que prometer ao profissional

- Honesto: **"na grande maioria dos casos"** — sem número inventado. Composição estimada a partir dos benchmarks: 1.ª tentativa ~80–85% de sucesso em crédito; com dunning completo + fallback SCA, **~85–95% de cobrança efetiva em crédito** e um patamar inferior (talvez 75–85%) em débito. **Estes intervalos são extrapolação, não medição** — substituir pelo número real do piloto e só então mostrá-lo na app (régua: enaltecer o Honra, nunca inflacionar).

### O que isto decide no desenho
Fluxo de recurso em 3 andares: retry automático (soft declines) → fallback SCA on-session (authentication_required) → aperto de reputação. E instrumentação desde o dia 1, porque o número PT não existe em lado nenhum.

**Fontes:** [CoinLaw — Card Decline Statistics 2026](https://coinlaw.io/card-decline-statistics/) · [PYMNTS — 52% dos declines são débito](https://www.pymnts.com/consumer-insights/2025/52-percent-of-payment-declines-are-debit-cards/) · [Spreedly — débito vs crédito](https://www.spreedly.com/blog/credit-card-vs-debit-card-decline-rates-processing-fees) · [Recurly Research — decline reasons](https://recurly.com/research/subscription-benchmarks-top-payment-decline-reasons/) · [Stripe — decline codes](https://docs.stripe.com/declines/codes) · [Stripe — CITs e MITs](https://docs.stripe.com/payments/cits-and-mits)

---

## 3. Dunning / retries com regras de rede

**Nível de confiança: ALTO** nas regras de rede; **MÉDIO** na cadência ótima (é heurística, afinável com dados).

### 3.1 As regras duras

- **Visa (excessive reattempts):** máx. **15 reattempts por transação/cartão em 30 dias**; a partir da 16.ª, fee de ~US$0,10 por tentativa ("VS RAF Excessive Reattempts"). Categorias de decline: **Cat. 1 (nunca re-tentar** — cartão perdido/roubado/conta inexistente: qualquer retry é logo "excessive"); Cat. 2 (esperar e re-tentar — ex.: insufficient_funds); Cat. 3 (corrigir e re-tentar — dados errados); Cat. 4 (restantes).
- **Mastercard (TPE + Merchant Advice Codes):** **MAC 03 "do not try again"** e **MAC 21 "payment cancelled"** → re-tentar dá multa por tentativa (US$1 no 1.º mês, até US$2 depois). MAC 01 = há nova informação de conta (usar Card Account Updater); MAC 24/25/26 = re-tentar após 1h/24h/2 dias.
- **Stripe (recomendação):** máx. **8 retries** por cobrança; emissores interpretam retries em excesso como fraude e passam a recusar cobranças legítimas.

### 3.2 Smart Retries e Card Account Updater

- **Smart Retries** é do Stripe **Billing** (subscriptions e invoices) — **não se aplica a PaymentIntents avulsos** como as nossas penalizações. Opção teórica: emitir a penalização como Invoice one-off na conta connected (herda Smart Retries), mas acrescenta complexidade e acopla-nos ao Billing. **Decisão: máquina de dunning própria**, simples e auditável.
- **Card Account Updater:** automático na Stripe, sem custo no pricing standard; desde 2024–2025 com atualização **em tempo real para Visa no Reino Unido/Europa e Mastercard globalmente**. Evento `payment_method.automatically_updated` para sincronizar os nossos registos.
- **Nuance de Connect (importante):** em direct charges com cartão guardado na plataforma, o payment method é **clonado** para a conta connected no momento da cobrança, e o clone é um objeto independente. **Clonar sempre na hora de cobrar** (nunca guardar clones para reutilizar) — assim cada cobrança beneficia do vault da plataforma já atualizado pelo Card Account Updater.

### 3.3 A máquina de dunning da Fatia D (proposta)

```
Tentativa 0 (a quebra é confirmada) ── MIT off_session
 ├─ sucesso → fim (registar métricas)
 ├─ authentication_required → fluxo SCA on-session (72h) — NÃO re-tentar por máquina
 ├─ hard decline (lost/stolen/pickup_card, invalid_account, MAC 03/21,
 │   fraud) → parar; pedir novo cartão ao cliente; aperto de reputação
 └─ soft decline (insufficient_funds, try_again_later, do_not_honor,
     generic_decline, MAC 24/25/26) → dunning:
     retry #1 a D+1 · retry #2 a D+3 · retry #3 a D+7
     (se o decline for MAC 24/25/26, respeitar o mínimo indicado)
     → 3 falhas → pedir novo cartão + aperto de reputação
```

- Total: **máx. 4 tentativas** — folga enorme face ao 15/30d da Visa e dentro dos 8 da Stripe.
- Racional da cadência: `insufficient_funds` recupera 60–70% em 24–48h (→ D+1 e D+3); o retry D+7 apanha o ciclo salarial — na Europa Ocidental os dias 1 e 15 do mês têm melhor taxa de aprovação; se D+7 cair a <3 dias do dia 1/15, deslizar o retry para essa data.
- Cada retry: nova confirmação da mesma PaymentIntent falhada ou nova PI com o mesmo PM clonado de fresco (preferir re-confirmar; criar nova PI se a anterior ficou `canceled`).

### O que isto decide no desenho
A tabela de estados do dunning (pendente → retry_1/2/3 → sca_pendente → cobrado/incobrável), o mapa decline_code→ação como configuração e não código, e o respeito por MAC nos retries. Smart Retries fica fora; Card Account Updater fica ligado por omissão com clonagem na hora.

**Fontes:** [Payway — Visa Excessive Reattempts](https://www.payway.com/visa-excessive-reattempts-rule-fees) · [Visa — regras de resubmissão (PDF)](https://usa.visa.com/dam/VCOM/global/support-legal/documents/updates-to-rules-for-declined-transaction-resubmission-and-use-of-authorization-response-codes.pdf) · [Qualpay — categorias de decline Visa](https://help.qualpay.com/help/visas-decline-code-grouping) · [TabaPay / Payabl / Chargebacks911 — MACs Mastercard](https://developers.tabapay.com/docs/merchant-advice-code-mac) · [Slicker — retry rules 06/2026](https://www.slickerhq.com/resources/blog/visa-mastercard-payment-retry-rules) · [Stripe — Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) · [Stripe — card account updater / network tokens](https://stripe.com/newsroom/news/network-tokens-card-account-updater) · [Stripe — declines](https://docs.stripe.com/declines/card)

---

## 4. Holds em cartões de DÉBITO (o ponto crítico para PT)

**Nível de confiança: ALTO** no problema e no contexto PT; **MÉDIO** nos dias exatos de libertação (variam por banco).

### 4.1 O problema

- Num débito, o hold **bloqueia dinheiro real da conta à ordem** do cliente durante dias. Após libertação/cancelamento, os bancos podem demorar **1 a 8 dias úteis** a repor a disponibilidade (política do emissor, não nossa) — é a maior fonte de reclamações documentada em hotéis/rent-a-car, mesmo com disclosure feita à cabeça.
- **Portugal é um mercado de débito:** 28,6 M de cartões de débito vs 9,9 M de crédito no fim de 2024; **só ~10% das operações de cartão em estabelecimentos são crédito** (Banco de Portugal, Relatório dos Sistemas de Pagamentos 2024). Um hold de 25% de um evento de 800 € são 200 € indisponíveis na conta de um cliente PT durante ~5 dias — UX péssima e um gerador de "isto é burla?" no suporte.
- Casais estrangeiros (o segundo segmento do Honra) usam maioritariamente crédito → o hold é invisível para eles (só reduz plafond).

### 4.2 Regras de disclosure

- Visa: as políticas de cancelamento/no-show **têm de ser divulgadas ao portador no momento da compra/reserva** ("Visa will support your policies, provided they are clearly disclosed to cardholders"); o consentimento para guardar o cartão tem de ser **separado** dos T&C gerais (regra Visa/MC de stored credentials). Já cumprimos no contrato-convite; o aviso pré-hold reforça a prova em caso de disputa.
- Boas práticas (setor hoteleiro + guias anti-chargeback): avisar **antes** de armar (email/push a D−4: montante, data do arme, data de libertação prevista), explicar "não é uma cobrança", e libertar proativamente (cancelar a PI, não deixar expirar).

### 4.3 A alternativa "modelo Fresha"

- Fresha: **nenhum dinheiro é retido à cabeça** — o cartão fica gravado e a fee de no-show/cancelamento tardio é cobrada ao cartão **apenas na quebra** (a % é definida pelo profissional, até 100%). É o standard do setor beauty/wellness e reduz perdas por no-show "até 60%" segundo a própria Fresha — ou seja, o efeito dissuasor vem sobretudo de o cartão estar gravado + política clara, não do bloqueio.
- Trade-off: sem hold não há garantia de fundos → o risco de `insufficient_funds` no débito é real (secção 2). Mitigação: dunning (secção 3) + aperto de reputação (que no Honra é a verdadeira caução, decisão de 14/07).

### 4.4 Decisão proposta

**Híbrido por tipo de cartão**, lido em `payment_method.card.funding`:

| Funding | Estratégia |
|---|---|
| `credit` | Hold clássico a D−2 (25%), captura na quebra. |
| `debit` / `prepaid` | **Sem hold.** Cartão gravado + aviso de política; na quebra, cobrança MIT direta + dunning. |
| `unknown` | Tratar como débito (conservador). |

- Comunicar de forma diferente: ao cliente de crédito, "reservámos X € como caução"; ao de débito, "o teu cartão garante o compromisso; só é cobrado se faltares".
- Nota de equidade: o profissional vê o mesmo nível de garantia contratual nos dois casos — a diferença é só o instrumento. Mostrar ao profissional o estado ("caução armada" vs "cartão em garantia") sem o expor à mecânica de rede.

### O que isto decide no desenho
A Fatia D precisa de **dois caminhos de quebra** (capturar hold vs criar MIT) atrás da mesma máquina de estados, e o campo `funding` tem de ser guardado no contrato no momento do SetupIntent. O aviso pré-hold é obrigatório e datado (prova para disputas).

**Fontes:** [Banco de Portugal — Relatório dos Sistemas de Pagamentos 2024 (PDF)](https://www.bportugal.pt/sites/default/files/documents/2025-05/rsp2024.pdf) · [Consumer Action / Georgia AG — authorization holds em débito](https://www.consumer-action.org/helpdesk/articles/authorization_holds) · [Chargebacks911 — authorization holds](https://chargebacks911.com/authorization-hold/) · [Fresha — charge no-show and cancellation fees](https://www.fresha.com/help-center/knowledge-base/payments/617-charge-no-show-and-cancellation-fees) · [Visa — Card Acceptance Guidelines (PDF)](https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf) · [Stripe API — card.funding](https://docs.stripe.com/api/payment_methods/object)

---

## 5. Riscos de monitorização 2026 (VAMP, ECP) e o que conta contra quem

**Nível de confiança: ALTO** nos thresholds (Stripe docs + 4 fontes da indústria convergentes); **MÉDIO** na atribuição exata plataforma vs connected (a Stripe não documenta tudo publicamente).

### 5.1 Visa — VAMP (substituiu VDMP/VFMP desde 01/04/2025)

- **VAMP ratio** = (disputas TC15 + fraudes TC40) ÷ pagamentos capturados, mensal. A mesma transação pode contar 2× (TC40 e depois TC15).
- Thresholds de **merchant** em vigor (a Visa apertou a 01/04/2026):
  - **Non-compliant:** count ≥ 5 **e** ratio ≥ **0,5%**
  - **Excessive (UE/EUA/AP/CA/LAC):** count ≥ 1500 **e** ratio ≥ **1,5%** (era 2,2% até 03/2026; CEMEA mantém 2,2%)
  - Enumeração (card testing): ratio ≥ 20% ou count ≥ 300 000 (sem multas, mas monitorizado)
- Multas: **~US$8 por transação disputada/fraudulenta** para merchants em "excessive"; a Visa pode cobrar também em non-compliant. Acquirers têm thresholds próprios (0,5% "above standard" desde 01/2026) — o que significa que **a Stripe, como acquirer, vai pressionar cedo** merchants que se aproximem dos limiares.
- Dashboard: `dashboard.stripe.com/radar/cbmp/vamp` (por statement descriptor, com dados Visa + cálculo Stripe em tempo real).

### 5.2 Mastercard — ECP/HECM e EFM

- **ECM:** ≥ 100 chargebacks/mês **e** ratio ≥ 1,5% → multas a partir do 2.º mês (US$1 000) e a escalar (até US$100k+ e "issuer recovery assessment" de US$5/chargeback acima de 300).
- **HECM:** ≥ 300 chargebacks **e** ratio ≥ 3% → multas a dobrar.
- **EFM (fraude):** ≥ 1 000 pagamentos e-commerce + fraude > US$50k + fraud chargeback rate > 0,5% + pouca adoção de 3DS.
- Saída dos programas: 3 meses consecutivos abaixo do threshold.

### 5.3 Contra quem conta (direct charges)

- Em direct charges, **o merchant of record é a conta connected** (o profissional): o statement descriptor é dele, as disputas debitam o saldo dele, e as métricas VAMP/ECP acumulam **na identidade de merchant dele** — não num agregado da plataforma.
- **Mas:** a plataforma não está a salvo — (1) se for "responsável por saldos negativos", paga as disputas que o profissional não cubra; (2) a Stripe avalia o risco do **portfólio** da plataforma Connect e pode intervir na plataforma inteira se os connected accounts forem sistematicamente maus; (3) os thresholds de acquirer do VAMP agregam ao nível da Stripe, que empurra a pressão para baixo.
- Realismo de escala: um profissional do Honra fará dezenas de cobranças/mês, não milhares — os thresholds de **count** (100, 1500) estão longe; o perigo real é o **ratio** com denominador pequeno (2 disputas em 50 cobranças = 4%!) e o limiar non-compliant de **count ≥ 5 + 0,5%**, que um profissional pequeno mau consegue atingir.

### 5.4 Boas práticas pré-captura (reduzem disputas na origem)

1. Descritor: `HONRA* <NOME-PRO>` (configurável por charge em direct charges) — "não reconheço o movimento" é a causa n.º 1 de disputa evitável.
2. **Email/push ANTES de capturar a penalização** (com o contrato, a política aceite e o OTP da prova-de-encontro) — mata a disputa "não autorizei".
3. Responder a `radar.early_fraud_warning.created` (TC40) com reembolso rápido quando a cobrança for fraca — evita que vire disputa TC15 (contaria 2×).
4. Guardar o pacote de prova por contrato (aceite da política + SCA do setup + OTP) pronto a submeter em disputa.

### O que isto decide no desenho — alertas por profissional
- **Amarelo:** 2 disputas+EFW em 90 dias, ou ratio 90d ≥ 0,3% → rever o profissional, ativar aviso.
- **Vermelho:** ≥ 5 disputas+EFW em 12 meses **ou** ratio ≥ 0,5% → suspender holds/penalizações desse profissional (só pagamento no ato), investigação manual. (Espelha o "non-compliant" da Visa com margem.)
- **Plataforma:** ratio agregado mensal < 0,3% como KPI interno; dashboard VAMP da Stripe verificado mensalmente.

**Fontes:** [Stripe — monitoring programs](https://docs.stripe.com/disputes/monitoring-programs) · [Chargeflow — VAMP 2026](https://www.chargeflow.io/blog/vamp-visa-acquirer-monitoring-program) · [MRC — thresholds VAMP em vigor](https://merchantriskcouncil.org/learning/resource-center/member-news/blog/2026/stricter-vamp-ratio-thresholds-are-now-in-effect-heres-how-to-stay-compliant) · [Basis Theory — VAMP abril 2026](https://blog.basistheory.com/visa-acquirer-monitoring-program-2026-updates) · [Visa — VAMP fact sheet (PDF)](https://corporate.visa.com/content/dam/VCOM/corporate/visa-perspectives/security-and-trust/documents/visa-acquirer-monitoring-program-fact-sheet-2025.pdf) · [Stripe — merchant of record](https://docs.stripe.com/connect/merchant-of-record) · [Stripe — disputes on Connect](https://docs.stripe.com/connect/disputes)

---

## 6. Métricas de pagamento a instrumentar (dashboard interno)

**Nível de confiança: ALTO** (desenho próprio, ancorado nas secções anteriores).

### 6.1 As 8 métricas núcleo

| # | Métrica | Definição | Porque existe |
|---|---|---|---|
| 1 | **Auth success rate no arme** | holds armados com sucesso ÷ tentativas de arme (por funding, por rede) | Decide se D−2 chega ou se é preciso pedir cartão novo mais cedo |
| 2 | **Capture success rate** | capturas ok ÷ tentativas de captura (e % capturada dentro de `capture_before`) | Vigia a janela Visa 4d18h na prática |
| 3 | **MIT decline rate por razão** | falhas MIT ÷ tentativas, segmentado por `decline_code` × funding × emissor (BIN) | O número PT que não existe publicamente — o nosso ativo |
| 4 | **Tempo até captura/cobrança** | mediana e p90 de (quebra confirmada → dinheiro cobrado), incluindo dunning | O que prometemos ao profissional ("em quanto tempo recebo?") |
| 5 | **Dispute rate por profissional** | (disputas + EFW) ÷ cobranças capturadas, janelas 90d e 12m | Alimenta os alertas amarelo/vermelho da secção 5 |
| 6 | **% contratos por nível de caução** | distribuição i/ii/iii (sinal fora + cartão gravado + hold) | Mede a adoção real dos 3 andares do contrato-convite |
| 7 | **Penalizações cobradas vs perdoadas** | € e n.º, com motivo do perdão (ex.: data reocupada) | Mede a saúde do sistema de honra; alimenta a fee 0 no perdão |
| 8 | **Recovery rate do dunning** | % recuperada na tentativa 0 / retry 1 / 2 / 3 / fallback SCA | Afina a cadência D+1/D+3/D+7 com dados reais |

Secundárias (derivadas, sem esforço extra): taxa de fallback SCA concluído em 72h; % de holds libertados sem quebra (deve ser a esmagadora maioria); custo Stripe por € de penalização cobrada; idade média dos cartões no vault e taxa de `payment_method.automatically_updated`.

### 6.2 Onde vivem (só desenho, sem código)

- **Tabela `eventos_pagamento` (append-only, imutável):** uma linha por transição — `contrato_id`, `profissional_id`, `cliente_id (hash)`, `tipo_evento` (arme_tentado, arme_ok, arme_falhou, hold_libertado, hold_expirado, captura_ok, captura_parcial, mit_tentado, mit_falhou, retry_n, sca_pedido, sca_concluido, disputa_aberta, efw_recebido, perdoado), `pi_id`, `decline_code`, `funding`, `rede`, `bin`, `montante`, `fee_aplicada`, `capture_before`, `criado_em`. Fonte da verdade = **webhooks Stripe** (`payment_intent.*`, `charge.expired`, `charge.dispute.*`, `radar.early_fraud_warning.created`, `payment_method.automatically_updated`) + eventos internos (perdão, confirmação de quebra).
- **Views/materializações `metricas_pagamento_*`:** agregações diárias por profissional e globais (as 8 métricas). Nunca escrever agregados à mão — derivar sempre dos eventos.
- Não inventar um sistema novo: os eventos que a app já regista no ciclo do contrato-convite ganham só o vocabulário de pagamento acima.

### O que isto decide no desenho
O esquema de eventos entra na Fatia D **antes** da primeira cobrança real — o piloto de Lisboa·eventos é a única fonte possível dos números PT (decline rate por emissor, recovery do dunning). 90 dias de piloto ≈ primeira versão honesta do "quase sempre".

---

## 7. Application fee da plataforma nas penalizações

**Nível de confiança: ALTO** na mecânica Stripe; **MÉDIO** nos benchmarks (verificados mas heterogéneos); a proposta final é juízo fundamentado, não facto.

### 7.1 Benchmarks (o que as plataformas levam em no-show/cancel fees)

| Plataforma | O que leva na penalização | Nota |
|---|---|---|
| **Booking.com** | **Comissão plena (~15%)** sobre fees de cancelamento/no-show efetivamente cobradas; **0 se o parceiro perdoar** (reportar no-show/waive → sem comissão) | O precedente mais claro: fee segue a cobrança, perdão custa 0 |
| **OpenTable** | **2% service fee** sobre transações, incluindo no-show fees e depósitos (rollout EUA 2025–2026) | Fee baixa e uniforme |
| **Fresha** | ~0 sobre a fee de no-show (paga só processamento); a comissão de 20% é sobre novos clientes do marketplace | O profissional fica com a penalização quase toda |
| **StyleSeat** | Booking fee fixa (US$2,35) ao cliente; no-show fee (ex.: 50% do serviço) vai para o profissional | Fee fixa, não percentual |

Padrão do mercado: **a penalização é do profissional; a plataforma leva pouco ou nada**, e nada quando é perdoada.

### 7.2 Mecânica Stripe (confirmada)

- Em direct charges, `application_fee_amount` **pode ser definido/ajustado no momento da captura** (`POST /payment_intents/:id/capture`), e é **limitado ao montante efetivamente capturado** — captura parcial ⇒ a fee tem de caber no capturado.
- Em cobrança MIT sem hold, define-se na criação/confirm da PaymentIntent.
- Custo de base do Honra por cobrança (pricing standard PT): **1,5% + 0,25 €** (cartões EEA standard), 1,9% + 0,25 € (EEA premium), 2,5%/3,25% + 0,25 € (UK/internacionais — relevantes nos casais estrangeiros) e **20 € por disputa**.

### 7.3 Proposta fundamentada

- **Fee do Honra na captura de penalização: 3%, mínimo 0,60 €.**
  - Cobre o custo Stripe no pior caso comum (cartão internacional ~3,25% + 0,25 € fica ligeiramente acima — aceitável como custo de aquisição do segmento estrangeiro; alternativa: 3% EEA / 4% não-EEA se se quiser neutralidade total).
  - Fica entre a OpenTable (2%) e a Booking (15%), do lado "a penalização é do profissional" — coerente com o modelo de receita do Honra (subscrições, não take rate) e com a régua de enaltecer: **o Honra não pode parecer que lucra com quebras**.
- **Perdão (ex.: data reocupada): fee 0 €** — cancelar a PI do hold ou simplesmente não cobrar; se já capturado e depois perdoado, reembolsar por inteiro (o reembolso da application fee é suportado via `refund_application_fee`).
- Comunicação na app: "O Honra cobra 3% para cobrir os custos de processamento da penalização. Se perdoares, não pagas nada." — transparência como arma.

### O que isto decide no desenho
`application_fee_amount` calculado **na captura** (não na criação) para acompanhar capturas parciais; flag `perdoada` a montante da captura; reembolso total com `refund_application_fee=true` no fluxo de perdão tardio.

**Fontes:** [Booking.com — cancellation fees & commission](https://partner.booking.com/en-us/help/reservations/reduce-cancellations/handling-cancellation-fees-and-commission) · [Booking.com — reporting no-shows](https://partner.booking.com/en-us/help/reservations/overbookings-no-shows/reporting-guest-no-shows-your-property) · [Philadelphia Inquirer — OpenTable 2% service fee](https://www.inquirer.com/food/restaurants/opentable-service-fee-no-show-restaurant-reservation-20260114.html) · [StyleSeat — booking fee / no-show protection](https://help.styleseat.com/articles/13612673-booking-fee) · [Fresha — no-show fees](https://www.fresha.com/help-center/knowledge-base/payments/617-charge-no-show-and-cancellation-fees) · [Stripe API — capture (application_fee_amount)](https://docs.stripe.com/api/payment_intents/capture) · [Stripe — pricing PT](https://stripe.com/en-pt/pricing)

---

## 8. Plano de prova da Fatia D (modo teste)

**Nível de confiança: ALTO** (cartões documentados pela Stripe; a limitação da expiração é estrutural).

### 8.1 Cartões de teste por cenário

| Cenário da Fatia D | Cartão | Comportamento |
|---|---|---|
| Setup ok + MIT ok (caminho feliz) | `4242 4242 4242 4242` | Tudo passa |
| Setup ok + **MIT ok garantido off-session** | `4000 0038 0000 0446` | Já "configurado" para off-session; MIT nunca pede SCA |
| Setup ok + **insufficient_funds off-session** (dunning!) | `4000 0082 6000 3178` | Attach/setup com 3DS passa; **todas** as cobranças falham com `insufficient_funds` |
| **authentication_required off-session** (fallback SCA) | `4000 0027 6000 3184` | Exige SCA em TODAS as transações, mesmo off-session — dispara o fluxo de recurso |
| SCA só se não houver setup | `4000 0025 0000 3155` | Off-session falha com `authentication_required` **se não** houve SetupIntent; com setup, passa — valida que o nosso setup está bem marcado |
| Decline genérico | `4000 0000 0000 0002` / `9995` | `generic_decline` / `insufficient_funds` imediatos (testar o gating por decline_code) |
| **Disputa após captura** (métrica 5 + provas) | `4000 0000 0000 0259` | Cobrança passa e é disputada como fraude — testar submissão do pacote de prova |
| EFW/risco | `4000 0000 0000 4954` / `4100 0000 0000 0019` | Radar highest risk (pode bloquear) |
| Incremental auth disponível (futuro IC+) | `4000 0584 0000 0063` | `incremental_authorization.status=available` |

Fluxo Connect a testar com conta connected de teste + payment method **clonado na hora** (plataforma → connected), exatamente como em produção.

### 8.2 Expiração de autorização e dunning sem esperar dias reais

- **Não há fast-forward:** os test clocks da Stripe só servem Billing/subscriptions, não PaymentIntents avulsos; em test mode as auths expiram no tempo real da rede (`capture_before` idêntico ao live).
- Estratégia em 3 camadas:
  1. **Unit/integração com relógio injetado:** o scheduler da Fatia D recebe `now()` injetável; simular D−4→D+7 em milissegundos contra `capture_before` fixados por fixture.
  2. **Webhooks sintéticos:** `stripe trigger charge.expired` (e `payment_intent.canceled`, `charge.dispute.created`, `radar.early_fraud_warning.created`) via Stripe CLI para provar os handlers ponta-a-ponta.
  3. **Uma prova real de calendário:** deixar 1 hold de teste expirar de verdade (Visa test ≈ 7 dias CIT / validar o valor devolvido em `capture_before`) para confirmar o evento e a máquina de estados — agendar isto cedo no desenvolvimento, corre em paralelo.
- Dunning: os retries testam-se com `4000 0082 6000 3178` (falha sempre → percorre D+1/D+3/D+7 com o relógio injetado) e com um cartão que "recupera": trocar o payment method do customer de teste entre retries (simula o cliente que repõe saldo).
- Métricas: cada teste E2E valida também as linhas em `eventos_pagamento` — o dashboard nasce testado.

**Fontes:** [Stripe — testing (cartões)](https://docs.stripe.com/testing?testing-method=card-numbers) · [Stripe — declines/testing off-session](https://docs.stripe.com/declines/codes) · [Stripe API — charge.expired](https://docs.stripe.com/api/events/types) · [Stripe — test clocks (âmbito Billing)](https://docs.stripe.com/billing/testing/test-clocks) · [Stripe — cloning para direct charges](https://docs.stripe.com/connect/cloning-customers-across-accounts)

---

## O que só se sabe medindo (e como medir no piloto)

1. **Decline rate MIT real em cartões PT (débito CGD/Millennium/Santander/Novobanco…):** não existe benchmark público. Medir com a métrica 3 (decline por BIN/emissor) nos primeiros 90 dias do piloto Lisboa·eventos; mínimo ~100 cobranças para um primeiro número com dignidade.
2. **Recovery real da cadência D+1/D+3/D+7:** métrica 8; ajustar a cadência ao fim de 90 dias (ex.: se D+3 recuperar pouco, deslizar para o dia 1/15).
3. **Reação PT ao hold em crédito** (reclamações/1000 holds): métrica de suporte; se >2%, reforçar o aviso pré-hold antes de mexer na mecânica.
4. **Taxa de conclusão do fallback SCA em 72h:** decide se o prazo é 72h ou mais.

---

*Relatório de investigação — não toca em código nem na BD. Preparado para o desenho da Fatia D (hold vivo + dunning).*
