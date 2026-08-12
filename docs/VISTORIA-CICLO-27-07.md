# VISTORIA AO CICLO COMPLETO — 27/07/2026

> Pedido do Vítor: *"Faz uma vistoria com rigor neste processo, desde a criação do trabalho até à finalização do projeto com o profissional. Verifica se não há lacunas e se realmente faz sentido. Testa contigo e com um agente teu."*
> Método: ciclo E2E conduzido AO VIVO contra a BD de desenvolvimento, pela mesma porta da app (anon key + RLS + Edge Functions, **zero service_role**). Duas partes independentes: **cliente = vitor.gama@honra.app** (conduzido pelo Claude) e **profissional = assistente@honra.app** (conduzido por um agente autónomo, com mandato para criticar). Guião: `honra-e2e.mjs` (scratchpad da sessão). Testes negativos em todos os pontos de guarda.

## 1. O CICLO PROVADO (tudo ao vivo, com timestamps)

| # | Gesto | Quem | Resultado |
|---|---|---|---|
| 1 | Publicar anúncio | cliente | `trabalhos` aberto (5aeef8db…) |
| 2 | Candidatar | profissional | ok; **duplicado travado** (constraint única) |
| 3 | Abrir orçamento ao candidato | cliente | `pedido` (0d8a8226…) |
| 4 | Proposta: prazo 10/08 + 2 checkpoints com prazos | cliente | ok; **valor 300€ NÃO gravou (062 por aplicar)** |
| 5 | Ler proposta ANTES de aceitar | profissional | ✓ decisão 5 da fatia D cumpre-se (viu prazo+checkpoints) |
| 6 | Aceitar (aperto-agir) | profissional | `aceite` 01:23:17 |
| 7 | Selar (aperto-agir) | cliente | `selado` 01:24:11; **anúncio → `a_decorrer` sozinho (058 ✓)** |
| 8 | Apresentar cp1 com substância | profissional | `entregue`; evidência íntegra |
| 9 | Confirmar cp1 | cliente | `confirmado`; negócio fica `selado` (correto) |
| 10 | Apresentar cp2 | profissional | `entregue` |
| 11 | Confirmar cp2 | cliente | **agregação automática → `honrado`; anúncio → `concluido` sozinho** |
| 12 | Marcar entregue | profissional | `entregue` |
| 13 | Confirmar entrega | cliente | `concluido` |
| 14 | Avaliar 5★ | cliente | ok; **2ª avaliação travada** (constraint) |

**Avisos (sino) verificados dos DOIS lados:** pedido, "Aceitaram — sela o aperto", selado, "Evolução apresentada" ×2, "Evolução confirmada" (cp1), honrado. O sino existe e fala.

## 2. GUARDAS PROVADAS (testes negativos, mensagem real)

- Aperto fora de vez (cliente em `pedido`) → *"não é a tua vez de agir neste orçamento"* ✓
- **Checkpoint pelo profissional** → *"Só o contratante define os checkpoints deste projeto."* ✓ (a lei "nunca pelo profissional" está na BD)
- Checkpoint do cliente PÓS-selo → *"Checkpoints trancados após o selo…"* ✓ (047)
- Profissional confirmar o próprio trabalho → travado (por construção: o ramo do prestador na função só conhece "apresentar"; confirmar vive no ramo do recetor) ✓
- Apresentação vazia → *"Precisas de anexar evidência…"* ✓ (decisão 1: toque vazio = não agiu)
- Reapresentar checkpoint entregue → travado ✓
- Confirmar checkpoint sem evolução → *"ainda não tem evolução para decidir"* ✓
- Profissional concluir → *"Transição de estado reservada ao servidor"* ✓ (010)
- **Profissional avaliar o cliente** → RLS nega ✓ (037, unidirecional)
- Suspensão e identidade verificada exigidas nos gestos (aperto-agir §4b/§5, verificado em código)
- Resolver de silêncio-ao-prazo cobre checkpoints (véspera + marca informada) — verificado em código; **confirmar que o cron está vivo no dashboard**

## 3. LACUNAS (por gravidade)

