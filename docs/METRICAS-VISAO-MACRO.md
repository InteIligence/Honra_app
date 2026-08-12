# MÉTRICAS — Visão Macro do Honra (o painel de um deus sobre a operação)

> **Data:** 18/07/2026 · **Âmbito:** o modelo de métricas que diz a VERDADE sobre a saúde do Honra — a Estrela Polar, a liquidez do marketplace, os funis dos dois lados, a qualidade/confiança, a receita, os sinais de perigo, e como instrumentar tudo sem mentir.
> **Método:** só desenho — leu-se o esquema real (migrações 002→042), as Edge Functions e os documentos de desenho. **Não toca em código nem na BD.** A instrumentação constrói-se depois.
> **Constrói POR CIMA** das 8 métricas de PAGAMENTO já desenhadas (`docs/PAGAMENTOS-HOLD-METRICAS.md §6`, tabela `metricas_pagamento`, view `alertas_vamp_profissional`) — não as repete.
> **Régua sagrada (herdada):** nenhum número sem prova; nunca inflacionar; **ganha-se com a proteção executada, nunca com o falhanço**. Uma métrica que empurre a operação para longe desta régua está mal desenhada — mesmo que suba.
>
> **Legenda de estado de cada métrica** (a honestidade macro do documento):
> - 🟢 **[MEDE-SE JÁ]** — derivável hoje por query sobre tabelas que já existem e já se escrevem.
> - 🟡 **[PRECISA INSTRUMENTAÇÃO]** — falta uma tabela/evento/coluna; propõe-se o esquema aqui.
> - 🔵 **[SÓ NO PILOTO]** — só ganha significado com volume real (Lisboa·eventos); antes disso é ruído.

---

## SUMÁRIO EXECUTIVO

**A Estrela Polar:** **Honras Verificadas por mês** — o número de negócios que chegam ao estado `honrado` entre partes cujos carris de confiança foram realmente usados (profissional verificado dos dois lados no interno; profissional verificado + assinatura/OTP do convidado no contrato-convite). É a única métrica que sobe **se e só se** o Honra cumpriu a promessa: duas pessoas deram a palavra, compareceram, e a palavra valeu. É à prova de inflação (só se lá chega passando por `selado`/`assinado` → `checkpoint` → `honrado`, cada degrau com uma ação real e datada) e amarra o valor ao fosso da verificação. **Não** se escolheu "valor protegido" (€ que passam pela caução) como Estrela Polar porque a maioria dos apertos internos **não tem dinheiro** (a reputação é a caução) — um alvo em € cegaria metade do marketplace e arriscaria o incentivo perverso de premiar negócios de maior risco. O € fica como **guardião**, não como norte.

**As 5 alavancas que a movem:**
1. Oferta verificada ativa (profissionais com selo Verificado, disponíveis, por vertical/cidade).
2. Apertos e assinaturas iniciados / mês (as entradas no cano).
3. Taxa de honra (honrados ÷ chegados ao checkpoint).
4. Tempo até ao 1.º aperto de um profissional novo (ativação/liquidez).
5. Repeat-rate (recontratações — o volante de inércia).

**O painel mínimo do dia 1 do piloto** (8 números, todas as manhãs) está na secção 8. **As 3 métricas que mais mentem se mal definidas** estão na secção 9.

**A verdade incómoda de hoje:** o topo do funil (partilha do Honra Card → link aberto → formulário começado) **não está instrumentado** — o funil só nasce em `formulario_recebido`. E **não existe qualquer tabela de subscrições** — logo conversão, MRR, churn e ARPU **não são mediáveis hoje**, por muito que se queira. Ambos têm esquema proposto na secção 7.

---

## 1. A ESTRELA POLAR — Honras Verificadas / mês

### 1.1 Definição exata

**Honra Verificada** = um negócio que atinge um estado terminal `honrado` **e** cujos carris de confiança foram engatados:

- **Ramo interno (`orcamentos`):** `estado = 'honrado'` **e** ambas as partes têm identidade verificada no momento do selo (idealmente o selo **Verificado** = 4 abas verdes; no mínimo `identidade` verificada — ver limiar abaixo).
- **Ramo contrato-convite (`contratos_convite`):** `estado = 'honrado'` **e** o profissional é verificado **e** o convidado passou o carril (assinatura OTP registada — `assinado_em is not null`, que é pré-condição de `honrado`).

**Fórmula:**
```
Honras Verificadas (mês M) =
   #{orcamentos : estado='honrado', selado_em ∈ M, ambas as partes verificadas}
 + #{contratos_convite : estado='honrado', checkpoint_em ∈ M, P verificado}
```

**Fonte:** `orcamentos.estado` + `perfis`/`verificacoes` para o carimbo de verificação; `contratos_convite.estado` + `contratos_convite.checkpoint_em` + `contas_connect`/`verificacoes` do profissional. **Janela = flow mensal** (data do desfecho), nunca o acumulado (o acumulado é vaidade — ver secção 9).

### 1.2 O que revela
Se sobe, o Honra está a produzir mais do seu único produto: confiança cumprida entre gente verificada. Se estagna com a oferta a crescer, o problema é de **liquidez ou de fuga no funil** (secções 2–3), não de tração.

