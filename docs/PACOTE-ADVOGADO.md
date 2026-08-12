# HONRA — Pacote de entrega ao advogado

> **Data:** 23/07/2026 · **Objetivo:** validar o que podemos ligar a sério (piloto) sem risco regulatório ou de nulidade.
> Este é o **índice e guião** de tudo o que é jurídico no Honra. Aponta para as peças de detalhe (o mapa e a profundidade já existem) e diz, para cada uma, se está **pronta** ou se **falta produzir**.
> **A consulta é a porta** entre o Honra construído e um piloto real com dinheiro/utilizadores.

---

## 0. Como usar este pacote

1. Ler este documento (é a capa de tudo).
2. Produzir as 2 peças que ainda faltam (secção 2) — **T&C e Política de Privacidade** em rascunho.
3. Escolher o advogado e enviar o email-filtro (secção 7).
4. Levar/enviar a pasta de entrega (secção 1) e conduzir a consulta pelo guião (secção 6).

---

## 1. A pasta de entrega (o que levar/enviar)

| # | Peça | Ficheiro | Estado | Papel na consulta |
|---|---|---|---|---|
| 1 | **Briefing — o mapa** | `docs/BRIEFING-ADVOGADO.md` | ✅ Pronto | 1 página + 27 perguntas em 7 blocos. Entregar no início. |
| 2 | **Dossier jurídico — a profundidade** | `docs/JURIDICO-CONTRATO-CONVITE.md` | ✅ Pronto | Diplomas, artigos e jurisprudência PT/UE com links. Semáforo verde/amarelo/vermelho. |
| 3 | **Contrato-tipo + mandato (exemplar)** | `docs/CONTRATO-TIPO-EXEMPLAR.md` | ✅ Pronto | O texto exato que o consumidor assina, renderizado num caso real. |
| 4 | **Desenho do produto (contexto)** | `docs/DESENHO-CONTRATO-CONVITE.md` | ✅ Pronto (opcional) | Fluxo, máquina de estados, fronteiras de credibilidade. Só se pedir contexto. |
| 5 | **Termos de Serviço (T&C)** | — | ⛔ **A produzir** | Rascunho para o advogado corrigir, não redigir do zero. |
| 6 | **Política de Privacidade** | — | ⛔ **A produzir** | Idem. É onde vive metade do Bloco D. |
| 7 | **Clearance de marca "Honra" (INPI)** | — | 🟠 Pendente | Colisão com HONRA II TECH, LDA. Levar o resultado da pesquisa (secção 8). |

