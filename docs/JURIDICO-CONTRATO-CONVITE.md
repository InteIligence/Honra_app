# HONRA — Investigação jurídica: contrato-convite, caução e penalizações

> **Data:** 13/07/2026 · **Âmbito:** contrato à distância freelancer↔consumidor via formulário + OTP SMS + cartão gravado (Stripe SetupIntent) + hold de caução ~25% armado a D-7, capturado só em quebra; cancelamento escalonado; pagamento principal direto entre as partes (sem escrow).
> **Método:** pesquisa web profunda com fontes primárias (Diário da República/PGD Lisboa, EUR-Lex, EBA, Banco de Portugal, dgsi.pt, documentação oficial Stripe/Visa/Mastercard), 2+ fontes por afirmação sempre que possível. **Isto não é aconselhamento jurídico** — é o mapa para a consulta com advogado.

---

## SUMÁRIO EXECUTIVO — semáforo do desenho atual

### 🟢 VERDE (confirmado, o desenho está certo)

| Tema | Conclusão |
|---|---|
| **Sem direito de arrependimento de 14 dias** | Serviços de DJ/foto/vídeo para casamento com data marcada caem na exceção do **art. 17.º, n.º 1, al. k) do DL 24/2014** (transpõe o art. 16.º(l) da Diretiva 2011/83/UE). As Orientações da Comissão (2021/C 525/01) dão o **catering de casamento** como exemplo paradigmático, e o TJUE (**C-96/21, CTS Eventim**) confirmou que a exceção vale mesmo para **intermediários**. Condições: **data expressa no contrato** + aviso obrigatório de que não há arrependimento (art. 4.º/1/p)). Sem jurisprudência PT publicada — quase-verde, não 100% inequívoco. |
| **Contrato por OTP SMS é válido** | Liberdade de forma (art. 219.º CC) + contratação eletrónica livre (art. 25.º DL 7/2004) + não-discriminação da assinatura eletrónica (art. 25.º/1 eIDAS). É assinatura eletrónica **simples** — vale; a batalha é só probatória. |
| **SCA/MIT: o modelo "hoteleiro" é legal** | Setup do cartão com SCA/3DS + cobranças off-session como Merchant-Initiated Transactions fora do âmbito da SCA — exatamente o modelo validado pela **EBA (Q&A 2019_4792, caso hoteleiro; Q&A 2018_4131)**. O Stripe SetupIntent implementa isto nativamente. |
| **P2B e DSA: obrigações leves para micro-empresa** | O P2B aplica-se mas dispensa micro/pequenas do sistema interno de reclamações (art. 11.º/5) e mediadores (art. 12.º/7). No DSA, os arts. 19.º e 29.º isentam micro/pequenas de quase tudo (incl. KYBC do art. 30.º); resta um pacote pequeno (pontos de contacto, termos claros, notice-and-action). |

### 🟡 AMARELO (defensável, mas precisa de afinação com advogado)

| Tema | Risco |
|---|---|
| **Escalonamento de penalizações (perde sinal → 10-15% → 25%)** | Como cláusula contratual geral, cai no **art. 19.º, al. c) do DL 446/85**: proibida se **desproporcionada aos danos a ressarcir** (juízo abstrato, por escalão). Escalonar no tempo joga A FAVOR — é a fórmula que o legislador validou nas viagens organizadas (**art. 25.º DL 17/2018**: antecedência + reafetação) — e o regime supletivo (arts. 1172.º/1229.º CC) permitiria exigir até ao lucro integral, pelo que 25% capado é generoso. Mas cada degrau tem de ser justificado pelo dano típico, e o tribunal pode reduzir equitativamente (art. 812.º CC, imperativo) se a data for reocupada. Atenção também ao **art. 21.º/i** (Lei 32/2021): T&C com letra <11 / espaçamento <1,15 são nulos. |
| **Chamar "sinal" à caução** | O hold **não é sinal** — o sinal exige entrega material efetiva (TRC 09/01/2024, proc. 4432/22: cheque não pago não é sinal). E o rótulo importaria o regime do **dobro** contra o freelancer (art. 442.º/2 CC). Qualificar a caução como **cláusula penal de cancelamento** (art. 810.º CC), com o hold como garantia de cobrança — não usar "sinal" nem "caução" nos T&C sem intenção deliberada. |
| **RGPD do cliente convidado** | Base legal sólida (art. 6.º/1/b no fluxo; 6.º/1/f para reter a evidência com LIA documentada), mas o **prazo de retenção** tem de ser fixado (5-6 anos defensável; 20 anos do art. 309.º CC não passa o teste de proporcionalidade da CNPD para todos os dados). Dupla via de informação: art. 13.º no formulário + art. 14.º no primeiro contacto (o telefone vem do freelancer). |
| **IVA das penalizações** | Jurisprudência TJUE **MEO (C-295/17)** e **Vodafone Portugal (C-43/19)**: penalizações pré-fixadas por cancelamento são **contraprestação tributável em IVA**, não indemnização. O freelancer provavelmente tem de faturar a penalização (salvo isenção art. 53.º CIVA). A HONRA deve cobrar **"em nome e por conta" do freelancer** para não entrar na cadeia de IVA (art. 4.º/4 CIVA). |
| **DAC7 — obrigação "invisível"** | A HONRA cai no âmbito da **Lei 36/2023** (transpõe a Diretiva 2021/514): "serviços pessoais" contam, e a obrigação de reportar rendimentos dos freelancers à AT existe **mesmo com pagamento direto entre as partes**, porque o preço consta do contrato guardado ("razoavelmente cognoscível"). Reporte anual até 31 de janeiro. |

### 🔴 VERMELHO (o desenho atual quebra aqui — mudar antes de construir)

| Tema | Problema |
|---|---|
| **Hold a D-7 não sobrevive na Visa** | Autorização off-session (MIT) na **Visa expira em ~4 dias e 18 horas** (Mastercard/Amex: 7 dias). Um hold armado a D-7 morre a ~D-2, **antes do evento** — e nas outras redes expira no próprio dia, sem margem para capturar após o no-show. **Soluções:** re-autorizar perto da data (novo hold a D-3/D-2), captura MIT direta ao cartão gravado só no momento da quebra (sem hold, modelo Fresha), ou extended authorization (29-30 dias, exige pricing IC+ negociado com a Stripe + 0,08% na Visa). |
| **Captura na conta Stripe da HONRA + repasse = serviço de pagamento** | A HONRA atua pelos **dois lados** (arma o hold contra o cliente, cobra a favor do freelancer) → perde a exclusão de agente comercial (**art. 5.º, al. b) DL 91/2018** / art. 3.º(b) PSD2 + considerando 11 + EBA Q&A 2020_5354/5355). Se os fundos passarem pela esfera da HONRA, é atividade licenciável (Banco de Portugal). **Solução limpa: Stripe Connect com DIRECT CHARGES na conta do freelancer** (freelancer = merchant of record) **+ `application_fee_amount` para a HONRA** — os fundos nunca tocam na HONRA; a Stripe (STEL, licenciada na Irlanda, C187865) é o PSP. Destination charges são zona cinzenta; evitar. |