### 1.3 Estado e limiares
🟢 **[MEDE-SE JÁ]** no ramo interno; 🟢 no ramo convite (todos os campos existem). O único juízo a fixar: **que grau de verificação conta como "verificada"**. Proposta: **`identidade` verde nas duas partes** é o chão (é o que impede o fantasma); mostrar em paralelo a fatia que também tem o **selo Verificado completo** (as 4 abas) — a subida dessa fatia é o sinal de que a reputação está a "enobrecer" (memória `honra-prestigio-gold`).

**Não confundir** Honras Verificadas com "negócios honrados" bruto (contadores `perfis.negocios_honrados`): esses somam os dois lados de cada negócio (duplicam por desenho) e incluem estados legados do backfill (migração 016). A Estrela Polar conta **negócios**, não lados, e só os do fluxo verificado — deriva-se dos `orcamentos`/`contratos_convite`, **não** dos contadores denormalizados.

### 1.4 As 5 alavancas de input (cada uma com a sua ficha nas secções seguintes)

| # | Input | Onde vive | Move a Estrela Polar porque… |
|---|---|---|---|
| I1 | Oferta verificada ativa | §2.1 | sem oferta densa não há com quem honrar |
| I2 | Apertos/assinaturas iniciados / mês | §3 (degrau `selado`/`assinado`) | é o caudal que entra no cano |
| I3 | Taxa de honra | §4.1 | é a eficiência do cano (quanto do que entra sai honrado) |
| I4 | Tempo até 1.º aperto (novo profissional) | §2.4 | ativação: um profissional que nunca aperta é oferta morta |
| I5 | Repeat-rate | §4.6 | recontratar é a prova de amor — multiplica sem custo de aquisição |

---

## 2. SAÚDE DO MARKETPLACE — liquidez (o risco n.º 1)

Um marketplace morre à fome antes de morrer de qualquer outra coisa: falta de densidade num dos lados, num sítio, numa vertical. O beachhead (Lisboa·casamentos/eventos) precisa de **profundidade**, não de espalhar. Estas métricas são o detetor de fome **antes** do desmaio.

### 2.1 Oferta verificada ativa (por vertical × cidade)
🟢 **[MEDE-SE JÁ]** · **Definição:** nº de perfis profissionais com `identidade` verde (idealmente selo Verificado), `disponibilidade in ('disponivel','a_partir_de')`, com pelo menos 1 categoria, agrupados por `perfis.cidade` × `categorias.slug`.
**Fonte:** `perfis` ⋈ `verificacoes` ⋈ `perfil_categorias` ⋈ `categorias`.
**Revela:** onde há tecido para transacionar. **Limiar de beachhead:** definir uma **massa mínima por célula (vertical×cidade)** — heurística de arranque: **< 8 profissionais verificados** numa célula onde há procura = célula anémica (não anunciar essa célula ainda). O número exato calibra-se no piloto 🔵.

### 2.2 Procura ativa (por vertical × cidade)
🟡 **[PRECISA INSTRUMENTAÇÃO]** parcial · **Definição:** sinais de intenção de compra por célula: no ramo convite, `contratos_convite` novos (formulários recebidos) por cidade do profissional/serviço; no ramo interno, `orcamentos` iniciados (`estado='pedido'`) por categoria do destinatário.
**Fonte hoje:** `contratos_convite.formulario_em` + `orcamentos.criado_em`. **O que falta:** a procura que **não chega** a formulário/pedido (quem viu o Card e não avançou) — invisível sem `eventos_produto` (§7.3). Hoje mede-se a procura **materializada**, não a **latente**.
**Revela:** se a oferta e a procura estão no mesmo sítio. **Alerta:** procura a subir numa célula sem oferta verificada suficiente (§2.5).

### 2.3 Match rate (procura que encontra oferta e transaciona)
🟢 **[MEDE-SE JÁ]** (ramo convite) · **Definição:** dos convites que entram (`formulario_recebido`), a fração que o profissional aceita (`aguarda_assinatura` ou além) — é o "sim, aceito trabalhar contigo".
**Fórmula:** `#{convites que passaram de formulario_recebido} ÷ #{formularios_recebidos}`, por vertical×cidade.
**Fonte:** `contratos_convite.estado` + `eventos_convite` (tipos `formulario`, `aceite`, `recusa`, `expiracao`).
**Revela:** se a oferta está a dizer sim (capacidade/apetite) ou a recusar/ignorar (oferta saturada, mal-emparelhada, ou desinteressada). **Limiar:** match rate < 40% numa célula = oferta a rejeitar procura → ou faltam profissionais, ou o emparelhamento está errado. **Cuidado:** distinguir **recusa ativa** (`recusado`) de **silêncio** (`formulario_expirado`, 7 dias) — o silêncio é pior (oferta ausente, não seletiva).

### 2.4 Tempo até ao 1.º aperto de um user novo (Time-to-First-Handshake)
🟢 **[MEDE-SE JÁ]** · **Definição, profissional:** mediana e p90 de `perfis.criado_em` → primeiro momento em que participa num `orcamentos.selado_em` OU num `contratos_convite` que chega a `assinado`. **Cliente convidado:** `clientes_convidados.criado_em` → `contratos_convite.assinado_em`.
**Revela:** a ativação. Um profissional que se regista e nunca aperta em X dias é **oferta morta** — infla a "oferta" sem mover a Estrela Polar. **Limiar:** > 21 dias sem 1.º aperto = registo em risco de morte; alimenta uma coorte de ativação. 🔵 o corte exato afina-se no piloto.