> **Nota honesta:** o briefing assume que "temos rascunhos de T&C e Política de Privacidade" — **não existem como documentos**. O contrato-tipo, sim (gerado em código, extraído para o exemplar #3). Fechar esta lacuna **antes** da consulta faz o advogado corrigir em vez de escrever do zero (mais barato e mais rápido).

---

## 2. Antes de marcar a consulta — o que ainda falta produzir

- [ ] **Rascunho de Termos de Serviço** (posso gerar a partir do desenho + dossier: limitação de responsabilidade, licença de portefólio, convenção de prova do OTP, foro do consumidor, marca de incumprimento, selos).
- [ ] **Rascunho de Política de Privacidade** (retenção 5-6 anos, base legal art. 6.º/1/f com LIA, arts. 13.º/14.º no convite, subcontratantes Stripe/Bird/Supabase + SCCs, biometria).
- [ ] **Resultado da pesquisa de marca** (TMview + INPI) impresso, para a questão E-18.
- [ ] **Decidir a pergunta de estrutura** (E-17): Lda vs ENI — levar a intenção, não a decisão fechada.

> Diz "sim" e eu produzo os dois rascunhos (T&C + Política de Privacidade) a seguir — é o passo que falta para o pacote ficar 100 % pronto a entregar.

---

## 3. Os 2 flancos mais caros de errar (topo da agenda)

Estavam a passar despercebidos; a verificação de completude (15/07) trouxe-os para o centro. **Começar a consulta por aqui.**

1. 🔴 **Práticas comerciais desleais nas avaliações e selos** — DL 57/2008 (alt. DL 109-G/2021), contraordenacional, fiscalização **ASAE**.
   Dizer "avaliações verificadas" e "profissão verificada" cria, por lei, o **dever de declarar como verificamos** e a **proibição absoluta de avaliações falsas/distorcidas**. O maior fosso do Honra é também a sua maior obrigação. *(Briefing G-20.)*

2. 🔴 **RGPD dos profissionais: AIPD/DPIA + biometria + scoring** — art. 35.º RGPD + Reg. CNPD 1/2018.
   **AIPD obrigatória antes do lançamento**; base legal do **art. 9.º** para o face-match do KYC (dado biométrico); o índice de confiança e os selos automáticos podem cair no **art. 22.º** (decisões automatizadas). O flanco RGPD mais desguarnecido. *(Briefing G-21.)*

---

## 4. Semáforo do desenho (do dossier jurídico)

**🟢 Já validado (o desenho está certo):** exceção ao arrependimento para eventos com data (art. 17.º/1/k + C-96/21 CTS Eventim) · contrato por OTP SMS (liberdade de forma + eIDAS) · modelo "hoteleiro" SCA/MIT (EBA Q&A 2019_4792) · P2B/DSA leves para micro-empresa.

**🟡 Defensável, afinar com o advogado:** escalonamento das penalizações (art. 19.º/c DL 446/85) · não chamar "sinal" à caução (art. 442.º/2) · prazo de retenção RGPD do convidado · IVA das penalizações (MEO/Vodafone) · DAC7.

**🔴 O desenho quebra aqui (já mapeado, exige decisão):**
- **Hold a D-7 morre na Visa** (autorização MIT expira em ~4 dias e 18h). Solução: re-autorizar a D-3/D-2 ou captura direta na quebra. *(Dossier §5.2.)*
- **Se os fundos passarem pela esfera do Honra = serviço de pagamento licenciável.** Solução travada: Stripe Connect **direct charges** na conta do profissional + `application_fee`. *(Dossier §6 · Briefing B-5.)*

---

## 5. Agenda priorizada — as 27 perguntas, por bloco

> Texto integral de cada pergunta no **Briefing** (#1 da pasta). Aqui vai o condensado, na ordem de ataque da consulta. Começar pelos 🔴 do Bloco G, depois A→F.

**Bloco A — Contrato-convite e cancelamento (consumidor) — o coração**
- A-1 Cláusula penal escalonada passa o art. 19.º/c? Que dano típico documentar? Devolução se a data for reocupada?
- A-2 Qualificar como cláusula penal (810.º) e fugir a "sinal" (442.º/2). Que simetria mínima equilibra?
- A-3 Exceção ao arrependimento (17.º/1/k) cobre foto/vídeo/DJ? Texto exato do aviso (4.º/1/p)? Serviços sem data fixa? Casais fora da UE (Roma I)?
- A-4 A cláusula como liquidação antecipada da indemnização por desistência (1156.º/1170.º/1172.º/1229.º) — limites?

**Bloco B — Pagamentos e regulação**
- B-5 Stripe Connect direct charge + application fee mantém o Honra fora do art. 4.º DL 91/2018? Vale consulta prévia ao BdP?
- B-6 Redação do mandato MIT (EBA Q&A 2019_4794): profissional como beneficiário, gatilhos pré-definidos.
- B-6A 🟠 **Escrow para projetos longos** (standby): quando o Honra controla fundos perde a exclusão de agente? Operar sob PSP de marketplace (Mangopay/Lemonway)? Decisão pós-beachhead — mapear já.

**Bloco C — Reputação e responsabilidade da plataforma** *(era a lacuna maior)*
- C-7 "Marca de incumprimento" com nome real: risco de difamação + RGPD. Que salvaguardas a tornam lícita (facto vs juízo, contraditório, prazo, apagamento)?
- C-8 Avaliações de clientes + índice de confiança: responsabilidade por conteúdo de utilizadores, moderação, direito de resposta.
- C-9 Selos de profissão: responsabilidade por selo errado; limitação nos T&C; usar registos públicos das Ordens.
- C-10 Responsabilidade pelos negócios entre utilizadores; cláusula de limitação (precedente CACCL 321/2025 favorável).
- C-10A "A honra segue a pessoa": reter hash do documento + estado reputacional grave após apagamento (interesse legítimo)? Denylist permanente para expulsos?

**Bloco D — Dados, conformidade e consumidor**
- D-11 Retenção (5-6 anos) + LIA do 6.º/1/f + textos 13.º/14.º (telefone vem do profissional = recolha indireta) + DPA/SCCs (Stripe, Bird, Supabase).
- D-12 RAL (Lei 144/2015): que entidade de arbitragem indicar e onde.
- D-13 Idade/capacidade: garantir maioridade dos dois lados (contrato com menor é anulável).
- D-14 Cliente-convidado que é **empresa** (não consumidor): o regime muda? B2C vs B2B no mesmo fluxo.
- D-15 Checklist DSA/P2B para micro-empresa (pontos de contacto, ranking, notice-and-action).
- D-16 Revisão global dos T&C e Política de Privacidade.

**Bloco E — Estrutura e marca** *(foundational)*
- E-17 Que entidade opera o Honra (Lda/ENI)? As obrigações de plataforma recaem sobre ela.
- E-18 Marca "Honra" (INPI) vs HONRA II TECH, LDA. Assunto para si ou colega de PI? Quando registar.

**Bloco F — Fiscal** *(para fiscalista/contabilista)*
- F-19 DAC7 (Lei 36/2023): registo e reporte anual à AT desde o 1.º ano. Faturação das penalizações "em nome e por conta".

**Bloco G — Completude (inclui os 2 críticos da secção 3)**
- G-20 🔴 Práticas comerciais desleais nas avaliações/selos (DL 57/2008).
- G-21 🔴 AIPD + biometria (art. 9.º) + scoring (art. 22.º).
- G-22 🟠 Cookies/ePrivacy (Lei 41/2004) + opt-in de marketing vs OTP transacional.
- G-23 🟠 Acessibilidade EAA/DL 82/2022 (**não** o DL 83/2018) — isenção de microempresa? WCAG mínimo já.
- G-24 🟠 Livro de Reclamações eletrónico (DL 74/2017).
- G-25 🟠 IP + direito à imagem nos portefólios (art. 79.º CC + RGPD; notice-and-takedown).
- G-26 🟡 Falso trabalho independente (Dir. 2024/2831 + art. 12.º CT) — desenhar como marketplace neutro.
- G-27 🟡 Branqueamento (Lei 83/2017) — **confirmar que NÃO somos entidade obrigada**.

*(A fundir: convenção de prova + audit trail do OTP → Bloco A; foro/competência do consumidor (Bruxelas I bis) → A-3; claims "verificado" (Cód. Publicidade) → G-20. Fora do advogado: seguro RC/E&O → corretor.)*

---

## 6. Guião da consulta (1-2 h) e resultado esperado

**Sequência sugerida:** (1) contexto em 6 linhas → (2) os 2 flancos críticos (secção 3) → (3) Bloco A com o contrato-tipo à frente → (4) Bloco B (pagamentos) → (5) C e D → (6) E (estrutura/marca) → (7) despachar F para o fiscalista.

**Sair da consulta com:**
- Contrato-tipo + cláusula de cancelamento **validados ou corrigidos** (pronto a usar mil vezes).
- Um **sim/não claro** sobre a estrutura de pagamentos (somos ou não instituição de pagamento).
- As **salvaguardas** da marca de incumprimento e dos selos (para não haver processos).
- A **lista de peças obrigatórias** que faltam (RAL, avisos, entidade, AIPD…).
- Estimativa de **honorários** para redigir/rever T&C + Política de Privacidade + AIPD.

---

## 7. Encontrar o advogado

**Especialidade a procurar:** Direito **Digital/TMT + Consumo + RGPD** (é a interseção rara que o Honra precisa).

**Shortlist (boutiques startup-friendly primeiro):** GFDL · CCA (tem agentes de marca p/ INPI) · pbbr Techlawyers · SRS Legal · Antas da Cunha ECIJA. **Grandes, para um parecer "à prova de bala":** VdA · PLMJ · Morais Leitão.

**Estratégia:** enviar um email com as 4 alíneas técnicas como **filtro** (quem responder bem às quatro é quem sabe do assunto); pedir 1.ª consulta com **valor fechado**; juntar o tema da marca (Honra vs HONRA II TECH).

### Email-filtro (pronto a enviar)

> **Assunto:** Consulta jurídica — plataforma digital (consumo + RGPD + pagamentos)
>
> Exmo(a). Dr(a).,
>
> Estou a lançar em Portugal uma plataforma/app de reputação verificada de profissionais, com um módulo de contratação entre profissional e consumidor (contrato à distância assinado por OTP, com cláusula de cancelamento escalonada e cobrança via Stripe Connect). Procuro aconselhamento numa **1.ª consulta focada** e gostaria de saber se a vossa prática cobre, em conjunto, estas quatro frentes:
>
> 1. **Direito do consumo** — cláusula penal de cancelamento (art. 19.º/c DL 446/85) e exceção ao direito de arrependimento para serviços com data (art. 17.º/1/k DL 24/2014);
> 2. **RGPD** — AIPD/DPIA, dado biométrico (KYC/face-match) e decisões automatizadas (scoring);
> 3. **Estrutura de pagamentos** — confirmar que o modelo Stripe Connect (direct charges na conta do profissional + application fee) nos mantém fora do regime de instituição de pagamento (DL 91/2018);
> 4. **Plataformas digitais** — obrigações leves de DSA/P2B para micro-empresa e práticas comerciais nas avaliações/selos (DL 57/2008).
>
> Tenho um **briefing e um dossier técnico** prontos a partilhar. Poderiam indicar-me disponibilidade e o **valor fechado** de uma 1.ª consulta de 1-2 h? Há ainda um ponto de **marca (INPI)** que agradeço saber se tratam internamente.
>
> Com os melhores cumprimentos,
> Vítor Gama

---

## 8. Marca — o que já se sabe (para a questão E-18)

Pesquisa preliminar grátis (TMview + INPI, 06/07/2026): **"HONRA II TECH, LDA"** é uma **firma** de retalho de informática (Matosinhos), de setor diferente — **não** uma marca registada. Não se encontrou nenhuma **marca** "Honra" registada (inconclusivo, mas encorajador). **Firma ≠ marca** → o risco é menor do que parecia. Registar a marca **figurativa** (`honra.` + selo H), classes 9/35/42/45. Fazer o pedido antes de ter utilizadores. *(Roadmap burocrático — Fase B.)*

---

## 9. Depois da consulta

- Passar as respostas às **8 lacunas 🟡/🔴** para decisões de produto (o que muda no desenho).
- Encomendar a **redação final** de T&C + Política de Privacidade + AIPD.
- Fechar a **estrutura** (constituir Lda antes de cobrar/publicar — Roadmap Fase C).
- Agendar **corretor de seguros** (RC/E&O) e **fiscalista** (DAC7 + IVA das penalizações).

---

### Anexos técnicos (já existentes, não é preciso reler)
`BRIEFING-ADVOGADO.md` · `JURIDICO-CONTRATO-CONVITE.md` · `CONTRATO-TIPO-EXEMPLAR.md` · `DESENHO-CONTRATO-CONVITE.md` · `../Honra-burocracia-roadmap.md`