---

## 1. Direito de livre resolução (arrependimento) e a exceção de lazer com data marcada

**Resposta curta: o consumidor NÃO tem direito de arrependimento de 14 dias nestes contratos — mas só se o contrato previr data ou período de execução específicos, e os deveres de informação pré-contratual mantêm-se.**

### 1.1 A norma europeia e a transposição portuguesa

- **Diretiva 2011/83/UE, art. 16.º, al. l)**: exceção ao direito de retratação para «fornecimento de alojamento, para fins não residenciais, transporte de bens, serviços de aluguer de automóveis, restauração ou serviços relacionados com **atividades de lazer** se o contrato previr uma **data ou período de execução específicos**». [EUR-Lex — Diretiva 2011/83/UE](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32011L0083)
- **Transposição: DL 24/2014, de 14 de fevereiro — art. 17.º, n.º 1, alínea k)** (atenção: em Portugal é a alínea **k)**, não l) — a l) portuguesa é a dos conteúdos digitais): «1 — **Salvo acordo das partes em contrário**, o consumidor não pode resolver livremente os contratos de: … k) Fornecimento de alojamento, para fins não residenciais, transporte de bens, serviços de aluguer de automóveis, restauração ou serviços relacionados com atividades de lazer se o contrato previr uma data ou período de execução específicos.» Redação **idêntica desde 2014**, confirmada na republicação pela Lei 10/2023 (DR 1.ª série, n.º 45, 03/03/2023, pág. 32). Nota de produto: o proémio «salvo acordo em contrário» torna a exceção supletiva — a HONRA pode conceder voluntariamente um período de arrependimento se isso servir o produto. [DL 24/2014 consolidado — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2062&tabela=leis) · [Lei 10/2023 — PDF oficial DR](https://files.dre.pt/1s/2023/03/04500/0001100039.pdf)
- **Alterações ao DL 24/2014**: Lei 47/2014 (28/07), DL 78/2018 (15/10), DL 9/2021 (29/01, regime contraordenacional), DL 109-G/2021 (10/12 — transpôs a Diretiva 2019/2161 "Omnibus"; alterou as als. a) e l) do 17.º, **não a k)**), Lei 16/2022 (16/08) e Lei 10/2023 (03/03).

**Confiança: ALTA** (duas fontes independentes coincidentes, uma delas o DR em 1.ª série).

### 1.2 DJ/fotografia/vídeo de casamento cabem na exceção?

- **Muito provavelmente sim — mas não "inequívoco" por falta de decisão portuguesa publicada.**
- **Orientações da Comissão 2021/C 525/01, secção 5.11.6**: a exceção interpreta-se restritivamente à luz do considerando 49 (fundamento = **reserva de capacidade** que o profissional dificilmente reocupa); os exemplos abrangidos incluem literalmente o **«fornecimento de refeições para um aniversário ou uma festa de casamento numa data específica»** — o catering de casamento é o exemplo paradigmático da própria Comissão. Um DJ/fotógrafo/videógrafo do mesmo casamento está em posição económica idêntica (capacidade = 1 casamento/dia). A contrario: não se aplica a atividades de lazer **sem limitação de capacidade**. [Orientações 2021/C 525/01 — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX:52021XC1229(04))
- **TJUE, acórdão de 31/03/2022, C-96/21 (CTS Eventim)** — o ponto mais valioso para uma **plataforma**: a exceção do art. 16.º(l) aplica-se **mesmo quando quem contrata com o consumidor é um intermediário** (em nome próprio, por conta do organizador), desde que (i) o risco económico da capacidade libertada recaia sobre o organizador/prestador e (ii) o contrato preveja data ou período específico. É irrelevante a possibilidade prática de revender. [Acórdão C-96/21 — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:62021CJ0096)
- No desenho HONRA o contrato é celebrado **diretamente entre freelancer e cliente** — caso ainda mais simples do que o CTS Eventim: o prestador da atividade de lazer é a própria contraparte. O CTS Eventim é a rede de segurança se algum dia a HONRA contratar em nome próprio.
- **Direito comparado** (mesma norma harmonizada): na Alemanha (§ 312g Abs. 2 Nr. 9 BGB) a doutrina dominante enquadra fotografia de casamento na exceção; o **BGH 13/07/2022, VIII ZR 317/21** aplicou a exceção e decidiu que a omissão da informação de que *não há* direito **não faz nascer** o direito.
- **Não encontrada** jurisprudência portuguesa nem decisões publicadas de centros de arbitragem (CIAB/CNIACC/CICAP) sobre fotógrafos/DJs de casamento e o art. 17.º/1/k — os centros publicam pouco e mal indexado.
- **Requisito operacional crítico**: o contrato tem de prever **expressamente a data do evento** — campo obrigatório no formulário HONRA.

**Confiança: MÉDIA-ALTA** (apoio direto do considerando 49 + Orientações + CTS Eventim + doutrina alemã; sem decisão PT publicada — fotografia/vídeo ligeiramente mais discutível do que DJ/animação).

### 1.3 O que fica na mesma obrigatório

- **Informação pré-contratual — art. 4.º/1, al. p) DL 24/2014**: «Quando não haja direito de livre resolução, nos termos do artigo 17.º, a indicação de que o consumidor não beneficia desse direito» — é **obrigatório dizer expressamente, antes de contratar, que NÃO há arrependimento**. Mantêm-se os restantes deveres (identidade, preço total, características) e os requisitos de forma dos arts. 5.º-6.º (botão com indicação clara de obrigação de pagamento; confirmação em suporte duradouro).
- **Mercados em linha — arts. 4.º-A e 4.º-B** (aditados pelo DL 109-G/2021): a HONRA tem deveres próprios de plataforma — informar critérios de ordenação dos resultados e **se o prestador é ou não profissional** (com aviso das consequências). Diretamente aplicável.
- **Extensão para 12 meses (art. 10.º/2)**: só opera quando o direito de resolução **existe** e foi omitida a informação da sua existência (al. m)). Caindo na exceção, não há prazo para esticar (mesma lógica do BGH VIII ZR 317/21) — **mas** se num litígio a exceção for afastada (ex.: contrato sem data específica), a omissão faz o prazo saltar para 12 meses. Mais uma razão para a data ser campo obrigatório.
- **Sanção**: violação dos arts. 4.º/4.º-A/4.º-B = **contraordenação económica grave** (art. 31.º/2, regime RJCE/DL 9/2021, fiscalização ASAE; em infrações generalizadas UE, coima até 4% do volume de negócios). Cláusulas que limitem direitos do consumidor têm-se por não escritas (art. 29.º).
- **Recomendação de produto**: o formulário-convite deve dizer, antes da assinatura: *"Este contrato tem data de execução específica — não existe direito de livre resolução de 14 dias (art. 17.º, n.º 1, al. k) do DL 24/2014). Aplica-se a política de cancelamento abaixo."* Cumpre o art. 4.º/1/p) E é a primeira peça de evidência anti-chargeback.
- **Casais estrangeiros**: dentro da UE a exceção é harmonizada (mesma regra em todos os Estados-Membros); para consumidores de fora da UE, verificar lei aplicável/foro (Roma I, art. 6.º) — para o advogado.