### 2.5 Densidade e o balanço dos dois lados (o detetor de fome)
🟢/🟡 · **Definição:** por célula vertical×cidade, o par (oferta verificada ativa §2.1, procura ativa §2.2) e o seu **rácio de equilíbrio**.
**Sinais de um marketplace a morrer à fome — ANTES do desmaio:**
- **Oferta sem procura:** muitos profissionais verificados, poucos formulários/pedidos → o lado que paga (subscrição) vai sentir que "não acontece nada" e churna. É a morte silenciosa mais provável de um marketplace de reputação.
- **Procura sem oferta:** formulários/pedidos a bater numa célula sem profissionais suficientes → experiência de "ninguém responde", má reputação de arranque.
- **Densidade a diluir:** oferta a crescer em nº de células (espalhar) sem nenhuma célula a passar o chão de massa mínima → **antipadrão do beachhead**. Vigiar o **nº de células acima do chão de massa mínima** como métrica de foco (deve concentrar, não espalhar).
**Limiar operacional:** se, ao fim de 30 dias, **< 1 célula** (idealmente Lisboa×eventos) estiver acima do chão de massa e de match rate saudável, o beachhead não pegou — parar de recrutar largura e afundar profundidade.

---

## 3. FUNIL DO CICLO DE VIDA (onde medir a fuga em cada degrau)

O princípio: **um degrau, um evento datado, uma taxa de passagem**. Mede-se a fuga (drop-off) entre degraus consecutivos e o **tempo** em cada um (um degrau que não perde gente mas demora semanas também mata o negócio).

### 3.1 Funil do PROFISSIONAL (oferta)
🟢 **[MEDE-SE JÁ]** (todos os degraus existem)

| Degrau | Evento/carimbo | Fonte | Fuga que revela |
|---|---|---|---|
| Registo | `perfis.criado_em` | `perfis` | — |
| Verificação (identidade) | `verificacoes(aba='identidade').verificado_em` | `verificacoes` | quem se regista e não verifica (não é oferta real) |
| Selo Verificado (4 abas) | 4 abas verdes | `verificacoes` | quem para na verificação parcial (vaidade < 4 verificações) |
| Conta Connect ativa | `contas_connect.estado='ativa'` | `contas_connect` | oferta que não pode receber caução (gate dos níveis ii/iii) |
| 1.º aperto/assinatura | §2.4 | `orcamentos`/`contratos_convite` | ativação (o degrau que mais mata) |
| 1.º honrado | 1.º `honrado` como parte | idem | prova de que o carril inteiro funciona para ele |
| Repetição | 2.º+ negócio | idem | retenção/amor (§4.6) |

**Métrica-chave do funil:** **taxa registo→1.º honrado** e o **tempo** de cada troço. O troço `verificação → 1.º aperto` é onde vive a morte da oferta.

### 3.2 Funil do CLIENTE interno (procura B2B)
🟢 **[MEDE-SE JÁ]** · Registo → identidade verde → 1.º `pedido` (`orcamentos`) → 1.º `aceite` recebido → 1.º `selado` → 1.º `honrado` → recontratação. Fonte: `perfis`, `verificacoes`, `orcamentos` (estados `pedido→aceite→selado→honrado`). Fuga típica a vigiar: `pedido→aceite` (a oferta ignora?) e `selado→honrado` (o checkpoint falha?).

### 3.3 Funil do CONTRATO-CONVITE (o beachhead — B2C eventos)
🟡🟢 · O funil crítico do piloto. **O topo (degraus 1–2) NÃO está instrumentado** — nasce hoje no degrau 3.

| # | Degrau | Evento | Fonte | Estado |
|---|---|---|---|---|
| 1 | Honra Card partilhado (QR/link) | — | **falta** | 🟡 `eventos_produto` (§7.3) |
| 2 | Link/Card aberto pelo convidado | — | **falta** | 🟡 `eventos_produto` |
| 3 | Formulário submetido | `tipo='formulario'` | `eventos_convite` / `contratos_convite.formulario_em` | 🟢 |
| 4 | P aceita | `tipo='aceite'`, `aceite_em` | idem | 🟢 |
| 5 | Convidado assina (OTP) | `tipo='assinatura'`, `assinado_em` | idem | 🟢 |
| 6 | Cartão gravado + mandato (níveis ii/iii) | `tipo='cartao_gravado'`, `cartao_gravado_em` | idem | 🟢 |
| 7 | Hold armado (nível iii, crédito) | `tipo='hold_armado'`, `hold_armado_em` | `contratos_convite` + `metricas_pagamento(evento='arme_ok')` | 🟢 |
| 8 | Checkpoint (D0→D+1) | `checkpoint_em` | idem | 🟢 |
| 9 | Honrado | `estado='honrado'` | idem | 🟢 |
| 10 | Avaliação (voluntária) | `avaliacoes` (via magic link `avaliar`) | `avaliacoes`/`magic_links_convite` | 🟢 |

**Fugas a medir (taxa de passagem entre degraus consecutivos), por vertical×cidade:**
- **3→4 (formulário→aceite):** o profissional responde? Silêncio = `formulario_expirado`.
- **4→5 (aceite→assinatura):** o convidado assina? Fuga aqui = atrito do contrato/OTP. `aguarda_assinatura` parado > prazo → `assinatura_expirada`.
- **5→6 (assinatura→cartão):** só níveis ii/iii; `cartao_falhou` é um sub-estado a contar à parte.
- **6/7→8 (proteção→checkpoint):** chega ao evento? (deve chegar quase sempre).
- **8→9 (checkpoint→honrado):** o profissional confirma "recebi"? Silêncio até D+1 = `incumprido_profissional` (marca em P — sinal grave, §4.4).

