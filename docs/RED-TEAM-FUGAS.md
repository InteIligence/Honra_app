# HONRA — Red-team: fugas ao modelo (económico + reputacional)

> **Papel:** advogado do diabo. Assume má-fé de utilizadores espertos. Só análise — **não** se tocou em código nem na BD.
> **Data:** 18/07/2026 · **Base:** migrações `supabase/migrations/002→042`, funções `supabase/functions/*`, `_shared/pagamentos.ts`/`contrato.ts`, docs `DESENHO-CONTRATO-CONVITE.md`, `JURIDICO-CONTRATO-CONVITE.md`, `PAGAMENTOS-HOLD-METRICAS.md`, `BRIEFING-ADVOGADO.md`.
> **Regra de leitura:** cada fuga diz **funciona hoje? sim/parcial/não** verificado no código real, com severidade, impacto e mitigação (distinguindo código / desenho-regra / advogado). Onde uma guarda já tapa o ataque, digo-o (ver §5 — o que já está tapado).

---

## 1. Sumário executivo — as 5 fugas de maior risco

| # | Fuga | Funciona hoje | Severidade | Porque dói |
|---|------|:---:|:---:|---|
| **A** | **Lavagem de reputação: apagar a conta e recriar com o mesmo Cartão de Cidadão** (a marca/expulsão desaparecem; nada retém a identidade) | **SIM** | 🔴 Crítica | Destrói o fosso central ("a honra segue a pessoa, não a conta"). Sem isto, a marca vale zero. |
| **C** | **Farm de reputação com "clientes" sockpuppet** — 1 identidade verificada + N contas descartáveis não-verificadas fabricam negócios honrados, acendem o selo "profissão por trabalho" e enchem de avaliações 5★ | **SIM** | 🔴 Crítica | O índice, os contadores e o selo — o produto inteiro — tornam-se falsificáveis por 1 pessoa sem cúmplice. |
| **E** | **Contrato-convite: checkpoint unilateral do profissional** — `nao_recebi` captura a cláusula penal ao cartão do cliente **sem qualquer prova**, mesmo que o cliente tenha pago/comparecido (double-dip) | **SIM** | 🟠 Alta | Cliente lesado sem defesa (não tem conta); prática desleal (DL 57/2008); chargebacks → VAMP. É o maior fosso entre o **desenho** ("prova de encontro + OTP") e o **código**. |
| **D** | **Marca interna por inação: quem toca o botão escapa e empurra a marca para o lado passivo** — freelancer que não entrega nada mas toca "apresentei" limpa-se e marca o cliente honesto | **SIM** | 🟠 Alta | Inverte a justiça da marca; incentiva confirmar trabalho mau para não ser marcado → corrompe marca **e** avaliações. |
| **B** | **Segunda conta simultânea com o mesmo CC** (identidade não é dedup por documento; "1 pessoa = 1 conta" não é imposto) | **SIM** | 🟠 Alta | Sockpuppets verificados, evasão de bloqueios e o combustível da fuga C. |

> As três que eu taparia **primeiro** estão na §4 (são A, C e E — com a razão).

---

## 2. Tabela de todas as fugas encontradas

