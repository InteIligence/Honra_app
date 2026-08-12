# Limpeza da BD — auditoria 16/07 (executada a 17/07/2026)

> **Estado: NADA foi apagado.** Este documento é a auditoria só-leitura + os DELETEs propostos, prontos a executar **apenas por decisão do fundador**. A Parte 2 (perfis-semente) foi executada — ver secção final.

---

## 1. Auditoria dos perfis (9 encontrados)

Contagens verificadas diretamente na BD (`orc de/para` = orçamentos enviados/recebidos; `aval` = avaliações dadas+recebidas; `verif` = selos 'verificado'/total de abas; `notif` = notificações).

| Perfil | id | Papel / Cidade | Tipo | Honrados | Apertos | Admin | orc de/para | aval | msgs | trab | convites | verif | portefólio | notif | Criado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Vítor Hugo** | `63a79cf9-142f-409b-b416-ba4e3bda6e8d` | — / — | pessoa | 0 | 0 | não | 0/4 | 0 | 0 | 0 | 0 | 0/4 | 0 | 3 | 08/07 |
| **Vítor Gama** | `96930528-e7f6-4a0b-985a-c46cad8ac2d6` | Fotógrafo / Sintra | pessoa | 3 | 3 | não | 9/3 | 2 | 0 | 0 | 0 | 3/4 | 1 | 11 | 08/07 |
| Demo Verificação | `76b5bc17-2da8-41e8-8434-8258ee4de146` | Estúdio criativo / Lisboa | empresa | 3 | 4 | não | 0/3 | 1 | 0 | 0 | 0 | 2/4 | 0 | 1 | 09/07 |
| Demo Dois | `7961713f-9c46-496b-814b-23bf3a55e784` | — / — | pessoa | 0 | 0 | não | 0/5 | 0 | 0 | 0 | 0 | 0/4 | 0 | 1 | 09/07 |
| tó | `f1e1a865-d4d3-47b3-9f18-4f751b9a4a94` | — / — | pessoa | 4 | 4 | não | 3/1 | 1 | 1 | 1 | 0 | 2/4 | 1 | 8 | 11/07 |
| alberto | `2204d4e7-7848-4770-887d-6869e8e31560` | — / — | pessoa | 0 | 0 | não | 2/1 | 0 | 0 | 0 | 0 | 0/4 | 0 | 3 | 11/07 |
| **Rute** | `518d1954-c1e9-41d1-b234-49b559c4122d` | Vendedora comercial / Lisboa | pessoa | 2 | 2 | não | 0/2 | 4 | 1 | 0 | 0 | 4/4 ✅ | 1 | 9 | 12/07 |
| **Vitor Hugo** | `e37db213-0e57-4fab-8691-6a66dc41ce87` | Realizador / Lisboa | pessoa | 2 | 2 | não | 5/0 | 4 | 2 | 0 | 0 | 3/4 | 1 | 9 | 12/07 |
| **Claude Assistente** | `2ffbd330-aeb6-494d-9d21-eacad557df22` | DJ / Lisboa | pessoa | 0 | 0 | **sim** | 0/0 | 0 | 0 | 0 | **1** | 3/4 | 1 | 0 | 14/07 |
| _pedidos_profissao_ | | | | | | | | | | | | | | 0 em todos | |

### Classificação

**INTOCÁVEIS (5):**
- `2ffbd330-…` **Claude Assistente** — admin, conta Connect ativa, 1 contrato-convite (Afonso), 2 tarefas de agenda, contacto verificado.
- `96930528-…` **Vítor Gama** — conta principal do fundador; 3 selos, portefólio, o grosso dos orçamentos.
- `63a79cf9-…` **Vítor Hugo** — regra "qualquer Vitor Hugo/Vítor Hugo". Nota: é a única conta com email **por confirmar** em auth.users.
- `e37db213-…` **Vitor Hugo (Realizador)** — regra idem; 3 selos, portefólio com 2 ficheiros, par ativo da Rute.
- `518d1954-…` **Rute** — 4/4 selos ✅ (única conta Verificada completa), portefólio, contacto verificado.