**Métrica de topo do funil convite (assim que houver `eventos_produto`):** **Card aberto → formulário → assinado → honrado** — a conversão ponta-a-ponta do beachhead. Hoje só se mede **formulário → honrado** (a partir do degrau 3), o que **esconde a maior fuga** (quantos abriram o Card e nunca preencheram). Instrumentar o topo é a prioridade n.º 1 de produto para o piloto.

---

## 4. QUALIDADE / CONFIANÇA (a reputação é o produto)

### 4.1 Taxa de honra (rácio honrados / apertos)
🟢 **[MEDE-SE JÁ]** · **Definição:** dos negócios que chegaram ao ponto de compromisso (`selado` no interno, `assinado` no convite) e já resolveram, a fração que resolveu em `honrado`.
**Fórmula (interno):** `honrados ÷ (honrados + incumpridos + cancelados_mutuo)` sobre negócios já resolvidos — **não** dividir stock por flow (secção 9). No perfil já existem os ingredientes: `negocios_honrados`, `negocios_falhados`, `apertos_selados`, `cancelados_mutuo` (migrações 016/033).
**Revela:** a fiabilidade do tecido. **É o rácio que o Vítor decidiu expor** ("190 apertos e 10 honrados é de desconfiar"). **Cuidado com o denominador** (secção 9) — usar `apertos_selados` (linha-a-linha, já com backfill honesto) e não uma contagem de eventos que duplique.

### 4.2 Taxa de incumprimento
🟢 **[MEDE-SE JÁ]** · **Definição:** fração de negócios resolvidos que terminam em incumprimento (`orcamentos.estado='incumprido'`; `contratos_convite.estado in ('incumprido_cliente','incumprido_profissional')`). Segmentar por **quem falhou** (`quem_falhou`) — o incumprimento do **profissional** (`incumprido_profissional`, gerado pelo cron por silêncio no checkpoint) é o mais tóxico para a marca do Honra e merece vigilância própria.
**Limiar:** taxa de incumprimento agregada > 5% ou qualquer subida sustentada = erosão do tecido de confiança.

### 4.3 Marcas de incumprimento emitidas
🟢 **[MEDE-SE JÁ]** · **Definição:** contagem de marcas (`negocios_falhados` incrementado; transições para `incumprido_*`). É a "caução real" do modelo (a reputação). **Revela:** o custo reputacional em circulação. Cruzar com **reincidência** (perfis com ≥2 marcas) → candidatos a suspensão/expulsão (o aperto de 14/07: marca → suspensão → expulsão).

### 4.4 Cancelamentos mútuos (o sinal ambíguo — analisado)
🟢 **[MEDE-SE JÁ]** (contador `cancelados_mutuo`) · **A ambiguidade:** um cancelamento mútuo é, por desenho, **neutro** — desfeito a dois, sem marca (migração 032). Mas o mesmo número conta **duas histórias opostas**:
- **Saúde:** duas partes adultas que, mudando as circunstâncias, se libertam civilizadamente sem penalizar ninguém. Bom sinal de que o Honra não aprisiona.
- **Doença/conluio:** o cancelamento mútuo como **rota de fuga às marcas e às fees** — profissional e cliente combinam "cancelar a dois" para o incumpridor não ficar marcado, ou para escapar ao escalão de caução. No contrato-convite, é a válvula por onde a desintermediação e a evasão à penalização escapam.

**Como desambiguar (não olhar para o número cru):**
- **Timing:** cancelamentos mútuos concentrados **perto do evento** (dentro do escalão 2/3) são suspeitos — a essa altura, "mútuo" pode ser penalização disfarçada de acordo.
- **Reincidência:** um par (ou um profissional) com muitos cancelamentos mútuos = padrão, não acaso.
- **Rácio:** `cancelados_mutuo ÷ apertos_selados` por profissional; um outlier é bandeira.
**Limiar:** profissional com rácio de cancelamento mútuo > 20% **e** ≥3 casos = investigar conluio. 🔵 calibrar no piloto.

### 4.5 Disputas / chargebacks (VAMP)
🟡 **[PRECISA INSTRUMENTAÇÃO]** (Fatia D+) · A view `alertas_vamp_profissional` **já existe** e já calcula amarelo/vermelho, **mas** os eventos `disputa_aberta`/`efw_recebido` que a alimentam **nascem de webhooks de charge ainda por ligar** — por isso hoje a view devolve **0 disputas, honestamente**. **O que falta:** subscrever `charge.dispute.*` e `radar.early_fraud_warning.created` no `stripe-webhook` e escrever esses eventos em `metricas_pagamento`. Limiares já definidos na migração 042 (amarelo: ≥2/90d ou ratio≥0,3%; vermelho: ≥5/12m E ratio≥0,5%). **Revela:** os profissionais que geram fricção de pagamento — perigo de multa de rede e de contaminação do portfólio Connect da plataforma.