| Cód. | Fuga | Cenário | Funciona hoje | Sev. | Impacto dominante |
|---|---|---|:---:|:---:|---|
| A | Apagar+recriar conta (mesmo CC) lava marca/expulsão | 1·2·3 | **SIM** | 🔴 Crítica | Confiança / modelo inteiro |
| B | 2.ª conta simultânea com o mesmo CC | 1·2·3 | **SIM** | 🟠 Alta | Confiança / fraude |
| C | Farm de mérito com sockpuppets (honrados, selo, 5★) | 1·2 | **SIM** | 🔴 Crítica | Confiança |
| D | Marca por inação: tocar o botão escapa e empurra a culpa | 1·2 | **SIM** | 🟠 Alta | Confiança |
| E | Checkpoint-convite unilateral: cobrar sem entregar / double-dip | 3 | **SIM** | 🟠 Alta | Económico + legal + confiança |
| F | Cliente assina e faz chargeback da penalização | 3 | **SIM** | 🟠 Média-alta | Económico (P) + risco Stripe |
| G | Fuga à fee (5%): perdão combinado + pagar por fora | 3 | SIM (auto-limitante) | 🟡 Baixa-média | Económico (fee marginal) |
| H | Subvalorizar `valor_total` para encolher fee e penalização | 3 | SIM (auto-limitante) | 🟡 Baixa | Económico |
| I | Desintermediação (combinar por fora após conhecerem-se) | 1·2·3 | **SIM** (estrutural) | 🟠 Média | Económico (GMV/fee) |
| J | Escapar à marca por "cancelamento mútuo" combinado | 1·2 | **SIM** (por acordo) | 🟠 Média | Confiança |
| K | Formulário público como vetor de spam/smishing (telefone da vítima) | 3 | **PARCIAL** | 🟠 Média | Confiança / legal (Lei 41/2004) |
| L | Selo profissão via cédula: homónimo / cédula alheia | 3 | **PARCIAL** | 🟡 Média-baixa | Confiança / legal (selo errado) |
| M | Débito para evitar o hold e falhar o MIT de propósito | 3 | **SIM** (trade-off assumido) | 🟠 Média | Económico (P não recebe) |
| N | Inconsistência 3%↔5% em comentários/UI da fee | 3 | SIM (cosmético) | 🟢 Baixa | Legal (transparência DL 57/2008) |

---

## 3. Detalhe por fuga

### A — Lavagem de reputação: apagar a conta e recriar com o mesmo CC 🔴
**Ataque, passo a passo:** utilizador marcado/suspenso/expulso abre Definições → "Eliminar conta" (`eliminar-conta`) → `admin.auth.admin.deleteUser(user.id)` apaga `auth.users` → **cascata** apaga `perfis`, `verificacoes`, `orcamentos`, contadores (`negocios_honrados/falhados`, `apertos_selados`, `cancelados_mutuo`), marcas. Regista-se de novo (email novo), verifica identidade (`criar-verificacao` cria nova sessão Stripe Identity com `metadata[perfil_id]` — **sem qualquer verificação de que o documento já foi usado**) e nasce **limpo**.

**Funciona hoje? SIM.** Confirmado em `eliminar-conta/index.ts` (delete + cascade) e `criar-verificacao/index.ts` + `stripe-webhook` (o webhook `identity.verification_session.verified` só acende a aba pelo `perfil_id`; não guarda fingerprint do documento, não consulta denylist). Não existe em lado nenhum: hash do documento, denylist de expulsos, ou dedup por identidade (grep confirmou — só há dedup por **telefone**, migração 022, que é outro eixo). **Já é conhecido** — está no `BRIEFING-ADVOGADO.md` Q10-A como lacuna aberta.

**Severidade: 🔴 Crítica.** Impacto: confiança + o modelo inteiro. Todo o edifício "a reputação é a caução; 1 pessoa = 1 conta" assenta em a identidade ser persistente através do apagamento — e não é.

**Mitigação:**
- **Código:** no webhook `identity.verification_session.verified`, ler o fingerprint do documento (Stripe Identity expõe `verified_outputs`/`document.number` e um *dashboard* de duplicados) e guardar um **hash irreversível** numa tabela `identidades_vistas`; no `criar-verificacao`/aprovação, **recusar** se o hash já estiver ativo noutra conta ou numa **denylist de expulsos**. Reter o par (hash + estado reputacional grave) **sobrevive** ao apagamento da conta.
- **Desenho:** definir a política de retenção mínima pós-apagamento (só hash + marcas graves, nunca o resto).
- **Advogado:** licitude da retenção por interesse legítimo vs direito ao apagamento (LIA art. 6.º/1/f) e denylist permanente para expulsos — **já é a Q10-A** do briefing; é o desbloqueio jurídico que falta.

---

### B — Segunda conta simultânea com o mesmo CC 🟠
**Ataque:** a mesma pessoa cria 2+ contas e verifica a identidade em todas (o `criar-verificacao` aceita a mesma pessoa/documento tantas vezes quantas as contas). "1 pessoa = 1 conta" **não é imposto na identidade**.

