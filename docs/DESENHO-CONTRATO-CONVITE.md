# HONRA — DESENHO FORMAL: CONTRATO-CONVITE ("aperto de mão por convite")

> **Estado:** desenho aprovado em brainstorm (13/07/2026), ZERO código escrito.
> **O que é:** a variante do aperto de mão para quando a outra parte **não tem conta
> Honra** — o profissional convida o cliente por link/QR (a partir do Honra Card),
> o cliente vê a prova, preenche um formulário, e assina um contrato curto com OTP.
> O compromisso do cliente sobe em três andares (sinal → cartão gravado → hold na
> semana do evento). O pagamento grande corre SEMPRE direto entre eles, fora do Honra.
> **O que NÃO é:** escrow. O Honra nunca guarda dinheiro de terceiros. Só segura
> (hold) e só cobra penalização a quem quebra o que assinou.
>
> Documentos-irmãos: `~/honra-app/ACORDAR.md` (motor de caução 2 toques, construído
> e provado), `docs/JURIDICO-CONTRATO-CONVITE.md` (investigação jurídica de 13/07
> — este desenho incorpora-a; ver 1.1), memórias `honra-caucao-mecanica`,
> `honra-posicionamento`, `didit-principio-design` ("mostrar, não dizer").

---

## 0. Porquê esta variante (em duas frases)

O motor dos 2 toques exige que as DUAS partes tenham conta e reputação em jogo — é
perfeito para o marketplace interno, mas o dinheiro grande do beachhead (eventos/
casamentos, DJ 500–1.200€, foto até 4.500€) vem de clientes que **não estão no
Honra** e nunca vão criar conta para contratar um fotógrafo uma vez na vida. O
Contrato-Convite leva o aperto de mão até eles: o profissional traz o cliente pelo
Honra Card, o Honra dá-lhe prova primeiro e só pede compromisso depois — e o
profissional deixa de trabalhar com medo do "desapareceu na véspera".

## 1. Decisões travadas (não re-litigar; desenha-se a partir daqui)

1. **Fluxo:** link/QR do Honra Card → convidado vê o **Honra Card primeiro**
   (identidade verificada, selo, historial) → preenche **formulário** (datas,
   serviço, valor — zero dinheiro nesta fase) → profissional **aceita** no Honra →
   gera-se um **contrato** curto e legível (modelo do Honra; anexos externos só
   REGISTADOS com hash+carimbo, nunca interpretados) → cliente **assina com OTP
   por SMS** (Bird, já vivo) via magic link.
2. **Três andares de compromisso do cliente:**
   a) **Sinal** pago direto ao profissional na assinatura (FORA do Honra; o
      contrato apenas o regista como cláusula).
   b) **Cartão gravado** (Stripe SetupIntent) na assinatura, com mandato explícito
      para a cláusula de cancelamento **escalonada no tempo**.
   c) **Hold de caução** (default 25%, janela 10–30%) armado automaticamente antes
      do evento (cron diário já existente — pg_cron).
3. **Checkpoint no dia 0/+1:** profissional confirma "recebi o pagamento total"
   (pago direto, fora do Honra) → hold liberta-se, 0€, negócio **honrado**.
   Cliente não paga/desaparece → **captura do hold**. Profissional dá ghost →
   hold do cliente liberta-se + **marca** de incumprimento no perfil dele.
4. **Assimetria deliberada:** o convidado põe em jogo o cartão; o profissional põe
   em jogo a reputação. Sem aperto simbólico de 2€ neste fluxo (o convidado não
   tem reputação a manchar — seria teatro).
5. **Avaliação desacoplada do fecho:** só depois de honrado, voluntária, magic
   link + OTP. Nunca condição para fechar.
6. **Níveis de proteção por contrato**, à escolha do profissional:
   (i) só contrato assinado; (ii) contrato + cartão gravado; (iii) contrato +
   cartão + hold.
7. **UX = escada de confiança:** prova antes de pedido; cartão em ÚLTIMO;
   Apple Pay/Google Pay à cabeça; o cartão apresentado pelo que o cliente GANHA
   ("proteção mútua — nada é cobrado a menos que canceles nos termos que
   assinaste").
8. **Sem escrow.** O Honra nunca guarda dinheiro de terceiros. Só holds e
   cobranças de penalização a quem quebra.

### 1.1 Correções vinculativas da pesquisa jurídica (13/07 — ver `JURIDICO-CONTRATO-CONVITE.md`)

A investigação jurídica (fontes primárias: DR, EUR-Lex, EBA, Stripe/Visa)
alterou três peças do brainstorm. Este desenho já as incorpora:

1. **O hold NÃO pode armar no dia −7.** Uma autorização off-session (MIT)
   expira em **~4 dias e 18 horas na Visa** (7 dias nas outras redes) — armado
   a −7 morreria a ~−2, ANTES do evento. O andar 3 foi redesenhado: **arma no
   dia −3**, com a captura MIT direta (modelo Fresha) como fallback vivo e a
   extended authorization como via comercial de v2 (ver 5 e 11.2).
2. **A captura NUNCA pode cair na conta Stripe do Honra** (perder-se-ia a
   exclusão de agente comercial — art. 5.º/b DL 91/2018, considerando 11 PSD2,
   EBA Q&A 2020_5354/5355 → atividade licenciável pelo Banco de Portugal). A
   estrutura segura: **Stripe Connect com DIRECT CHARGES na conta do
   profissional + application fee do Honra** (modelo OpenTable). Isto emenda a
   decisão 8 na parte "sem Connect": o Connect direct charges é justamente o
   que mantém o Honra FORA dos fundos — e torna literal o "captura a favor do
   freelancer" do brainstorm (ver 11.1).
3. **A exceção ao direito de arrependimento é o art. 17.º/1/k) do DL 24/2014**
   (não a al. l) e tem duas condições operacionais que passam a INVARIANTES do
   produto: **data do evento como campo obrigatório do contrato** + **aviso
   expresso de que não há direito de livre resolução** (art. 4.º/1/p — a
   omissão é contraordenação grave e faria o prazo de arrependimento saltar
   para 12 meses). Ver 4.3 e 8.1.

## 2. Atores

| Ator | Quem é | O que põe em jogo | Como age |
|---|---|---|---|
| **Profissional** (P) | perfil Honra, identidade verificada | a reputação (marca de incumprimento, taxa de honra) | na app, autenticado |
| **Cliente convidado** (C) | pessoa SEM conta Honra | o cartão (cláusulas que assinou) + o sinal (fora do Honra) | página pública, magic link + OTP |
| **Cron** (`resolver-convites`) | o relógio | — | arma holds, lembra, expira, resolve checkpoints, tenta cobranças |
| **Webhook Stripe** | o mensageiro do dinheiro | — | confirma SetupIntent, holds, cobranças, disputas |

Pré-condição imutável: **só profissionais com identidade verificada** podem gerar
convites e aceitar formulários (a mesma régua do motor de 2 toques — a guarda
`guarda_aceita_verificado` é o precedente). A prova vem antes do pedido: se o
Honra Card não tem selo, não há convite.

## 3. Fluxo narrativo (a escada de confiança)