**Confiança: ALTA** (texto legal lido diretamente).

---

## 2. O sinal (arts. 440.º–442.º CC) — reforça ou complica?

**Resposta curta: aplica-se a serviços apenas por convenção expressa, e é uma faca de dois gumes — se a caução for qualificada como "sinal", o freelancer que incumprir deve o DOBRO. Recomendação: estruturar como cláusula penal, não como sinal.**

- **Art. 440.º CC** (antecipação do cumprimento): «Se… um dos contraentes entregar ao outro coisa que coincida… com a prestação a que fica adstrito, é a entrega havida como antecipação total ou parcial do cumprimento, **salvo se as partes quiserem atribuir à coisa entregue o carácter de sinal**» — fora da compra e venda, o caráter de sinal **não se presume**; exige convenção. **Art. 441.º**: a presunção de sinal existe **apenas** no contrato-promessa de compra e venda. O sinal **pode** ser convencionado em qualquer contrato, incluindo serviços de DJ/fotografia (o art. 440.º está na parte geral dos contratos). [CC — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=775&tabela=leis) · [Art. 440.º anotado](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-i-das-obrigacoes-em-geral/capitulo-ii-fontes-das-obrigacoes/seccao-i-contratos/subseccao-viii-antecipacao-do-cumprimento-sinal/artigo-440-o-antecipacao-do-cumprimento/)
- **Art. 442.º CC (Sinal)**: n.º 1 — o sinal imputa-se na prestação devida ou é restituído; n.º 2 — **se quem deu o sinal incumprir, perde-o; se quem o recebeu incumprir, restitui o dobro**; n.º 4 — salvo estipulação em contrário, o sinal **esgota** a indemnização (não há indemnização suplementar). Exemplo de aplicação: TRL 17/12/2019, proc. 22550/18.2T8LSB.L1-7 (devolução de €15.000 por incumprimento de quem recebeu o sinal). [Art. 442.º CC — anotado](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-i-das-obrigacoes-em-geral/capitulo-ii-fontes-das-obrigacoes/seccao-i-contratos/subseccao-viii-antecipacao-do-cumprimento-sinal/artigo-442-o-sinal/)
- **O hold da HONRA NÃO é um sinal — com apoio jurisprudencial direto**: o sinal é um contrato real *quoad constitutionem* — exige **entrega material efetiva**. O **TRC 09/01/2024, proc. 4432/22.5T8CBR.C1** decidiu que um cheque não pago **não constituiu sinal**, distinguindo-o da cláusula penal («simples promessa a cumprir no futuro, meramente consensual») — analogia direta: uma autorização não capturada no cartão não é dinheiro entregue, logo não é sinal. [dgsi](https://dgsi.pt/jtrc.nsf/c3fb530030ea1c61802568d9005cd5bb/39145fe5d0323ee680258ab4003ddc9e?OpenDocument=) · [resumo TRC](https://trc.pt/contrato-promessa-sinal-clausula-penal-criterios-de-distincao-interpretacao-do-contrato/)
- A qualificação natural do desenho HONRA é **cláusula penal** — **art. 810.º/1 CC**: «As partes podem fixar por acordo o montante da indemnização exigível: é o que se chama cláusula penal» — com o hold como mera **garantia de cobrança** dessa pena. Sujeita a **redução equitativa quando manifestamente excessiva (art. 812.º CC — imperativo: «é nula qualquer estipulação em contrário»**; redução também em cumprimento parcial, 812.º/2). O **STJ 18/01/2022, proc. 889/18.7T8EPS.P1.S1** admitiu redução **oficiosa** em contrato de adesão, aferida pelo dano efetivo no momento do incumprimento (nota: há divergência no STJ — outra corrente exige pedido do devedor). [Art. 810.º](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-i-das-obrigacoes-em-geral/capitulo-vii-cumprimento-e-nao-cumprimento-das-obrigacoes/seccao-ii-nao-cumprimento/subseccao-ii-falta-de-cumprimento-e-mora-imputaveis-ao-devedor/divisao-iv-fixacao-contratual-dos-direitos-do-credor/artigo-810-o-clausula-penal/) · [Art. 812.º](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-i-das-obrigacoes-em-geral/capitulo-vii-cumprimento-e-nao-cumprimento-das-obrigacoes/seccao-ii-nao-cumprimento/subseccao-ii-falta-de-cumprimento-e-mora-imputaveis-ao-devedor/divisao-iv-fixacao-contratual-dos-direitos-do-credor/artigo-812-o-reducao-equitativa-da-clausula-penal/) · [STJ 889/18 — dgsi](https://www.dgsi.pt/jstj.nsf/954f0ce6ad9dd8b980256b5f003fa814/ff16abcadccdd08a802587d00046b3e9)
- **Implicações para o desenho:**
  1. Se os contratos-tipo da HONRA usarem a palavra "sinal" para pagamentos antecipados reais (ex.: 20% pagos ao freelancer na adjudicação, fora da plataforma), o regime do art. 442.º cola-se-lhes: cliente desiste → perde o sinal; **freelancer falha → dobro**. Isso é bidirecionalidade que protege o consumidor e pode até ser argumento de equilíbrio nas cláusulas (ver secção 3).
  2. A **caução via hold** deve ser redigida como cláusula penal: "em caso de cancelamento a menos de X dias, o cliente deve a título de cláusula penal Y% do valor, cuja cobrança autoriza no cartão registado". Não misturar os dois institutos no mesmo texto.
  3. A bidirecionalidade "aperto de mão de 2 lados" do desenho HONRA (penalização também quando o freelancer quebra) é **exigível pelo equilíbrio do DL 446/85** (art. 19.º, al. c) e boa-fé do art. 15.º) — uma cláusula penal só contra o consumidor, sem contrapartida quando o profissional falha, é candidata a abusiva.

**Confiança: ALTA** na letra dos artigos; **MÉDIA** na qualificação exata do hold (doutrina não unívoca — é exatamente o tipo de coisa que o advogado fecha em 15 minutos com o contrato-tipo à frente).

---

## 3. Cancelamento escalonado vs. cláusulas contratuais gerais (DL 446/85)

**Resposta curta: escalonar no tempo é a estrutura MAIS defensável que existe — mas cada degrau tem de ser proporcional ao dano típico, o contrato tem de ser comunicado e explicado, e um degrau final acima de ~25-30% perto da data começa a pedir justificação forte.**

- **Regime**: o DL 446/85, de 25 de outubro, continua em vigor, alterado pelo DL 220/95 (+Retif. 114-B/95), DL 249/99, DL 323/2001, **Lei 32/2021**, DL 108/2021, DL 109-G/2021, Lei 10/2023 e DL 123/2023. **Nota importante: a Lei 32/2021 NÃO aditou um "art. 21.º-A"** — aditou a **alínea i) ao art. 21.º**: proibição absoluta de cláusulas «com letra inferior a 11 ou a 2,5 mm e espaçamento entre linhas inferior a 1,15» — **diretamente relevante para os T&C na app** (tipografia mínima sob pena de nulidade). Aplica-se a cláusulas pré-elaboradas sem negociação individual — exatamente o contrato-tipo da HONRA. [DL 446/85 — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=837&tabela=leis) · [Versão consolidada DRE](https://diariodarepublica.pt/dr/legislacao-consolidada/decreto-lei/1985-34436475) · [Lei 32/2021 — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=3436&tabela=leis&ficha=1&pagina=1&so_miolo=S)
- **Normas-chave:**
  - **Arts. 5.º-6.º e 8.º**: dever de **comunicação integral e prévia** e de **informação** — cláusulas não comunicadas adequadamente consideram-se **excluídas** do contrato. Num fluxo móvel de convite, isto exige a política de cancelamento visível ANTES do OTP, não escondida em link.
  - **Art. 15.º-16.º**: proibição geral de cláusulas contrárias à boa-fé.
  - **Art. 19.º, al. c)** (relações com consumidores finais, proibição relativa): são proibidas, «consoante o quadro negocial padronizado», as cláusulas que «consagrem **cláusulas penais desproporcionadas aos danos a ressarcir**». O juízo é **objetivo e abstrato**: compara-se a pena com os danos que **típica e normalmente** resultam naquele setor — não com o dano concreto. [Jurisprudência TRC sobre 19.º/c](https://trc.pt/clausulas-contratuais-gerais-clausula-penal-desproporcionalidade-nulidade-e-exclusao/)
  - **Art. 12.º**: cláusulas proibidas são **nulas**; **art. 812.º CC** permite ainda a redução equitativa da pena manifestamente excessiva.
- **O escalonamento temporal foi validado pelo próprio legislador no setor mais próximo** — **DL 17/2018, de 8/03, art. 25.º** (viagens organizadas; transpõe a Diretiva (UE) 2015/2302): o viajante pode rescindir a todo o tempo, pagando taxa «adequada e justificável», **«calculada com base na antecedência da rescisão… e nas economias de custos e nas receitas esperadas em resultado da reafetação dos serviços»**. É exatamente a fórmula do escalonamento HONRA: antecedência + poupança de custos + probabilidade de re-reserva da data. [DL 17/2018 — DRE](https://diariodarepublica.pt/dr/detalhe/decreto-lei/17-2018-114832293)
- **Aplicação ao escalonamento HONRA (perde adiantamento → 10-15% → 25%):**
  - A lógica temporal espelha o dano típico do freelancer (quanto mais perto da data, menor a chance de reocupar a data) — alinha com o art. 19.º/c. **Estrutura correta.**
  - O teste do 19.º/c faz-se **por escalão**: cada percentagem tem de ser justificável face ao dano típico naquele momento. **Documentar o racional** (taxas históricas de re-reserva por antecedência) é a melhor defesa.
  - Mesmo válida em abstrato, a pena concreta pode ser **reduzida ex art. 812.º** se o freelancer reocupar a data (dano efetivo ≈ 0) — considerar **devolução automática se a data for re-preenchida**: além de justo, blinda a cláusula (e enaltece o produto).
  - **Simetria**: penalização espelhada (ou consequência séria) para quebra pelo freelancer reforça a validade (boa-fé, arts. 15.º-16.º).
  - **Trunfo argumentativo**: o regime supletivo legal permitiria ao prestador exigir **até ao lucro integral** (ver nota abaixo sobre 1229.º/1172.º CC) — um teto de 25% é *mais favorável ao consumidor* do que a lei supletiva. Excelente defesa contra a acusação de desproporção.
- **Jurisprudência aplicável (por analogia — não há casos publicados de casamentos):**
  - **TRG 14/03/2024, proc. 2983/20.5T8BRG.G1**: em contratos de adesão há **duplo controlo** da cláusula penal — (1.º) desproporcionada aos danos típicos → **nula** (19.º/c + 12.º DL 446/85; sem exigência de desproporção "manifesta"); (2.º) se válida, ainda redutível ex 812.º CC (no caso, cortou a pena de ~1/3 para ~1/6 do valor). [dgsi](https://www.dgsi.pt/jtrg.nsf/86c25a698e4e7cb7802579ec004d3832/3e4f90ff1cd5048e80258ae8004de717?OpenDocument=)
  - **TRC 28/10/2025, proc. 1283/23.3T8LRA.C1**: cláusula que permitia exigir o preço integral sem contraprestação → **nula por 19.º/c**. [resumo TRC](https://trc.pt/clausulas-contratuais-gerais-clausula-penal-desproporcionalidade-nulidade-e-exclusao/)
  - **CACCL, Sentença 321/2025, proc. 1506/2025 (11/08/2025)**: evento cancelado pelo promotor → devolução do preço; **a plataforma intermediária de venda não responde** — precedente arbitral favorável ao modelo marketplace da HONRA. [PDF CACCL](https://www.centroarbitragemlisboa.pt/files/jurisprudencia/sentencas2025/diversas/Sent.321.pdf)
- **Posição da DECO** (obtida por via indireta — sem dossier dedicado a casamentos): não há lei específica para cancelamento de festas; o prestador **pode reter uma parte** (tipicamente sinal de 10-20%) **se já iniciou preparativos ou contratou terceiros**, devolvendo o resto; na hotelaria aceita penalização **desde que o consumidor tenha aderido expressamente à condição**. [DECO PROteste — hotéis](https://www.deco.proteste.pt/familia-consumo/ferias-lazer/dicas/hoteis-fazer-ha-problemas)

**Confiança: ALTA** no regime legal e no paralelo DL 17/2018; **MÉDIA** na jurisprudência (decisões citadas verificadas; inexistência de casos de casamentos não garantida — o motor do dgsi não é totalmente indexável); **MÉDIA** na posição DECO (via indireta).

**Nota sobre a livre desistência**: mesmo sem direito de arrependimento, o consumidor pode sempre desistir — a questão nunca é "se", é "quanto paga". Para serviços atípicos regem as regras do mandato por remissão do **art. 1156.º CC** (jurisprudência constante, ex. STJ 2018, proc. 216/15.5T8GRD.C1.S1); a revogação é livre e **imperativa** («não obstante convenção em contrário» — **art. 1170.º/1 CC**), obrigando a indemnizar (art. 1172.º). No paralelo da empreitada, o **art. 1229.º CC** manda indemnizar o empreiteiro «dos seus gastos e trabalho **e do proveito que poderia tirar da obra**» — i.e., o regime supletivo pode chegar a 100% do lucro do contrato. A cláusula de cancelamento da HONRA é a **liquidação antecipada** (e capada) dessa indemnização — e nunca pode *impedir* o cancelamento, só fixar-lhe o preço (o desenho atual respeita isto). [Art. 1170.º](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-ii-dos-contratos-em-especial/capitulo-x-mandato/seccao-iv-revogacao-e-caducidade-do-mandato/subseccao-i-revogacao/artigo-1170-o-revogabilidade-do-mandato/) · [Art. 1229.º](https://informador.pt/legislacao/lexit/codigos/direito-civil/codigo-civil/livro-ii-direito-das-obrigacoes/titulo-ii-dos-contratos-em-especial/capitulo-xii-empreitada/seccao-v-extincao-do-contrato/artigo-1229-o-desistencia-do-dono-da-obra/)

---

## 4. Assinatura eletrónica por OTP SMS (eIDAS)

**Resposta curta: é assinatura eletrónica SIMPLES — válida, admissível como prova, mas de livre apreciação pelo tribunal. Quem tem melhor audit trail ganha; um selo temporal qualificado é o único upgrade barato que compra uma presunção legal.**

### 4.1 Classificação e efeitos (eIDAS)

- **Assinatura eletrónica simples** — art. 3.º/10 do Reg. (UE) 910/2014. **Não** é avançada porque falha requisitos do art. 26.º, sobretudo a al. c): o OTP é gerado pelo prestador, transita por canal SMS vulnerável (SIM swap) e não está sob controlo exclusivo do signatário; e a al. d): o OTP em si não está criptograficamente ligado ao documento (só o hash da plataforma cria essa ligação). [eIDAS consolidado — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX%3A02014R0910-20240520)
- **Art. 25.º/1 eIDAS (não discriminação)**: «Não podem ser negados efeitos legais nem admissibilidade enquanto prova… pelo simples facto de se apresentar em formato eletrónico ou de não cumprir os requisitos das assinaturas eletrónicas qualificadas.»
- **eIDAS 2.0 (Reg. 2024/1183)** não alterou os arts. 3.º/10, 25.º e 26.º. Novidade futura: **EUDI Wallet** dará assinatura qualificada gratuita a cidadãos UE — upgrade natural para a HONRA a médio prazo.

### 4.2 Direito português — valor probatório

- **DL 12/2021, de 9 de fevereiro** (executa o eIDAS; **revogou o DL 290-D/99** — art. 36.º). **Art. 3.º, n.º 10**: «O valor probatório dos documentos eletrónicos não associados a serviços de confiança qualificados é apreciado **nos termos gerais do direito**» → livre apreciação (art. 366.º CC). Assinatura **qualificada** = força de documento particular assinado (art. 376.º CC). [DL 12/2021 — DRE](https://diariodarepublica.pt/dr/detalhe/decreto-lei/12-2021-156848060) · [PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=3404&tabela=leis)
- **Liberdade de forma**: art. 219.º CC — serviços de eventos não exigem forma escrita; a assinatura OTP não é condição de validade, é só prova. **Art. 25.º/1 DL 7/2004** (comércio eletrónico): «É livre a celebração de contratos por via eletrónica…» (serviços de eventos não caem nas exclusões do n.º 2). [DL 7/2004 — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1399&tabela=leis)

### 4.3 Jurisprudência portuguesa (a lição do audit trail)

- **TRP 24/02/2026, proc. 103054/24.4YIPRT.P1** — crédito online com OTP SMS; o banco **perdeu**: audit trail fraco (sem gravação, testemunha indireta, discrepâncias). Sumário cita verbatim o art. 3.º/10 do DL 12/2021. [dgsi](https://www.dgsi.pt/jtrp.nsf/56a6e7121657f91e80257cda00381fdf/6bdf1b2ffea1c3d080258db8003ef996?OpenDocument=)
- **TRP 10/07/2024, proc. 106478/22.8YIPRT.P1** — mútuo com OTP via **prestador de serviços de confiança registado**; o credor **ganhou**: certificação por terceiro, GUID em todas as páginas, dados que só o devedor podia fornecer. [dgsi](https://dgsi.pt/jtrp.nsf/56a6e7121657f91e80257cda00381fdf/e0a73577f523238c80258bba004c249e?OpenDocument=)
- **TRL 13/03/2025, proc. 11019/23.3T8SNT.L1-2** — OTP como fator de imputação da vontade em pagamentos. [dgsi](https://www.dgsi.pt/jtrl.nsf/33182fc732316039802565fa00497eec/b0b9db4e22e51bae80258c580055ffed?OpenDocument=)

### 4.4 O que fortalece a prova (por ordem de custo-benefício)

1. **Hash SHA-256 do PDF** calculado antes do envio do OTP e **referido na própria SMS** («Código 483920 para assinar o contrato #1234, hash a1b2…») — cria a ligação OTP↔documento.
2. **Selo temporal qualificado (RFC 3161)** sobre o hash, de um QTSP da [Trusted List do GNS](https://www.gns.gov.pt/pt/trusted-lists/) — **art. 41.º/2 eIDAS: presunção legal** de exatidão da data/hora e integridade. Cêntimos por selo; o melhor rácio prova/preço do stack.
3. **Log OTP imutável** (hash chain): número, conteúdo da SMS, delivery receipt, timestamp de introdução, IP, user-agent, ID de sessão.
4. **Email de confirmação** com o PDF/hash para ambas as partes (segundo canal + comportamento concludente).
5. **Prova da ligação número↔identidade** do cliente (verificação do número no fluxo de convite).

**Confiança: ALTA** (textos legais verificados + 3 acórdãos). *Para o advogado: cláusula de convenção de prova nos T&C; confirmar numeração consolidada do art. 3.º DL 12/2021; impacto da Lei 12-A/2026 no DL 7/2004.*

---

## 5. Cobrança off-session (PSD2/SCA) e chargebacks de no-show

**Resposta curta: o enquadramento legal está confirmado (modelo hoteleiro validado pela EBA) — mas o desenho técnico "hold a D-7 + captura pós-evento" QUEBRA na Visa, e o 3DS inicial não dá liability shift às capturas. A defesa anti-chargeback vive da divulgação e aceitação explícita da política.**

### 5.1 SCA e Merchant-Initiated Transactions

- MIT não são "isentas" — estão **fora do âmbito** do art. 97.º PSD2 (não são iniciadas pelo ordenante). Distinção confirmada em:
  - **EBA Q&A 2018_4131** (01/03/2019): cobranças iniciadas só pelo beneficiário, ao abrigo de um **standing agreement** com critérios pré-definidos, não estão sujeitas a SCA. [EBA](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4131)
  - **EBA Q&A 2019_4792** (12/03/2021) — **caso hoteleiro, análogo perfeito**: guardar o cartão como garantia de reserva exige **SCA no setup do mandato**; cobranças posteriores (no-show) são MIT. [EBA](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2019_4792)
  - **EBA Q&A 2019_4794**: o mandato pode ser recolhido por **intermediário** em nome do beneficiário — **desde que o nome do beneficiário (o freelancer) conste do mandato**. Crítico para o texto do contrato HONRA. [EBA](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2019_4794)
- O contrato assinado com OTP deve **pré-definir percentagem, momento e condições** da penalização — é isso que faz das capturas MIT válidas ao abrigo do mandato.
- Stripe: `SetupIntent` com `usage: off_session` (3DS no setup) + `PaymentIntent` com `off_session: true` → marcado como MIT nas redes; a exemption fica à discrição do emissor (fallback: `authentication_required` → cliente reconfirma on-session). [Stripe — Save and reuse](https://docs.stripe.com/payments/save-and-reuse)

### 5.2 ⚠️ Janelas de autorização — o achado crítico

| Rede | Hold CIT | Hold **MIT** (o caso HONRA) |
|---|---|---|
| Visa | 7 dias | **~4 dias e 18 horas** |
| Mastercard / Amex / Discover | 7 dias | 7 dias |

- Hold armado a D-7 **expira a ~D-2 na Visa** (antes do evento) e no próprio dia nas outras redes. [Stripe — Place a hold](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- **Extended authorization**: Visa 29d18h / Mastercard 30 dias — mas exige **pricing IC+** (negociar com a Stripe) e +0,08% na Visa; Amex/Discover limitam a MCC de viagens. [Stripe — Extended authorization](https://docs.stripe.com/payments/extended-authorization)
- **Alternativas por ordem de simplicidade**: (1) hold mais tardio + re-autorização (hold a D-3, captura pós-evento; cada re-auth é nova MIT ao abrigo do mesmo mandato); (2) sem hold — **captura MIT direta no momento da quebra confirmada** (modelo Fresha; sem garantia de fundos mas sem gestão de expiração); (3) extended auth com IC+; (4) validar sempre o campo `capture_before` do charge em runtime.

### 5.3 Chargebacks de no-show/cancelamento — como vencer

- **Códigos**: Visa **13.7** (Cancelled Merchandise/Services) e 13.6 (Credit Not Processed); Mastercard **4853** (Cardholder Dispute, absorveu o antigo 4841). Janela do emissor: 120 dias; resposta do comerciante: 45 dias (MC).
- **Regra Visa de "properly disclosed"**: a política de cancelamento tem de estar **no ecrã de checkout, junto ao botão de submissão, com aceitação explícita (checkbox/click-to-accept)** e com o **valor específico** da penalização. [Visa Core Rules (PDF público)](https://usa.visa.com/dam/VCOM/download/about-visa/visa-rules-public.pdf) · [Visa Dispute Management Guidelines (PDF)](https://usa.visa.com/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)
- **Evidência a submeter** (campos Stripe): `cancellation_policy`, `cancellation_policy_disclosure`, `customer_communication` (aviso pré-captura!), `service_date`, `service_documentation` (contrato OTP + logs 3DS do setup). [Stripe — Dispute categories](https://docs.stripe.com/disputes/categories)
- **Sem liability shift**: o 3DS do SetupIntent **não** transfere responsabilidade para o emissor nas cobranças MIT subsequentes — chargeback de fraude (Visa 10.4) defende-se por representment com o mandato + 3DS inicial, não automaticamente. [Stripe — 3DS](https://docs.stripe.com/payments/3d-secure/authentication-flow)
- **Números da indústria**: win rate bruto em representment ~45-54%, net recovery muito inferior; orçamentar perder uma fração das disputas. Vigiar rácios (>0,9% Visa / >1% MC = programas de monitorização).
- **Boas práticas**: click-to-accept separado com o valor exato; descritor claro ("HONRA*CAUCAO"); email de pré-aviso antes do hold e antes da captura; capturar apenas o valor pré-divulgado; cancelamento fácil dentro do prazo.

**Confiança: ALTA** no regime SCA/MIT e janelas Stripe (fontes primárias); **MÉDIA-ALTA** nas regras Visa/MC (primárias identificadas, parseadas via secundárias convergentes); **MÉDIA** nas estatísticas.

---

## 6. Licença de instituição de pagamento — a HONRA pode tocar nos fundos?

**Resposta curta: NÃO deixar a captura cair na conta Stripe da HONRA. A HONRA atua pelos dois lados, logo perdeu a exclusão de agente comercial; a estrutura segura (e a que as plataformas comparáveis usam) é direct charge na conta Stripe do freelancer + application fee.**

### 6.1 O regime

- **DL 91/2018 (RJSPME)**, em vigor (alterado por DL 66/2023, Lei 82/2023, Lei 1/2025, Lei 68/2025, Lei 73/2025 — nenhuma tocou nestes artigos, ao que se apurou): **art. 4.º** define serviços de pagamento (incl. acquiring e **envio de fundos**); **art. 5.º, al. b)** exclui operações «através de um agente comercial autorizado por contrato a negociar ou a concluir a venda… **exclusivamente em nome do ordenante ou exclusivamente em nome do beneficiário**». [DL 91/2018 — PGD Lisboa](https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2954&tabela=leis&so_miolo=) · [DRE](https://diariodarepublica.pt/dr/detalhe/decreto-lei/91-2018-116936932)
- **Considerando 11 da PSD2**: plataformas que atuam **em nome de ambas as partes** «só deverão ser excluídas se **não entrarem, em momento algum, na posse ou controlo de fundos dos clientes**». [PSD2 — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX:32015L2366)
- **EBA Q&A 2020_5355 e 2020_5354**: leitura restritiva confirmada — cláusulas de "liquidação da dívida" não salvam; a autoridade nacional avalia o modelo de negócio. [5355](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5355) · [5354](https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2020_5354)
- **Conclusão**: captura → conta HONRA → repasse ao freelancer = posse/controlo de fundos por quem atua pelos dois lados = atividade licenciável junto do Banco de Portugal. **Evitar por completo.**

### 6.2 A estrutura recomendada (verificada na documentação Stripe)

- **Stripe Connect, DIRECT CHARGES na connected account do freelancer** (Express recomendado): o PaymentIntent é criado na conta do freelancer (header `Stripe-Account`) → o freelancer é o merchant of record, responde por refunds/chargebacks; **os fundos nunca tocam na HONRA**; a Stripe (**Stripe Technology Europe Ltd**, e-money institution autorizada pelo Central Bank of Ireland, ref. C187865) é o PSP licenciado. A HONRA cobra `application_fee_amount`. [Stripe — charge types](https://docs.stripe.com/connect/charges) · [Direct charges](https://docs.stripe.com/connect/direct-charges) · [FAQ Stripe Connect & PSD2](https://stripe.com/guides/frequently-asked-questions-about-stripe-connect-and-psd2) · [Registo CBI C187865](https://registers.centralbank.ie/FirmDataPage.aspx?firmReferenceNumber=C187865)
- **Manual capture (hold) funciona em direct charges**, com captura parcial (`amount_to_capture`) — perfeito para penalização proporcional; `application_fee` limitado ao capturado. [Place a hold](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) · [Multicapture](https://docs.stripe.com/payments/multicapture)
- **Destination charges / separate charges & transfers**: os fundos liquidam primeiro no balance da plataforma — a Stripe defende que mesmo aí é a Stripe quem detém os fundos, mas é **zona cinzenta sem validação regulatória pública**. Não usar para as penalizações.
- **Atenção ao desenho da caução de 2 lados**: o direct charge cobre a quebra do cliente (hold no cartão do cliente, na conta do freelancer). A penalização por quebra do **freelancer** a favor do cliente exige mecânica própria (hold simétrico ou consequência reputacional) — mapear charge a charge.

### 6.3 Como fazem os comparáveis

- **Booking.com**: quando toca nos fundos ("Payments by Booking.com"), fá-lo através de entidade **licenciada** (Booking Holdings Financial Services International Ltd, e-money CBI ref. C447372). Lição: tocar em fundos = licença. [BHFS](https://www.bookingholdings.com/about/financial-services/)
- **OpenTable**: a no-show fee é cobrada **pelo restaurante, na conta Stripe do próprio restaurante** (os disputes correm no restaurante). **O modelo mais próximo da HONRA.** [OpenTable — no-shows](https://support.opentable.com/s/article/Manage-your-own-Cancellations-and-No-shows?language=en_US)
- **Fresha**: guarda o cartão e cobra no-show fee como **agente do beneficiário apenas** ("the Partner appoints Fresha as its agent to collect and process payments"), via processadores licenciados. [Fresha — no-show fees](https://www.fresha.com/help-center/knowledge-base/payments/617-charge-no-show-and-cancellation-fees) · [Partner Terms](https://terms.fresha.com/partner-terms)
- **HoneyBook**: processador dos EUA — irrelevante como precedente PSD2.

### 6.4 Risco residual

- Não existe entendimento público específico do BdP sobre marketplaces e a exclusão de agente comercial; o BdP está vinculado à prática das Q&A da EBA e é ativo em alertas contra atividade não autorizada. Mitigações: regras de captura **automáticas/contratuais** (a HONRA como agente técnico do freelancer, não árbitro discricionário dos fundos); comunicação no site alinhada ("o profissional cobra, a Stripe processa" — nunca "a HONRA devolve/paga"); ponderar **consulta prévia informal ao BdP** (canal fintech) antes do lançamento. [BdP — autorização IP](https://www.bportugal.pt/en/page/application-authorisation-payment-institution)

**Confiança: ALTA** para a estrutura direct charges; **MÉDIA** para o risco residual (inferência regulatória sólida, sem confirmação do BdP).

---

## 7. Obrigações de plataforma — P2B, DSA, RGPD do convidado

### 7.1 P2B (Reg. 2019/1150) — aplica-se

- Âmbito preenchido (art. 1.º/2 + 2.º/2): freelancers = utilizadores profissionais; é irrelevante o pagamento correr fora da plataforma («irrespective of where those transactions are ultimately concluded»). [Reg. 2019/1150 — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32019R1150)
- Obrigações sempre aplicáveis: **art. 3.º** (termos claros; alterações com pré-aviso ≥15 dias), **art. 4.º** (fundamentação de restrições/suspensões; cessação com 30 dias de pré-aviso), **art. 5.º** (parâmetros principais do ranking nos termos).
- Dispensas para pequenas empresas (<50 trabalhadores e ≤10M€, Recomendação 2003/361/CE): **art. 11.º/5** (sistema interno de reclamações) e **art. 12.º/7** (mediadores).

**Confiança: ALTA.**

### 7.2 DSA (Reg. 2022/2065) — plataforma em linha, mas isenções esvaziam quase tudo

- A HONRA é "plataforma em linha" (art. 3.º/i — difunde perfis ao público). Enquanto **micro/pequena empresa**:
  - **Art. 19.º**: Secção 3 (arts. 20.º-28.º) **não se aplica** (exceção: art. 24.º/3 — reportar utilizadores ativos a pedido).
  - **Art. 29.º**: Secção 4 (arts. 30.º-32.º, incl. **KYBC/rastreabilidade dos traders**) **não se aplica**.
  - **Fica sempre**: art. 11.º (ponto de contacto p/ autoridades), art. 12.º (ponto de contacto p/ utilizadores), art. 14.º (termos com regras de moderação em linguagem clara), art. 16.º (notice-and-action), art. 17.º (fundamentação de remoções/suspensões), art. 18.º (reporte de suspeitas de crimes graves). Relatórios de transparência dispensados (art. 15.º/2).
- **Coordenador nacional: ANACOM** (DL 20-B/2024, de 16/02; regime sancionatório na Lei 12-A/2026, de 15/04). [DSA — EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32022R2065) · [ANACOM](https://www.anacom.pt/render.jsp?contentId=1773180)
- **Nota estratégica**: a verificação de profissionais é o produto da HONRA — construir já "à prova de art. 30.º" (NIF, IBAN, morada) evita retrabalho quando a isenção cair.

**Confiança: ALTA.**

### 7.3 RGPD do cliente convidado sem conta

- **Papéis**: HONRA = **responsável pelo tratamento** (controller) do fluxo de assinatura e evidência contratual. Stripe = processor nos serviços de plataforma + **controller independente** para fraude/compliance (confirmado no [Stripe DPA](https://stripe.com/legal/dpa)). A HONRA nunca guarda dados de cartão (só tokens).
- **Bases legais**: **art. 6.º/1/b** durante o fluxo (sem telefone não há OTP — necessidade objetiva, cf. [EDPB Guidelines 2/2019](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines-art_6-1-b-adopted_after_public_consultation_en.pdf)); **art. 6.º/1/f** (interesse legítimo, com LIA documentada) para reter a evidência pós-contrato.
- **Retenção**: teto teórico = prescrição ordinária de **20 anos (art. 309.º CC)** — desproporcional para tudo; posição defensável: **evidência mínima (contrato+hash+logs) por 5-6 anos**, apagando cedo o resto (ex.: telefone). As prescrições presuntivas dos arts. 316.º-317.º CC não servem sozinhas (presumem pagamento, não extinguem ações de incumprimento). A prática CNPD indexa a retenção ao prazo de prescrição das ações do contrato, com tetos proporcionais.
- **Informação**: **art. 13.º** no formulário (dados recolhidos diretamente) **+ art. 14.º no primeiro contacto** — o nome/telefone são fornecidos primeiro **pelo freelancer** (recolha indireta): o próprio SMS/ecrã de convite deve linkar a política de privacidade.

**Confiança: ALTA** (papéis/bases); **MÉDIA** (prazo concreto de retenção — juízo de proporcionalidade a fechar com advogado).

---

## 8. IVA / faturação — sinalização de riscos

1. **Comissão/subscrição HONRA**: serviço tributável normal (23%). Sem controvérsia. **ALTA.**
2. **DAC7 (Lei 36/2023, de 26/07** — a transposição PT da Diretiva 2021/514; **não** é o DL 74/2022): a HONRA é "plataforma" no âmbito (faz muito mais do que processar pagamentos), os freelancers prestam "serviços pessoais", e a contraprestação é "razoavelmente cognoscível" porque o preço consta do contrato guardado → **obrigação de diligência (recolher NIF) e reporte anual à AT até 31 de janeiro, mesmo sem processar o pagamento principal**. [Lei 36/2023 — DRE](https://diariodarepublica.pt/dr/detalhe/lei/36-2023-216188321) · [OCC](https://www.occ.pt/pt-pt/noticias/dac-7-regime-de-comunicacao-de-informacoes-pelos-operadores-de-plataformas) **ALTA no enquadramento; MÉDIA no detalhe operacional.**
3. **Penalizações são tendencialmente tributáveis em IVA**: TJUE **MEO C-295/17** (22/11/2018) e **Vodafone Portugal C-43/19** (11/06/2020) — montantes pré-determinados por cessação antecipada = contraprestação de serviços, não indemnização fora do IVA. O freelancer deverá faturar a penalização (salvo isenção do art. 53.º CIVA); a fee da HONRA é serviço tributável dela. **ALTA na jurisprudência; MÉDIA na aplicação exata.**
4. **Cadeia de IVA**: se a HONRA cobrar a penalização **em nome próprio**, arrisca o art. 4.º/4 CIVA (intervenção em nome próprio = recebeu e prestou o serviço → IVA sobre o total). Mitigação: cobrar **"em nome e por conta" do freelancer**, com mandato expresso — coerente com a estrutura direct charges da secção 6. **MÉDIA — para fiscalista.**

---

## PERGUNTAS PARA O ADVOGADO (consulta de 1-2h, por ordem de prioridade)

**Bloco A — Contrato-convite e cancelamento (o coração)**
1. Valide o nosso contrato-tipo: a penalização escalonada (X% até 30 dias / Y% até 7 dias / 25% depois) passa o art. 19.º/c do DL 446/85 no "quadro negocial padronizado" de eventos? Que fundamentação de dano típico devemos guardar por escrito?
2. Qualificação da caução: devemos redigi-la como cláusula penal (art. 810.º CC) e evitar a palavra "sinal"? Se o freelancer quebrar, que consequência simétrica mínima torna a cláusula equilibrada sem nos obrigar ao regime do dobro (art. 442.º/2 CC)?
3. Valide a subsunção de fotografia/vídeo (mais do que DJ) em "serviços relacionados com atividades de lazer" — parecer ancorado no considerando 49 da Diretiva (catering de casamento), Orientações 5.11.6 e CTS Eventim; texto exato do aviso "sem direito de livre resolução" (art. 4.º/1/p)) e dos deveres de mercado em linha (arts. 4.º-A/4.º-B) no ecrã móvel. A exceção cobre serviços acessórios sem data fixa no momento da assinatura (ex.: sessão de noivado)? E casais de fora da UE (Roma I, art. 6.º)?
4. A cláusula de cancelamento como "liquidação antecipada" da indemnização por desistência livre (arts. 1156.º/1170.º/1172.º e paralelo do 1229.º CC) — confirma o enquadramento e limites?

**Bloco B — Pagamentos e regulação**
5. Parecer curto: o fluxo Stripe Connect **direct charge na conta do freelancer + application fee** mantém-nos fora do art. 4.º do DL 91/2018 na leitura do Banco de Portugal? Vale a pena a consulta informal prévia ao BdP?
6. O texto do mandato MIT no contrato (EBA Q&A 2019_4794): que redação garante que o freelancer consta como beneficiário e que os critérios de disparo do hold/captura são "pré-definidos" q.b.?

**Bloco C — Dados e conformidade**
7. Fixe o prazo de retenção da evidência contratual (proposta: 5-6 anos para contrato+hash+logs; telefone apagado antes) e valide a LIA do art. 6.º/1/f.
8. Reveja os textos arts. 13.º/14.º RGPD no fluxo de convite (o telefone vem do freelancer — recolha indireta) e o DPA/SCCs da Stripe (transferências fora da UE).
9. Checklist mínima DSA/P2B para micro-empresa: pontos de contacto (arts. 11.º-12.º DSA), termos (art. 14.º DSA + arts. 3.º-5.º P2B com parâmetros de ranking), notice-and-action (art. 16.º).

**Bloco D — Fiscal (para fiscalista/contabilista, não advogado)**
10. Registo e reporte DAC7 (Lei 36/2023) desde o 1.º ano; desenho da faturação das penalizações à luz de MEO/Vodafone (quem fatura, com ou sem IVA, art. 53.º CIVA para freelancers pequenos); cláusula "em nome e por conta" para a fee da HONRA.

---

## Notas de honestidade metodológica

- **Não encontrado** (apesar de procurado): jurisprudência portuguesa publicada sobre penalizações de cancelamento de casamentos/eventos com consumidores; decisões publicadas de centros de arbitragem de consumo sobre o tema; entendimento público do BdP sobre marketplaces e a exclusão de agente comercial. A ausência foi verificada, mas não é garantia de inexistência — os centros de arbitragem publicam pouco.
- **Fontes secundárias** usadas onde as primárias bloquearam fetch: regras Visa/Mastercard (PDFs primários identificados, detalhe cruzado com 3+ secundárias convergentes); artigos de suporte OpenTable/Fresha.
- **Datas sensíveis**: as janelas de autorização das redes (Visa ~4d18h MIT) mudam por circulares — validar `capture_before` em runtime, sempre.
- Relatórios de suporte detalhados por bloco (com todas as fontes) na pasta de trabalho da sessão; os links essenciais estão todos neste documento.