**Funciona hoje? SIM** (mesmo mecanismo da fuga A — ausência de dedup por documento). Serve para: sockpuppets verificados, evasão de `bloqueios` (migração 024 bloqueia por `perfil_id`, não por pessoa), operar como "profissional" e "cliente" ao mesmo tempo, e — sobretudo — dar a uma farm de reputação (C) contrapartes que **parecem** verificadas.

**Severidade: 🟠 Alta.** Impacto: fraude/confiança.
**Mitigação:** a mesma da A (dedup por fingerprint do documento resolve as duas de uma vez) + advogado.

---

### C — Farm de mérito com "clientes" sockpuppet (o elo mais fraco do interno) 🔴
**Ataque, passo a passo:**
1. O beneficiário **B** verifica a identidade **uma vez** (é o único lado que precisa: a guarda `guarda_aceita_verificado` da migração 004 e o `aperto-agir` só exigem identidade a **quem ACEITA** — `para_perfil`).
2. Cria-se uma conta descartável **A** (email grátis, **sem** verificação de identidade — quem *pede*, *sela* e *avalia* nunca precisa de estar verificado; políticas `orc_pede`, transições `aceite→selado` e a política de avaliação não exigem identidade a `de_perfil`).
3. **A** cria pedido → **B** aceita (`aperto-agir`) → **A** sela → ambos tocam o checkpoint (`agir-checkpoint`) — **sem esperar os 6 dias** (o prazo é só do resolver/aviso) e **sem prova real** (o `ficheiro` é opcional; `ficheiroOk` pode ser vazio) → estado **`honrado`**.
4. `atualizar_contadores_honra` (016/033) faz **+1 `negocios_honrados`** e **+1 `apertos_selados`** a **ambos**. Ao **2.º** honrado, o trigger `sincronizar_selo_profissao_trabalho` (029, `LIMIAR_TRABALHO=2`) **acende o selo "profissão por trabalho"** de B.
5. **B** marca `entregue` → **A** confirma `concluido` → **A** avalia **B** com 5★ (política `avaliacoes_insere_com_prova` da 037: basta `de_perfil=auth.uid()` e estado `concluido`). `recalc_indice` (010) põe `indice_confianca = média` → 5.0.

Repete-se em minutos por ciclo, com contas A diferentes. Resultado: contadores altos, selo profissional aceso e índice 5.0 — **tudo fabricado por 1 pessoa**, sem cúmplice e sem trabalho.

**Funciona hoje? SIM.** As guardas da migração 010 fecharam a forja **direta** de estados (inserir `concluido` à mão, editar índice, auto-acender selo) — mas **não** a forja por **ciclo real** com sockpuppets, que passa por todas as guardas legítimas. Não existe: exigência de identidade em `de_perfil`, dedup de contraparte, limite de velocidade, deteção de par/cluster repetido, nem ponderação das avaliações pela qualidade do avaliador. O auto-negócio **literal** de 1 só conta (de_perfil=para_perfil) está travado no `agir-checkpoint` (o `if/else` só marca `a_agiu`, nunca `b_agiu` → nunca chega a honrado) — mas basta uma 2.ª conta para o vetor abrir por inteiro.

**Severidade: 🔴 Crítica.** Impacto: confiança. É exatamente o fosso que a 010 quis proteger ("se a reputação for falsificável, não vale nada").

**Mitigação:**
- **Código:** (1) exigir **identidade verificada também em quem PEDE e em quem AVALIA** (fecha a maior parte, porque encarece cada sockpuppet a uma identidade real — e a dedup da fuga A/B remata); (2) o selo "por trabalho" exigir **≥2 contrapartes DISTINTAS e verificadas** (não 2 negócios com a mesma/duas contas falsas); (3) **velocity/graph limits** — sinalizar clusters que só negoceiam entre si; (4) ponderar `indice_confianca` pela idade/reputação do avaliador (uma avaliação de conta recém-criada sem histórico pesa pouco).
- **Desenho:** o selo "profissão por trabalho" é o ponto mais frágil — subir o limiar e ancorá-lo em contrapartes independentes verificadas; considerar exigir, para negócios que contam para o selo, um sinal mais caro de falsificar (ex.: prova-de-encontro/OTP como no convite).

---

