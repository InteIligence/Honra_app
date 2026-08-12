# HONRA — Briefing para consulta jurídica

> **Para:** advogado(a) de Direito Digital / TMT com prática de Direito do Consumo e Proteção de Dados.
> **Duração alvo:** 1–2 h. **Objetivo:** validar o que podemos ligar a sério (piloto) sem risco regulatório ou de nulidade.
> Existe um **dossier de apoio** com todos os diplomas, artigos e jurisprudência citados (documento à parte) — este briefing é o mapa; o dossier é a profundidade.

---

## 1. O que é o Honra (em 6 linhas)

App/marketplace de **reputação verificada** de profissionais. Duas frentes:

- **B2B (marketplace interno):** empresas e freelancers combinam trabalho; "aperto de mão" com checkpoint; quem falta à palavra leva uma **marca de incumprimento** pública. **Sem dinheiro no aperto** — a consequência é reputacional.
- **B2C / contrato-convite (a lançar primeiro, vertical eventos/casamentos):** o profissional partilha um link; o **cliente (consumidor)** preenche um formulário, recebe um **contrato** gerado pelo Honra e **assina por OTP (SMS)**; há uma **cláusula de cancelamento escalonada** e uma **caução** cobrada só em caso de quebra, via **Stripe Connect na conta do profissional** (o Honra nunca detém os fundos). O pagamento principal corre direto entre as partes.
- Verificações: identidade (KYC), profissão (cédula da Ordem OU trabalho comprovado), contacto (OTP), portefólio. 1 pessoa = 1 conta.

---

## 2. As questões, por prioridade