**CANDIDATOS A APAGAR (4):**
- `f1e1a865-…` **tó** — sintético; 2 selos, 1 item de portefólio (ficheiro no storage), 1 trabalho publicado, 4 orçamentos cruzados com contas intocáveis (ver avisos).
- `2204d4e7-…` **alberto** — sintético; sem selos, 3 orçamentos soltos.
- `7961713f-…` **Demo Dois** — sintético; sem selos, só 5 orçamentos recebidos em estado 'pedido'.
- `76b5bc17-…` **Demo Verificação** — sintético (empresa); 2 selos, 1 orçamento `confirmado_ambos` com o Vítor Gama + 1 avaliação (ver avisos).

**DÚVIDAS (2):**
1. **Contrato-convite "Afonso"** (`b3f888a8-…`, cliente_convidado `7e2f5784-…`, tel. `+351912345678`) — é claramente de teste (número fictício, estado `aguarda_assinatura`, sem serviço/valor), mas pertence à conta **Claude Assistente (intocável)** e é a única demo viva da rampa do contrato-convite. Arrasta 3 eventos_convite + 1 magic_link. Apagar ou manter como demo = decisão do fundador (SQL opcional na secção 4).
2. **2 ficheiros órfãos no bucket `cedulas`** — owners `22545515-…` e `9abf8610-…` **já não existem em auth.users** (contas de teste apagadas antes desta auditoria). São lixo de storage sem dono; só listados, não mexi.

---

## 2. Inventário de teste remanescente