### D — Marca interna por inação: tocar o botão escapa e empurra a culpa 🟠
**Ataque:** no checkpoint interno, a marca cai por **inação** (`resolver-caucoes`: `quem_falhou = aAgiu&&!bAgiu?'b' : !aAgiu&&bAgiu?'a' : 'ambos'`). O freelancer **B** que não entregou nada toca "apresentei evolução" (`b_agiu`, ficheiro opcional). O cliente **A** (vítima), vendo que nada foi entregue, **não confirma**. No checkpoint: `aAgiu=false, bAgiu=true → quem_falhou='a'` → **a vítima leva a marca**, o incumpridor fica limpo. Simetricamente, o ator malicioso que **toca sempre** nunca é marcado; a marca só apanha quem fica passivo.

**Funciona hoje? SIM.** `agir-checkpoint` não valida substância nenhuma — só regista o toque; `resolver-caucoes` marca puramente por quem não tocou.

**Severidade: 🟠 Alta.** Impacto: confiança. Inverte a justiça da marca e cria um incentivo perverso: o cliente honesto passa a **confirmar trabalho mau** só para não ser marcado → corrompe a marca **e** as avaliações (que só abrem depois de `concluido`).

**Mitigação:**
- **Desenho:** a marca não pode ser "quem tocou primeiro". Introduzir **contestação/disputa** que suspende a marca quando um lado agiu e o outro reclama; distinguir "apresentou evidência real" (com ficheiro/prova) de "tocou". O lado que reclama tem de poder abrir disputa **antes** de a marca cair.
- **Código:** exigir evidência (ficheiro) para `b_agiu` contar como "apresentou"; expor o desfecho contestável.

---

### E — Contrato-convite: checkpoint unilateral do profissional (cobrar sem entregar / double-dip) 🟠
**Ataque:** o `convite-checkpoint` só tem **um** ator — o profissional (JWT). `nao_recebi` → captura o hold (ou MIT direto) da cláusula penal do escalão 3 (`pct_caucao=25%`) ao cartão gravado do cliente, **sem exigir prova nenhuma**. Um profissional que **foi pago por fora** (ou a quem o cliente compareceu) pode na mesma tocar `nao_recebi` e ficar com o pagamento de fora **E** capturar 25% do cliente. O cliente-convidado não tem conta, não avalia, não marca ninguém — só lhe resta o chargeback.

**Funciona hoje? SIM** (nível ≥2 com cartão gravado). Confirmado em `convite-checkpoint/index.ts`: a decisão é 100% do profissional; `nao_recebi` chama `capturarHold`/`cobrarMit` sem qualquer input do cliente. (O ghost — não tocar — marca o profissional a D+1, `resolver-convites`; mas tocar `nao_recebi` não custa nada ao profissional.)

**Severidade: 🟠 Alta.** Impacto: económico (cliente lesado) + legal (prática comercial desleal, DL 57/2008; e a "prova de encontro + OTP" que o desenho promete como fosso **não existe** no código do checkpoint) + confiança + risco de chargeback/VAMP.

**É o maior fosso entre desenho e implementação:** o `DESENHO`/memória falam de crítica e cobrança "só com prova de encontro + OTP"; o `convite-checkpoint` **não recolhe consentimento nem prova do cliente** para o `nao_recebi` cobrar.

**Mitigação:**
- **Desenho + código:** o `nao_recebi` que **cobra** tem de exigir prova-de-encontro/OTP do cliente (ou uma janela de contestação do cliente por magic link antes da captura). Sem consentimento do cliente, a captura fica frágil na disputa (o pacote de prova não inclui o "sim" do cliente ao incumprimento).
- **Advogado:** confirmar que a captura unilateral sem contraditório do consumidor é defensável (chargeback + DL 57/2008 + cláusula penal art. 810.º CC).

---

### F — Cliente assina e faz chargeback da cláusula penal 🟠
**Ataque:** direct charge na conta Connect do **profissional** (merchant of record, migração 035). O cliente disputa a cobrança da penalização como "serviço não prestado"/"não reconheço". A disputa debita o profissional; a fee 5% do Honra pode ser estornada; +20 €/disputa. O pacote de prova (OTP, `contrato_hash` imutável, política aceite — `eventos_convite` append-only) é a defesa.