### 4.6 Repeat-rate (recontratação — amor à 2.ª vista)
🟢 **[MEDE-SE JÁ]** (interno) / 🟡 (convite) · **Definição:** fração de negócios honrados que são um **segundo (ou n-ésimo) negócio entre o mesmo par**.
**Fórmula (interno):** para cada par `(de_perfil, para_perfil)`, contar honrados; repeat-rate = `#{pares com ≥2 honrados} ÷ #{pares com ≥1 honrado}`. **Convite:** o par é `(profissional_id, cliente_convidado_id)` — e `clientes_convidados` tem unicidade por telefone, logo o mesmo cliente reconhece-se entre contratos.
**Revela:** o volante de inércia — recontratar não custa aquisição e é a prova mais dura de valor entregue. **Limiar:** repeat-rate a subir coorte após coorte = produto saudável; plano ao longo de 90 dias = negócios de uma-só-vez (mau para LTV).

### 4.7 Tempo de resposta do profissional
🟢 **[MEDE-SE JÁ]** · **Definição:** mediana/p90 de `formulario_em → aceite_em` (convite) e `pedido→aceite` (interno). **Revela:** a experiência do lado da procura; respostas lentas matam a conversão 3→4 mesmo sem recusa explícita. **Limiar:** p90 > 48h = atrito de oferta.

### 4.8 Índice de confiança / avaliações
🟢 **[MEDE-SE JÁ]** · `perfis.indice_confianca` = média das notas (`avaliacoes.nota`, 1–5). **A vigiar como qualidade de dados, não como Estrela Polar:** a avaliação é **voluntária** e só desbloqueia com prova de interação (`avaliacoes` exige `orcamento` concluído; no convite, magic link `avaliar` pós-honrado). Medir a **taxa de preenchimento de avaliação** (avaliações emitidas ÷ negócios honrados elegíveis) — se for baixa, a média mente por amostra pequena.

---

## 5. RECEITA E UNIT ECONOMICS

> **Aviso de régua:** a receita do Honra é a **subscrição**, mais uma **fee de 5% (mín. 0,60 €) só sobre penalizações efetivamente cobradas** (`_shared/pagamentos.ts:feePenalizacao` — nota: subiu de 3%→5% a 17/07; o doc PAGAMENTOS §4/§7 ainda diz 3% — **discrepância a reconciliar**). **Valor protegido (GMV que passa pela caução) NÃO é receita** — é exposição gerida. Confundir os dois é o maior embuste possível (secção 9).

### 5.1 Subscritores ativos vs base grátis (conversão)
🔴 **[NÃO MEDIÁVEL HOJE]** · **Não existe qualquer tabela de subscrições/planos na BD** (verificado em todas as migrações). Logo: **conversão grátis→pago, MRR, ARPU, churn e LTV são hoje impossíveis de medir.** Esquema proposto na §7.2 (`subscricoes` + `eventos_subscricao`). **Alvos do modelo** (memória `honra-pricing-modelo`): Pro 9,99 €/mês, Empresa 24,99 €, Fundador 4,99 €; **~250 subscrições ≈ operação enxuta**. Sem instrumentação, o "250" é um objetivo cego.
**Métricas a medir assim que houver a tabela:** subs ativos por plano; taxa de conversão grátis→pago; MRR e o seu movimento (nova/upgrade/downgrade/churn/reativação); % da base que é grátis; **nº de subs vs o chão de 250** (o gráfico que diz "a operação paga-se a si própria?").

### 5.2 Fee cobrada vs perdoada
🟢 **[MEDE-SE JÁ]** (assim que houver cobranças) · **Fonte:** `metricas_pagamento` — `evento='fee_cobrada'` (soma `fee_centimos`) vs `evento='perdoado'` (fee 0). **Revela:** quanto a plataforma recebe da proteção **executada** vs quanto **perdoa** (data reocupada → fee 0). **Régua viva:** o perdão a 0 € é feature, não bug — mede a saúde do sistema de honra.

### 5.3 Valor protegido (GMV sob caução) — o guardião, não a receita
🟢 **[MEDE-SE JÁ]** · **Definição:** (a) **valor em risco ativo** = soma dos holds armados vivos + valor coberto por cartão gravado (contratos em `caucionado`/`assinado` com cartão); (b) **GMV honrado** = soma de `contratos_convite.valor_total` dos contratos que chegaram a `honrado`. **Fonte:** `contratos_convite.valor_total`, `metricas_pagamento` (arme/captura). **Revela:** a escala do que o Honra guarda. **Nunca** somar isto à receita nem apresentá-lo como tal. **Nota crítica:** o marketplace **interno não tem GMV** (a reputação é a caução, sem dinheiro) — logo o valor protegido só existe no ramo convite; não usar GMV como saúde global.

### 5.4 CAC implícito e eficiência de aquisição
🔴 **[NÃO MEDIÁVEL HOJE]** · Não há rastreio de origem de aquisição (nenhum campo `origem`/`utm`/`convidado_por` que ligue um registo a um canal ou a um profissional que trouxe o cliente). **Proxy futuro:** no convite, o cliente entra sempre **por um profissional** (o Card é dele) — logo o "CAC" do lado da procura é essencialmente **zero pago** (a oferta traz a procura). Isso é uma força enorme do modelo, mas só se torna **mensurável** com `eventos_produto` a registar a partilha do Card e a origem do formulário (§7.3). Custo de servidor por € de penalização cobrada é derivável (custo Stripe conhecido vs `fee_centimos`).

### 5.5 Custo de processamento por penalização
🟢 **[MEDE-SE JÁ]** (piloto) · Custo Stripe conhecido (1,5%+0,25 € EEA; mais em internacional) vs `fee_centimos` cobrada. **Revela:** se a fee de 5% cobre mesmo o custo em cada mix de cartão (o segmento estrangeiro, ~75% da procura, usa cartões internacionais mais caros — vigiar a margem real por rede).