### 🔴 Críticas — fecham-se aplicando o que JÁ ESTÁ CONSTRUÍDO
1. **O contrato mexe-se depois da palavra dada.** PÓS-selo, o cliente mudou o prazo global de 10/08→05/08 na BD viva, sem qualquer aviso ao profissional (sino vazio entre 01:24 e 01:26 — dupla prova). Se ele entregasse a 07/08 (dentro do que assinou), a máquina dizia que falhou — com a escada de marca em cima. **A migração 062 fecha isto** (valor+prazo trancados no selo, só do cliente).
2. **Negócio sem valor escrito.** O termo mais disputável — o preço — não existe no orçamento (coluna da 062 por aplicar). O agente-profissional: *"dei a minha palavra num contrato cujo preço só existe na cabeça do cliente; no dia do conflito, não há registo."*
3. **Dupla promessa viva na BD.** Nos pedidos do assistente estão DOIS "TESTE 058" ambos `selado` do mesmo par (criados com 12s de intervalo) — exatamente o que a **060 (limpeza+índice único) e a 061 (cascata uma-vaga-um-aperto)** matam. Construídas, por aplicar.

**→ Ação nº1, antes de tudo: aplicar as migrações 060, 061 e 062 à BD.**

### 🟠 Importantes — pequenas fatias novas
4. **Coerência de prazos não é validada:** ficou um contrato com prazo global (05/08) ANTERIOR ao prazo do último checkpoint (08/08). Invariante em falta na escrita: prazo global ≥ max(prazo dos checkpoints). (A 062 tranca pós-selo mas não valida a coerência pré-selo.)
5. **A confirmação do ÚLTIMO checkpoint é engolida pelo honrado:** o cp1 gera "Evolução confirmada", o cp2 não (o código salta o aviso quando o desfecho é honrado). São factos distintos — a aceitação da entrega final é a prova que o profissional arquivaria.
6. **Três vozes de erro:** (a) frases de negócio exemplares (cp-add, evidência vazia); (b) frases de máquina ambíguas ("já não está à espera de evolução", "reservada ao servidor"); (c) **Postgres cru a vazar** (candidatura duplicada, RLS da avaliação, avaliação dupla). Uniformizar para (a): as guardas só-BD precisam de tradução na app.

### 🟡 A decidir (produto, não bugs)
7. **A `ordem` dos checkpoints é cosmética** — nada impede apresentar o cp2 com o cp1 pendente. Se a "prova de conceito" pode ser saltada, o controlo intermédio esvazia-se. Guarda ou número?
8. **`honrado` chega ANTES de `entregue`** — semanticamente estranho para quem lê ("honrado mas ainda não recebi"). Se é intencional (honra = compareceram; entrega = logística), a UI tem de o explicar. Nota: o corpo do aviso ("Os dois compareceram") tem voz de comparência/evento em negócios internos — rever copy.
9. **Profissão `pendente` candidata-se sem flag** — o cliente não vê que o selo de profissão está por verificar. Liga ao mecanismo de Profissão por decidir.
10. **Não há contraproposta** — o profissional só aceita ou recusa em bloco (não pode propor "cp1 até 05/08 em vez de 03/08"). Pode ser deliberado (anti-leilão é lei do produto — mas contraproposta de PRAZO não é leilão de preço). Decisão consciente a registar.
11. **Mérito do contratante não chega ao momento da decisão** do profissional (o carril existe na visão; o rank/Confiança do cliente devia estar na candidatura/pedido).

### Higiene
12. `cliente@teste.app` já não existe (limpeza 16/07) — recriar ou riscar dos docs. Sino do assistente com 3 `selado` duplicados de testes antigos. Dados desta vistoria ficaram na BD (anúncio "VISTORIA 27/07", negócio concluído + avaliação 5★ no assistente) — limpar quando se aplicar a 060 ou deixar como histórico de teste.

## 4. VEREDITO

**A espinha do ciclo FAZ SENTIDO e está sólida.** A ordem dos gestos é a certa (cliente propõe → profissional aceita → cliente sela → trancado → profissional apresenta → cliente confirma), as guardas de papel estão na BD e aguentaram todos os ataques dos dois lados, e a automação (agregação de checkpoints → honrado; anúncio a seguir o aperto do princípio ao fim) correu sem um único gesto redundante — foi a peça mais impressionante da vistoria, nas palavras do próprio agente.

**O que trai a promessa hoje não é desenho, é DEPLOYMENT:** as três fatias que fecham as três lacunas críticas (060/061/062) estão construídas no repo à espera de aplicação. Depois disso, as fatias novas são pequenas (invariante de prazos, aviso do último checkpoint, tradução de erros) e o resto são decisões de produto para o Vítor, não código.