**Funciona hoje? SIM** (é inerente a cartões; nada no código o impede — nem deve). O risco agrava-se pela fuga E: se o profissional capturou sem prova de encontro, o cliente ganha o chargeback com facilidade.

**Severidade: 🟠 Média-alta.** Impacto: económico (profissional) + **risco de portfólio Stripe** — `PAGAMENTOS §5.3`: se o profissional tiver saldo negativo, a plataforma (Honra) pode ser chamada; o rácio VAMP com denominador pequeno dispara depressa.
**Mitigação:** desenho/advogado (pacote de prova robusto, descritor `HONRA* <PRO>`, email pré-captura — desenhado em `PAGAMENTOS §5.4` mas **ainda não construído**) + código (instrumentar `charge.dispute.*` e `radar.early_fraud_warning`).

---

### G — Fuga à fee (5%): perdão combinado + pagar por fora 🟡
**Ataque:** perdão = fee 0 (`convite-cancelar` acção `perdoar`; `convite-checkpoint` acção `recebi`). Profissional e cliente combinam: o profissional toca `recebi` (0 €, fee 0) e o cliente paga a penalização por fora (MB Way/numerário). O Honra não vê fee.

**Funciona hoje? SIM, mas AUTO-LIMITANTE:** para poupar 5% o profissional **abdica do mecanismo de execução** (a caução só se cobra via Honra). Só compensa quando o cliente paga voluntariamente — precisamente o que a caução existe para garantir.

**Severidade: 🟡 Baixa-média.** Impacto: perda de fee marginal.
**Mitigação:** aceitar como limite do modelo — a fee é sobre a proteção **executada**; cobrar sobre acordos fora do sistema exigiria deter fundos (o que quebra a estrutura regulatória, migração 035). Nenhuma ação de código sensata.

---

### H — Subvalorizar `valor_total` para encolher fee e penalização 🟡
**Ataque:** a base da penalização = `valor_total` do formulário, fornecido pelo **cliente** (`convite-formulario`). Combinam pôr valor baixo (ou "a combinar"=`null` → sem instrumento, sem cobrança, sem fee — o `resolver-convites` marca `sem_hold_sem_valor`) e o resto por sinal/fora.

**Funciona hoje? SIM, mas AUTO-LIMITANTE** (reduz também a própria proteção do profissional). As percentagens (`pct_caucao=25`, `pct_cancelamento=12`, `janela=2`) estão **fixas em constantes** no `convite-decidir` — o profissional **não** as pode manipular, o que é bom; só a base é que é subvalorizável.

**Severidade: 🟡 Baixa.** Mitigação: desenho (aceitável; opcional sanity-check de `valor_total` vs categoria/mercado).

---

### I — Desintermediação (combinar por fora depois de se conhecerem) 🟠
**Ataque:** interno e convite — nada impede as partes de, após o primeiro contacto no Honra, tratarem tudo por fora. O fosso é a credencial verificada + o histórico honrado + (no convite) a caução. **Atrito real:** perde-se o histórico/proteção e, no convite, a caução; mas para um negócio único entre partes que já confiam, é trivial.

**Funciona hoje? SIM** (estrutural em qualquer marketplace, não é um "bug").
**Severidade: 🟠 Média.** Impacto: económico (churn de GMV/fee).
**Mitigação:** desenho — o valor recorrente tem de viver na plataforma (descoberta, histórico verificado, proteção); **não há guarda técnica** que o impeça nem deve haver. É a razão pela qual a fatia B2C (descoberta + crítica com prova) importa: dá valor que não se leva para fora.

---

### J — Escapar à marca por "cancelamento mútuo" combinado 🟠
**Ataque:** `cancelar-mutuo` — ambos tocam cancelar → `cancelado`, **sem marca**, conta como `cancelados_mutuo` (neutro). Quem falhou propõe cancelar; se o outro aceitar (por acordo/compensação), ninguém é marcado.