---

## 6. SINAIS DE PERIGO PRECOCES (o que um deus vê antes do desastre)

### 6.1 Concentração (poucos users = todo o volume)
🟢 **[MEDE-SE JÁ]** · **Definição:** quota do volume (apertos selados / honras) detida pelo **top-N** de profissionais (ex.: top-5, top-10) e/ou um **Gini** simples sobre `orcamentos`/`contratos_convite` agrupados por `profissional_id`. **Revela:** fragilidade — se 5 profissionais fazem 80% das honras, a saída de um deles é um buraco. Um beachhead saudável concentra no início (natural), mas a **tendência** deve ser de diluição da concentração à medida que a densidade cresce. **Alerta:** top-5 > 70% do volume passados 60 dias de piloto = dependência perigosa.

### 6.2 Desintermediação estimável (a fuga para fora da app)
🟡 **[PRECISA INSTRUMENTAÇÃO]** · **O risco:** o profissional usa o Honra para **ganhar o cliente** e depois leva a relação para fora (evita a subscrição/fee). **Não é medível diretamente** — mas há **proxies**:
- **Fuga pós-contacto:** convites/pedidos que chegam a `aceite`/conversa e **morrem** sem `honrado`, sobretudo quando o mesmo par nunca mais aparece → possível migração para fora.
- **Cair no interno:** pares que transacionam uma vez e nunca repetem **dentro** do Honra apesar de sinais de relação continuada.
- **Cancelamento mútuo suspeito** (§4.4) como capa de desintermediação.
**O melhor proxy honesto:** taxa `formulário/pedido → honrado` a cair sem a procura cair — gente entra, é atendida, e sai por fora. Exige `eventos_produto` para separar "abandonou" de "migrou". **Assumir que é imperfeito e nunca reportá-lo como facto.**

### 6.3 Fee a crescer mais depressa que os honrados (o incentivo perverso)
🟢 **[MEDE-SE JÁ]** (piloto) · **A métrica-guardiã da régua sagrada.** **Definição:** taxa de crescimento de `Σ fee_centimos` (fee de penalização) vs taxa de crescimento de **Honras Verificadas**. **Se a fee cresce mais depressa que as honras, o Honra está a ganhar mais com o falhanço do que com o sucesso** — exatamente o que a régua proíbe. **Alerta VERMELHO de missão:** `Δ%(fee cobrada) > Δ%(honras)` sustentado por 2+ meses → parar e investigar (as penalizações não podem virar modelo de negócio). Esta é, talvez, a métrica mais importante do documento a seguir à Estrela Polar: é o alarme de que o produto se está a trair a si próprio.

### 6.4 Procura sem oferta / oferta sem procura por célula
🟢/🟡 · Ver §2.5 — repetido aqui como sinal de perigo porque **é a causa n.º1 de morte de marketplaces**. O painel diário deve ter sempre a célula do beachhead sob os olhos.

### 6.5 Acumulação de estados "presos"
🟢 **[MEDE-SE JÁ]** · **Definição:** contratos/orçamentos parados num estado não-terminal além do prazo: `aguarda_assinatura` sem assinar, `cartao_falhou` sem repor, `cobranca_pendente` em dunning, `caucionado` sem checkpoint. **Fonte:** `contratos_convite.estado` + carimbos + índices já criados (`contratos_convite_dunning_idx`, `_estado_data_idx`). **Revela:** fricção operacional e dinheiro/holds a envelhecer. **Alerta:** qualquer `cobranca_pendente` a aproximar-se de `cobranca_incobravel`; qualquer hold perto do `hold_capture_before`.

### 6.6 Erosão da qualidade da verificação
🟢 **[MEDE-SE JÁ]** · **Definição:** % de perfis "verificados" cujas abas estão a **expirar** (`verificacoes.estado='expirado'` / `reconfirma_em` no passado) sem reconfirmar. A verificação é **viva** (tem `reconfirma_em`) — se a base envelhece sem reconfirmar, o selo vira mentira. **Alerta:** subida da fração de abas expiradas não reconfirmadas.

---

## 7. COMO INSTRUMENTAR (só desenho)

### 7.1 O que é DERIVÁVEL HOJE por query (queries-tipo)

Tudo o que segue corre sobre tabelas que já existem e já se escrevem. Exemplos (ilustrativos — a afinar):

**Estrela Polar (Honras Verificadas / mês, ramo convite):**
```sql
select date_trunc('month', checkpoint_em) as mes, count(*) as honras_verificadas
from contratos_convite cc
where estado = 'honrado'
  and exists (select 1 from verificacoes v
              where v.perfil_id = cc.profissional_id
                and v.aba = 'identidade' and v.estado = 'verificado')
group by 1 order by 1;
```

**Funil do convite (taxa de passagem por degrau):**
```sql
select
  count(*) filter (where formulario_em is not null)                as d3_formulario,
  count(*) filter (where aceite_em    is not null)                 as d4_aceite,
  count(*) filter (where assinado_em  is not null)                 as d5_assinado,
  count(*) filter (where cartao_gravado_em is not null)            as d6_cartao,
  count(*) filter (where hold_armado_em is not null)               as d7_hold,
  count(*) filter (where estado = 'honrado')                       as d9_honrado
from contratos_convite;
```