```
 C abre o link/QR
   1º  HONRA CARD ─── prova: identidade ✓, selo, historial, escalão. Zero pedidos.
   2º  FORMULÁRIO ─── datas, serviço, valor. Zero dinheiro. Zero conta.
        (o Honra fica com nome + telemóvel do C — o mínimo para o contrato)
   3º  ESPERA ─────── P recebe no Honra e ACEITA (escolhe nível de proteção;
                      percentagens congelam no aceite)
   4º  CONTRATO ───── magic link por SMS → C lê o contrato curto do Honra
                      (datas, serviço, valor, sinal, cláusula de cancelamento
                       escalonada, anexos registados por hash)
   5º  ASSINATURA ─── OTP por SMS (Bird) → assinado
   6º  CARTÃO ─────── (níveis ii/iii) SÓ AGORA: Apple Pay / Google Pay à cabeça,
                      enquadrado pelo que o C ganha. SetupIntent + mandato.
   7º  SILÊNCIO ───── nada acontece até perto do evento. (nível iii: o hold
                      arma-se sozinho no dia −3; C é avisado no −4 — nunca é surpresa)
   8º  EVENTO ─────── pagamento grande DIRETO entre C e P, fora do Honra
   9º  CHECKPOINT ─── P confirma "recebi" → hold liberta, 0€, HONRADO
  10º  AVALIAÇÃO ──── dias depois, o HONRA convida C a avaliar (voluntário)
```

Princípio "mostrar, não dizer" aplicado: a página do convidado nunca escreve
"somos de confiança" — abre com o Honra Card (a prova) e cada pedido chega apenas
quando o degrau anterior o justificou. O verde só acende no que significa:
assinado, seguro, honrado.

## 4. Máquina de estados

### 4.1 Diagrama

```
 (link do Honra Card — permanente, não é um estado; cada submissão cria 1 contrato)
        │  C preenche o formulário                                    [C, página pública]
        ▼
 FORMULARIO_RECEBIDO
        ├── P recusa ───────────────────────────► RECUSADO             [P]   (C avisado por SMS)
        ├── 7 dias sem resposta de P ───────────► FORMULARIO_EXPIRADO  [cron] (C avisado)
        └── P ACEITA (nível + % congelam; contrato gera-se; magic link enviado a C)
        ▼                                                              [P]
 AGUARDA_ASSINATURA
        ├── C não assina em 72h (lembrete às 24h e 48h) ─► ASSINATURA_EXPIRADA [cron]
        ├── magic link morto/expirado ─► C pede link novo por SMS (mesmo estado)
        ├── (nível ii/iii) cartão falha ao gravar ─► fica aqui; C repete   [C]
        └── C assina: OTP válido  + (nível ii/iii) SetupIntent 'succeeded'
        ▼                                                              [C + webhook]
 ASSINADO ◄────────────────────────────────┐
        │   (níveis i e ii ficam aqui até ao evento)                   │
        │   nível iii: dia −3 → PaymentIntent off-session (MIT) na     │
        │   conta Connect de P (aviso a C no −4)                       │
        ├── autorização OK ────────────────► CAUCIONADO                │ [cron + webhook]
        ├── cartão recusado/exige 3DS ─────► CARTAO_FALHOU             │ [cron]
        │       ├── C repõe/autentica via magic link → re-arma ────────┘ [C]
        │       └── não reposto até −1 ────► SEM_CAUCAO (contrato vale;  [cron]
        │                                    quebra cobra-se por MIT direta — 6.3)
        ▼
 ─── DIA 0 (evento) ─── CHECKPOINT (D0 → D+1) ───
        ├── P: "Recebi o pagamento total" ──► HONRADO                  [P]
        │        hold libertado (0€). Avaliação desbloqueia (voluntária).
        ├── P: "O cliente não pagou / faltou" ─► INCUMPRIDO_CLIENTE    [P → servidor]
        │        CAUCIONADO → captura do hold; SEM_CAUCAO/nível ii →
        │        cobrança off-session da % de caução; nível i → só registo.
        └── P em silêncio até D+1 de manhã ──► INCUMPRIDO_PROFISSIONAL [cron]
                 hold de C libertado (0€) + MARCA no perfil de P.
                 (inação = default; nunca se julga acusação, julga-se ação)

 CANCELAMENTOS (possíveis a partir de ASSINADO / CAUCIONADO / SEM_CAUCAO):
        ├── mútuo (P propõe OU C propõe; o outro confirma — 2 toques)
        │        ──► CANCELADO_MUTUO   holds libertados, 0€, sem marca. [P+C]
        │            (o sinal é assunto entre eles; o contrato regista a devolução acordada)
        ├── C cancela a > X meses do evento (X do contrato, default 2)
        │        ──► CANCELADO_ESCALAO_1   0€ via Honra (perde só o sinal — fora do Honra)
        ├── C cancela entre X meses e o dia −8
        │        ──► COBRANCA_PENDENTE ── off-session % média (10–15%)  [servidor]
        │               ├── cobrado ─────► CANCELADO_ESCALAO_2
        │               └── falha SCA/recusa → magic link "conclui o cancelamento"
        │                     + retentativas (D+1, D+3, D+7) ─► COBRANCA_INCOBRAVEL
        │                     (registado no contrato; P avisado; sem marca — C não tem perfil)
        ├── C cancela do dia −7 em diante → deve a % de caução (o PREÇO é do tempo)
        │        ├── hold já armado (≥ dia −3) → captura ─► CANCELADO_ESCALAO_3 [servidor]
        │        └── hold ainda não armado (−7…−4) ou falhado → cobrança MIT
        │            direta da % caução (ramo COBRANCA_PENDENTE, valor do escalão 3)
        └── P cancela unilateralmente
                 ──► CANCELADO_PROFISSIONAL   hold/cartão de C intocados, 0€;
                     MARCA no perfil de P se a ≤ 30 dias do evento.     [P]

 REMARCAÇÃO (ver 6.1): não é estado — é uma ADENDA assinada pelos dois que
 recalcula os relógios; se havia hold e a nova data sai da janela viva da
 autorização, o hold liberta-se e o contrato volta a ASSINADO (re-arma no novo dia −3).
```

### 4.2 Estados — resumo

| Estado | Quem lá chega | Dinheiro | Terminal? |
|---|---|---|---|
| `formulario_recebido` | C (função pública) | nenhum | não |
| `recusado` | P | nenhum | sim |
| `formulario_expirado` | cron | nenhum | sim |
| `aguarda_assinatura` | P (aceitou) | nenhum | não |
| `assinatura_expirada` | cron | nenhum | sim |
| `assinado` | C (OTP) + webhook (SetupIntent) | cartão gravado (ii/iii) | não |
| `caucionado` | cron −3 + webhook | hold ativo (% caução) | não |
| `cartao_falhou` | cron −3 | nenhum (a re-pedir) | não |
| `sem_caucao` | cron −1 | cartão gravado, sem hold | não |
| `honrado` | P (checkpoint) | hold libertado, 0€ | sim (abre avaliação) |
| `incumprido_cliente` | P → servidor | captura/cobrança | sim |
| `incumprido_profissional` | cron | hold libertado + marca em P | sim |
| `cancelado_mutuo` | P+C (2 toques) | 0€ | sim |
| `cancelado_escalao_1/2/3` | C → servidor | 0€ / 10–15% / captura | sim |
| `cobranca_pendente` → `…_incobravel` | servidor | tentativas MIT | não → sim |
| `cancelado_profissional` | P | 0€ (marca em P se ≤30d) | sim |

### 4.3 Guardas e timers

- **Guarda de integridade (espelho da 005/007):** TODAS as transições com
  dinheiro/prova são exclusivas do servidor (service_role). Ao cliente da app (P)
  só se permitem, via Edge Function, as ações declaradas: aceitar/recusar,
  checkpoint, cancelar, propor remarcação. O convidado NUNCA toca na BD — só fala
  com Edge Functions públicas guardadas por token+OTP. Trigger novo
  `guarda_ciclo_convite` na tabela nova, com a mesma filosofia da
  `guarda_ciclo_caucao`.
- **Percentagens congeladas no aceite:** `pct_caucao` (10–30, default 25),
  `pct_cancelamento` (10–15), `janela_x_meses` e o **nível de proteção** gravam-se
  no contrato quando P aceita e **nunca mais mudam** (ver 6.7). O mandato que C
  assina refere estes números exatos — mudá-los depois invalidaria o consentimento.