**Funciona hoje? SIM, por acordo.** Requer o consentimento da outra parte — para disputas genuínas a vítima não tem incentivo a consentir (mitigação natural). Mas pode ser negociado ("cancela mútuo e devolvo-te X").
**Severidade: 🟠 Média.** Impacto: confiança (marcas evitáveis; `cancelados_mutuo` inflacionável). Já **parcialmente mitigado**: `cancelados_mutuo` é mostrado (a decisão 033 — "o cancelamento mútuo faz a sua história"); muitos cancelados = sinal visível.
**Mitigação:** desenho — expor o rácio de cancelados; opcional limitar cancelamentos mútuos por par/período.

---

### K — Formulário público como vetor de spam/smishing 🟠
**Ataque:** `convite-formulario` é público (`--no-verify-jwt`). Um atacante submete formulário a um profissional verificado com o **telefone de uma vítima**. Se o profissional aceitar (`convite-decidir`), sai um SMS do Honra para a vítima ("o teu profissional preparou o contrato, assina: `<link>`") — **smishing amplificado pelo Honra**. Rate-limit fraco (5/IP/10min; 45s/telefone via `clientes_convidados`); CAPTCHA é TODO explícito. Também cria linhas `clientes_convidados` com PII de vítimas e polui a fila do profissional.

**Funciona hoje? PARCIAL:** hoje a maioria dos SMS está **parqueada** (Bird TODO / `CONVITE_MODO_TESTE`), por isso o vetor está **latente** — arma quando o envio de SMS ficar ao vivo. O `convite-decidir` **envia** SMS de texto livre ao aceitar, portanto o caminho existe.
**Severidade: 🟠 Média.** Impacto: confiança + legal (Lei 41/2004, comunicações não solicitadas; reputação de sender/número).
**Mitigação:** código — CAPTCHA no formulário **e/ou** confirmar posse do número por OTP **antes** de criar o contrato (hoje o OTP só entra na assinatura); reforçar rate-limit por telefone/IP. + advogado.

---

### L — Selo profissão via cédula: homónimo / cédula alheia 🟡
**Ataque:** o cruzamento nome-da-cédula ↔ identidade verificada é **juízo manual do admin** — não há código que o faça (`profissao-submeter` só exige identidade verificada e guarda a alegação; `profissao-rever` só verifica `is_admin` e acende o selo se o admin `aprovar`). Um "João Silva" verificado submete a cédula real de **outro** "João Silva" advogado; o admin confirma nome+nº+ativo no portal da Ordem (batem) e pode não distinguir o homónimo. À escala, 1 admin a rever tudo → risco de rubber-stamp.

**Funciona hoje? PARCIAL** (depende da diligência do admin; exige um homónimo real e ativo).
**Severidade: 🟡 Média-baixa.** Impacto: confiança + legal (selo errado = prática enganosa DL 57/2008; responsabilidade Q9 do briefing).
**Mitigação:** desenho/processo — checklist de revisão que cruze mais atributos (data de nascimento/foto do portal da Ordem quando existam) e exija correspondência forte; a longo prazo, automatizar o cruzamento com a fonte. + advogado.

---

### M — Débito para evitar o hold e falhar o MIT de propósito 🟠
**Ataque:** por desenho (`PAGAMENTOS §4`, `resolver-convites`), **débito/pré-pago → sem hold**, só MIT na quebra (modelo Fresha). O cliente que sabe disto usa débito, deixa a conta a zero; o MIT falha (`insufficient_funds`); o dunning (D+1/D+3/D+7, máx. 4) tenta e desiste → `cobranca_incobravel`. A penalização **não** é cobrada.

**Funciona hoje? SIM** (trade-off assumido do débito — PT é ~90% débito).
**Severidade: 🟠 Média.** Impacto: económico (profissional não recebe). **Nota estrutural importante:** para o **cliente-convidado**, "a reputação é a caução" **não se aplica** (ele não tem conta nem marca), e o único dente é o instrumento financeiro — que em débito é **evitável**. No débito, o contrato-convite fica **sem dente real** para um cliente de má-fé.
**Mitigação:** desenho — é o limite conhecido do débito em PT; opções: exigir crédito para eventos de alto valor, ou sinal (fora do Honra) maior no débito. + advogado (equilíbrio da cláusula).

---