**Oferta verificada ativa por célula:**
```sql
select p.cidade, cat.slug, count(distinct p.id) as profissionais_verificados
from perfis p
join verificacoes v on v.perfil_id = p.id and v.aba='identidade' and v.estado='verificado'
join perfil_categorias pc on pc.perfil_id = p.id
join categorias cat on cat.id = pc.categoria_id
where p.tipo in ('pessoa','empresa') and p.disponibilidade <> 'ocupado'
group by 1,2 order by 3 desc;
```

**Taxa de honra por profissional (rácio já exposto):**
```sql
select id, nome, negocios_honrados, apertos_selados,
       round(negocios_honrados::numeric / nullif(apertos_selados,0), 3) as taxa_honra,
       cancelados_mutuo, negocios_falhados
from perfis where apertos_selados > 0 order by apertos_selados desc;
```

**Repeat-rate (interno):**
```sql
with pares as (
  select least(de_perfil,para_perfil) a, greatest(de_perfil,para_perfil) b,
         count(*) filter (where estado='honrado') honras
  from orcamentos group by 1,2)
select round(avg((honras>=2)::int)::numeric,3) as repeat_rate
from pares where honras >= 1;
```

**Fee cobrada vs perdoada, penalizações, dunning:** tudo em `metricas_pagamento` (eventos `fee_cobrada`, `perdoado`, `captura_ok`, `mit_ok`, `retry`, `incobravel`) — a espinha das 8 métricas de pagamento já desenhadas.

### 7.2 O que precisa de TABELA/EVENTO NOVO — subscrições (a maior lacuna de receita)

Coerente com o padrão append-only de `metricas_pagamento`/`eventos_convite`:

```sql
-- Estado atual da subscrição de cada perfil (uma linha por perfil).
create table if not exists public.subscricoes (
  perfil_id             uuid primary key references public.perfis(id) on delete cascade,
  plano                 text not null default 'gratis'
                          check (plano in ('gratis','fundador','pro','empresa')),
  estado                text not null default 'ativa'
                          check (estado in ('ativa','trial','cancelada','inadimplente')),
  stripe_subscription_id text,
  preco_centimos        integer,          -- MRR desta linha
  iniciada_em           timestamptz,
  renova_em             timestamptz,
  cancelada_em          timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Movimentos de MRR (append-only) — a verdade histórica que a linha de estado perde.
create table if not exists public.eventos_subscricao (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid references public.perfis(id) on delete set null,
  tipo         text not null,  -- nova|upgrade|downgrade|churn|reativacao|trial_iniciada|pagamento_falhou
  plano_de     text,
  plano_para   text,
  delta_mrr    integer,        -- cêntimos (+/-)
  criado_em    timestamptz not null default now()
);
```
Fonte da verdade = webhooks de subscrição da Stripe (Billing). Só service_role escreve; append-only no `eventos_subscricao` (mesmo trigger de imutabilidade das outras). **Sem isto, secção 5.1 é cega.**

### 7.3 O que precisa de EVENTOS DE PRODUTO — o topo do funil (hoje invisível)

O funil do convite começa em `formulario_recebido`; **a partilha do Card e a abertura do link não deixam rasto**. Propõe-se uma tabela append-only genérica de eventos de produto:

```sql
create table if not exists public.eventos_produto (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,   -- card_partilhado|card_aberto|convite_link_aberto|
                               -- formulario_iniciado|perfil_visto|pesquisa_feita
  ator_perfil uuid references public.perfis(id) on delete set null,  -- se autenticado
  sessao_hash text,            -- visitante anónimo (hash, RGPD-safe)
  alvo_perfil uuid references public.perfis(id) on delete set null,  -- de quem é o Card
  contrato_id uuid references public.contratos_convite(id) on delete set null,
  origem      text,            -- 'qr'|'link'|'app'|canal
  payload     jsonb,
  criado_em   timestamptz not null default now()
);
```
Isto desbloqueia: **conversão ponta-a-ponta do beachhead** (Card aberto→formulário→assinado→honrado), a **procura latente** (§2.2), o **CAC-por-profissional** (§5.4) e o proxy de **desintermediação** (§6.2). RLS service_role; append-only. **Prioridade n.º1 de instrumentação de produto** para o piloto — é a diferença entre ver metade e ver o funil inteiro.

### 7.4 O que precisa só de LIGAR webhooks já reservados
`disputa_aberta`/`efw_recebido` em `metricas_pagamento` (a view VAMP já os espera) → subscrever `charge.dispute.*` e `radar.early_fraud_warning.created`. Sem código de tabela — só handlers. Fatia D+.

### 7.5 Camada de agregação (regra de ouro)
**Nunca escrever agregados à mão.** As métricas derivam-se sempre dos eventos imutáveis (`metricas_pagamento`, `eventos_convite`, `eventos_subscricao`, `eventos_produto`) e dos estados. Materializar em views `metricas_*` (diárias, por profissional e globais) como a `alertas_vamp_profissional` já faz. Assim o painel é reproduzível e auditável, e nenhum número existe sem a linha que o prova (régua).

---

## 8. O PAINEL MÍNIMO DO DIA 1 DO PILOTO (8 números, todas as manhãs)

> Lisboa·eventos. O que o Vítor deve ver antes do café. Cada linha tem a fonte e o estado de mensurabilidade hoje.