- **contratos_convite:** 1 (o "Afonso" acima — dúvida #1). Satélites: 3 `eventos_convite` (formulario, aceite, sms_enviado), 1 `magic_links_convite`, 0 `otp_convidado`, 0 `anexos_convite`.
- **clientes_convidados:** 1 ("Afonso", `7e2f5784-8679-4a75-8d18-e25ce55040c2`).
- **notificações:** 45 no total. 13 pertencem diretamente aos candidatos (tó 8, alberto 3, Demo Verificação 1, Demo Dois 1). As restantes são dos intocáveis, mas várias apontam para orçamentos dos candidatos — caem em cascata com eles (FK `notificacoes.orcamento_id → orcamentos ON DELETE CASCADE`).
- **trabalhos:** 1 ("Sessão fotográfica de produto — 20 fotos", do tó). **candidaturas:** 0.
- **outros:** denuncias 0, bloqueios 0, push_tokens 0, pedidos_conta 0, pedidos_profissao 0.

### Storage (SÓ LISTADO — nada apagado)

| Bucket | Objeto | Dono | Situação |
|---|---|---|---|
| portfolio | `f1e1a865-…/1783827940479.png` (26 KB) | tó | **pasta de candidato** |
| evolucoes | `f6925048-…/1783823019430.png` (26 KB) | Vítor Gama | ficará **órfão** se o tó for apagado (o orçamento f6925048 morre em cascata) |
| cedulas | `22545515-…/prova.txt` (0 KB) | conta inexistente | **já órfão** |
| cedulas | `9abf8610-…/p.txt` (0 KB) | conta inexistente | **já órfão** |
| portfolio | `2ffbd330-…`, `518d1954-…`, `96930528-…`, `e37db213-…` (×2) | intocáveis | manter |
| evolucoes | `18013d7d-…`, `59c2da93-…` | orçamentos Rute↔Vitor Hugo | manter |

---

## 3. Cadeia de FKs verificada (o que cai em cascata)

`perfis.id → auth.users(id) ON DELETE CASCADE` — **apagar em `auth.users` limpa tudo** com uma instrução. Filhos de `perfis` com CASCADE: orcamentos (de+para), avaliacoes (de+para), mensagens, notificacoes, trabalhos, candidaturas, verificacoes, portfolio_itens, perfil_categorias, contas_connect, contratos_convite, contactos_verificados, otp_contacto, pedidos_conta, pedidos_profissao (`revisto_por` = SET NULL), preferencias_notificacao, push_tokens, tarefas, denuncias, bloqueios, leitura_conversa. Filhos de `orcamentos` com CASCADE: avaliacoes, mensagens, notificacoes, leitura_conversa. Filhos de `contratos_convite` com CASCADE: eventos_convite, magic_links_convite, otp_convidado, anexos_convite, notificacoes.

### ⚠️ Avisos de honestidade antes de apagar

1. **Os contadores não recuam.** `negocios_honrados`/`apertos_selados` são inteiros gravados no perfil. O Vítor Gama tem 3 honrados — **todos ganhos contra tó e Demo Verificação**. Apagar os candidatos apaga os orçamentos-prova (b7d5d09a, f6925048, b92b8c40) mas os contadores ficam a dizer 3. Pela régua do Honra (nenhum número sem prova), incluí em baixo um bloco opcional de recontagem.
2. **Avaliações dos intocáveis desaparecem juntas:** a avaliação recebida pelo Vítor Gama (orçamento b7d5d09a com tó) e a do orçamento b92b8c40 (com Demo Verificação) caem em cascata.
3. **Storage não cai em cascata** — os ficheiros listados na secção 2 têm de ser removidos à parte (Dashboard → Storage, ou API de Storage; apagar só a linha em `storage.objects` deixa o ficheiro físico no S3).

---

## 4. DELETEs propostos (⚠️ NÃO EXECUTADOS — decisão do fundador)

```sql
-- ============================================================
-- PASSO 0 — pré-verificação (esperado: 4 linhas, os 4 candidatos)
-- ============================================================
select id, nome from perfis where id in (
  'f1e1a865-d4d3-47b3-9f18-4f751b9a4a94',  -- tó
  '2204d4e7-7848-4770-887d-6869e8e31560',  -- alberto
  '7961713f-9c46-496b-814b-23bf3a55e784',  -- Demo Dois
  '76b5bc17-2da8-41e8-8434-8258ee4de146'   -- Demo Verificação
);

-- ============================================================
-- PASSO 1 — apagar as 4 contas de teste
-- (auth.users → perfis → todos os filhos, tudo ON DELETE CASCADE,
--  verificado na secção 3; uma única instrução chega)
-- ============================================================
begin;

delete from auth.users where id in (
  'f1e1a865-d4d3-47b3-9f18-4f751b9a4a94',  -- tó
  '2204d4e7-7848-4770-887d-6869e8e31560',  -- alberto
  '7961713f-9c46-496b-814b-23bf3a55e784',  -- Demo Dois
  '76b5bc17-2da8-41e8-8434-8258ee4de146'   -- Demo Verificação
);

-- PASSO 2 — pós-verificação (todas devem devolver 0)
select count(*) from perfis where nome in ('tó','alberto','Demo Dois','Demo Verificação');
select count(*) from orcamentos o where not exists (select 1 from perfis p where p.id=o.de_perfil)
                                     or not exists (select 1 from perfis p where p.id=o.para_perfil);
select count(*) from trabalhos t where not exists (select 1 from perfis p where p.id=t.autor_perfil);

commit;

-- ============================================================
-- PASSO 3 — recontagem (APROVADA pelo Vítor 17/07; estados
-- VERIFICADOS contra o trigger vivo `atualizar_contadores_honra`:
-- honrados contam na transição p/ 'honrado', e os negócios avançam
-- depois p/ 'entregue'/'concluido' → a recontagem tem de incluir
-- esses estados + o legado 'confirmado_ambos', senão rouba honrados)
-- ============================================================
update perfis p set
  negocios_honrados = (select count(*) from orcamentos o
    where (o.de_perfil=p.id or o.para_perfil=p.id) and o.estado in ('honrado','entregue','concluido','confirmado_ambos')),
  apertos_selados = (select count(*) from orcamentos o
    where (o.de_perfil=p.id or o.para_perfil=p.id) and o.selado_em is not null),
  cancelados_mutuo = (select count(*) from orcamentos o
    where (o.de_perfil=p.id or o.para_perfil=p.id) and o.estado = 'cancelado'),
  negocios_falhados = (select count(*) from orcamentos o
    where (o.de_perfil=p.id or o.para_perfil=p.id) and o.estado = 'incumprido')
where not p.semente;

-- Ver o resultado:
select nome, negocios_honrados, apertos_selados, cancelados_mutuo, negocios_falhados
from perfis where not semente order by nome;

-- ⚠️ NOTA DE EXECUÇÃO (17/07): o Claude foi impedido pelo modo de
-- segurança de executar o PASSO 1 (delete de contas) — decisão
-- reservada ao fundador. Colar os PASSOS 0→3 no SQL Editor do
-- Supabase, por esta ordem, quando o fundador aprovar.

-- ============================================================
-- PASSO 4 (DÚVIDA #1 — só se decidires largar a demo "Afonso") —
-- ============================================================
-- begin;
-- delete from contratos_convite where id = 'b3f888a8-c324-4328-85e0-9bd41d546a14';
--   -- cascata: eventos_convite (3), magic_links_convite (1), otp_convidado (0), anexos (0), notificacoes ligadas
-- delete from clientes_convidados where id = '7e2f5784-8679-4a75-8d18-e25ce55040c2';
-- commit;
```

### Storage a remover à parte (Dashboard → Storage, DEPOIS do Passo 1)
1. `portfolio/f1e1a865-d4d3-47b3-9f18-4f751b9a4a94/1783827940479.png` (pasta do tó)
2. `evolucoes/f6925048-9fd7-4b4e-a21c-ff9bda1261f0/1783823019430.png` (fica órfão com o tó)
3. `cedulas/22545515-6caa-41d6-9f37-9a37470f1672/prova.txt` (já órfão)
4. `cedulas/9abf8610-f202-4487-b078-4557abd4a1c8/p.txt` (já órfão)

---

## 5. PARTE 2 — Perfis-semente Lisboa·eventos (EXECUTADO 17/07)

**Migração aplicada:** `supabase/migrations/040_perfis_semente.sql` — coluna aditiva `perfis.semente boolean not null default false`.
**🧹 Antes do lançamento:** `delete from auth.users where id in (select id from perfis where semente);`

Contas criadas via signup público (emails já confirmados — a confirmação está desativada no projeto).
**Palavra-passe única das 8 contas:** `hl3NRAl8YxJSmA8fxEaybZTv`

| # | Email | id | Nome | Papel | Cidade | Categorias |
|---|---|---|---|---|---|---|
| 1 | semente1@honra.app | `de02559d-f8cc-4ae8-b705-00c9835efd59` | Miguel Tavares | DJ | Lisboa | dj, eventos |
| 2 | semente2@honra.app | `7610e8a1-f0e8-461d-8f38-0f5c6117d3aa` | Inês Correia | Fotógrafa de casamentos | Sintra | fotografia-video |
| 3 | semente3@honra.app | `4e408fc6-9beb-433a-9ec8-91c9fdf93af4` | Tiago Baptista | Videógrafo | Lisboa | fotografia-video |
| 4 | semente4@honra.app | `f71b231b-98d9-4a9c-aa9d-0d71f2c753c6` | Carolina Mendes | Wedding planner | Cascais | wedding-planner, eventos |
| 5 | semente5@honra.app | `9ae85408-7336-4eec-9b62-93b6274096cc` | Ricardo Fonseca | Chef de catering | Lisboa | catering |
| 6 | semente6@honra.app | `ab31fc86-980e-4900-ac67-fd5895ad2e3e` | Marta Silveira | Florista e decoradora | Sintra | decoracao-flores |
| 7 | semente7@honra.app | `c296c743-eb1e-49ad-a0ef-2038cf7b7ad6` | João Álvares | Músico — banda ao vivo | Lisboa | musica-ao-vivo, eventos |
| 8 | semente8@honra.app | `2f5cda64-7de7-44e9-b32e-643e29d26276` | Sofia Ravasco | Maquilhadora de noivas | Cascais | cabelo-maquilhagem-noiva |

Todos: `tipo='pessoa'`, `disponibilidade='disponivel'`, `semente=true`.
**Honestidade verificada:** 0 selos, 0 negócios, 0 avaliações em todos os 8 — só as 4 abas de verificação `pendente` que o trigger de signup cria para toda a gente.