### N — Inconsistência 3% ↔ 5% em comentários/UI 🟢
`_shared/pagamentos.ts` (`feePenalizacao`) usa **5%** (decisão 17/07). Mas os cabeçalhos de `convite-cancelar` e `convite-checkpoint` ainda dizem **3%**. Cosmético, mas: se a UI/contrato mostrar 3% e cobrar 5%, é risco de transparência (DL 57/2008).
**Mitigação:** código — alinhar comentários e qualquer texto ao cliente com os 5% reais.

---

### O — Conluio a dois: identidades reais, trabalho fabricado 🔴 (20/07, levantada pelo Vítor)
**Ataque:** 2 amigos com contas verificadas fazem orçamentos um ao outro, "apresentam evolução"
nos checkpoints com fotos tiradas à toa, confirmam tudo em conformidade e avaliam-se com 5★.
Nenhuma regra formal é violada — o trabalho é que não existe. Custo: 0€ (o aperto interno não
tem dinheiro desde a 032).

**O que compra HOJE (verificado no código a 20/07):** N honrados, Confiança 100% (barra),
índice 5.0, escalão **Reconhecido**. **O que JÁ NÃO compra:** selo profissão, Referência e
Mestre — a 046 exige ≥2 contrapartes DISTINTAS verificadas (lado contratado) e os escalões de
topo exigem 4 abas verdes; um par fechado tem 1 contraparte cada, para sempre.

**Verdade estrutural:** conluio entre identidades reais não se ELIMINA em nenhuma plataforma;
encarece-se, limita-se o teto do ganho e pune-se retroativamente (a identidade real é o que
torna a punição cara).

**Mitigações desenhadas (por travar pelo Vítor; construir pós-Caminho B):**
1. **Diversidade nos ESCALÕES (a principal):** estender o princípio da 046 ao rank —
   Reconhecido ≥2 contrapartes distintas, Referência ≥5, Mestre ≥10 (números afináveis).
   Coerente com a lei existente; mata o teto do par sem tocar em utilizadores legítimos.
2. **Rendimentos decrescentes por contraparte:** honrados com a MESMA contraparte contam para
   Confiança%/rank só até K (ex.: 2); a partir daí mostram-se como "voltou a contratar" (sinal
   honesto e positivo de repeat, mas deixa de inflacionar o número principal).
3. **Deteção (fila de revisão, nunca bloqueio automático):** reciprocidade espelhada A↔B,
   cadência anómala, hash percetual de fotos de evidência repetidas entre checkpoints/negócios,
   mesma origem de rede. A espinha de eventos imutável (visão macro) é a prova.
4. **Punição:** confirmado o conluio → `registar_infracao(...,'ataque')` nos DOIS (suspensão
   direta, piso 1 mês), avaliações do par anuladas no recálculo, identidade retida. Os Termos
   têm de nomear fraude de reputação (flanco "práticas desleais" do pacote jurídico).
5. **Transparência como dissuasor:** o histórico é público — 30 honrados todos com o mesmo
   @handle são visivelmente ocos para qualquer cliente que toque no perfil. Mostrar
   contrapartes sem fricção é defesa passiva.

**O que NÃO fazer:** reintroduzir dinheiro no aperto interno (decisão 14/07 — e o conluio paga
fees alegremente, o Fiverr prova-o); prova-de-encontro OTP no interno (os amigos encontram-se
MESMO — prova presença, não trabalho).

## 4. As 3 que eu taparia primeiro — e porquê

1. **A — Lavagem de reputação (apagar+recriar com o mesmo CC).** É a **raiz**. Enquanto a identidade não persistir através do apagamento, **toda** a consequência reputacional (marca → suspensão → expulsão) é reversível com dois cliques, e o modelo "a reputação é a caução" é decorativo. Tapar isto (hash do documento + denylist, retido pós-apagamento) é o desbloqueio de maior alavanca — e o jurídico já está mapeado (Q10-A). **Sem isto, nada do resto importa.**