| # | Número | Fonte | Hoje? |
|---|---|---|---|
| 1 | **Honras Verificadas** — ontem e acumulado no piloto (a Estrela Polar) | `contratos_convite`/`orcamentos` + `verificacoes` | 🟢 |
| 2 | **Funil do convite do dia:** formulários → aceites → assinados → honrados (4 números-degrau) | `contratos_convite` carimbos | 🟢 (topo do funil ainda oculto 🟡) |
| 3 | **Balanço do beachhead:** nº profissionais verificados ativos (Lisboa×eventos) vs nº formulários/convites da semana | `perfis`⋈`verificacoes` vs `contratos_convite` | 🟢 |
| 4 | **Velocidade:** tempo mediano formulário→assinado; e p90 resposta do profissional | carimbos `contratos_convite` | 🟢 |
| 5 | **Taxa de honra (rolling 30d)** e nº de **marcas** emitidas | `orcamentos`/`contratos_convite`, `perfis` | 🟢 |
| 6 | **Dinheiro sob guarda:** valor protegido ativo (holds/cartões vivos) + penalizações **cobradas vs perdoadas** (€) + **fee cobrada** à parte | `contratos_convite`, `metricas_pagamento` | 🟢 (com cobranças reais) |
| 7 | **Alertas:** qualquer profissional a amarelo/vermelho (VAMP) + qualquer `cobranca_pendente`/`incobravel` + qualquer hold perto do `capture_before` | `alertas_vamp_profissional`, `contratos_convite` | 🟢 view / 🟡 disputas até ligar webhooks |
| 8 | **Presos:** contratos parados por degrau além do prazo (`aguarda_assinatura`, `cartao_falhou`, `cobranca_pendente`) | `contratos_convite` + índices | 🟢 |

**Guardião de missão (semanal, não diário):** `Δ%(fee cobrada) vs Δ%(honras)` (§6.3) — se a fee crescer mais que as honras, alarme.

---

## 9. AS 3 MÉTRICAS QUE MAIS MENTEM SE MAL DEFINIDAS

1. **Valor protegido confundido com receita (o embuste-mor).** GMV sob caução **não é dinheiro do Honra** — é exposição gerida. Apresentá-lo como tração ou receita é inflar por um fator enorme e trair a régua. Regra: valor protegido e fee cobrada vivem em **caixas separadas**, com rótulos explícitos, e o valor protegido nunca entra em nenhuma soma de receita. Agrava-se por o marketplace **interno não ter GMV** (reputação = caução): um "GMV global" seria duplamente falso.

2. **Taxa de honra com stock a dividir flow (ou com denominador errado).** Dividir `negocios_honrados` (contador cumulativo, que inclui o backfill e sobrevive à limpeza de dados) por `apertos_selados` de um período recente mistura acumulado com fluxo e infla. E os contadores denormalizados **somam os dois lados** de cada negócio (duplicam por desenho, migração 016/033). Regra: escolher explicitamente numerador e denominador da **mesma coorte/período**, contar **negócios** e não lados, e ancorar linha-a-linha (`selado_em`, `estado`) — não em eventos que dupliquem.

3. **Cancelamento mútuo lido como número único.** É genuinamente ambíguo (§4.4): saúde (libertação civilizada) **ou** doença (fuga a marcas/fees, capa de desintermediação). Reportá-lo como um só KPI "cancelamentos" — bom ou mau — mente sempre. Regra: nunca isolar o número cru; cruzar **sempre** com timing (perto do evento?), reincidência (mesmo par/profissional?) e rácio por profissional. O mesmo cuidado vale para o "match rate" (distinguir recusa ativa de silêncio) — um denominador que junte intenções reais com curiosos infla ou esconde a fuga.

---

## 10. HONESTIDADE FINAL — o que hoje NÃO é mensurável

- **Conversão, MRR, ARPU, churn, LTV, o "chão dos 250 subs":** 🔴 zero — **não há tabela de subscrições** (§7.2). É a maior lacuna do modelo de receita.
- **Topo do funil do beachhead** (Card partilhado → aberto → formulário começado): 🔴 invisível — o funil só nasce em `formulario_recebido`. Esconde a **maior fuga** e a **procura latente**. Precisa de `eventos_produto` (§7.3).
- **CAC e origem de aquisição:** 🔴 sem rastreio de canal/origem; só se torna mensurável com `eventos_produto`.
- **Disputas/chargebacks:** 🟡 a view VAMP existe mas devolve 0 até ligar os webhooks de charge (§7.4).
- **Desintermediação:** 🟡 nunca medível diretamente — só por proxies imperfeitos, a reportar sempre com essa ressalva.
- **Números PT de decline/recovery MIT:** 🔵 só existem medindo no piloto (herança do doc PAGAMENTOS §2/§6) — mínimo ~100 cobranças para um primeiro número com dignidade.
- **Todos os limiares numéricos deste documento** (massa mínima por célula, 21 dias de ativação, 40% de match rate, 20% de cancelamento mútuo, top-5 <70%…) são **hipóteses de arranque**, não factos — calibram-se com os primeiros 90 dias e substituem-se pelos números reais medidos. Régua: mostrar o número inventado como se fosse medido seria a pior traição do Honra.

---

*Documento de desenho — não toca em código nem na BD. Constrói por cima das 8 métricas de pagamento (PAGAMENTOS-HOLD-METRICAS §6) e prepara a camada de métricas de produto/marketplace/receita para o piloto de Lisboa·eventos.*