- **Timers (todos servidos pelo cron diário; horas em UTC):**
  - formulário sem resposta de P: **7 dias** → expira.
  - assinatura: **72h** (lembretes 24h/48h) → expira.
  - magic link: validade **72h**, uso ilimitado dentro da validade mas SEMPRE com
    OTP para agir; reemissão por SMS a pedido.
  - hold: arma no **dia −3** (a janela MIT da Visa é ~4d18h — ver 11.2),
    avisando C no **dia −4** ("amanhã vamos reservar X% no teu cartão, como
    assinaste"). Validar SEMPRE o `capture_before` real do hold em runtime —
    as janelas das redes mudam por circular.
  - `cartao_falhou`: retentativa diária até ao **dia −1**; depois `sem_caucao`.
  - checkpoint: P age até **D+1 de manhã** (lembretes: D0 de manhã, D0 à noite);
    o cron resolve em D+1 — com ~18h de folga dentro da janela Visa MIT do hold
    armado a −3 (expira ~D+2 de madrugada).
  - cobrança falhada: retentativas **D+1, D+3, D+7** → incobrável.
  - avaliação: convite a C **D+2** após honrado; janela de **14 dias**.
- **Invariantes legais do formulário e do contrato (não configuráveis — ver 1.1):**
  1. **A data do evento é campo OBRIGATÓRIO.** Sem data (ou período) específica
     não há contrato-convite — é a data que sustenta a exceção ao arrependimento
     do art. 17.º/1/k do DL 24/2014. O formulário não submete sem ela; a BD
     recusa-a nula; o template do contrato imprime-a em destaque.
  2. **Aviso expresso de que NÃO há direito de livre resolução** (art. 4.º/1/p
     do DL 24/2014), mostrado ANTES da assinatura e repetido no texto do
     contrato, com a aceitação registada em `eventos_convite`. A omissão é
     contraordenação grave (ASAE) e faria o prazo de arrependimento saltar
     para 12 meses.
  3. **Política de cancelamento junto ao botão de assinar**, com valores
     concretos e aceitação explícita (regra Visa "properly disclosed") — é
     também a primeira peça de evidência anti-chargeback.

## 5. Os três andares do compromisso (cada ferramenta para o seu tempo)

| Andar | Instrumento | Quando morde | O que cobre |
|---|---|---|---|
| 1. Sinal | dinheiro direto C→P na assinatura (fora do Honra) | desde o dia 1 | o compromisso longínquo; cancelamento no escalão 1 "custa" só isto |
| 2. Cartão gravado + mandato | SetupIntent; cobrança off-session 10–15% | do fim do escalão 1 até ao dia −8 | a janela média, onde o sinal já não chega e a % de caução ainda não é devida |
| 3. % de caução (default 25%) | **hold** (PaymentIntent manual, do dia −3 ao checkpoint) OU **cobrança MIT direta** (dias −7…−4, ou se o hold falhar) | os últimos 7 dias + o próprio evento (no-show, "não pagou") |

O desenho separa o PREÇO do MEIO: o preço da quebra é função do TEMPO (escalão 1
até X; escalão 2 de X ao dia −8; escalão 3 = % de caução nos últimos 7 dias); o
meio é o instrumento vivo nesse momento. O hold — a forma mais forte do escalão
3 — só pode nascer no **dia −3**: a janela MIT da Visa é ~4d18h e, armado antes,
morreria antes do evento (ver 1.1 e 11.2). Entre −7 e −4, ou quando o hold
falha, o mesmo preço cobra-se por MIT direta ao cartão gravado. Nunca há dois
instrumentos a morder ao mesmo tempo; nunca há um vazio de preço.

O texto do mandato (assinado com o OTP) é a peça jurídica central: autoriza
explicitamente (a) guardar o cartão, (b) a cobrança off-session da % de
cancelamento nos escalões e datas exatos do contrato, (c) a reserva (hold) da %
de caução na semana do evento e a sua captura nos casos descritos. Texto curto,
em português corrente, com os números do contrato — não um wall of legalês.
Duas exigências da pesquisa jurídica: o mandato tem de **nomear P como
beneficiário** (EBA Q&A 2019_4794 — é ele o merchant of record no Connect,
ver 11.1); e a penalização redige-se como **cláusula penal** (art. 810.º CC),
nunca como "sinal" (o rótulo importaria o regime do dobro do art. 442.º/2 CC
contra P). O "sinal" da decisão 2a) — o pagamento real feito fora do Honra —
deve chamar-se "adiantamento" no template; a palavra final é do advogado.

## 6. Casos-limite (obrigatórios)

### 6.1 Remarcação da data do evento
- É uma **adenda**, não um contrato novo: P propõe (ou C pede por magic link),
  o OUTRO confirma — dois toques, como o `cancelar-mutuo`. A adenda regista-se
  (hash + carimbo) e os relógios recalculam.
- Se já havia hold e a nova data sai da janela viva da autorização (validar
  pelo `capture_before` real): **liberta-se o hold** (a janela do Stripe não
  estica) e o contrato volta a `assinado`; re-arma no novo dia −3. C é avisado
  ("a reserva foi libertada; volta a fazer-se a 3 dias da nova data").
- Os escalões de cancelamento recalculam sobre a NOVA data. Anti-abuso: remarcar
  dentro do escalão 2/3 não apaga o passado — o contrato guarda o histórico de
  adendas; remarcações em catadupa (>2) exigem cancelamento mútuo + contrato novo.
- O valor e a % **não** se alteram por adenda (mandato); mudar valor = contrato novo.

### 6.2 Cancelamento de comum acordo
- Sempre possível, sempre 0€ via Honra, **sem marca** para ninguém (o precedente
  do motor 2 toques mantém-se: afunilar o cancelamento, nunca o transformar em
  arma). O destino do sinal é assunto entre eles; a adenda de cancelamento tem um
  campo livre "acordámos que…" que fica registado, não garantido.

### 6.3 O cartão falha/expirou quando o cron tenta armar o hold (dia −3)
- Estado `cartao_falhou`. C recebe SMS com magic link "o teu cartão não deixou
  reservar a caução — repõe em 1 minuto" → página com Payment Element (Apple/
  Google Pay primeiro) para atualizar o método OU autenticar 3DS se for só SCA.