### Bloco A — Contrato-convite e cancelamento (o coração; consumidor)
1. **Cláusula penal escalonada** (perde adiantamento → 10–15% → 25%): passa o **art. 19.º/c do DL 446/85** no quadro padronizado de eventos? Que fundamentação de dano típico guardar por escrito? Devolução automática se a data for reocupada — recomendável?
2. **Qualificar a caução como cláusula penal (art. 810.º CC) e evitar "sinal"** (fugir ao regime do dobro, art. 442.º/2). Que consequência simétrica mínima para a quebra do profissional torna a cláusula equilibrada (boa-fé, DL 446/85)?
3. **Exceção ao direito de arrependimento** (art. 17.º/1/**k**) DL 24/2014): confirmar a subsunção de **fotografia/vídeo/DJ de casamento** (data marcada). Texto exato do aviso obrigatório "sem direito de livre resolução" (art. 4.º/1/p). Cobre serviços acessórios **sem data fixa** (ex.: sessão de noivado)? E **casais de fora da UE** (Roma I, art. 6.º)?
4. A cláusula como **liquidação antecipada** da indemnização por desistência livre (arts. 1156.º/1170.º/1172.º; paralelo 1229.º CC) — enquadramento e limites?

### Bloco B — Pagamentos e regulação
5. O fluxo **Stripe Connect direct charge na conta do profissional + application fee** mantém o Honra **fora** do art. 4.º do DL 91/2018 (não somos instituição de pagamento) na leitura do Banco de Portugal? Vale a pena **consulta informal prévia ao BdP**?
6. Redação do **mandato MIT** no contrato (EBA Q&A 2019_4794): garantir que o profissional consta como beneficiário e que os gatilhos do hold/captura são "pré-definidos".
6-A. 🟠 **ESCROW para projetos longos (standby, mas mapear já).** O modelo atual (direct charges na conta do profissional, o Honra nunca detém fundos) foi desenhado para **eventos pontuais** (dia marcado, cliente presente). Para **projetos longos/à distância** (ex.: cinema, montagem, consultoria — pago no fim, às vezes 2 meses depois), o profissional precisa que o dinheiro fique **seguro à cabeça e libertado na aceitação da entrega** — ou seja, **escrow**. Perguntar: (a) no momento em que o Honra **detém ou controla** fundos de terceiros, perde a exclusão de agente comercial (PSD2, considerando 11; EBA Q&A 2020_5354/5355) e passa a atividade **licenciável pelo BdP** (instituição de pagamento / moeda eletrónica)? (b) Operar sob **PSP licenciado de marketplace** (Mangopay/Lemonway, com carteiras *ring-fenced*) como agente/distribuidor evita a licença própria, e em que termos? (c) O Stripe Connect com *separate charges & transfers* / *delayed payout* (fundos no balance da plataforma) é zona cinzenta a evitar? (d) Que requisitos de KYC/proteção de fundos passam a aplicar-se. **Nota:** é uma **mudança de postura regulatória**, não um toggle — decisão para depois do beachhead de eventos; mapear agora para não travar a expansão para o gig longo.

### Bloco C — Reputação e responsabilidade da plataforma *(lacuna que faltava — crítico)*
7. **A "marca de incumprimento":** o Honra publica, associado ao **nome real**, que alguém faltou à palavra num negócio. Qual o risco de **difamação** e de **RGPD** (dados pessoais negativos)? Que salvaguardas a tornam lícita — facto objetivo (inação registada) vs juízo de valor, contraditório, prazo de permanência, direito ao apagamento?
8. **Avaliações de clientes** e o índice de confiança: responsabilidade do Honra por conteúdo de utilizadores; moderação; direito de resposta do avaliado.
9. **Selos de profissão** ("advogado/contabilista verificado", confirmado contra o registo da Ordem): que responsabilidade assume o Honra por um selo **errado** (falso positivo/negativo) e como a **limitar nos T&C**? Há problema em usar os registos públicos das Ordens para esta verificação?
10. **Responsabilidade da plataforma pelos negócios entre utilizadores** (serviço mau, dano a terceiro): exposição do Honra e **cláusula de limitação de responsabilidade** adequada. (o precedente CACCL 321/2025 parece favorável ao modelo marketplace)
10-A. **"A honra segue a pessoa, não a conta" — retenção de identidade pós-apagamento.** O modelo 1 pessoa = 1 conta (verificação de identidade) só funciona se apagar a conta **não lavar a reputação**: hoje, quem elimina a conta pode registar-se de novo com o mesmo Cartão de Cidadão e nascer limpo. Queremos reter um **fingerprint mínimo da identidade (hash do documento) + o estado reputacional grave (marcas/suspensão/expulsão)** mesmo após pedido de apagamento RGPD, por interesse legítimo (integridade da plataforma/prevenção de fraude): (a) é lícito e em que termos (minimização, prazos)? (b) para EXPULSOS, uma denylist permanente de identidade (nunca mais pode criar conta) é sustentável face ao direito ao apagamento? (c) que informação dar no momento da verificação de identidade sobre esta retenção?

### Bloco D — Dados, conformidade e consumidor *(parcialmente novo)*
11. **Retenção** da evidência contratual (proposta: 5–6 anos para contrato+hash+logs; telefone apagado antes) + validar a LIA do art. 6.º/1/f; textos arts. 13.º/14.º RGPD no fluxo de convite (o telefone vem do profissional = recolha indireta); **DPA/SCCs** dos subcontratantes (Stripe, Bird, Supabase — transferências fora da UE).
12. **Resolução Alternativa de Litígios (Lei 144/2015):** obrigação de informar o consumidor sobre a entidade de arbitragem de consumo competente — qual indicar e onde (T&C/site)?
13. **Idade/capacidade:** como garantir que profissionais **e** clientes convidados são maiores? (contrato com menor é anulável)
14. **Cliente-convidado que é EMPRESA** (não consumidor): o contrato-convite muda de regime? Como tratar B2C vs B2B no mesmo fluxo?
15. Checklist mínima **DSA/P2B** para micro-empresa: pontos de contacto (arts. 11.º-12.º DSA), termos e parâmetros de ranking (art. 14.º DSA + arts. 3.º-5.º P2B), notice-and-action (art. 16.º).
16. **Revisão dos nossos Termos de Serviço e Política de Privacidade** (temos rascunhos) — validação global.

### Bloco E — Estrutura e marca *(novo — foundational)*
17. Que **entidade** deve operar o Honra? As obrigações de plataforma (DAC7, DSA, P2B) e a responsabilidade contratual recaem sobre ela — sociedade (Lda), ENI, onde?
18. **Marca "Honra" (INPI):** há conflito conhecido com **HONRA II TECH, LDA** (`honra.pt`). Este é assunto para si ou para um colega de propriedade industrial? Quando fazer o pedido para não perder o nome depois de termos utilizadores?

### Bloco F — Fiscal *(para fiscalista/contabilista, não advogado)*
19. **DAC7** (Lei 36/2023): registo e reporte anual à AT desde o 1.º ano, mesmo sem processar o pagamento. Faturação das penalizações à luz de **MEO/Vodafone** (quem fatura, com/sem IVA, art. 53.º CIVA); cláusula "em nome e por conta" para a fee do Honra.

---

### Bloco G — Acrescentado na verificação de completude *(15/07 — inclui os 2 riscos mais caros de errar)*

20. 🔴 **CRÍTICO — Práticas comerciais desleais nas avaliações e selos (DL 57/2008, alterado pelo DL 109-G/2021).** É o regime (contraordenacional, ASAE) que rege *diretamente* o coração do Honra: dizer "avaliações verificadas" e "profissão verificada" cria, por lei, o **dever de declarar como verificamos** e a **proibição absoluta de avaliações falsas/distorcidas**. Perguntar (art. 10.º-A + lista negra): que informação dar sobre *se e como* verificamos as avaliações e onde; se a "prova de encontro + OTP" cumpre as "medidas razoáveis e proporcionadas"; que redação nos protege ao remover/ordenar/destacar avaliações; e se um selo errado/desatualizado configura prática enganosa.
21. 🔴 **CRÍTICO — RGPD dos PROFISSIONAIS: AIPD (DPIA) + biometria + scoring.** O briefing só tratava os dados do *convidado*. Falta o tratamento mais arriscado: guardar documentos de identidade, verificação de identidade (provável *face-match* = **dado biométrico, art. 9.º**) e o **índice de confiança** (scoring/profiling). Perguntar: somos obrigados a **AIPD (art. 35.º + Regulamento CNPD 1/2018)** antes do lançamento; qual a base legal do **art. 9.º** para a biometria; o índice/selos automáticos caem no **art. 22.º** (decisões automatizadas); e como articular o nosso KYC com o da Stripe sem duplicar.
22. 🟠 **Cookies e comunicações não solicitadas (Lei 41/2004):** consentimento de cookies no site (art. 5.º) e regime de opt-in para marketing por SMS/email/push (art. 13.º-A) — distinto do OTP transacional.
23. 🟠 **Acessibilidade digital — EAA / DL 82/2022** (em vigor desde 28/06/2025; **não** o DL 83/2018, que é só setor público): o e-commerce ao consumidor está no âmbito; beneficiamos da isenção de microempresa e até que dimensão? Que WCAG mínimo desenhar já para não refazer a app depois.
24. 🟠 **Livro de Reclamações eletrónico (DL 74/2017):** temos de o disponibilizar e mostrar o link para livroreclamacoes.pt de forma destacada? (articula com a RAL da questão 12)
25. 🟠 **IP e direito à imagem nos portefólios:** que licença nos T&C para alojar/exibir o conteúdo sem assumir titularidade; como nos protegemos se o profissional não tiver direitos; as fotos mostram terceiros identificáveis (noivos/convidados) — direito à imagem (art. 79.º CC) + RGPD, de quem exigir consentimento; mecanismo de notice-and-takedown (safe harbour, arts. 16.º-18.º DL 7/2004 + art. 6.º DSA).
26. 🟡 **Falso trabalho independente (Diretiva 2024/2831 + art. 12.º/12.º-A CT):** risco de os freelancers serem presumidos trabalhadores; como desenhar T&C/produto para ficar claramente do lado do **marketplace neutro** (sem controlo, direção ou fixação de preço).
27. 🟡 **Branqueamento (Lei 83/2017) — confirmar que NÃO somos "entidade obrigada"** (a Stripe detém os fundos; a nossa verificação é para confiança, não AML). Sobretudo confirmação/descarte.

**Pontos a fundir em questões existentes:** convenção de prova nos T&C + audit trail mínimo do OTP (juntar ao Bloco A); cláusulas de foro/competência com consumidores — Bruxelas I bis, arts. 17.º-19.º (juntar à questão 3, ao lado de Roma I); publicidade do próprio Honra e claims "verificado" (Código da Publicidade — funde na questão 20).

**Fora do advogado:** seguro de responsabilidade civil / E&O (exigir aos profissionais nos T&C + ponderar seguro próprio, porque guardamos dados de ID e emitimos selos) — é assunto para **corretor de seguros**; o advogado só redige a cláusula e o disclaimer.

---

## 3. O que levar à consulta
- Este briefing (o mapa) + o **dossier detalhado** (diplomas, artigos, jurisprudência PT e europeia, com links) — entregar no início.
- Uma versão do **contrato-tipo** e do **aviso de cancelamento** que geramos (mesmo em rascunho).
- Os **rascunhos** de Termos de Serviço e Política de Privacidade.

## 4. O resultado que queremos sair da consulta
- O contrato-tipo + cláusula de cancelamento **validados ou corrigidos** (pronto a usar mil vezes).
- Um **sim/não claro** sobre a estrutura de pagamentos (somos ou não instituição de pagamento).
- As **salvaguardas** da marca de incumprimento e dos selos, para não haver processos.
- A lista de **peças obrigatórias** que faltam (RAL, avisos, entidade, etc.).