2. **C — Farm de mérito com sockpuppets.** É o ataque que falsifica **o produto inteiro** (índice, contadores, selo profissional) por 1 pessoa, sem cúmplice, em minutos. O mínimo eficaz: **exigir identidade verificada também em quem pede e avalia** (encarece cada sockpuppet a uma identidade real) + o selo "por trabalho" exigir **contrapartes distintas verificadas**. Combinado com a correção A/B (dedup de documento), fecha a economia do ataque.

3. **E — Checkpoint-convite unilateral (cobrar sem entregar).** É onde o **dinheiro real** e o **consumidor** se encontram, e é o maior desvio entre o que o desenho promete (prova de encontro + OTP) e o que o código faz (o profissional cobra 25% sozinho, sem prova). Expõe a clientes lesados, a chargebacks e a DL 57/2008. Exigir consentimento/prova do cliente para o `nao_recebi` **cobrar** protege o cliente, o profissional honesto **e** a defesa em disputa.

---

## 5. O que já está tapado (crédito onde é devido)

Verificado no código — **não** repetir estes como fugas:
- **Auto-verificação do selo:** só o webhook (service_role) escreve `verificacoes`; o cliente nunca acende o seu selo (010 FIX 1; `profissao-rever` só admin).
- **Fabricar negócio já `concluido`:** os orçamentos **nascem em `pedido`** (`orc_pede`, 010 FIX 2); chegar a concluído exige o ciclo real.
- **Inflar o índice/contadores/`is_admin` diretamente:** `guarda_perfil` bloqueia edição pelo cliente (010/016/029/033).
- **Reescrever partes/colunas do orçamento:** `guarda_ciclo_caucao` reserva transições e colunas ao servidor (007/010).
- **Agir fora de vez no aperto:** `aperto-agir` — "um só caminho válido por combinação"; updates condicionados ao estado de partida (idempotentes).
- **Auto-negócio literal (1 conta):** travado no `agir-checkpoint` (o `if/else` nunca marca `b_agiu` quando `de_perfil=para_perfil`).
- **Contrato-convite:** escrita toda do servidor (`guarda_ciclo_convite`), `eventos_convite` **append-only**, `contrato_hash`/`assinado_em` **imutáveis** mesmo para o servidor (026).
- **Percentagens da penalização:** **fixas em constantes** no `convite-decidir` (o profissional não as manipula).
- **Plágio no portefólio / cédulas:** ficheiros só na pasta do próprio (`{uid}/…`) (010 FIX 5; `profissao-submeter`).
- **RLS:** orçamentos/contratos fechados às partes; o público só toca via Edge Functions; `bloqueios` impedem novo orçamento/mensagem (024).
- **Perdão custa 0 / o Honra não captura no interno** (032/`resolver-caucoes` nunca captura; `perdoar` = fee 0).

---

## 6. Honesto sobre o que não consegui confirmar

- **Definição-base da tabela `orcamentos`** (a migração `001` não está na pasta; começa em `002`). Confirmei o **comportamento** pelas políticas/guardas — **não** existe `check (de_perfil <> para_perfil)` em nenhuma migração presente, e o auto-negócio literal já é travado no checkpoint; mas não vi o `CREATE TABLE` original.
- **Deteção de documentos duplicados na conta Stripe Identity real:** a Stripe **oferece** deteção de duplicados, mas **não** está no código; assumi que está desligada.
- **Front-end / guardas de cliente:** li o backend/BD (a fonte da verdade — guardas de cliente são contornáveis). Não auditei o cliente Expo.
- **Envio real de SMS (Bird):** a maioria está **parqueada** (TODO/`MODO_TESTE`) — por isso o vetor K está **latente**, não ativo, até o envio ficar ao vivo.
- **`connect-onboarding`/`connect-webhook` linha-a-linha:** a exposição a chargeback/saldo negativo (fuga F) foi inferida de `PAGAMENTOS §5.3` + migração 035, não de leitura exaustiva das duas funções Connect.
- **Suspensão/expulsão automáticas:** são **TODO explícito** (`resolver-caucoes`: "fase 2, decidida mas não construída"). Hoje só existe a **marca**; a escada marca→suspensão→expulsão ainda não corre em código — o que agrava A (não há sequer o degrau de que fugir, mas também não há retenção quando existir).

---

*Relatório de red-team — só análise. Não alterou código nem base de dados.*