- Retentativa automática diária até ao dia −1. Sem reposição: `sem_caucao` —
  o contrato **continua válido** (o mandato de cancelamento continua a valer),
  P é avisado com franqueza ("a proteção deste contrato caiu para o nível
  contrato+cartão"). Não se cancela o negócio por causa disto: o contrato é o
  chão, o hold é o teto.
- No checkpoint, um `sem_caucao` com cliente fugido resolve-se por **cobrança
  off-session da % de caução** (mesmo mandato) — com a taxa de sucesso que
  tiver. É o modelo Fresha — a alternativa (b) de 11.2 — já a viver dentro do
  desenho como fallback.

### 6.4 Cobrança off-session falha (SCA / MIT — PSD2)
- Todas as cobranças sem a pessoa presente são **MIT** (merchant-initiated),
  apoiadas no mandato criado no SetupIntent (isenção de SCA da PSD2 para MIT).
  Ainda assim o emissor PODE recusar ou exigir autenticação.
- Fluxo de recuperação: `cobranca_pendente` → SMS com magic link "conclui o
  cancelamento que pediste" (paga com 3DS, a pessoa presente — vira CIT) →
  retentativas D+1/D+3/D+7 → `cobranca_incobravel`.
- Incobrável é registado no contrato e mostrado a P com honestidade. **Não há
  marca para C** (não tem perfil onde marcar) — mas o telefone de C fica com
  registo interno de incumprimento (ver 7.2): se um dia criar conta ou voltar a
  assinar um convite, o Honra sabe (anti-reincidência, não exposto publicamente).
- Fronteira honesta: **o andar 2 é probabilístico**. O Honra promete a tentativa
  bem armada (mandato + retentativas + recuperação por link), não o sucesso — é
  por isso que a semana crítica pertence ao hold (esse, uma vez armado, captura
  sem re-SCA — provado no motor atual).

### 6.5 Chargeback (disputa do cartão)
- Evidência guardada por desenho, desde o primeiro toque (tabela `eventos_convite`,
  append-only): formulário submetido (conteúdo + IP + user-agent + timestamp),
  SMS enviados, OTP verificado (telefone, momento, id do envio Bird), texto
  integral do contrato + hash, momento da assinatura, texto do mandato aceite,
  avisos de véspera do hold, ação (ou silêncio) no checkpoint.
- Ao `charge.dispute.created` (webhook): estado do contrato NÃO muda; abre-se um
  registo de disputa, P é avisado, e a resposta ao Stripe monta-se com o pacote de
  evidência acima (contrato assinado com OTP no telefone do titular é uma defesa
  forte para "produto/serviço não recebido"; menos forte para "fraude" — risco
  aberto, ver 12).
- Se a disputa for perdida, o dinheiro capturado sai (mais a taxa de disputa) —
  registado no contrato; P informado com verdade.

### 6.6 Evento multi-dia
- O formulário aceita `data_inicio` e `data_fim`. TODOS os relógios do dinheiro
  ancoram na **data de liquidação** — por omissão a `data_inicio` (é aí que o
  no-show acontece), com opção de P a marcar "pagamento no fim" → ancora na
  `data_fim`. Hold arma a −3 da âncora; checkpoint em âncora+0/+1.
- Restrição dura da janela MIT (~4d18h na Visa): âncora no início + evento de N dias
  significa que o hold JÁ FOI resolvido quando o evento acaba (o hold protege o
  arranque e o pagamento, não a execução — igualzinho ao motor 2 toques, que
  protege o arranque e deixa a entrega para a reputação). Dizê-lo a P sem rodeios
  no momento de escolher a âncora.

### 6.7 O profissional quer baixar o nível de proteção a meio
- **Não pode.** Nível e percentagens congelam no aceite e constam do mandato
  assinado. Subir também não (pedir mais a C do que ele consentiu = novo
  consentimento). Único caminho: cancelamento mútuo + convite novo. A UI nem
  mostra a opção — mostra o porquê ("este contrato ficou selado como foi
  assinado").

### 6.8 Cliente estrangeiro (moeda, 3DS)
- v1: contratos **só em EUR** (o Honra é PT-first; a conversão é do emissor do
  cartão de C — transparente para P). Coluna `moeda` existe desde já, fixa a
  'EUR', para não doer depois.
- SetupIntent na assinatura é com a pessoa presente → 3DS corre normalmente para
  cartões UE; cartões fora do EEE nem exigem SCA (PSD2 não aplica) — a cobrança
  off-session tende a ser MAIS fiável nesses. Apple Pay/Google Pay primeiro
  ajuda em ambos (token de rede, menos recusas).
- SMS internacionais via Bird: custam mais e entregam pior em algumas redes —
  e-mail como canal de reserva para o magic link (o OTP fica sempre no SMS; se o
  SMS não entrega, a assinatura não acontece — fronteira honesta, registada).

### 6.9 Formulário expira sem aceitação
- 7 dias sem P responder → `formulario_expirado`; C recebe SMS honesto ("o
  profissional não confirmou; nada foi guardado do teu cartão — não chegámos a
  pedi-lo"). Silêncio repetido de P (3 formulários expirados em 90 dias) baixa a
  "taxa de resposta" no Honra Card — a reputação é viva; ignorar convidados
  também é conduta.

### 6.10 Morte do magic link
- Links têm token de uso único por SESSÃO de página, validade 72h, invalidados ao
  serem usados para AGIR (assinar/pagar/confirmar). Um link morto nunca é beco:
  a página oferece sempre "envia-me um link novo" (rate-limited, mesmo padrão
  45s/reenvio do `verificar-contacto`).
- O link **identifica**; só o OTP **autentica**. Ver o contrato exige link válido;
  assinar/cancelar/repor cartão exige link + OTP fresco. Roubo do telefone de C é
  o limite deste modelo (igual a toda a indústria de OTP) — registado nas
  fronteiras.

## 7. Esboço de dados

### 7.1 Tabelas novas

**`clientes_convidados`** — a pessoa sem conta.
- `id`, `nome`, `telefone` (E.164, **em claro** — ver nota RGPD), `email`
  (opcional), `stripe_customer_id`, `criado_em`.
- Unicidade suave por telefone (o mesmo C em vários contratos = a mesma linha).
- ⚠️ Diferença deliberada face ao motor: a `022` só guarda **hash** do telefone
  (verificação de contacto de quem TEM conta). Aqui o telefone em claro é
  **necessário** (enviar SMS, identificar a parte no contrato, defender
  disputas). Base legal distinta, retenção distinta — não misturar as tabelas.

**`contratos_convite`** — o contrato e a sua máquina de estados.
- Identidade: `id`, `profissional_id` → perfis, `cliente_convidado_id`.
- Negócio: `servico` (texto), `data_inicio` (**not null — invariante legal,
  ver 4.3**), `data_fim`, `ancora_liquidacao` ('inicio'|'fim'), `valor_total`
  (cêntimos), `moeda` ('EUR'), `sinal_valor` (o adiantamento fora do Honra —
  registado, nunca movido pelo Honra).
- Proteção (congelada no aceite): `nivel_protecao` (1|2|3), `pct_caucao`
  (10–30, default 25), `pct_cancelamento` (10–15), `janela_x_meses` (default 2).
- Contrato: `contrato_texto`, `contrato_hash`, `mandato_texto`, `mandato_hash`.
- Stripe: `setup_intent_id`, `payment_method_id`, `hold_id` (PaymentIntent),
  `cobranca_id` (PaymentIntent da penalização, se houver). TODOS os objetos
  Stripe vivem na **conta Connect de P** (direct charges — ver 11.1); o
  contrato guarda `stripe_account_id` desnormalizado (a conta de P pode mudar,
  o contrato não).
- Avisos legais: `aviso_resolucao_aceite_em` (art. 4.º/1/p) e
  `politica_cancel_aceite_em` (click-to-accept da política, regra Visa) —
  a assinatura é recusada enquanto forem nulos.
- Máquina: `estado` (check com os estados da secção 4), `quem_falhou`
  ('cliente'|'profissional'|null), `motivo_cancelamento`.
- Relógio: `formulario_em`, `aceite_em`, `assinado_em`, `cartao_gravado_em`,
  `hold_armado_em`, `checkpoint_em`, `resolvido_em`.
- RLS: P vê/lista os seus; C não tem acesso direto NENHUM à BD (tudo via Edge
  Function pública com token). Trigger `guarda_ciclo_convite` (espelho da 005).

**`contas_connect`** — a conta Stripe Express de P (pré-requisito dos níveis ii/iii).
- `perfil_id` (pk → perfis), `stripe_account_id`, `charges_enabled` (estado do
  onboarding, atualizado pelo webhook `account.updated`), `atualizado_em`.
- Convém recolher aqui o **NIF de P** no onboarding — mata dois coelhos: o
  Express pede-o e a DAC7 (Lei 36/2023) vai exigi-lo para o reporte à AT.

**`adendas_convite`** — remarcações e acordos, append-only.
- `contrato_id`, `tipo` ('remarcacao'|'cancelamento_mutuo'), `dados` (datas
  novas / acordo do sinal), `proposto_por`, `confirmado_em`, `hash`, `criado_em`.

**`anexos_convite`** — os anexos externos de P, registados e nunca interpretados.
- `contrato_id`, `nome_ficheiro`, `sha256`, `tamanho`, `storage_path` (bucket
  privado `contratos-convite`), `criado_em` (o carimbo temporal).
- O contrato do Honra referencia-os por nome+hash+carimbo ("Anexo A, registado a
  X"), com a fronteira escrita no próprio contrato: o Honra atesta EXISTÊNCIA e
  INTEGRIDADE à data, não conteúdo.

**`magic_links_convite`**
- `token_hash` (nunca o token), `contrato_id`, `finalidade` ('rever'|'assinar'|
  'cancelar'|'repor_cartao'|'remarcar'|'avaliar'), `expira_em`, `usado_em`,
  `criado_em`. RLS sem policies (só service_role) — padrão da `023`.

**`otp_convidado`** — o OTP de quem não tem perfil.
- Espelho da `otp_contacto` mas com chave `cliente_convidado_id` + `contrato_id`
  (a 023 é keyed por `perfil_id` — não serve para convidados): `codigo_hash`,
  `expira_em`, `tentativas`, `enviado_em`. Mesmo padrão: gerar → hash → Bird
  envia → validar; rate-limit 45s; máx. tentativas.

**`eventos_convite`** — a memória probatória, append-only, só service_role.
- `contrato_id`, `tipo` (formulario|sms_enviado|otp_ok|assinatura|mandato|
  hold_armado|hold_falhou|checkpoint|cancelamento|cobranca|disputa|…),
  `ip`, `user_agent`, `payload` (jsonb), `criado_em`.
- É daqui que sai o pacote de evidência de chargeback e a linha do tempo no ecrã
  de P.

**`avaliacoes_convidado`** — a avaliação do C (ver tensão 11.4).
- `contrato_id` (único — 1 avaliação), `cliente_convidado_id`,
  `profissional_id`, `nota`, `texto`, `otp_confirmado_em`, `criado_em`.
- Tabela PRÓPRIA, não a `avaliacoes`: a policy existente exige
  `auth.uid() = de_perfil` e o double-blind da 015 pressupõe dois perfis. A
  avaliação de convidado é unidirecional (C→P), sem selagem double-blind, pesada
  de forma diferente no índice (a decidir na construção do índice, fora deste
  desenho). Só após `honrado`, via magic link + OTP re-confirmado.

### 7.2 RGPD (dados de pessoa sem conta — levar a sério)

- **Bases legais:** dados do formulário, telefone, contrato, assinatura, cartão
  (tokenizado no Stripe, nunca no Honra) → art. 6(1)(b), diligências
  pré-contratuais e execução de contrato **de que C é parte**. IP/user-agent/
  evidência antifraude e o registo interno anti-reincidência → art. 6(1)(f),
  interesse legítimo (defesa contra fraude e disputas), documentado em LIA.
- **Informação:** a página do formulário diz, antes do submit, em 3 linhas
  humanas: o que guardamos, para quê, quanto tempo, e o link da política. O
  primeiro SMS identifica o Honra e o P.
- **Retenção (proposta v1, alinhada com a pesquisa jurídica; fixar com o
  advogado):** evidência mínima (contrato, hashes, logs de assinatura) por
  **5-6 anos** após estado terminal — a posição defensável do doc jurídico (o
  teto teórico de 20 anos do art. 309.º CC não passa a proporcionalidade da
  CNPD); **minimizar cedo** o resto: telefone, nome e texto livre apagados logo
  que deixem de ser precisos para disputas ativas. `formulario_expirado` /
  `recusado` sem assinatura = apagar dados pessoais aos **90 dias** (não chegou a
  haver contrato — não há base para reter).
- **Direitos:** acesso/portabilidade/apagamento por canal simples (email do
  suporte + verificação por OTP no telefone registado). Apagamento é limitado
  enquanto houver contrato ativo ou disputa possível (6(1)(b)/(f) prevalecem) —
  dizer isto com franqueza na política, não em rodapé.
- **Minimização:** NÃO pedir morada, NIF, data de nascimento no formulário. O
  contrato v1 vive com nome + telefone verificado. (Se o enquadramento jurídico
  do contrato vier a exigir mais identificação, é decisão consciente a tomar —
  não default.)
- O `eliminar-conta` (RGPD de quem tem conta) NÃO cobre convidados — fluxo novo,
  manual em v1 (volume será baixo), com registo do pedido em `pedidos_conta`
  (reutilizável com coluna para convidados).

### 7.3 O que se REUTILIZA vs. o que é NOVO

| Peça existente | Reutiliza-se? | Como |
|---|---|---|
| Holds Stripe `capture_method=manual` (padrão provado: autorizar → capturar/cancelar sem re-SCA) | ✅ | mesmo padrão; muda a ORIGEM (off-session/MIT em vez de Checkout presencial) |
| `stripe-webhook` | ✅ estende-se | novos eventos: `setup_intent.succeeded`, `payment_intent.amount_capturable_updated` (hold armado), `payment_intent.payment_failed`, `charge.dispute.created`, `account.updated` (Connect). Nota: os eventos das contas ligadas chegam por endpoint de webhook **Connect** próprio — configurar ao lado do existente |
| `resolver-caucoes` + pg_cron diário | ✅ padrão / ➕ função nova | função irmã `resolver-convites` no MESMO cron (não inchar a existente — relógios diferentes, tabela diferente) |
| `criar_aviso` + sino + push | ✅ | para o lado de P (todas as transições geram aviso a P) |
| Bird SMS (`verificar-contacto`: gerar→hash→enviar→validar, rate-limit) | ✅ padrão | função nova para convidados (auth por token, não por JWT) |
| `guarda_ciclo_caucao` (filosofia: dinheiro só do servidor) | ✅ padrão | trigger novo na tabela nova |
| Honra Card (`honra-card.tsx`) | ✅ | é a porta de entrada; ganha o link/QR "pede-me orçamento" |
| `orcamentos` + motor 2 toques | ❌ NÃO se toca | o contrato-convite é tabela e máquina PRÓPRIAS; um convidado que crie conta um dia entra no motor normal |
| `avaliacoes` / double-blind 015 / On-Honra 016 | ❌ | tabela própria `avaliacoes_convidado` (ver 11.4) |
| `otp_contacto` (023) | ❌ | keyed por perfil; convidado não tem — tabela irmã |

## 8. Superfícies

### 8.1 Página pública do convidado (web, rota `/c/…` na build web existente)
1. **Convite** (`/c/<handle-ou-token-do-card>`): o Honra Card em grande — selo,
   escalão, historial, taxa de honra. Um botão: "Pedir orçamento/data". Nada mais.
2. **Formulário:** serviço, **datas (obrigatórias — invariante legal 4.3;** o
   `CampoData` já existe), valor se conhecido, nome, telemóvel. Aviso RGPD de
   3 linhas. CAPTCHA leve + rate-limit por IP (função pública = alvo de spam).
3. **Contrato** (magic link): o contrato curto do Honra, legível num ecrã de
   telemóvel; a **data do evento em destaque**; anexos listados com hash+carimbo
   e a fronteira escrita; a cláusula de cancelamento como LINHA DO TEMPO visual
   (hoje → X meses → −8 → evento), não como parágrafo; e o aviso legal, claro e
   antes do passo de assinar: "Este contrato tem data de execução específica —
   não existe direito de livre resolução de 14 dias (art. 17.º/1/k do DL
   24/2014). Aplica-se a política de cancelamento acima."
4. **Assinatura:** imediatamente acima do botão, a política de cancelamento com
   os **valores concretos** e caixa de aceitação explícita (regra Visa
   "properly disclosed") + o aviso de não-resolução. Depois: OTP de 6 dígitos
   por SMS. Verde acende no "Assinado".
5. **Cartão** (níveis ii/iii, só DEPOIS de assinado): Apple Pay/Google Pay à
   cabeça, cartão manual em baixo; título pelo ganho ("Proteção mútua deste
   contrato"), subtítulo honesto ("Nada é cobrado a menos que canceles nos termos
   que assinaste. Reserva de X% a 6 dias do evento, devolvida no dia.").
6. **Estado** (o mesmo link, sempre vivo): linha do tempo do contrato — assinado ✓,
   reserva a −6, evento, honrado. É também aqui que se cancela, se pede
   remarcação, se repõe o cartão.
7. **Avaliação** (magic link próprio, pós-honrado): 1 nota + texto, OTP, obrigado.

### 8.2 Ecrãs novos do profissional (na app)
- **Convites** (secção nova em Orçamentos ou tab própria): formulários recebidos
  com o essencial (quem, quando, quanto) + Aceitar (escolhe nível, vê as
  percentagens congelarem) / Recusar.
- **Detalhe do contrato:** a MESMA linha do tempo que C vê (verdade única), mais
  o que só P vê: nível de proteção, estado do cartão/hold com honestidade
  ("caução reservada" / "cartão falhou — avisámos o cliente"), anexos (upload →
  hash na hora), ações (cancelar, propor remarcação).
- **Checkpoint:** no dia do evento, o contrato sobe ao topo com dois botões:
  "Recebi o pagamento total" / "O cliente não pagou ou faltou". Prazo visível
  (D+1). O silêncio tem preço e o ecrã di-lo uma vez, sem dramatizar.
- **Definições → Contrato-convite:** defaults de P (nível, pct_caucao,
  pct_cancelamento, janela X) — aplicados a convites FUTUROS, nunca aos vivos.
- **Receber proteções (Connect):** onboarding Stripe Express de P via Account
  Link — **pré-requisito para escolher os níveis ii/iii** ("para a proteção
  cair na TUA conta, a Stripe precisa de te conhecer" — mostrar, não dizer:
  o gate explica-se pelo ganho). Estado visível e honesto; sem
  `charges_enabled`, os convites de P ficam limitados ao nível i.
- **Partilha:** o Honra Card ganha o QR/link "pede-me orçamento" (a pílula
  Credencial já existe — acrescenta-se o modo convite).

### 8.3 Mensagens ao convidado (SMS Bird; e-mail como espelho se existir)
| Momento | Canal | Conteúdo (tom: claro, curto, sem medo) |
|---|---|---|
| P aceitou | SMS | "O <nome> confirmou. Lê e assina o contrato: <link>" |
| Lembrete assinatura (24h/48h) | SMS | "O contrato com <nome> espera por ti: <link>" |
| Assinado | SMS | "Assinado ✓. Guarda este link — é o teu contrato: <link>" |
| Véspera do hold (D−4) | SMS | "Amanhã reservamos <X>% (<valor>€) no teu cartão, como assinaste. Devolvido no dia do evento: <link>" |
| Cartão falhou | SMS | "O teu cartão não deixou fazer a reserva. Repõe em 1 minuto: <link>" |
| Honrado | SMS | "Tudo certo com o <nome>. A reserva foi devolvida — 0€ cobrados." |
| Pedido de avaliação (D+2) | SMS | "Como correu com o <nome>? 30 segundos: <link>" |
| Cancelamentos/expirações | SMS | o que aconteceu + o que custa/custou, sem eufemismo |

Custo: ~0,04€/SMS (Bird prepaid) × ~8 SMS/contrato ≈ 0,32€/contrato — absorvível;
e-mail opcional corta os não-críticos.

## 9. Edge Functions novas (nome + responsabilidade)

| Função | JWT | Responsabilidade |
|---|---|---|
| `convite-formulario` | não (pública) | valida formulário + CAPTCHA/rate-limit; upsert do convidado; cria contrato em `formulario_recebido`; avisa P (sino/push) |
| `convite-decidir` | sim (P) | aceitar (congela nível+%; gera texto do contrato+mandato+hashes; cria magic link; SMS a C) ou recusar |
| `convite-pagina` | não (token) | devolve à página pública o estado + contrato + linha do tempo (leitura; valida token, nunca dá mais do que a finalidade permite) |
| `convite-otp` | não (token) | gerar/enviar/validar OTP do convidado (padrão Bird da `verificar-contacto`, rate-limit 45s, máx. tentativas) |
| `connect-onboarding` | sim (P) | cria/renova a conta Express de P + Account Link; devolve o estado (`charges_enabled`) — gate dos níveis ii/iii |
| `convite-assinar` | não (token+OTP) | valida os 2 aceites legais (4.3) + regista assinatura + evidência; nível ii/iii: cria SetupIntent **na conta Connect de P** (mandato embutido, P nomeado beneficiário) e devolve client_secret à página |
| `convite-cancelar` | ambos (P via JWT; C via token+OTP) | calcula o escalão à data; dispara captura/cobrança/libertação conforme; regista motivo e adenda |
| `convite-checkpoint` | sim (P) | "recebi" → liberta hold → `honrado`; "não pagou" → captura/cobrança → `incumprido_cliente` |
| `convite-remarcar` | ambos | propõe/confirma adenda de data; recalcula relógios; liberta+reprograma hold se preciso |
| `convite-avaliar` | não (token+OTP) | grava `avaliacoes_convidado` (só `honrado`, janela 14d, 1 por contrato) |
| `resolver-convites` | não (`x-resolver-secret`, cron) | expira formulários/assinaturas; avisa D−4; arma holds D−3 (off-session, na conta de P, validando `capture_before`); retentativas de cartão até D−1 → `sem_caucao`; lembretes de checkpoint; resolve D+1 (ghost de P); dunning de cobranças (D+1/D+3/D+7) |
| `stripe-webhook` (estende) | não | + `setup_intent.succeeded`, hold confirmado, `payment_intent.payment_failed`, `charge.dispute.created`, `account.updated` (via endpoint Connect próprio) |

Padrões herdados: CORS e formato de resposta das funções atuais; segredos já
existentes (`STRIPE_SECRET_KEY`, `BIRD_ACCESS_KEY`, `RESOLVER_SECRET`); cron
diário 09:00 UTC ganha a segunda chamada (ou o `cron-resolver.sql` passa a chamar
as duas funções).

## 10. Fronteiras de credibilidade (o que o Honra garante vs. não garante)

**O Honra garante:**
- que a identidade de P foi verificada e o historial mostrado é real (o motor
  de reputação existente);
- que o contrato exibido é o que foi assinado (hash + evidência + OTP no telefone
  de C);
- que os anexos registados existiam, com aquele conteúdo, àquela hora (hash +
  carimbo) — **existência e integridade, nunca validade jurídica nem conteúdo**;
- que o hold, uma vez armado, se resolve como o contrato diz (o padrão
  capturar/libertar sem re-SCA está provado ao vivo no motor atual);
- que nada é cobrado fora dos termos assinados, e que C é sempre avisado ANTES
  (véspera do hold — a captura nunca é surpresa);
- que o Honra **nunca guarda dinheiro de terceiros**: sem escrow, o pagamento do
  serviço e o adiantamento correm por fora, sempre — e as capturas/penalizações
  caem DIRETO na conta Stripe de P (direct charges); o Honra recebe apenas a
  sua application fee (11.1).

**O Honra NÃO garante:**
- o pagamento do serviço (corre fora do Honra — o Honra dá consequência ao
  calote, não o impede);
- o sucesso da cobrança off-session (andar 2 é probabilístico — mandato bem
  armado + retentativas + recuperação, não certeza);
- a qualidade do serviço de P (isso é a reputação, que este fluxo alimenta);
- o conteúdo dos anexos de P (registados, não interpretados);
- que o contrato do Honra vença em tribunal (é prova forte de acordo e
  consentimento, desenhada com evidência; não é aconselhamento jurídico — e o
  texto-modelo v1 DEVE passar por um advogado antes do live);
- a vitória de P nas disputas de cartão: no Connect, **P é o merchant of
  record — as disputas correm na conta dele**; o Honra monta o pacote de
  evidência, não assume o risco de chargeback (dizê-lo sem eufemismo no
  onboarding);
- proteção contra roubo do telefone de C (limite de todo o modelo OTP).

## 11. Tensões com o motor existente (apontadas, não escondidas)

### 11.1 ✅ RESOLVIDA (com estrutura): para onde vai o dinheiro capturado
O brainstorm dizia "captura **a favor do freelancer**"; a lei do motor 2€ dizia
"capturado → Honra, nunca à outra parte". A pesquisa jurídica resolveu o
impasse — nos dois sentidos:
- A captura **NUNCA pode cair na conta Stripe do Honra**: o Honra atua pelos
  dois lados (arma o hold contra C, cobra a favor de P), logo perde a exclusão
  de agente comercial (**art. 5.º/b DL 91/2018; considerando 11 PSD2; EBA Q&A
  2020_5354/5355**). Fundos na esfera do Honra = atividade licenciável pelo
  Banco de Portugal. O caminho "fica no Honra como taxa" morreu — não por
  escolha de produto, por lei.
- A estrutura segura é **Stripe Connect com DIRECT CHARGES na conta ligada
  (Express) de P + `application_fee_amount` para o Honra** (o modelo
  OpenTable): SetupIntent, hold e cobranças criam-se NA conta de P; **P é o
  merchant of record**; os fundos nunca tocam o Honra; a Stripe (STEL,
  Irlanda, C187865) é o PSP licenciado. Destination charges são zona cinzenta
  sem validação regulatória pública — **não usar**.
Consequências no desenho (já incorporadas):
- o onboarding Connect Express de P é **pré-requisito dos níveis ii/iii**
  (função `connect-onboarding`, tabela `contas_connect`, gate na escolha do
  nível — 8.2 e 9);
- a promessa "a favor do freelancer" passa a ser literal: a captura cai na
  conta de P, líquida da application fee do Honra;
- P assume o papel de merchant of record: refunds e **disputas correm na conta
  dele** (o Honra fornece o pacote de evidência — 6.5 e 10);
- as regras de captura mantêm-se AUTOMÁTICAS/contratuais (o Honra é agente
  técnico de P, nunca árbitro discricionário dos fundos) e a comunicação
  alinha-se: "o profissional cobra, a Stripe processa" — nunca "o Honra
  devolve/paga";
- fiscal (para o fiscalista): a fee do Honra cobra-se "em nome e por conta"
  de P (art. 4.º/4 CIVA); as penalizações são tendencialmente tributáveis em
  IVA (TJUE MEO C-295/17, Vodafone C-43/19) — quem as fatura é P.
Residual (não bloqueante, mas real): não há entendimento público do BdP sobre
marketplaces e a exclusão de agente comercial — ponderar consulta informal ao
canal fintech do BdP antes do live (perguntas do bloco B do doc jurídico).

### 11.2 A janela do hold MIT é ~4d18h (Visa) — o andar 3 mudou de forma
A pesquisa jurídica corrigiu uma premissa do brainstorm: os 7 dias provados ao
vivo no motor 2€ valem para holds **CIT** (autorização com a pessoa presente).
Um hold **off-session (MIT)** — o nosso, armado pelo cron com o cartão gravado
— expira em **~4 dias e 18 horas na Visa** (7 dias em Mastercard/Amex/
Discover). Armado a −7 morreria a ~−2, ANTES do evento; até um −6 morreria a
~−1. As três soluções em cima da mesa, e a escolha:
- **(a) ESCOLHIDA: armar no dia −3, com re-autorização se falhar.** Cobre −3
  até ~+1¾ na Visa (o checkpoint resolve em D+1 de manhã com ~18h de folga;
  mais folga nas outras redes). É a mais fiel ao motor existente: mantém o
  HOLD como forma do compromisso — segura-se com aviso, liberta-se a 0€, só se
  captura a quem foge — e reutiliza o padrão capturar/cancelar já provado.
  Cada re-autorização é uma nova MIT ao abrigo do mesmo mandato; a véspera
  honesta passa do −7 para o −4.
- **(b) documentada: sem hold — captura MIT direta só na quebra confirmada**
  (modelo Fresha). Sem gestão de expiração, mas sem garantia de fundos no
  momento da verdade. **Já vive no desenho como fallback**: é o que acontece
  em `sem_caucao` (6.3) e nos cancelamentos entre −7 e −4 — o preço do escalão
  3 cobra-se por MIT direta quando o hold não existe.
- **(c) documentada: extended authorization (Visa 29d18h / MC 30 dias)** —
  permitiria voltar ao −7 ou mais cedo, mas é **dependência COMERCIAL**: exige
  pricing IC+ negociado com a Stripe (+0,08% na Visa) e tem limites por
  rede/MCC. Fica para v2, se os dados mostrarem que 3 dias de cobertura são
  pouco para o vertical de eventos.
Consequências assumidas: (a) margem fina → o cron dos convites corre em
horário próprio, com alarme se falhar um dia, e valida SEMPRE o
`capture_before` real em runtime (as janelas mudam por circular das redes);
(b) multi-dia com liquidação no fim reduz a folga → âncora explícita (6.6);
(c) `dias_arme` é configuração, não constante.

### 11.3 MIT/off-session é terreno NOVO — o motor nunca lá esteve
Tudo o que está provado ao vivo (autorizar → capturar/cancelar sem re-SCA) foi
sempre iniciado **com a pessoa presente** (Checkout, SCA na hora). O
contrato-convite introduz duas operações **sem a pessoa**: armar o hold no −3 e
cobrar a penalização de cancelamento. O ENQUADRAMENTO legal está agora
confirmado pela pesquisa (o "modelo hoteleiro" da EBA — Q&A 2019_4792 e
2018_4131: SCA no setup do mandato, MIT fora do âmbito depois; e o mandato
pode ser recolhido pelo Honra como intermediário DESDE QUE nomeie P como
beneficiário — Q&A 2019_4794). O que resta é risco **operacional**: os
emissores honram a MIT *na maioria* dos casos, não em todos, e o 3DS do setup
**não dá liability shift** às capturas. A taxa real de recusa é desconhecida
até testarmos. O desenho absorve isto (estados `cartao_falhou`/`sem_caucao`/
`cobranca_pendente` + recuperação por magic link), mas a expectativa de P tem
de ser calibrada na UI: o nível iii é "quase sempre", não "sempre". Provar em
teste com cartões 4000-series de falha antes de prometer.

### 11.4 Avaliações e telefone: os módulos existentes não encaixam diretos
- `avaliacoes` exige `auth.uid()=de_perfil` (RLS) e o double-blind da 015
  pressupõe dois perfis → a avaliação de convidado precisa de **tabela própria**
  e de decisão posterior sobre o peso no índice/On-Honra (016) — não misturar
  sem pensar, senão o índice fica inflacionável por convites.
- `otp_contacto` (023) é keyed por `perfil_id` e a 022 só guarda hash do
  telefone → o convidado precisa de tabelas irmãs com telefone em claro e base
  legal própria (7.2). São *padrões* reutilizados, não *linhas* reutilizadas.
- O trigger de avisos (006) projeta transições de `orcamentos` → o contrato-convite
  precisa do seu próprio trigger de avisos (para P) + canal SMS (para C, que não
  tem sino).

## 12. Riscos abertos (honestos)

1. **Regulatório — RESOLVIDO COM ESTRUTURA; resta o residual (11.1).** Direct
   charges na conta de P + application fee mantêm o Honra fora dos fundos. Sem
   entendimento público do BdP sobre marketplaces e a exclusão de agente
   comercial, ponderar consulta informal prévia (canal fintech). Deixou de
   bloquear a construção da Fatia D em teste; o parecer do advogado (bloco B
   do doc jurídico) continua a ser porta para o LIVE.
2. **Validade do contrato-modelo** — a assinatura OTP/SMS está confirmada como
   assinatura eletrónica simples válida (art. 25.º eIDAS; TRP 2024/2026: ganha
   quem tem melhor audit trail — e o nosso `eventos_convite` é desenhado para
   isso). A fechar com o advogado: redigir a caução como **cláusula penal**
   (art. 810.º CC), nunca "sinal" (regime do dobro do art. 442.º/2 contra P);
   justificar cada escalão pelo dano típico (art. 19.º/c DL 446/85; o paralelo
   validado é o art. 25.º do DL 17/2018, viagens organizadas); contar com a
   redução equitativa (art. 812.º CC) se a data for reocupada — considerar
   **devolução automática se P re-preencher a data** (blinda a cláusula e
   enaltece o Honra); tipografia dos T&C ≥ corpo 11 / espaçamento ≥ 1,15
   (art. 21.º/i via Lei 32/2021, sob pena de nulidade). Upgrade barato de
   prova: **selo temporal qualificado (RFC 3161)** sobre o hash do contrato —
   presunção legal de data e integridade (art. 41.º/2 eIDAS) por cêntimos.
3. **Taxa de sucesso MIT desconhecida (11.3)** — enquadramento confirmado pela
   EBA; a execução é que é probabilística. Medir em teste antes de prometer
   números a P.
4. **Chargebacks** — sem liability shift do 3DS do setup para as capturas MIT;
   win rates da indústria ~45-54% brutos; e no Connect é **P quem leva a
   disputa** (merchant of record). Defesa: política "properly disclosed" junto
   ao botão com valor concreto e aceitação explícita (invariante 4.3) +
   pacote de `eventos_convite` nos campos certos do Stripe
   (`cancellation_policy_disclosure`, `customer_communication`,
   `service_documentation`). Fraude "não fui eu" continua a defesa mais fraca —
   Apple/Google Pay primeiro mitiga. Orçamentar perder uma fração; vigiar
   rácios (>0,9% na Visa = programa de monitorização).
5. **Spam/abuso do formulário público** — primeira superfície do Honra aberta a
   não-autenticados. CAPTCHA + rate-limit por IP + telefone verificado por OTP
   cedo… e ainda assim vai levar porrada. Monitorizar desde o dia 1.
6. **P a usar o convite para fugir ao motor interno** — dois clientes COM conta
   podiam preferir o convite (sem 2€ do lado de P… mas P não paga 2€; sem
   reputação simétrica). Regra simples v1: se o telefone de C corresponde a um
   contacto verificado de um perfil Honra, sugerir o motor normal (não bloquear —
   observar).
7. **Assimetria mal recebida** — C compromete o cartão, P "só" a reputação; um C
   letrado pode achar torto. A resposta é a transparência da escada (o C vê o
   historial de P e a marca que P leva se falhar) — mas é uma aposta de perceção,
   não uma certeza.
8. **Custo/entregabilidade de SMS internacionais** (6.8) e dependência do Bird
   num fluxo onde o SMS é o ÚNICO canal de autenticação do C.
9. **Obrigações "invisíveis" de plataforma** (do doc jurídico; disparadas por
   este fluxo, geridas fora dele): **DAC7** (Lei 36/2023 — reporte anual dos
   rendimentos de P à AT até 31/jan, MESMO com o pagamento fora do Honra,
   porque o preço consta do contrato guardado → recolher o NIF de P no
   onboarding Connect, ver `contas_connect`); **P2B** (termos claros,
   pré-aviso de 15 dias, parâmetros de ranking); **DSA mínimo** de
   micro-empresa (pontos de contacto, notice-and-action); **IVA das
   penalizações** (P fatura; o Honra cobra a sua fee "em nome e por conta").

## 13. Ordem de construção sugerida (fatias, tudo em modo de teste)

Cada fatia fecha redonda e prova-se no browser/telemóvel antes da seguinte —
como as fatias do motor.

- **Fatia A — o convite sem dinheiro (nível i quase inteiro).**
  Tabelas `clientes_convidados` + `contratos_convite` + `eventos_convite` +
  guarda; `convite-formulario` (com CAPTCHA/rate-limit) + `convite-decidir` +
  `convite-pagina`; página pública (Card → formulário → estado); ecrã Convites
  de P; avisos a P; expirações no `resolver-convites`.
  *Prova:* convidado sem conta pede, P aceita/recusa, tudo expira bem.
- **Fatia B — contrato + assinatura OTP (fecha o nível i).**
  Geração do texto+hashes; `magic_links_convite` + `otp_convidado` +
  `convite-otp` + `convite-assinar` (sem SetupIntent); SMS Bird ao convidado;
  anexos com hash+carimbo.
  *Prova:* contrato assinado com OTP real no telemóvel; link morto renasce; hash
  bate certo.
- **Fatia C — Connect + cartão gravado + mandato (nível ii).**
  Primeiro o alicerce regulatório: `connect-onboarding` + `contas_connect` +
  webhook `account.updated` (Express de P, com NIF; gate dos níveis ii/iii).
  Depois: SetupIntent no `convite-assinar` **criado na conta de P** (Apple/
  Google Pay primeiro; mandato com P nomeado beneficiário); webhook
  `setup_intent.succeeded`; ecrã do cartão na página pública;
  `convite-cancelar` com escalões 1 e 2 (direct charge off-session +
  application fee + dunning + `cobranca_incobravel`).
  *Prova:* onboarding Express em teste; cancelar em cada escalão com cartões
  de sucesso E de falha SCA; a captura a cair na conta de P e a fee do Honra
  a cair certa; recuperação por magic link.
- **Fatia D — o hold vivo (nível iii).** (Desbloqueada: a estrutura do
  dinheiro está decidida — 11.1. O parecer do advogado é porta para o LIVE,
  não para construir em teste.)
  `resolver-convites` completo (aviso −4, arme −3 na conta de P com validação
  do `capture_before` em runtime, retentativas até −1, `sem_caucao`);
  `convite-checkpoint`; resolução D+1 (ghost de P + marca); webhook dos holds;
  escalão 3 do cancelamento (captura, ou MIT direta se não houver hold).
  *Prova:* o teste dos 2 telemóveis outra vez — honrado (0€), cliente fugido
  (captura na conta de P + fee), P fantasma (libertação + marca), cartão que
  falha no −3; repetir com cartão Visa E Mastercard (janelas MIT diferentes).
- **Fatia E — remarcação + cancelamento mútuo.**
  `adendas_convite` + `convite-remarcar`; liberta-e-rearma o hold; cancelamento
  mútuo de ponta a ponta.
  *Prova:* remarcar com hold armado; escalões recalculados sobre a data nova.
- **Fatia F — avaliação do convidado + chargeback + RGPD.**
  `avaliacoes_convidado` + `convite-avaliar`; `charge.dispute.created` + pacote
  de evidência; retenção/minimização (job de limpeza aos 90 dias/3 anos);
  exposição no perfil de P (com o peso decidido).
  *Prova:* avaliar só depois de honrado; disputa de teste gera o pacote; limpeza
  apaga o que deve e só o que deve.

Transversal, antes do live (não é fatia, é porta): revisão jurídica do
contrato-modelo + mandato (perguntas dos blocos A e B do doc jurídico) e a
eventual consulta informal ao BdP — a estrutura do dinheiro já está desenhada
(11.1); falta o carimbo, não a decisão.

---

*Desenho escrito a 13/07/2026 a partir do brainstorm com o Vítor e reconciliado
no mesmo dia com a investigação jurídica (`JURIDICO-CONTRATO-CONVITE.md` —
secção 1.1 lista as três correções vinculativas). Zero código. Onde este
documento e o motor existente se contradizem, a secção 11 manda; onde a lei
mandar diferente, manda a lei.*
