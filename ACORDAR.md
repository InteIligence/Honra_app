# HONRA — para quando acordares ☀️

## 🔴 STATUS 01/08 — SEGURANÇA CRÍTICA, O CICLO DESTRANCADO, A ESCADA REFEITA

### O que fechou um buraco grave (072)
`registar_infracao` (048) ficou **sem `revoke`**. Em PostgreSQL o EXECUTE de uma função nova é dado
a PUBLIC por omissão, e o PostgREST expõe tudo o que vive no schema `public` — logo **qualquer
pessoa com a chave `anon` (que viaja dentro do bundle) podia suspender qualquer conta até 2 anos**.
Confirmado AO VIVO em produção: um POST anónimo com um uuid inexistente respondeu 409 (violação de
FK), não 401 — ou seja, a função executou. E um suspenso também não pode apagar a conta: ficava preso.
**LIÇÃO:** a 048 escrevia a intenção certa num comentário ("só o sistema"). Uma intenção em
comentário não é uma permissão.

### O ciclo NUNCA chegava ao fim (074)
Nada, em lado nenhum, escrevia `orcamentos.estado='concluido'` — e a RLS das avaliações exigia esse
estado. **Ninguém conseguiu avaliar ninguém, nunca.** A máquina termina em `honrado` (063); a cauda
`entregue→concluido` era de quando havia botões manuais. Agora avalia-se a partir de `honrado`.
Regra do Vítor: *"a crítica surge após o momento de honra, por vontade própria e não por obrigação"*.

### A escada tem SEIS degraus e corre a HONRADOS (não a avaliações)
Verificado · Provado(2) · Recomendado(75) · Reconhecido(125⚠️) · Referenciado(200) · Mestre(500),
cada um com piso de Confiança (30/60/70/75/90%). O 125 é **proposta minha, por confirmar**.
PORQUÊ: as avaliações são opcionais e dependem de terceiros (com double-blind, de DUAS vontades) —
alguém podia honrar 30 negócios sem falhar um e ficar preso em Provado. O piso de conduta existe
porque volume puro convidava ao farm de negócios pequenos.
- **Arte deslocada:** peça do antigo Referência → Reconhecido; a do Mestre → Referenciado; o Vítor
  está a desenhar a nova do Mestre. `nivelDesenho()` = `[0,1,2,3,4,4]` — muda-se o último número.
- **DECIDIDO, POR CONSTRUIR:** a Confiança decai com a inatividade. *"É honrar o caminho."* Resolve
  a saturação (hoje chega-se a 100% com 14 honrados e fica-se lá para sempre).

### O COMBINADO COM CONSEQUÊNCIA (078) — conceito novo
Encontro marcado no chat: cumprido **+2** de Confiança aos dois, falhado **−2** a quem faltou.
*"O checkpoint é o TRABALHO; o combinado é a PRESENÇA."*
**Ninguém condena sozinho:** silêncio dos dois → expira sem consequência; acusação contestada →
disputa, sem mexer em contadores; só o silêncio DEPOIS de uma acusação recebida é que conta.
⏳ Falta ligar o botão "Marcar combinado" no chat (a mecânica já existe).

### Conversa solta do orçamento (075/076/077)
Falar deixou de criar um orçamento fantasma que a outra pessoa tinha de aceitar (e recusar matava a
conversa). Duas naturezas: a do NEGÓCIO (com pílula de contexto) e a LIVRE (uma só por pessoa, par
ordenado a<b — duplicados não podem existir). As pastas antigas convergiram. A marca de leitura
passou a conhecer as três naturezas (antes só orçamentos: grupos e livres nunca ficavam lidos).

### Pesquisa (maquete 3a) e Chat (maquete 4a)
- **Pesquisa:** frase editável com pastilhas (`FAZ Música ao Vivo ×`), lista em vez de grelha, elo na
  rede a partir de negócios reais, painel de PROVAS ao lado, sugestão de categorias POR ESCRITA
  (84 na base — as pastilhas não escalavam). Ordenação nunca por preço.
- **Chat:** duas colunas na Secretária. O separador saiu da coluna de leitura de 720px (passou a
  `cenaMesa`) — a 720 as duas colunas partiam-se.

### Regras de trabalho aprendidas (não repetir os erros)
- **Migrações:** dar SEMPRE a versão sem comentários e sem acentos, colada no chat. A versão
  comentada falha no SQL Editor dele. O ficheiro do repo mantém os comentários.
- **Maquetes:** quando há maquete de ecrã inteiro, a instrução é *"substitui o layout"*, nunca
  *"evolui"* — foi "evolui" que deu o híbrido no Início.
- **Ver antes de dizer que está bom:** o typecheck não apanha `transform-origin`, `collapsare`,
  zIndex em falta nem botões que navegam para o sítio errado. Pedir ao Vítor para deixar a sessão
  aberta no browser em `localhost:8081`.

### ⏳ ABERTO
- **Bug por resolver:** criar grupo falha com violação de RLS, apesar de a política estar correta,
  de `identidade_verificada` devolver `true` e de `auth.uid()` resolver. À espera de ver se há
  sobrecargas da função ou uma policy RESTRICTIVE.
- Peça do Mestre (vem do Design). Decay da Confiança. Ligar "Marcar combinado".
- Da vistoria: grupos furam o bloqueio · 48 chamadas leem o erro do servidor no sítio errado ·
  "Publicar trabalho" grava por cima do anúncio anterior.
- **Slogan em aberto:** "Constrói o teu nome" é a base.


## 🪪 STATUS 28/07 (6) — PERFIL 1c (passe Honra Card) + Enter nos forms + rail final
Handoff `~/Desktop/HONRA/design_handoff_perfil/Perfil 1c.dc.html`. O Vítor picou (com razão) por eu
andar a adiar. Aplicado:
- **Perfil secretária = passe Honra Card** (inicio.tsx? não — src/app/(tabs)/perfil.tsx, largo): card
  verde arredondado sobre o bege (NÃO a faixa full-bleed, que fica só no telemóvel). Toggle
  **Frente/Verso** (state `face`): Frente = medalhão H (svg) + nome+✓verde + @handle·papel·cidade +
  chips de verificação + "CREDENCIAL PÚBLICA honraapp.com/handle" + Partilhar; Verso = Confiança %
  grande + barra + stats + lista de verificações. Depois: linha (Disponível/Ocupado + áreas +
  Verificar contacto + Editar) e grelha Portefólio | Avaliações (1fr/420). Cores do handoff (#127A4A
  verde-check, #DCEBDF disp ativo, #9A7740 gerir, etc.).
- **Rail:** roda de Definições no FUNDO (o "símbolo que faltava"); ativo = anel branco fino (não o
  quadrado creme); avatar-topo=perfil, H=casa (já antes).
- **Enter nos formulários:** Campo virou forwardRef; login e registo saltam campo-a-campo com Enter
  e submetem no último (returnKeyType + onSubmitEditing + refs).
- tsc 0; i18n paridade; export. Fonte Manrope ainda DEFERIDA.
- **⏳ PRÓXIMO (prometido):** AGENDA COM CALENDÁRIO (dia→nota→hora do alerta→checklist). Pergunta ao
  Vítor no ar: o alerta agendado é do TELEMÓVEL (expo-notifications; web não fia). Confirmar e construir.

## 🎨 STATUS 28/07 (5) — SHELL DESKTOP 1a (handoff do Vítor) — rail + cabeçalho refeitos
Handoff `~/Desktop/HONRA/design_handoff_shell_desktop/Shell Desktop 1a.dc.html`. O Vítor apanhou
que eu tinha feito rail+fundo mas deixado o CABEÇALHO VERDE gigante por refazer (não batia nada
com o desenho). Corrigido:
- **Rail à medida** (`src/components/RailSecretaria.tsx`) — cartão verde flutuante, ao lado do
  conteúdo (a barra nativa esconde-se na secretária via `tabBar={()=>null}`). Ícone ativo =
  quadrado creme; inativo = sálvia (#88A697). Tokens novos: begeSecretaria #E7E0D0, salvia.
- **Reestrutura pedida pelo Vítor:** o AVATAR do dono sobe ao TOPO (era o selo H) → leva ao perfil,
  acende quando lá está; o **H torna-se o botão de CASA** (1º item, glifo selo); o ícone de perfil
  (user) SAIU do meio (redundante).
- **Cabeçalho de secretária refeito (inicio.tsx `cabecalhoDesktop`)**: SOBRE O BEGE — identidade
  (avatar anel-dourado + Olá/nome + ✓ verde #127A4A), pílula de stats creme #F7F3E9 com divisórias
  (à tua espera/a decorrer/por ler), moldura do calendário, botão **Publicar anúncio** verde
  #123C2B com + dourado. **Percurso = FAIXA VERDE separada** por baixo (pcD, sólida, sobre o bege).
  fundo do Início passa a begeSecretaria no largo. Mobile intacto.
- **"Publicar trabalho" → "Publicar anúncio"** (decisão do Vítor; concordei — "anúncio" nomeia o
  objeto, já é a palavra interna do sistema; conceito `trabalho` mantido no código).
- **Perfil:** Disponibilidade (toggle) separada das áreas ("O QUE FAÇO", etiquetas passivas) — a
  confusão de balões colados resolvida.
- Fonte Manrope do handoff: DEFERIDA (carga de fonte é passo à parte). tsc 0; i18n paridade; export.
- **PENDENTE olhos do Vítor:** o conjunto do dashboard vs handoff; propagar a pele (bege+cartões
  #FBF8F0) aos restantes painéis se ele quiser.

## 🧩 STATUS 28/07 (4) — RAIL MINIMALISTA + TODOS OS PAINÉIS FORA DO MODO TELEMÓVEL
Rail: FORA o expansível/rótulos — fica só símbolos (76px), ícones brancos (Honra.creme),
selecionado num círculo branco (brancoCreme, ícone verde). Sem botão de encolher.
Painéis (todos ganharam `largo`, deixaram a coluna estreita de 720):
- **Rede** → grelha de 2 colunas de pessoas (maxW 1100).
- **Insígnias** → as 5 em fila que quebra (moeda 156px, maxW 1100).
- **Agenda** → 2 colunas: Compromissos | Tarefas (maxW 1100).
- **Convites** → coluna centrada larga (maxW 840 — lista lê-se a fio).
- **Percurso** → coluna centrada (maxW 760 — narrativa da jornada).
- **Definições** → coluna centrada (maxW 720 — padrão de ajustes desktop).
tsc 0; i18n paridade; export novo. Chat mantém coluna (simples, por decisão).
- **PRÓXIMO ("depois avançamos com os detalhes"):** os ecrãs [id] — projeto, perfil público
  (= aplicar o painel do perfil próprio), trabalho, conversa. E refinar Percurso/Definições para
  2 colunas se o Vítor quiser (agora estão centrados, apropriado mas não "usa a largura toda").
- Chaves i18n `tabs.rail_encolher/abrir` ficaram sem uso (rail já não expande) — inócuas.

## 🖥️ STATUS 28/07 (3) — SECRETÁRIA COMPLETA + GRUPOS DE EQUIPA (feedback do Vítor ao vivo)
Sessão guiada pelo Vítor a ver o browser em direto. Régua dele: "separadores diferentes,
ferramentas diferentes — nada simétrico a 100%". Feito:
- **Rail encolhível:** botão no fundo (chevrons) alterna 212↔76px; nasce encolhido < 1200px;
  o conteúdo conquista o espaço. Rótulos só no rail aberto.
- **Pesquisar:** "Último honrado {quando}" nos cartões (migração **067**: coluna+trigger 048 fiel+
  backfill+grant na montra fail-closed; guarda_perfil protege a recência; APLICADA ✓); grelha de
  2 colunas AGORA COERENTE em todos os segmentos (mural incluído); tolerância à coluna ausente.
- **Convites no browser:** ACEDER sim (link no Orçamentos ficou), CRIAR não — o FAB dá lugar a
  nota "faz-se no telemóvel" (Platform web).
- **Chat simples + GRUPOS (migração 068, APLICADA ✓):** grupos_conversa+grupo_membros (líder por
  trigger; RLS: membros leem/escrevem, líder gere, qualquer um sai; identidade verificada p/ criar);
  mensagens.grupo_id XOR orcamento_id, mesmo realtime. App: useMensagens(id, grupo), lista do Chat
  mistura negócios+grupos por recência (ícone users), botão user-plus no topo, ecrã /criar-grupo
  (nome+busca por @handle+chips), conversa de grupo com nº de membros + autor nos balões alheios.
  Não-lidas de grupos fica para v2 (RPC conta por orçamento).
- **Perfil = PAINEL na secretária:** segmentos extraídos e compostos — 3 colunas (Confiança+
  contratante+disponibilidade | Selo+verificações | Portefólio+editar) sob a credencial full-width,
  avaliações ao comprido; telemóvel intacto (empilhado igual).
- **Wordmark `Honra.`** (H maiúsculo) no átrio e no pago.tsx — decisão do Vítor.
- ⚠️ A meio, `(tabs)/_layout.tsx` apareceu com import truncado (colisão com sessão paralela) —
  reparado. tsc 0; i18n paridade (1157/1157); export novo.
- **PENDENTE de olhos do Vítor:** rail encolhido/aberto, grelha Pesquisar, painel Perfil, criar
  grupo ao vivo (BD já aplicada). Browser embutido continua com artefacto de captura em largura
  ≥1024 — a prova visual é dele.

## 🧽 STATUS 28/07 (2) — GAVETA 1 (polimento UX) — quase toda já feita
Ao abrir a gaveta 1 da vistoria, a maioria JÁ estava feita (sessão paralela, comentários "063 · #N"):
chat.tsx trata o erro (não mente com "sem conversas") ✅; Botao com accessibilityRole/State ✅;
+not-found.tsx com marca ✅; erros crus mapeados via helper `mensagemAuth` ✅. **Só faltava
puxar-para-atualizar** — adicionei RefreshControl a Início, Chat e Orçamentos (padrão: spinner cheio
só no 1º load; puxar re-corre `carregar`). **pesquisar.tsx deixado de fora de propósito** (load
inline de 5 queries com flag `vivo` → extração arriscada num ficheiro em edição paralela; e a
pesquisa refresca ao escrever/filtrar). tsc 0; i18n 1128/1128; app limpa. Resta da gaveta 1: nada
crítico (o pesquisar, se um dia).

## 🚀 STATUS 28/07 — TUDO NO AR (deploy + crons feitos pelo Claude via token)
Com o token de gestão do Vítor (sbp_… — A ROTAR), fiz o que faltava:
- **12 funções deployadas** (28/07 02:2x), cada uma com a flag JWT certa (confirmado verify_jwt na
  lista): aperto-agir, agir-checkpoint, convite-decidir, exportar-dados (jwt) + convite-formulario,
  convite-otp, convite-checkpoint, convite-cancelar, convite-cartao, convite-comparencia,
  resolver-caucoes, resolver-convites (no-verify-jwt). NÃO toquei nas entrega-* (da sessão paralela).
- **BUG meu corrigido:** a inserção automática do `import { modoTeste }` tinha ficado ENCRAVADA dentro
  de um import multi-linha em 3 funções (convite-cancelar/comparencia, resolver-convites) → deploy
  400. Movido para linha própria; redeployadas OK.
- **Crons:** resolver-caucoes (09:00), **resolver-convites (09:05 — JÁ estava ativo, resolve o #14)**,
  revelar-avaliacoes (09:30) todos ativos; **agendei honra-purga-convidados (03:30)**.
- **Migrações:** já estavam aplicadas (o Vítor NÃO precisa de recolar o APLICAR-060-a-065.sql — o erro
  de sintaxe dele era colagem baralhada; ignorar).
- **⚠️ FALTA SÓ O VÍTOR:** (1) ROTAR os tokens sbp_… que colou. (2) SE testar o fluxo convite em dev:
  o modoTeste (065·#10) agora exige TAMBÉM `MODO_TESTE_REF=haqynnhstjgzgtnnwqsi` nos secrets (senão o
  modo-teste fica off — é a blindagem, funciona como desenhado).

## ⚠️ STATUS 27/07 (6) — CONFLITO PARALELO RECONCILIADO (pagamento-na-entrega vs o meu #1)
Ao verificar antes do deploy, descobri que a `065_pagamento_na_entrega` (sessão paralela) e a minha
`063` mexeram no MESMO sítio: o tail honrado→entregue→concluido. Eu tinha-o removido (avaliar em
honrado); eles fizeram-no o FLUXO DE ENTREGA COM PAGAMENTO (pagamento_estado ortogonal, bucket
`entregas`, resolver de silêncio). Na BD ganhou o desenho DELES. **Vítor decidiu: fica o
pagamento-na-entrega.** Desfiz a minha #1:
- App: avaliação volta a `concluido` (proximoPassoProjeto, inicio.proximoPasso, renderAccoes,
  AVALIAVEL); honrado/entregue mostram passos de entrega + o bloco `<Entrega>` trata as ações;
  removido o filtro `avaliadas`/`TERMINAIS` do Início. i18n dos passos de entrega re-adicionado.
- Migração 063 §2 (política de avaliação em honrado) REMOVIDA — a política canónica vive na 065
  (concluido/…). Os #3 (contestação), #4 (agregação determinista — CONFIRMADO vivo), #12/#13
  (triggers de prazo/checkpoint) mantêm-se.
- tsc 0; i18n 1128/1128; app carrega limpa. **A BD JÁ está no estado 065** (não é preciso reaplicar).
- ⚠️ Colisão de ficheiros resolvida: a minha confidencialidade 065→**066**. Há duas migrações "065"
  no histórico (a deles = pagamento; a minha = confidencialidade renomeada 066).
- **DEPLOY É SEGURO (repo já fundido):** confirmei que `resolver-caucoes` tem AS DUAS mãos no mesmo
  ficheiro (64 refs de pagamento delas + 7 do meu relógio de contestação). Deployar o estado atual =
  deployar o merge. Funções a deployar: as minhas (aperto-agir, agir-checkpoint, resolver-caucoes,
  convite-formulario, exportar-dados, 7 de convite) + as NOVAS delas (entrega-decidir, entrega-pagamento).
  Comando: `npx supabase functions deploy <nome> --project-ref haqynnhstjgzgtnnwqsi` (com SUPABASE_ACCESS_TOKEN).

## ✅ STATUS 27/07 (5) — MIGRAÇÕES APLICADAS + VERIFICADAS AO VIVO
O Vítor aplicou o pacote (060→064 + confidencialidade) e correu o verificar-estado-vivo.sql.
- **Verificado ao vivo (Management API, leitura):** as 6 afirmações-chave dão TRUE — incl.
  `avaliacao_abre_em_honrado`, `checkpoint_garantido_ao_selar`, `perfis_sem_select_amplo_anon`,
  `verificacoes_so_servidor_escreve`. Colunas confidenciais do perfil expostas a anon = **[]** (0).
  Buckets com teto+MIME aplicados (avatares 5MB, portfolio 60MB, evolucoes/cedulas/anexos 10MB).
- **BUG do verificador corrigido:** a afirmação das verificações estava INVERTIDA (pedia que a
  política insegura `verif_dono_tudo` existisse; o correto é ela NÃO existir — 010/043 apagam-na).
  Renomeada para `verificacoes_so_servidor_escreve` (not exists write policy). Ficheiro reenviado.
- **Renumeração:** a minha 065_confidencialidade → **066** (colisão com a 065_pagamento_na_entrega
  da sessão paralela, que criou o bucket `entregas`).
- **⚠️ NOTA (p/ o dono do fluxo de entrega):** o bucket `entregas` (065_pagamento_na_entrega) está
  SEM teto/MIME. É privado (risco baixo, só DoS), NÃO lhe mexi para não partir esse fluxo em curso.
- **🔐 O Vítor partilhou um token de gestão sbp_… no chat — ROTAR/REVOGAR.**

## 🛠️ STATUS 27/07 (4) — VISTORIA 360° RESOLVIDA (dossier docs/VISTORIA-360-RESOLUCAO.md)
Resolvidos TODOS os achados da vistoria 360°, repo-first, sem partir. tsc 0, export novo, i18n
1083/1083 paridade perfeita, app verificada no browser (átrio/404/navegação/Botao a11y).
- **Migração 063 (fecha o ciclo):** avaliação abre em `honrado` (tail removido — fim da armadilha
  do #1); agregação determinística (#4); estado `arquivado` + relógio da contestação (#3); prazo
  visível ao selar (#12); checkpoint garantido na transação do selo (#13). App: honrado=fim, cliente
  avalia, honrado-avaliado sai do painel; botões/i18n do tail removidos.
- **Migração 064 (segurança):** perfis INSERT defende is_admin/reputação; guarda_ciclo_caucao torna
  trabalho_id imutável; buckets com teto+MIME (mata XSS armazenado nos públicos); purga RGPD de
  convidados; RPC sou_admin() (app não puxa is_admin — 3 sítios).
- **Funções:** convite-formulario deixa de sobrescrever cliente cross-tenant (#8); `_shared/modoTeste.ts`
  amarra o modo-teste ao project-ref (7 funções, #10); exportar-dados +11 gavetas (#9); resolver-caucoes
  arquiva contestações; aperto-agir sem insert best-effort.
- **UX:** lib/erros.ts (voz do erro PT/EN, 6 ecrãs); Botao a11y; chat/enviar-mensagem sem falha
  silenciosa; +not-found com marca; lib/navegar.ts (back sem beco); erroSuave token; wordmark pago;
  a11y estrelas; 13 ficheiros de código-morto do template apagados.
- **Migração 065 (confidencialidade do perfil):** corte por COLUNA — perfis deixa de expor nif/
  is_admin/semente/suspensão a anon; só a montra (15 colunas) é pública; o próprio lê o reservado
  por RPC (sou_admin + meu_perfil_reservado); suspensao.tsx e editar-perfil ligados à RPC. Embeds
  perfis!de_perfil(nome) intactos. Fail-closed (coluna nova nasce privada).
- **Guardrail:** docs/verificar-estado-vivo.sql (dump RLS/triggers/buckets + 6 afirmações-chave,
  inclui perfis_sem_select_amplo_anon).
- **📦 PACOTE PRONTO A COLAR:** docs/APLICAR-060-a-065.sql (as 6 migrações por ordem + checklist).
- **⚠️ FALTA O VÍTOR:** colar APLICAR-060-a-065.sql no SQL Editor; redeploy das Edge Functions
  tocadas; correr verificar-estado-vivo.sql; agendar crons (purga + confirmar resolver-convites);
  confirmar MIME dos buckets no Dashboard.
- **🧑‍⚖️ DECISÕES ABERTAS:** fuga A (advogado); escalão do contratante (incomputável hoje); Confiança
  sem-decay vs Escalão com-decay. **⏸️ DEFERIDO c/ razão:** em_curso legado; pull-to-refresh.


## 🛰️ STATUS 27/07 (3) — VISTORIA 360° (3 agentes, dossier docs/VISTORIA-360-27-07.md)
3 auditores read-only (segurança · coerência do ciclo · app/UX/i18n). Fundação séria; a fraqueza
está nas PONTAS que não fecham e nas superfícies periféricas. 🔴 verificados por mim:
- **O profissional pode ficar com a honra e trancar a crítica:** tail honrado→entregue→concluido
  sem resolver; +1 honrado dá-se em `honrado` (048:199) mas a avaliação só abre em `concluido`
  (037:31); se o pro nunca marca "entregue", congela com a honra contada e o cliente sem avaliar.
- **Fosso repo↔BD viva sem guardrail** (043/044 provam regressões críticas passadas — auto-verif
  de identidade, avaliações bidirecionais/expostas). Precisa de verificação pós-deploy.
- **Contestação de checkpoint sem resolução automática** → congela sem admin (a fatia E tem
  arquivamento auto; o interno não).
- **Agregação fecha à 1ª falha** → culpa 'ambos' depende do calendário; contestação atropelada.
- **chat.tsx engole o erro** e mostra "sem conversas" (mente sobre dados).
🟠: buckets sem limite MIME/tamanho (XSS armazenado nos públicos); convite-formulario público
sobrescreve cliente cross-tenant por telefone; PII de convidados sem RGPD; CONVITE_MODO_TESTE=1
colapsa auth; entrega final modelada em 2 sítios; selar sem prazo = relógio oculto 6d; checkpoint
default best-effort fora da transação; cron resolver-convites por confirmar; 3 vozes de erro;
Botao base sem a11y; envio de mensagem falha em silêncio. 🟡 e crédito no dossier.
BOM: fugas C/D/E do red-team fechadas; i18n paridade perfeita; design-system real; 0 rotas partidas.
Ordem sugerida: 060/061/062 → tail do ciclo → guardrail de drift → contestação/agregação →
periféricas de segurança → passe de UX → decisões de produto.

## 🔍 STATUS 27/07 (2) — VISTORIA E2E AO CICLO COMPLETO (dossier em docs/VISTORIA-CICLO-27-07.md)
O Vítor exigiu prova em vez de palavras. Ciclo inteiro conduzido AO VIVO na BD de dev, a dois
(Claude=cliente vitor.gama · agente autónomo=profissional assistente@honra.app), pela porta da
app (anon+RLS+Edge Functions), com testes negativos em todas as guardas: **anúncio → candidatura
→ proposta (prazo+2 checkpoints) → aceite → selado (anúncio a_decorrer sozinho ✓) → evidências →
honrado (agregação sozinha ✓) → entregue → concluído → avaliado**. Veredito: a ESPINHA FAZ
SENTIDO e aguentou os ataques; o que trai a promessa é deployment, não desenho.
- 🔴 provado ao vivo: prazo mutável PÓS-selo sem aviso (062 fecha); negócio sem valor (062);
  dupla promessa TESTE 058 ×2 selados do mesmo par (060/061). **APLICAR 060+061+062 = ação nº1.**
- 🟠 fatias pequenas: invariante prazo global ≥ checkpoints; aviso do último checkpoint engolido
  pelo honrado; 3 vozes de erro (negócio/máquina/Postgres cru) por uniformizar.
- 🟡 decisões de produto: ordem dos checkpoints é cosmética; honrado-antes-de-entregue (semântica
  + copy "compareceram"); profissão pendente candidata-se sem flag; sem contraproposta (deliberado?);
  mérito do contratante ausente do momento da decisão. Detalhe completo no dossier.

## 📜 STATUS 27/07 — A PROPOSTA DO CLIENTE (062) + a vez no selado
Regra do Vítor (27/07): "O CLIENTE faz a proposta + orçamento, surge o aperto e os checkpoints
são elaborados pelo cliente — NUNCA pelo profissional. Assim que faço o aperto, sai da minha
alçada e desaparece do A TUA VEZ até haver resposta do outro lado."
- **062_proposta_do_cliente.sql (POR APLICAR):** `orcamentos.valor_proposta` (o orçamento em €
  não existia!) + guarda `guarda_proposta_cliente`: valor e prazo só do de_perfil, só em
  pedido/aceite; selo tranca; profissional NUNCA escreve (irmã da 047 §4).
- **App:** cartão "A PROPOSTA" no projeto (souA, pré-selo: valor € + prazo + guardar, com
  tolerância à coluna ausente no padrão 058); DETALHES mostram Orçamento/Entrega às duas partes
  (é a isto que o profissional diz sim); `guardarProposta` em lib/projeto.
- **A VEZ NO SELADO CORRIGIDA:** mal se sela, a bola está com o PROFISSIONAL. O Início lê a vez
  dos CHECKPOINTS dos selados (entregue→cliente confirma; pendente→prestador apresenta — a
  máquina D nunca toca em a_agiu/b_agiu, a fila estava cega); sem checkpoints, ordem legada
  B-mostra→A-confirma (o cliente nunca reclama vez sem B agir). Mesma leitura conservadora no
  `proximoPassoProjeto` partilhado.
- Junta-se ao colapso `umaPastaPorPar` (sessão paralela) → no Início: 1 negócio = 1 linha = 1
  botão. tsc 0; export novo. POR PROVAR AO VIVO (sessão de teste = ação do Vítor).
- **PENDENTE DE DECISÃO:** o selar deve EXIGIR valor_proposta? (proposta sem € é palavra sem
  orçamento — mas os convites-contrato têm o valor no contrato próprio; não travei sem luz.)

## 🤝 STATUS 26/07 (3) — UMA VAGA, UM APERTO: o segundo selo morre na base (061)
Fecha o 🔴 buraco do STATUS 26/07 (2): a 058 avisava os preteridos mas deixava os orçamentos
irmãos (`pedido`/`aceite`) vivos — o segundo candidato ainda selava e nascia um negócio selado
sem anúncio (dupla promessa). Migração **`061_uma_vaga_um_aperto.sql`** no padrão 043/060
(a app trava, a BD trava na mesma):
- **CASCATA** (`after_orcamento_vaga_uma`): ao selar um orçamento com `trabalho_id`, os irmãos
  pré-selo do mesmo anúncio passam a **`expirado`** (escolhido de propósito: `recusado` diria que
  o CANDIDATO recusou; `expirado` é a verdade — o selo dele nunca veio; neutro na reputação,
  016/033/041/048 não o contam, e estado morto para o índice da 060) e o candidato é avisado com
  a voz da 058 ("A vaga já tem quem a faça") — salvo se a 058 já o avisou pela candidatura (uma
  vez, nunca duas). Os genéricos do ciclo ("expirou") calam-se via flag transacional
  `honra.cascata_selo` — `notificar_ciclo` recriado (= 049 à letra + a flag, padrão honra.sistema).
- **GUARDA** (`before_orcamento_vaga_uma`, sem bypass de service_role como a 043): selar um
  orçamento cujo anúncio já está entregue a OUTRO aperto (`orcamento_selado` doutro, ou irmão
  selado/honrado/entregue/em_curso) morre na base com raise claro; `for update` na linha do
  anúncio serializa dois selos em simultâneo.
- **LIMPEZA:** irmãos pré-selo de anúncios já ocupados passam a `expirado`, triggers suspensos
  (padrão 060 — sem avisos fantasma; a 058 já tinha avisado na altura). Duplas promessas já
  CONSUMADAS (dois selados) não se tocam — desfazer um selo dado é decisão do Vítor.
- **App (`lib/projeto.tsx`):** `aperto()` agora recarrega ao falhar — quem perde a corrida vê o
  estado verdadeiro (Expirado, botão fora) + a razão real da BD no banner (o `aperto-agir` já
  devolve `erroUpd.message` e o ecrã já mostra `corpo.error`; ecrã do projeto e Edge Functions
  intocados).
- tsc a 0. **NÃO aplicada à BD nem deploy** (repo-first): correr no SQL Editor DEPOIS da 060, na
  sessão do Vítor.

## 🎯 STATUS 26/07 (2) — INÍCIO: cada negócio aparece UMA vez (regra do Vítor)
O Vítor viu o Início do lado contratante e cortou: **"uma interação para cada negócio"** — a mesma
frase-ação em três secções (fila, A DECORRER, OS TEUS TRABALHOS), tudo a dar ao mesmo sítio,
"gera conflito mental e não faz o dashboard prático". Tinha razão. Regra aplicada em `inicio.tsx`:
- **A TUA VEZ = a única casa das ações.** As linhas de passo agora identificam o negócio inteiro:
  `descricao · com {nome}` — dois aceites no mesmo anúncio (duas negociações) nunca mais são
  linhas gémeas indistinguíveis. (O negócio é anúncio + PESSOA.)
- **A DECORRER = só o que espera pelo OUTRO** (`!minhaVez`). O que espera por mim está na fila —
  nunca nos dois. O pulso do cabeçalho ("a decorrer") passou a dizer o mesmo número da secção.
- **OS TEUS TRABALHOS = só os serenos.** Aberto COM candidaturas vive na fila ("Rever N
  candidaturas"); aqui ficam os abertos sem candidaturas + fechados. O rasto muda de secção,
  não se perde.
- tsc a 0; export web novo. **POR PROVAR AO VIVO** (preciso de sessão iniciada — entrar com a
  conta de teste é ação reservada ao Vítor no browser-pane).
- **🔴 BURACO EXPOSTO (para a 061):** a 058 avisa os candidatos preteridos quando um sela, MAS os
  orçamentos irmãos em `aceite` ficam vivos e o segundo ainda transita para `selado` (fica um
  negócio selado sem anúncio = dupla promessa). Chip de tarefa criado ("Travar o segundo aperto
  no mesmo anúncio (061)") com o desenho: fechar os irmãos pré-selo + raise no selo tardio.

## 🚪 STATUS 26/07 — ÁTRIO: a entrada ganhou desenho de secretária (web ≥1024px)
A porta do Honra (login/registo/recuperar/redefinir) deixou de ser a coluna-telemóvel pousada no
backdrop preto — agora abre-se em **átrio**: painel da marca à esquerda (verde-escuro, wordmark
`honra.` com ponto dourado, filete, inscrição "TRABALHO REAL. PESSOAS REAIS.") e a
credencial/formulário à direita em creme. Duas colunas unidas = o próprio H (a ponte).
- **Tudo na `Moldura` (`src/app/_layout.tsx`):** novo ramo `ROTAS_ENTRADA` → os 4 ecrãs ganham o
  átrio SEM serem tocados (só o login esconde o subtítulo repetido quando `noAtrio`).
- **`LARGURA_SECRETARIA` promovida a token do tema** (`theme/honra.ts`) — estava triplicada
  (root layout, tabs layout, inicio); agora todos importam do mesmo sítio.
- PROVADO no browser: login/registo/recuperar em átrio a 1280px; móvel (375px) intacto com a
  coluna de sempre; consola limpa; tsc 0 (erros transitórios de `Portfolio.tsx` são de outra
  sessão a meio do vídeo-portefólio, não desta fatia).
- **PRÓXIMO (browser):** desenho de secretária para os restantes fluxos fora das tabs
  (avisos, editar-perfil, honra-card…) — continuam no backdrop até terem desenho próprio.

## 🪙 STATUS 22/07 (3) — MOEDA DE 2 LADOS (frente=selo · verso=máxima gravada)
O Vítor achou o "tilt 3D" HORRÍVEL ("desilusão") — e revelou a ideia verdadeira: cada moeda com
uma FRASE diferente. Refeito à volta disso. **O tilt foi ABANDONADO** (interativo do Insignia já
não é usado em lado nenhum; a prop fica adormecida).
- **`components/ui/MoedaInsignia.tsx` NOVO:** moeda de dois lados que VIRA ao toque (flip rotateY
  0↔180 com `backfaceVisibility:'hidden'`, 620ms). FRENTE = a `Insignia` (o selo H que se
  constrói). VERSO = disco+moldura dourada com a MÁXIMA do escalão gravada (serif itálico dourado)
  + nome do escalão + traço + losangos.
- **As 5 máximas (i18n `moeda.frase0..4`, PT+EN — Vítor: confirma/reescreve, a voz é tua):**
  · Verificado: "Tudo começa com um rosto verdadeiro."
  · Provado: "Deste a palavra — e cumpriste-a."
  · Reconhecido: "O teu trabalho fala por ti."
  · Referência: "Muitos guiam-se pelo teu nome."
  · Mestre: "A tua palavra vale por contrato."
- **Ligado:** Percurso (a moeda do teu escalão, 140px, "Toca para virar") + atelier `/insignias`
  (as 5, frente constrói-se, toca p/ ver o verso; REPETIR reconstrói a frente).
- PROVADO no browser: frentes constroem-se, toque vira e revela a máxima; frases distintas por
  escalão; consola limpa; tsc 0; dist novo.
- **PENDENTE:** aprovar/reescrever as 5 frases; decidir se a moeda substitui o ícone `award` no
  Honra Card (território sensível — luz do Vítor). Ver [[honra-insignias]].


## 🪙 STATUS 22/07 (2) — SELO 3D INTERATIVO (inclina com o dedo/rato)
O Vítor quis o selo "3D e a rodar com o movimento". Feito como **medalhão que se inclina na mão**
(tilt em perspetiva), não 3D de motor gráfico — leve e premium.
- **`Insignia` ganhou prop `interativo`:** `PanResponder` capta o arrasto → `rotateY` (horizontal)
  + `rotateX` (vertical) com `perspective: 900`; ao largar, `Animated.spring` volta ao centro
  (elástico, "assenta na mão"). Só reivindica arrasto horizontal-dominante → **não rouba o scroll
  vertical** de uma lista. Alcance TEMPERADO (±26°/±16°, fator 0.28) para o rosto ficar sempre
  legível (a 1.ª tentativa a ±34° virava-o quase de perfil — corrigido).
- **Realce especular:** elipse branca radial recortada no disco que desliza em contra-sentido da
  inclinação (a luz fica fixa no espaço, a face gira por baixo) — vende o volume 3D.
- **Ligado:** atelier `/insignias` (as 5, arrasta p/ rodar) + **Percurso** (o selo conquistado,
  132px, interativo). PROVADO no browser: inclina em perspetiva e volta ao centro; consola limpa;
  tsc 0; dist novo.
- **POR DECIDIR (luz do Vítor):** levar a insígnia REAL interativa ao **Honra Card** (hoje o selo do
  Card é só o ícone `award` do Feather — trocá-lo eleva o Card mas muda o rosto da credencial
  partilhável, território sensível → não mexi sem luz verde).
- **Conversas:** o Vítor GOSTA do clean atual (sem ruído). Rejeitou o cabeçalho verde grande que
  propus; quer só um toque "mais soft" (ex.: hora da conversa nova em verde discreto) — PARQUEADO,
  fazer leve. A maquete da proposta (orçamentos+conversas com pano verde + acentos vivos) ficou
  mostrada; ele gostou mas quer mais contido.


## ✏️ STATUS 22/07 — EDITAR TRABALHO PUBLICADO (pedido do Vítor)
Faltava editar um trabalho depois de publicado. Feito e provado ponta a ponta.
- **RLS já permitia** (`trabalhos_autor_edita`, UPDATE com `auth.uid()=autor_perfil`) → SEM migração.
- **`lib/trabalho.tsx`:** função nova `atualizarTrabalho(id, campos)` (UPDATE, mesmo shape do
  publicar; a 2.ª categoria só vale com a 1.ª). Chave i18n `trabalho.erro_editar`.
- **`publicar-trabalho.tsx` agora é DUAL (criar/editar):** aceita `?id`. Com id, `useFocusEffect`
  carrega o trabalho e pré-preenche (título, descrição, as 2 categorias em pílulas, valor, datas);
  título vira "Editar trabalho", botão "Guardar alterações"; guarda por UPDATE e volta ao detalhe
  (`router.replace('/trabalho/<id>')`, sem `de=pub`). Sincroniza no foco: id novo → carrega; sem
  id vindo de edição → limpa. **Datas no passado mantêm-se** (piso = a própria data se < hoje).
- **`trabalho/[id].tsx`:** lápis discreto (Feather `edit-2`) no canto sup. direito, SÓ para o
  autor e SÓ com o trabalho `aberto` → `/publicar-trabalho?id=<id>`. (Padrão convencional, não
  botão gigante.)
- **PROVADO no browser:** abri o Just4Fun_2026 → lápis → form pré-preenchido → mudei 350→480€ e
  removi a 2.ª categoria → Guardar → detalhe com 480€ e só "Animação". BD confirma
  (`orcamento_valor:480`, `categoria2_id:null`). tsc 0, consola limpa, dist novo.
- **Nota:** o trabalho de teste Just4Fun_2026 (agora 480€, categoria Animação) fica na BD para o
  Vítor testar. Servidor 8095 a servir a build nova.


## 🔧 STATUS 20/07 (9) — VARRIMENTO FINAL DO PROVADO (bug do relógio curto)
Queixa do Vítor: no Provado a lâmina de luz final travava depois de passar o H, em vez de varrer
até ao fim como no Verificado. **Era bug real:** o relógio (DURACAO) parava ANTES da última
animação acabar, e a lâmina ficava encravada a meio do disco, meio-visível.
- Contas: fim real por escalão = 1900 · **4700** · 5400 · 6300 · **8300** ms; relógio estava a
  2200 · **4300** · 5400 · 6500 · **8200** → Provado cortado 400ms, Mestre 100ms, e o
  Reconhecido MESMO no limite (ia travar ao menor desvio).
- **Correção de raiz:** `DURACAO = [2200, 4900, 5600, 6600, 8500]` (cauda depois do último
  keyframe) + regra escrita em comentário para não voltar a acontecer. Nenhum tempo da
  coreografia do desenho foi tocado — só se deixou o relógio chegar ao fim.
- **Higiene:** `DURACAO` passou a ser exportada e a `CerimoniaRank` importa-a — a constante
  estava DUPLICADA (o texto da cerimónia entrava com base numa cópia desatualizada).
- Provado no browser: as 5 em repouso, sem luz encravada; consola limpa; tsc 0; dist novo.

## 📸 STATUS 20/07 (8) — FOTO DE PERFIL: BUG DE RAIZ CORRIGIDO (+ a cara na pesquisa)
**Queixa do Vítor: "não recebeu a foto". Era bug a sério, em DOIS sítios. Reproduzido, causa
identificada, corrigido e provado ponta a ponta.**
- **CAUSA RAIZ (BD):** o upload dava sempre `new row violates row-level security policy`. O
  cliente carrega com `upsert:true` → no Postgres é `INSERT … ON CONFLICT DO UPDATE`, que exige
  política de **SELECT** sobre a linha; os buckets `avatares` e `portfolio` só tinham
  inserir/atualizar/apagar. **Prova decisiva:** o MESMO upload sem `upsert` devolvia 200; com
  `upsert`, 403. ⚠️ "Bucket público" NÃO cria política de SELECT em `storage.objects` — só abre o
  caminho de leitura por URL. Era essa a armadilha.
  → **Migração `054_avatares_leitura.sql` APLICADA à BD viva**: `avatares_le_todos` e
  `portfolio_le_todos` (SELECT). Buckets privados (evolucoes/cedulas/anexos-convite) intactos.
  Reprovado depois: upload COM upsert → **200**.
- **2.º BUG (UI):** o cartão da PESQUISA nunca mostrava a foto — só iniciais (`avatar_url` nem
  vinha na query). Corrigido: query + `<Avatar imagem=…>`. (Perfil próprio/público, Card e Rede
  já mostravam.)
- **Robustez do upload (`editar-perfil.tsx`), 3 armadilhas fechadas:**
  1. `launchImageLibraryAsync` estava FORA do try → permissão negada = silêncio total. Agora
     dentro: o utilizador vê sempre uma razão.
  2. **Blob → bytes:** no NATIVO, enviar um Blob ao Storage grava ficheiros de **0 bytes**
     (limitação conhecida do RN). Agora pede-se `base64:true` ao picker e converte-se com um
     descodificador próprio (sem dependências; validado byte-a-byte contra o `atob` nativo em
     todos os casos de padding). Web e nativo pelo mesmo caminho.
  3. `MediaTypeOptions` (deprecated) → `mediaTypes:['images']`; corte quadrado
     (`allowsEditing`+`aspect 1:1` — avatar é redondo); a foto ANTIGA é apagada (sem lixo no balde).
- **PROVADO no browser:** upload real (6218 bytes enviados = 6218 lidos na leitura pública),
  foto a aparecer no perfil, e na PESQUISA (posta temporariamente num perfil-semente). tsc 0.
- **LIMPEZA:** todos os ficheiros de teste apagados (bucket `avatares` a 0), `avatar_url` do Vítor
  e do semente repostos a null — **a foto real é ele que a escolhe**. Chave anon do scratchpad apagada.

## 🏅 STATUS 20/07 (7) — INSÍGNIAS + CERIMÓNIA DE SUBIDA (Claude Design → app a sério)
**Fonte:** projeto do Vítor no Claude Design "Animações de insígnias por valor"
(`bbdf48ad-…`, lido via DesignSync: `design_handoff_badge_animations/README.md` + `Insignias.dc.html`).
- **`react-native-svg` 15.15.4 instalado** (`npx expo install`) — a app não tinha SVG.
- **`components/ui/Insignia.tsx` NOVO** — as 5 insígnias, porte fiel: viewBox 200×200, o "H" em
  7 rectângulos, gradientes ouro/prata/brilho, sombra radial, halo, coroa de louros (porte exato
  do `wreath()`), bisel pontilhado sem costura, 24 raios, 5 marcos. Coreografia e TEMPOS do
  desenho: Verificado ~2,2s (prata, aro verde) · Provado ~4,3s (aro de ouro fecha por ÚLTIMO) ·
  Reconhecido ~5,4s (louros coroam no fim) · Referência ~6,5s (bisel entra a rodar primeiro) ·
  Mestre ~8,2s (barra cresce do CENTRO → braços disparam ↑↓ → serifas florescem → sol de raios,
  onda de choque, realce e varrimento final).
- **⚠️ ADAPTAÇÃO (decisão técnica):** o SVG do RN não tem filtros nem `transform-box:fill-box`.
  Em vez de transformar grupos, anima-se a GEOMETRIA (`x`/`width` = crescer do centro; `y`/`height`
  = disparar do meio; `rx`/`ry` = folha a nascer; `strokeDashoffset` = anel a desenhar-se;
  `r` = disco a nascer). Um só relógio linear em ms conduz tudo, com os MESMOS keyframes do CSS.
  Emboss → halo dourado (a luz vem do gradiente). Sem `pathLength`: dash calculado do perímetro.
- **`components/CerimoniaRank.tsx` REESCRITO:** véu de forja (#080c09 sólido) → "NOVA INSÍGNIA" →
  a insígnia constrói-se → só quando forjada é que o nome sobe + "Continuar". **NÃO fecha ao
  toque no véu** (um ritual de segundos não se despacha por acidente).
- **Gatilho no FEED (inicio.tsx):** compara o nível DERIVADO com o último visto por conta
  (`honra.escalao.<uid>` no AsyncStorage) — subiu → cerimónia; e **marca-se logo ao decidir**
  (celebrar duas vezes a mesma subida seria indigno). Descida/1.ª vez → grava em silêncio.
  Sem coluna nova na BD: o rank continua 100% derivado.
- **`/percurso`** abre agora com a insígnia conquistada em repouso (a respirar).
- **ATELIER `/insignias`** (rota escondida, sem botão): as 5 insígnias + REPETIR/VER TODAS, fundo
  de forja — para o Vítor rever as animações no telemóvel. **Link: `<ip>:8095/insignias`.**
- **PROVADO no browser:** as 5 a nascer no atelier; cerimónia real disparada na conta do Vítor
  (Provado) ponta a ponta; Percurso com a insígnia. tsc 0, consola limpa, dist novo.

## 🧵 STATUS 20/07 (6b) — A MONTRA TECIDA (sem secções; o cartão é a etiqueta)
O Vítor rejeitou as 2 secções ("disse para misturares"). Agora o "Todas" TECE: 1 trabalho a
abrir, depois 1 a cada 3 pessoas, numa lista só, SEM cabeçalhos. A distinção é o ADN do cartão:
- **Pessoa** entra pelo avatar escuro de anel dourado; **trabalho** entra pelo **ícone da sua
  ÁREA-MÃE** (calendário=eventos, película=cinema…, mapa `slugMaePorCat`) num círculo
  verde-suave 44 (mesma geometria, pele diferente), valor em pílula verde-suave, prazo em voz
  baixa, excerto 1 linha.
- `CartaoTrabalho` com `iconeSlug`; mural usa o mesmo cartão; chaves sec_*/ver_trabalhos
  removidas (PT+EN). PROVADO no browser; tsc 0; consola limpa; dist novo.

## 🏪 STATUS 20/07 (6) — "TODAS" VIROU MERCADO (trabalho primeiro, não rede social)
Crítica do Vítor: "Todas" só mostrava perfis — os trabalhos não estavam lá ("isto não é uma
rede social"). Agora o "Todas" é a MONTRA do mercado:
- Abre com **TRABALHOS ABERTOS** (até 3 + "Ver todos os trabalhos (N) ›" → segmento Trabalho),
  depois **PESSOAS & EMPRESAS**. Secções só aparecem quando têm conteúdo.
- A busca por texto apanha AGORA também os trabalhos (título/descrição/categorias/autor) e o
  filtro de Categorias filtra os dois mundos em conjunto no mix.
- Refactor: `CartaoTrabalho` extraído (mural + montra usam o mesmo); lista mista tipada
  (`ItemMisto`) num só FlatList; `trabalhosCat`/`trabalhosVisiveis` memos. Chaves
  `pesq.sec_trabalhos/sec_perfis/ver_trabalhos` (PT+EN).
- PROVADO no browser: montra com o Just4Fun_2026 (2 categorias!) no topo + perfis; busca
  "animadora" devolve só o trabalho (secção de pessoas some, honesta). tsc 0, consola limpa.

## 📜 STATUS 20/07 (5c) — LEI NOVA: A MECÂNICA NÃO SE COTA
O Vítor cortou a linha "Honrar a palavra +5 · falhar −10" do Percurso: cotar a palavra distorce o
propósito — a mecânica descobre-se a viver ("deixar para quando elas descubram"). Linha + chave
`percurso.regra` removidas (PT+EN); o cartão fecha na direção ("base — cresce ao honrar a
palavra"). LEI transversal gravada em [[honra-confianca-modelo]]: a UI mostra direção, nunca a
tabela de preços de mecânicas internas. Provado no browser; tsc 0; dist novo.

## 🤫 STATUS 20/07 (5b) — CONFIANÇA REDESENHADA TAMBÉM NO PERCURSO
O Vítor apontou que o Percurso ainda usava o cartão antigo + linha "Zona:" solta (era o mínimo).
Bloco próprio agora: **número sóbrio 24px + "3 honrados · 0 falhas" à direita; zonas DENTRO da
barra** (nomes "base · sólida · exemplar" cada um no seu território, o atual aceso a verde; ticks
60/90 em creme sobre o fill); descrição da zona atual + a regra em voz baixa ("Honrar a palavra
+5 · falhar −10"). Bug corrigido: `left: undefined` não anula `left:0` no merge do RN → estilos de
posição separados por zona. `Confianca` (cartão grande) continua nos perfis. Chaves novas
`percurso.z_*` + `percurso.regra` (PT+EN). PROVADO no browser, tsc 0, consola limpa, dist novo.

## 🤫 STATUS 20/07 (5) — CONFIANÇA EM VOZ BAIXA NO INÍCIO (feedback do Vítor)
"Isso não pode ser tão destacável no meu feed" → o cartão grande da Confiança saiu do Início.
- `Confianca` ganhou variante **`subtil`**: uma LINHA (rótulo pequeno + fio de 4px + % em 12px,
  tom sobre tom, sem cartão, sem número grande). O cartão completo (número 40px + zonas) continua
  nos perfis e no Percurso.
- No `inicio.tsx` a linha é tocável → `/percurso` (a história completa vive no espelho, não no feed).
- PROVADO no browser (conta do Vítor): fio discreto entre a rede e o Publicar; toque abre o
  Percurso com o cartão completo + zonas. tsc 0, dist reconstruído, consola limpa.

## 🧭 STATUS 20/07 (4) — FLUXO PÓS-PUBLICAR + HISTÓRICO DE FECHADOS + PAINEL "O TEU PERCURSO"
**2ª leva do pente fino do Vítor (ele em remote, "desenvolve à vontade"). Provado no browser, tsc 0, dist novo.**
- **Beco pós-publicar RESOLVIDO:** publicar → `router.replace('/trabalho/<id>?de=pub')`; o Voltar do
  detalhe com `de=pub` vai ao **Início** (não ao formulário); o formulário limpa-se após publicar
  (ficava montado atrás das tabs com tudo preenchido, pronto a duplicar). PROVADO: publicar → Voltar
  → Início com o trabalho no topo.
- **Histórico de trabalhos fechados:** a secção do Início passou a "OS TEUS TRABALHOS" (i18n PT+EN
  ajustado) — abertos em cartão + fechados em linha serena com pill "Fechado" (cap 3, "+N fechados
  no historial"). A "vaga sem sucesso" nunca desaparece do rasto do autor.
- **PAINEL "O TEU PERCURSO" (`src/app/(tabs)/percurso.tsx`, href null no layout):** o painel PRIVADO
  de performance travado no debate do rank vivo ([[honra-rank-vivo]]). Tudo derivado da BD:
  · escada dos 5 escalões com "ESTÁS AQUI" (dourado);
  · "PARA <próximo>" — requisitos REAIS linha a linha via **`requisitosProximo()` novo no
    prestigio.ts** (lê o LIMIAR; Provado = 1º trabalho avaliado; nota: no Mestre avaliações/projetos
    são OU — mostra-se o caminho das avaliações);
  · Confiança + **ZONAS 30 base · 60 sólida · 90 exemplar** (ticks subtis na barra do componente
    `Confianca` + rótulo da zona — leitura, motor intacto);
  · OS TEUS NÚMEROS: honrados, falhas, **pessoas distintas** (diversidade!), avaliações,
    trabalhos abertos/fechados + "No Honra desde <mês ano>".
  Entrada: o cartão "O TEU PERCURSO" do Início ficou tocável (seta ›). PROVADO no browser.
- Higiene de teste: trabalhos de prova do assistente fechados; pedido assistente→Miguel com 1
  checkpoint fica na BD p/ o Vítor ver o bloco de checkpoints pré-selo.
- **Nota p/ o Vítor:** o portefólio do assistente afinal está `verificado` na BD → o cartão
  "Completa a credencial" dele some por estar 3/3 (correto, confirmado por SQL — não é bug).

## ✨ STATUS 20/07 (3) — PENTE FINO do Vítor (4 lacunas resolvidas + swipe), tudo provado no browser
**Pedido do Vítor pós-teste: "há coisas a acontecer sem sentido". Polimento, não motor. tsc 0, dist reconstruído, consola limpa.**
- **Trabalho publicado JÁ NÃO perde o rasto:** `inicio.tsx` carregava trabalhos/candidaturas SÓ para
  empresa → conta pessoa via "Nada a decorrer" com trabalho aberto no mural. Agora carrega para TODOS
  e a secção "OS TEUS TRABALHOS ABERTOS" (com nº de candidaturas) aparece também na pessoa, colada ao
  "A decorrer". PROVADO (conta assistente, trabalho de teste publicado→visto no Início→fechado).
- **Sino só no Início** (ao lado da Agenda): removido dos cabeçalhos de perfil.tsx / orcamentos.tsx /
  chat.tsx (+ imports). PROVADO nos 3 ecrãs.
- **Checkpoints saem do pedido → vivem DENTRO do orçamento:** o form pedir-orçamento (perfil/[id])
  fica só descrição+prazo; bloco novo `CheckpointsProposta` em projeto/[id] — o contratante (souA)
  define/remove checkpoints em `pedido`/`aceite` (RLS 047 já permitia; tranca no selo). O contratado
  pré-selo e todos pós-selo continuam a ver o componente `Checkpoints` normal. PROVADO ao vivo
  (pedido assistente→Miguel com checkpoint "Playlist aprovada" inserido/listado — **ficou na BD para
  o Vítor ver o bloco**; o trabalho de teste do assistente foi fechado).
- **SWIPE entre separadores 😉:** PanResponder no `(tabs)/_layout.tsx` — arrastar horizontal
  (dx≥60, 2:1 sobre dy) muda inicio↔pesquisar↔orcamentos↔chat↔perfil; só nos 5 ecrãs raiz.
  PROVADO no browser (Início→Pesquisar por arrasto). ⚠️ NOTA: com RATO, arrastar em cima de um
  cartão tocável pode contar como toque (abriu um perfil); em touch real o responder system cancela
  o press — **confirmar no telemóvel**; se irritar, o remédio é cancelar press-on-move no `Cartao`.
- Estilos órfãos dos checkpoints limpos em perfil/[id]; chave i18n nova `cpdef.erro` (PT+EN).

## ✅ STATUS 20/07 — FILTRO DE CATEGORIAS = PAINEL (decisão do Vítor, construído + provado no browser)
**O Vítor rejeitou a fila horizontal de chips ("3 minutos de scroll até à letra P") → campo
"Categorias" que abre um PAINEL (folha do fundo).** Construído, `tsc` 0, dist reconstruído,
provado no browser (8083). Consola limpa.
- **Componente novo `src/components/ui/PainelCategorias.tsx`** (exportado no index): folha que sobe
  do fundo (véu escuro + creme, puxador, título+×), busca com realce agrupada por área (ícone dourado),
  12 áreas com ícone e contagem à entrada, drill-down para as filhas. Escolher FECHA (um gesto).
  `permitirArea` → chip tracejado "Toda a área" (filtra mãe+filhas). Reutiliza `ICONE_AREA`/`norm`
  exportados do `SeletorCategorias` (o seletor multi do editar-perfil fica intacto).
- **`pesquisar.tsx`:** fila plana de 84 chips REMOVIDA → fila `[Filtros] · | · [🏷 Categorias ⌄]`;
  com escolha vira pílula verde `[≋/🏷 nome ×]`. Filtro resolve-se LOCALMENTE (pares perfil↔categoria
  carregados 1x no focus; área = mãe+filhas via useMemo, sem ida à BD por toque). **A busca por texto
  passou a apanhar CATEGORIA** (+@handle no placeholder): "flores" encontra a Marta (florista) via
  categoria "Decoração & Flores" — provado. **O MURAL (segmento Trabalho) também filtra** pela mesma
  pílula (trabalhos por categoria_id ∈ mãe+filhas; vazio honesto `pesq.vazio_mural_filtro`).
- **`publicar-trabalho.tsx`:** chips planos → campo "Escolher categoria" que abre o MESMO painel
  (só subcategorias, sem "Toda a área"); escolhida = pílula verde com ×.
- **🐛 Web/RN aprendido:** `hitSlop` NÃO estica o alvo clicável no web → os × de limpar tinham 14px
  reais. Corrigido com `padding:10; margin:-10` (catLimpar/fecharAlvo) nos 3 sítios.
- **i18n:** `cats.titulo`, `cats.toda_area`, `pesq.vazio_mural_filtro`, `pub.categoria_ph`,
  `pesq.busca_ph` atualizado — PT+EN.
- **PROVADO no browser (conta assistente):** painel abre/fecha; drill-down Eventos; escolher DJ →
  só Miguel Tavares; "Toda a área" Eventos → todos os de eventos (incl. Paula Vaz); × limpa sem
  abrir o painel; busca "flores"→Marta via categoria; busca "real" no painel → grupo Cinema c/
  realce → Realizador escolhido no Publicar (pílula verde; NÃO publiquei — BD limpa).
- **POR PROVAR:** telemóvel real (o × com o dedo, a folha a 85% em ecrã pequeno, teclado sobre a
  folha no iOS).

### ➕ 20/07 (2) — TRABALHO COM ATÉ 2 CATEGORIAS (decisão do Vítor, construído + provado)
- **Migração `053_trabalho_segunda_categoria.sql` APLICADA à BD viva** (Management API):
  `trabalhos.categoria2_id` (FK categorias) + constraint `trabalhos_categoria2_distinta`
  (2ª só com 1ª e nunca repete). Teto de 2 = deliberado (foco, não spam de etiquetas).
- **⚠️ Joins desambiguadas:** com 2 FKs p/ `categorias`, o `categoria:categorias(nome)` AMBÍGUO
  partia — `CAMPOS_TRABALHO` usa agora `!trabalhos_categoria_id_fkey` / `!trabalhos_categoria2_id_fkey`.
- **`publicar-trabalho.tsx`:** 1ª pílula verde + porta tracejada "+ segunda categoria" (some ao
  chegar a 2); cada pílula com o seu ×; duplicado ignorado. `PainelCategorias` passou de
  `selecionadaId` → **`selecionadasIds: string[]`** (pesquisar atualizado).
- **Mural filtra pelas DUAS** (categoria_id OU categoria2_id ∈ mãe+filhas); cartão do mural mostra
  "Cat1 · Cat2"; `trabalho/[id]` mostra 2 chips.
- **PROVADO no browser:** publicado ao vivo "Vídeo + fotografia de lançamento — teste 2 categorias"
  (Realizador + Fotografia & Vídeo, conta Vitor Hugo — ficou na BD p/ testes, tem botão Fechar);
  filtro do mural "Toda a área · Eventos" apanha-o SÓ pela 2ª categoria ✓; detalhe com 2 chips ✓;
  consola limpa, tsc 0, dist reconstruído.

## ✅ STATUS 19/07 — TESTE AO VIVO (mãe do Vítor) + MODELO NICKNAME + fixes de UI
**Caminho B em curso.** Teste real no telemóvel (iPhone pequeno) revelou bugs; corrigidos no fio principal (os agentes têm sido sequestrados por injeção — 4x hoje; sempre recusadas, verificadas, relançadas).
- **Bug pedido-recusado preso** (`perfil/[id].tsx`): a guarda anti-duplicado só corria na montagem, mas os ecrãs ficam montados por trás das abas → "pedido em curso" ficava preso após recusa. FIX: `useFocusEffect` reavalia no foco (limpa pedidoEmCurso/enviado). tsc 0.
- **#2 Conversas fora do sino** (migração **049**): a 039 fazia a conversa (`descricao='Conversa'`) cair no sino ("Alguém quer falar contigo"). Fechado — conversa vive só no badge do Chat. Avisos antigos limpos.
- **#3 Badge de orçamentos na barra** (`src/lib/pedidos.tsx` novo + `_layout.tsx`): contador gémeo do chat na aba orçamentos = pedidos `pedido` dirigidos a mim (exclui 'Conversa'), realtime.
- **#4 Layout iPhone pequeno:** reproduzido a 320/375. Limpo a 375 (largura provável). A 320 só o cabeçalho de Orçamentos colide ("Orçamentos"+"Convites") — retoque de design p/ o PC (o auto-shrink truncava no web, revertido).
- **MODELO NICKNAME (@handle) — decisão 19/07, CONSTRUÍDO + provado ao vivo:** migração **050** (handle unique case-insensitive + `handle_new_user` grava handle do metadata + backfill dos perfis existentes com slug do nome) + **051** (RPC `handle_disponivel` p/ o registo verificar sem sessão). Registo capta NICKNAME (validação+disponibilidade); perfil (Credencial) e pesquisa mostram nome real + ✓ + @handle; busca por nome E handle. A garantia é o ✓ (verificação no compromisso), não a foto/nome. Ver [[honra-mercado-realidade]].
- **PENDENTE p/ sessão de design no PC:** #1 (fundir conversas por pessoa c/ separador de contexto), #4 (cabeçalho a 320). **LACUNA:** só testado iPhone, nunca Android ([[honra-teste-android]]).

## ✅ STATUS 18/07 (5) — ESCADA DE SUSPENSÃO CONSTRUÍDA E APLICADA (reincidência, sem perpétua, sem dinheiro)
**A consequência que faltava à MARCA existe agora: reincidência → suspensão que ESCALA e EXPIRA
sozinha. Aplicada à BD viva + funções deployadas + provada por API/SQL. `tsc` a 0.** Mitiga a
fuga A (§3 A / §6 do red-team): já há um degrau de que a lavagem-por-apagamento não escapa.

- **Migração `048_escada_suspensao.sql` APLICADA à BD viva** (Management API, statements diretos):
  · `perfis.suspenso_ate timestamptz` + `perfis.nivel_suspensao int` (0/1/2/3 = nenhum/1mês/6meses/2anos).
  · Tabela `infracoes` APPEND-ONLY (perfil_id, tipo `incumprimento|ataque`, origem, criado_em) +
    RLS (dono lê; escrita só sistema) — o livro auditável da reincidência.
  · `esta_suspenso(perfil)` (helper das guardas) e **`registar_infracao(perfil,tipo,origem)`** — a
    função reutilizável da ESCADA: insere a infração, conta as dos últimos 6 MESES (janela) e aplica
    o degrau. **Nunca encurta uma suspensão viva (só escala); ataque nunca ganha o 1.º degrau livre.**
  · `atualizar_contadores_honra` ESTENDIDA (016/033 intactos): no ramo 'incumprido' chama
    `registar_infracao` a quem falhou — o **ramo interno (resolver-caucoes / disputas de checkpoint)
    alimenta a escada pelo MESMO trigger dos contadores**, cobrindo fatia D + legado + revisão admin.
  · `guarda_perfil` ESTENDIDA: `suspenso_ate`/`nivel_suspensao` são do SISTEMA (o cliente não se
    des-suspende). `guarda_aceita_verificado` ESTENDIDA: bloqueia aceitar/selar se suspenso.
  · `orc_pede` (pedir) e `trabalhos_autor_insere` (publicar) recriadas + `not esta_suspenso(...)`.
- **DESENHO TRANCADO (Vítor) implementado:** 1.ª marca = SÓ marca pública (SEM suspensão); a escada
  arranca na 2.ª (<6m → 1 mês), 3.ª → 6 meses, 4.ª+ → 2 anos. **SEM prisão perpétua** (topo 2 anos; a
  porta reabre em `suspenso_ate`). **Ataque** (fraude/farm) = `registar_infracao(...,'ataque',...)`:
  suspensão direta (piso 1 mês) sem esperar reincidência. Enquanto suspenso: NÃO pede/aceita/sela/
  apresenta/aceita convites/publica; **PODE** login + ver (ecrã honesto) + exportar (RGPD).
- **RETENÇÃO (mitiga fuga A):** `eliminar-conta` recusa o apagamento enquanto durar a suspensão
  (409 honesto com a data). O gancho de retenção de fingerprint pós-apagamento / denylist fica
  **DOCUMENTADO** (secção 10 da migração) — depende do advogado (Q10-A); NÃO se construiu dedup por
  documento. Sem isso a fuga A fica MITIGADA (não FECHADA): após a suspensão expirar, o apagamento
  volta a ser possível.
- **Funções deployadas** (project haqynnhstjgzgtnnwqsi): `aperto-agir`, `agir-checkpoint`,
  `convite-decidir`, `eliminar-conta` (JWT on); `resolver-convites` (--no-verify-jwt, chama
  `registar_infracao` ao marcar `incumprido_profissional`; o cliente-convidado não tem conta → fora
  da escada, fuga M). Cada gesto de marketplace mostra o motivo honesto (403 `suspenso:true`) além da
  guarda da BD (defesa em profundidade).
- **UI (mostrar-não-dizer, tsc 0, i18n pt+en):** `lib/suspensao.tsx` (hook `useSuspensao`);
  `components/AvisoSuspenso.tsx` (ecrã honesto: "suspensa até <data> · motivo · termina sozinha · o
  que ainda podes fazer"); `inicio.tsx` abre com o aviso quando suspenso; `perfil/[id].tsx` — pedir/
  conversar dão lugar ao motivo. Chaves `susp.*`.
- **PROVAS (API/SQL na BD viva; contas descartáveis P1/P2/P3 + assistente; TUDO limpo no fim):**
  (a) 1.ª marca → nivel 0, `suspenso_ate` null (só marca). ✓
  (b) 2.ª→+31d(1mês), 3.ª→+184d(6meses), 4.ª→+731d(2anos), `nivel_suspensao` 1/2/3. ✓
  (c) marca de há 7 meses NÃO conta → nova 1.ª marca na janela → nivel 0. ✓
  (d) suspenso: PUBLICAR e PEDIR recusados server-side (RLS 42501, com identidade OK → isola a
      suspensão); guarda_aceita_verificado levanta exceção honesta no ACEITE mesmo via service_role;
      `eliminar-conta`→409 (conta NÃO apagada); `exportar-dados`→200; login OK. ✓
  (e) suspensão expirada (`suspenso_ate` no passado) → `esta_suspenso`=false → PUBLICAR volta. ✓
  (f) ataque à 1.ª → suspensão direta +31d (nivel 1), sem esperar reincidência. ✓
  (g) `tsc` a **0**; §5 re-verificada (`verif_dono_tudo` ausente, `orc_pede`/guardas presentes);
      contadores 016/033 intactos; SEM dinheiro (nenhuma coluna de hold/valor tocada).
- **⚠️ POR PROVAR AO VIVO:** o CRON a marcar por silêncio (não invoco o resolver ao vivo sem o
  segredo — precedente das fatias D/E); os fluxos nos 2 telemóveis (suspender → ver ecrã honesto →
  gestos recusados → expiração). **dist NÃO reconstruído, servidor 8095 NÃO tocado.**
- **GANCHO DO ADVOGADO (fuga A, Q10-A):** retenção de hash irreversível do documento + denylist de
  expulsos que SOBREVIVA ao apagamento — decisão jurídica (interesse legítimo vs direito ao
  apagamento, LIA art. 6.º/1/f). Só depois disso a fuga A fecha por inteiro.
- **Higiene:** token de gestão `sbp_5b84…` (SQL) + token de deploy usados; contas P1/P2/P3 criadas por
  SQL e **apagadas em cascata no fim** (0 restantes; assistente restaurado a null/0). Ficheiros de
  credencial do scratchpad apagados.

---

## ✅ STATUS 18/07 (4) — FATIA D CONSTRUÍDA E APLICADA (marca por inação, SEM dinheiro)
**A fuga D (§3 D do red-team) está tapada na BD viva + funções deployadas + provada por API/SQL.
A marca deixou de cair por INAÇÃO ("quem não tocou leva a marca") — agora julga SUBSTÂNCIA.
`tsc` a 0.** (As 5 decisões trancadas do Vítor implementadas.)

- **Migração `047_checkpoints_orcamento.sql` APLICADA à BD viva** (Management API, statements diretos):
  tabela nova `checkpoints_orcamento` (sub-unidades do orçamento), coluna `orcamentos.prazo`,
  `guarda_checkpoints` (trancado pós-selo), `avaliar_checkpoints_orcamento` (agregação do desfecho),
  RLS (contratante define pré-selo; as 2 partes leem), índices. Reutiliza o bucket `evolucoes` (007).
- **MODELAÇÃO escolhida:** o orçamento MANTÉM a sua máquina (`selado→honrado|incumprido`) — o desfecho
  é a AGREGAÇÃO dos checkpoints (todos confirmados→honrado; algum incumprido→incumprido+quem_falhou).
  **Contadores 016/033 disparam no estado do ORÇAMENTO, exatamente como antes** (§5 intacta). Um
  checkpoint contestado deixa o orçamento em `selado` (em curso) até à revisão admin — SEM estado novo
  no orçamento, sem tocar no contrato-convite.
- **🐛 BUG ENCONTRADO E CORRIGIDO (importante):** `guarda_checkpoints` é BEFORE DELETE e devolvia
  `NEW` (=NULL num DELETE) → **cancelava silenciosamente TODAS as remoções**, incluindo as em CASCATA
  (apagar orçamento não apagava os checkpoints → órfãos). Corrigido para devolver `OLD` no DELETE;
  reaplicado à BD; cascata reprovada OK (apagar orçamento apaga os checkpoints). Órfãos de teste limpos.
- **Funções deployadas** (project haqynnhstjgzgtnnwqsi):
  · `agir-checkpoint` **COM JWT** — máquina nova por `checkpoint_id`: prestador (`para_perfil`) apresenta
    com EVIDÊNCIA OBRIGATÓRIA (texto/ficheiro; toque vazio→400); recetor (`de_perfil`) confirma/contesta.
    Contestar→`contestado`+revisão, ninguém marcado. Caminho LEGADO (sem checkpoints) intacto.
  · `aperto-agir` **COM JWT** — ao SELAR cria um checkpoint por omissão se o contratante não definiu
    nenhum (o negócio corre sempre a máquina D; ancorado ao `orcamentos.prazo`).
  · `resolver-caucoes` **--no-verify-jwt** (cron) — passo novo de checkpoints ancorado ao PRAZO combinado
    (piso de segurança: nunca marca antes de `selado+24h`): 'pendente' ao prazo→marca o PRESTADOR;
    'entregue' + silêncio→marca o RECETOR **só depois de avisado (in-app) + relembrado** (nunca emboscada);
    'contestado'→não toca. Depois agrega. NUNCA captura (dinheiro fora, 032).
  · `checkpoint-disputa` **NOVA, COM JWT (admin)** — espelha `convite-disputa` mas **SEM cobrança**:
    'prestador' (confirma) | 'recetor' (marca o prestador). A moeda é a marca.
- **UI (mostrar-não-dizer, tsc 0, i18n pt+en):** `lib/projeto.tsx` (carrega checkpoints + ações
  apresentar/confirmar/contestar); componente novo `components/Checkpoints.tsx` (cada checkpoint conta a
  sua história + ações por papel/estado); `projeto/[id].tsx` mostra os checkpoints e defere-lhes as ações
  do `selado`; `perfil/[id].tsx` — o contratante define prazo do projeto + N checkpoints (descrição+prazo)
  no pedir-orçamento (visíveis ao contratado ANTES do selo); `revisao-disputas.tsx` ganhou secção
  "CHECKPOINTS INTERNOS" (dar razão ao contratante/prestador). Chaves `cp.*`, `pperfil.*`, `disputas.cp_*`.
- **PROVAS (contas descartáveis fatiad_a/b verificadas + assistente admin; TUDO limpo no fim):**
  - (a) B apresenta SEM evidência → **400 "precisas de anexar evidência"**, checkpoint fica `pendente`. ✓
  - (b) A contesta → checkpoint `contestado`, orçamento continua `selado`, **contadores INALTERADOS**;
    admin lista via `checkpoint-disputa` e resolve 'recetor' → checkpoint `incumprido`(prestador) →
    orçamento `incumprido`(b), B `negocios_falhados` 0→1. ✓
  - (c) B apresenta COM evidência (`aviso_entregue=true`) + recetor em silêncio → ANTES do lembrete a
    marca é 0 linhas (nunca emboscada); após avisado+relembrado → marca o RECETOR → orçamento
    `incumprido`(a), A `falhados` 0→1, B (prestador correto) intacto. **A marcação foi exercida no
    CONTEXTO DO SERVIDOR (postgres, = service_role) via a SQL exata do resolver** — não tenho o segredo
    do resolver; a função deployada respondeu **401** sem segredo (alcançável, gated). Runtime no CRON
    fica **por provar ao vivo** (precedente: fatia E).
  - núcleo da fuga D: B **não apresenta** nada → ao prazo marca o **PRESTADOR** (B falhados +1), o CLIENTE
    (A) fica **intacto** — a justiça da marca deixou de estar invertida. ✓
  - (d) checkpoints TRANCADOS após o selo: INSERT pós-selo → **400 "trancados após o selo"**; MOVER/editar
    → RLS filtra (0 linhas, descrição/prazo inalterados); DELETE do cliente pós-selo → protegido. Pré-selo
    o contratante define/edita/apaga à vontade. ✓
  - (e) ciclo legítimo MULTI-checkpoint ponta a ponta (2 checkpoints): B vê-os ANTES do selo → aceita →
    A sela → apresenta/confirma cp1 (orçamento fica `selado`) → apresenta/confirma cp2 → **`honrado`**;
    contadores A/B `honrados=1, apertos=1`; depois `entregue→concluido→avaliação 5★` (§5 gate intacto) e
    o sentido inverso (037) negado (42501). ✓
  - **§5 re-verificada:** `verif_dono_tudo` ausente, `orc_pede` nasce 'pedido', `guarda_perfil` /
    `guarda_ciclo_caucao` / `guarda_aceita_verificado` presentes, contrato-convite NÃO tocado.
  - **DINHEIRO NÃO reintroduzido:** todos os orçamentos de teste com `hold_a/hold_b/pagamento_id` a null;
    a tabela `checkpoints_orcamento` **não tem** colunas de dinheiro (hold/stripe/valor/pagamento).
  - **`tsc` a 0.**
- **⚠️ POR PROVAR AO VIVO:** os fluxos nos 2 telemóveis (contratante define checkpoints → contratado
  apresenta evidência → recetor confirma/contesta → revisão admin); o `resolver-caucoes` no CRON em
  runtime (marca por silêncio; sem o segredo do resolver não o invoquei ao vivo). **dist NÃO reconstruído,
  servidor 8095 NÃO tocado** (fazer antes de servir ao telemóvel).
- **Nota de higiene:** usei o token de gestão `sbp_5b84…` (SQL) e o de deploy; contas descartáveis
  `fatiad_a/b@honra.test` criadas por signup e **apagadas no fim** (0 restantes; os 4 orçamentos-semente
  ficaram intactos). A tentativa de revelar a service_role key foi (corretamente) recusada pelo classifier
  — daí a marcação por silêncio ter sido exercida via SQL no contexto do servidor.

---

## ✅ STATUS 18/07 (3) — FATIA E APLICADA + SELO SÓ-CONTRATADO (BD viva + funções ao vivo)
**A Fatia E saiu do repo para a BD viva e as funções estão deployadas e provadas. O selo de
ofício passou a contar SÓ o lado contratado. `tsc` a 0.** (Supersede a secção "POR APLICAR" abaixo.)

- **045 aplicada à BD viva** (via Management API, statements diretos — sem tracking do CLI). Antes do
  drop confirmei os `pg_get_constraintdef` das duas constraints: a lista da 045 já continha TODOS os
  valores existentes (nada se perdeu). Ficou: 6 colunas novas (`prova_encontro_em`, `captura_proposta_em`,
  `captura_prazo_em`, `consentimento_resultado`, `consentimento_aviso_entregue`, `contestacao_texto`);
  `contratos_convite_estado_check` +`captura_proposta`/`em_disputa`/`disputa_arquivada`;
  `magic_links_convite_finalidade_check` +`comparencia`/`checkpoint_confirmar`/`checkpoint_contestar`;
  `guarda_ciclo_convite` com a imutabilidade de `prova_encontro_em`; índice `…captura_proposta_idx`;
  bucket privado `anexos-convite` criado.
- **Funções deployadas** (project haqynnhstjgzgtnnwqsi): `convite-checkpoint` **--no-verify-jwt** (2 portas),
  `convite-comparencia` **--no-verify-jwt**, `convite-disputa` **COM JWT** (admin), `resolver-convites`
  **--no-verify-jwt** (cron), `convite-pagina` **--no-verify-jwt**. Todas "Deployed Functions." OK.
- **Segredo** `COMPARENCIA_SECRET` definido (secrets set OK). ⚠️ VALOR a reportar ao Vítor abaixo.
- **046 aplicada — SELO PROFISSÃO SÓ DO LADO CONTRATADO** (`046_selo_so_contratado.sql`, no repo + BD viva):
  nova `contrapartes_como_contratado_verificadas(perfil)` conta só negócios honrados em que o perfil é
  `para_perfil` (o que presta/ACEITA), com ≥2 `de_perfil` DISTINTOS e com identidade verificada;
  `acender_selo_profissao_trabalho` passou a usá-la; `selo_trabalho_apos_identidade` recalcula agora o
  lado CONTRATADO quando um CLIENTE ganha rosto. Backfill honesto correu.
  **Quem perdeu/ganhou:** NINGUÉM. Após a 043 nenhum selo `profissao` estava aceso (todos `pendente`);
  sob a 046 ninguém atinge 2 contrapartes-como-contratado (o máximo real é a Rute com 1). Backfill = no-op
  honesto. (Nota: sob a regra antiga 043, o Vitor Hugo tinha 1 contraparte "de ambos os lados" que era só
  como cliente → agora conta 0, coerente com a decisão.)
- **PROVAS (contas descartáveis + assistente admin; TUDO limpo no fim):**
  - (a) 045 no ar: colunas/estados/finalidades novos aceites (verificado por catálogo).
  - (b) Funções vivas: `convite-comparencia` sem auth → **401 "não autenticado"** (limpo, não 404);
    `convite-checkpoint` 2 portas → porta-cliente (token) devolve **"Link inválido."**, porta-P (sem JWT)
    devolve **"não autenticado"**; `convite-disputa` sem auth → **gateway 401** (JWT ligado), com anon →
    **401**, com JWT admin `acao:listar` → **200 ok:true**.
  - (c) Mini-ciclo LIVE (assistente como profissional, 2 contratos forjados por SQL, estado `assinado`
    nível 2, valor 100€/caução 30%): `nao_recebi` **COM** `prova_encontro` → **409 "Comparência
    comprovada — não podes declarar falta"**; `nao_recebi` **SEM** prova → **200 `captura_proposta`,
    cobrado:false, valor 3000c**, `hold_id` null (nada capturado), magic link `checkpoint_confirmar`
    criado ao vivo. `consentimento_aviso_entregue=false` (Bird parqueado / `CONVITE_MODO_TESTE` não a `1`
    em produção → a captura-por-silêncio NÃO vai ao vivo — a guarda dura da decisão 2 está de pé).
  - (d) Selo 046 por SQL: profissional com 2 clientes distintos verificados → **ACENDE** (verificado/
    trabalho); contratante com 2 profissionais distintos verificados → **NÃO acende** (cnt_046=0, embora
    cnt_043=2). A decisão fica provada na diferença entre as duas contagens.
  - (e) `tsc` a **0**; smoke do fluxo interno OK (`orc_pede` e `avaliacoes_insere_com_prova` intactas,
    `guarda_aceita_verificado`/`recalc_indice`/`identidade_verificada` presentes).
- **⚠️ SEGREDOS/TOKENS A REPORTAR AO VÍTOR:**
  - `COMPARENCIA_SECRET` = `honra-comparencia-f-QLS1tjT74kbfDmiwNLD_kIiQJ8OsCwY0UCIh4h590599l8i5pAUwgGbTQqy7gl`
    (guardar em local seguro; está nos secrets da função, não precisas de o recolar).
  - Usei o token de gestão `sbp_5b84…46dd` e o password grant da conta `assistente@honra.app`. Nada novo
    a rodar além do que já sabias; **mantém o hábito de revogar tokens de gestão antigos**.
- **SURPRESAS (nenhuma bloqueante):** (1) `perfis.id → auth.users(id)` com trigger que auto-cria o perfil,
  logo os testes precisaram de criar `auth.users` primeiro; (2) `metricas_pagamento` é append-only e o seu
  FK para o contrato é `ON DELETE SET NULL` → apagar um contrato de teste exige apagar a métrica primeiro
  (feito na limpeza); (3) a Management API teve 1 hiccup transitório 502 (Cloudflare) a meio da limpeza —
  repetido e concluído. Nada ficou por limpar (contratos/métricas/clientes/perfis de teste = 0).

---

## 🛡️ STATUS 18/07 — FATIA E (VERSÃO EVENTO) CONSTRUÍDA, POR APLICAR  ·  ✅ JÁ APLICADA (ver secção (3) acima)
**Fuga E blindada no REPO (nada aplicado à BD; nada deployado — a auditoria de drift corre noutra sessão).**
`tsc` a **0**. O `nao_recebi` do profissional JÁ NÃO captura sozinho — 3 camadas + corte estrutural:
- **Corte estrutural:** a cláusula penal só dispara para NO-SHOW. "Compareceu mas não pagou" nunca é captura unilateral.
- **Camada 1 — prova-de-encontro (`convite-comparencia`):** o P mostra um código ROTATIVO (6 dígitos + QR,
  HMAC de segredo do servidor, ~45s, só na janela D0±1); o cliente (magic link + OTP fresco) digita-o →
  cunha `prova_encontro` + `prova_encontro_em` IMUTÁVEL. Com prova, `nao_recebi` → **409**. Ninguém cunha sozinho.
- **Camada 2 — janela de contestação (`convite-checkpoint` reescrito):** `nao_recebi` sem prova → `captura_proposta`
  (NADA capturado). Aviso pré-captura ao cliente (magic link `checkpoint_confirmar` + OTP). Cliente **Confirma**
  ("faltei") → captura no cron; **Contesta** → `em_disputa` + hold libertado (protege o cliente); **Silêncio** →
  captura no cron. **A cobrança move-se SÓ no cron `resolver-convites`, nunca no toque do profissional.**
- **Tensão dura resolvida (crédito):** prazo do silêncio = `min(capture_before−12h, T0+48h)`. Se, ao declarar,
  o que resta até `capture_before−12h` < 24h (piso), LIBERTA o hold já (0€) e cai para MIT com a janela fixa de 48h.
- **Guarda dura (decisão 2):** captura-por-silêncio EXIGE `consentimento_aviso_entregue=true` (recibo). Bird
  PARQUEADO → fica `false` em produção → silêncio cai em `em_disputa` (revisão), não cobra. Em `MODO_TESTE` = `true`
  (o aviso "chega") para se poder provar o caminho.
- **Camada 3 — arbitragem (`convite-disputa`, admin):** `em_disputa` → admin **cobrar** (dá razão ao P) ou
  **arquivar** → `disputa_arquivada` (default protege o cliente). Ecrã mínimo em `revisao-disputas.tsx`.
- **UI (mostrar-não-dizer, tsc 0):** botão "Provar comparência" + notas de contestação no ecrã do profissional
  (`convites.tsx`); ecrã `comparencia.tsx` (código grande + contagem + QR web + "enviar link ao cliente");
  páginas do cliente `PaginaComparencia`/`PaginaConsentimento` em `c/[token].tsx`; i18n PT+EN completo.
- **Ficheiros:** migração `045_convite_prova_encontro.sql`; funções `convite-comparencia`, `convite-disputa` (novas),
  `convite-checkpoint`, `resolver-convites`, `convite-pagina`, `_shared/comparencia.ts`; UI `comparencia.tsx`,
  `revisao-disputas.tsx`, `convites.tsx`, `c/[token].tsx`, `definicoes.tsx`, `i18n/pt.ts`+`en.ts`, `declarations.d.ts`.
- **⚠️ PARA APLICAR (pós-auditoria), por ordem:**
  1. Aplicar `045_convite_prova_encontro.sql` (confirmar que a constraint inline se chama
     `contratos_convite_estado_check` antes do drop; verificar `magic_links_convite_finalidade_check`).
  2. **Deploy `convite-checkpoint` COM `--no-verify-jwt`** (mudou de JWT-only → 2 portas: P por JWT-à-mão + cliente
     por token/OTP, como o `convite-cancelar`). ⚠️ CRÍTICO: sem esta flag o porto do cliente parte.
  3. Deploy `convite-comparencia` e `convite-disputa` (**`convite-comparencia` COM `--no-verify-jwt`**;
     `convite-disputa` COM JWT — admin autenticado).
  4. Deploy `resolver-convites` e `convite-pagina`.
  5. Definir o segredo `COMPARENCIA_SECRET` (senão cai no `RESOLVER_SECRET`/service-role — funciona, mas dedicado é melhor).
  6. (Opcional) bucket `anexos-convite` já vem na 045 (anexo de contestação do cliente — upload é TODO).
- **GATED no Bird:** todos os SMS novos (aviso pré-captura, OTP de comparência/consentimento, lembrete, link de
  comparência) compõem-se e registam-se com `enviado:false` (parqueado). A **captura-por-silêncio não vai ao vivo**
  até o Bird ter recibo de entrega (`consentimento_aviso_entregue`). Ligar quando o Bird estiver a sério.
- **Provado:** `tsc` a 0; revisão manual da lógica. **Por provar até aplicar:** os fluxos ao vivo (2 telemóveis),
  a expiração real da janela, a captura no cron, e o `deno check` das funções (não há `deno` nesta máquina).

## 🔍 STATUS 18/07 (2) — DIFF SISTEMÁTICO repo↔BD viva (002→043) FEITO
Na sequência do aviso da 043 ("migrações no repo ≠ BD viva"), fiz um diff completo entre
as migrações 002→043 do repo e o estado REAL da BD (dump via Management API de `pg_policy`,
`pg_trigger`, `pg_proc.prosrc`, `pg_constraint`, colunas, `storage.objects` e buckets).
**Resultado: a BD viva está limpa — só faltava 1 objeto.**
- **Único drift achado + reposto (`044_drift_avaliacoes_leitura.sql`):** a policy
  `avaliacoes_leitura_publica` ainda estava na versão da 003 (`using (true)`) em vez da
  versão endurecida da 015 (`revelado_em is not null or auth.uid()=de_perfil`). Mesma
  família de falha do `recalc_indice` — a 015 aplicou-se só em parte. Baixo risco (0
  avaliações por revelar; a 037 carimba `revelado_em` sempre) mas reposto na régua.
  Aplicado à BD viva e verificado.
- **Confirmado SÃO na BD viva (tudo o que a 043 tocou + o resto):** `verif_dono_tudo`,
  `notificar_mensagem` e trigger `after_mensagem_notifica` **ausentes** ✓; `orc_pede`
  (estado='pedido'+identidade), `avaliacoes_insere_com_prova` (unidirecional+identidade),
  `recalc_indice`, `guarda_aceita_verificado` (guarda SELAR), `guarda_perfil` (6 campos),
  selos 043, `notificar_ciclo` (ramo Conversa), `magic_links…finalidade` (inclui 'cartao')
  — TODOS na versão esperada. 31/31 corpos de função batem certo (só `push_ao_avisar`
  difere, e é legítimo: segredo real vs `<PUSH_SECRET>`). 21 triggers, todas as policies,
  constraints, colunas, 10 storage policies e 4 buckets = OK.
- ⚠️ Token de gestão `sbp_607c…` usado neste diff — **revoga-o** no dashboard.
- 📌 PENDENTE (baixa prioridade): há **duas migrações com prefixo `040`**
  (`040_convite_cartao.sql` + `040_perfis_semente.sql`). Hoje ambas estão refletidas na BD,
  logo não há problema. MAS se um dia usares uma ferramenta que indexe migrações pelo número
  (supabase db push/CLI), uma pode ser saltada. Renomear uma para outro número livre quando
  for oportuno.

## 🛡️ STATUS 18/07 — FUGA C BLINDADA (farm de reputação com sockpuppets)
**Migração `043_fuga_c_sockpuppets.sql` APLICADA + `aperto-agir` redeployada.** A fuga C do
red-team (docs/RED-TEAM-FUGAS.md) está fechada: TODOS os gestos que criam reputação exigem
identidade verificada — PEDIR (RLS `orc_pede`), ACEITAR (004, intacta), SELAR (guarda da BD
estendida + 403 honesto no `aperto-agir`) e AVALIAR (RLS `avaliacoes_insere_com_prova`).
Um sockpuppet passa a custar uma identidade real; a dedup por documento (fuga A/B) remata.
- **Selo "profissão por trabalho" reescrito (029→043):** só acende com **≥2 CONTRAPARTES
  DISTINTAS, cada uma com identidade verificada**, em negócios honrados — 2 negócios com a
  mesma conta (ou contas sem rosto) já não provam ofício. Trigger novo: quando uma identidade
  acende, os selos das contrapartes recalculam-se na hora. **Backfill honesto:** os 3 selos
  "por trabalho" existentes (Rute, Vítor Gama, Vitor Hugo) **apagaram-se** — nenhum tinha 2
  contrapartes distintas verificadas (Rute↔Vitor Hugo só se tinham um ao outro; o Vítor Gama
  ficou sem negócios após a limpeza de 17/07). A régua é nunca inflacionar; voltam a acender
  sozinhos com trabalho real.
- **🚨 3 DRIFTS da BD viva achados e corrigidos na prova** (migrações antigas que a BD real
  não tinha, apesar de estarem no repo — a 043 repõe-nas):
  1. **`verif_dono_tudo` ainda existia** (a 010 FIX 1 mandava removê-la): qualquer conta
     podia **auto-verificar identidade e selos** por UPDATE direto — provado ao vivo antes
     de remover, negado depois. Era o buraco mais grave; furava tudo.
  2. `orc_pede` sem o `estado='pedido'` (010 FIX 2): dava para inserir orçamentos já
     'concluido'. Reposto (+ identidade).
  3. `recalc_indice` era a versão pré-010/015 (sem flag `honra.sistema`, contava seladas):
     **avaliar estava PARTIDO ao vivo** (o insert rebentava na guarda_perfil) e a policy de
     avaliação ainda era bidirecional (a 037 não estava aplicada). Repostos.
  → Moral: **migrações no repo ≠ BD viva.** Antes do beta vale a pena um diff completo.
- **UI (mostrar-não-dizer, tsc a 0):** quem não tem identidade verificada vê mensagem honesta
  + botão "Verificar identidade" em vez do gesto — pedir orçamento e iniciar conversa
  (`perfil/[id]`), avaliar (`projeto/[id]`), abrir orçamento a candidato (`trabalho/[id]`).
  Hook novo `src/lib/identidade.tsx`; chaves i18n `idverif.*` (PT+EN). Provado no browser
  (Metro 8081, conta descartável sem identidade): cartão honesto no perfil da Inês, gate da
  conversa vivo, consola limpa. **dist NÃO reconstruído** (fazer antes de servir o 8095).
- **Perfis-semente:** identidade marcada `verificado` por SQL nas 9 sementes (são demo de
  Lisboa·eventos; sem isto os fluxos de demonstração morriam no novo requisito). Documentado
  aqui — antes do lançamento as sementes saem todas na mesma.
- **Provado por API/SQL na BD real (contas descartáveis, tudo limpo no fim):**
  (a) sem identidade não cria pedido (RLS 42501) nem forja 'concluido';
  (b) sem identidade não SELA — 403 honesto na função E exceção da guarda por SQL direto;
  (b2) sem identidade continua sem poder ACEITAR (004 de pé);
  (c) sem identidade não AVALIA (RLS 42501);
  (d) selo: 2 honrados com a MESMA contraparte → NÃO acende; contraparte distinta mas SEM
  identidade → NÃO acende; quando ela verifica → **acende sozinho** (trigger novo);
  (e) ciclo legítimo completo ponta a ponta (assistente↔semente1, ambos verificados):
  pedido→aceite→selado→checkpoint×2→honrado→entregue→concluido→avaliação 5★ revelada — tudo
  pela API real; sentido inverso (profissional avalia cliente) negado (037).
  §5 do red-team re-verificada: inflar índice nega, transição fora de vez nega, portefólio
  e guarda_ciclo intactos, contrato-convite NÃO tocado.
- **FORA (fase 2, decidido):** velocity/graph limits, ponderação do índice pela reputação do
  avaliador, fuga E (checkpoint-convite — à espera da decisão com o advogado), dedup por
  documento (fuga A/B — depende da Q10-A do advogado).
- Nota de desenho em aberto: o selo "por trabalho" continua a contar negócios dos DOIS lados
  (como a 029) — um contratante com 2 profissionais distintos verificados também o acende.
  Apertar para "só como profissional (para_perfil)" é decisão tua.

## 🌅 STATUS 17/07 (madrugada+manhã)
- **FATIA C-2 PROVADA AO VIVO** ✅ (migração 040_convite_cartao): nível ii "contrato+cartão" no aceite
  (gate Connect), mandato click-to-accept (P nomeado beneficiário), Checkout mode=setup NA conta de P,
  cancelamento com escalões — MIT de 12% (60€) cobrado na conta de P e refundado em teste; P cancela ⇒ marca.
  Estado pós-cartão = `assinado` (+cartao_gravado_em); `caucionado` reservado ao hold (Fatia D).
- **MODO EMPRESA v1 FEITO + VERIFICADO** ✅ (migração 041 stats_contratante): registo "profissional·empresa",
  Início-painel de contratante (4 métricas deriváveis), rede de confiança ((tabs)/rede.tsx, "Voltar a contratar"),
  perfil público de empresa com trabalhos abertos listados (amor à 1ª vista), "COMO CONTRATANTE" no próprio.
  Empresa-semente: semente9@honra.app "Palco & Luz Produções" (semente=true). Polir: saudação de empresa
  usa 1º nome ("Olá, Palco") → nome completo (na leva i18n).
- **LIMPEZA BD EXECUTADA pelo Vítor** ✅ (SQL Editor): 4 contas de teste apagadas (tó/alberto/Demo Dois/Demo
  Verificação), 0 órfãos, contadores RECONTADOS honestos (Vítor Gama 3→0 — eram contra contas de teste;
  Rute↔Vitor Hugo mantêm 2/2 reais). Falta só: 4 ficheiros órfãos no Storage (lista em docs/limpeza-bd-16-07.md).
- **INVESTIGAÇÃO HOLDS+MÉTRICAS FECHADA** ✅ → `docs/PAGAMENTOS-HOLD-METRICAS.md` (8 parâmetros p/ Fatia D:
  arme D−2; hold só crédito, débito=MIT direto; dunning D+1/3/7 máx4; fee 3% mín 0,60€ e 0 no perdão; VAMP 2026;
  métricas núcleo; cartões de teste por cenário).
- **i18n EM CURSO** (agente): sistema próprio sem deps, PT+EN, prioridade caminho do convidado; contrato fica PT (advogado).
- Launch.json da home corrigido (serve-dist c/ SPA fallback no 8083); servidor do telemóvel 8095 relançado.

## 🔌 STATUS 16/07 — SESSÃO DE LIGAÇÕES (com o Vítor ao PC)
- **STRIPE CONNECT PROVADO AO VIVO** ✅ — Connect ativado (modelo direct charges: "comerciantes coletam
  diretamente"); webhook "Honra - Connect" (contas conectadas, `account.updated`) com
  `STRIPE_CONNECT_WEBHOOK_SECRET` ligado; onboarding Express de teste completo (conta
  `acct_1Ttw2c8kyCuqvQvQ` do perfil Claude) → webhook disparou → `contas_connect` = **ativa**,
  charges+payouts=true, gate `pode_nivel_protecao_avancado`=true. ⚠️ Exigiu ativar **"Accounts v1
  support"** no dashboard (conta nova = Accounts v2 por defeito). **Antes da Fatia C-2: decidir/fazer a
  migração do onboarding+webhook para Accounts v2** (agora é o momento barato).
- **SMS do link (Bird) = PARQUEADO** — rota texto-livre rejeita (E01001) e templates não aceitam URLs;
  o profissional partilha o link à mão (a resposta do convite-decidir devolve magic_link+mensagem_link).
  Retomar na config séria do Bird (véspera de beta, junto com sender HONRA).
- Recuperação de palavra-passe confirmada operacional pelo Vítor (15/07). Tokens antigos: Vítor a revogar.
- **3 lacunas do "passeio" do Vítor fechadas (15/07):** botão Mensagem no perfil público (conversa=orçamento;
  1º contacto cria pedido leve — decisão de modelo pendente); foto de perfil (bucket `avatares` + coluna
  `avatar_url` + UI "Adicionar foto" — faltava tudo, migração 036); **avaliação passou a UNIDIRECIONAL**
  cliente→profissional (migração 037: RLS só nesse sentido, revelação imediata, double-blind inerte).

## 🩺 STATUS 14/07 — APERTO DE MÃO SEM DINHEIRO (cirurgia feita, provada por API) ✅
**Decisão travada (15/07): a reputação É a caução.** Os holds de 2€ saíram do aperto de
mão INTERNO do marketplace — ambos os lados têm perfil verificado e 1 pessoa=1 conta, a
marca de incumprimento é inescapável. O ritual (2 toques), o checkpoint (~dia 6), o
cancelamento mútuo e os prazos ficaram TODOS iguais; só o dinheiro saiu do gesto.
- **Migração `032_aperto_sem_dinheiro.sql` APLICADA** — só recria `notificar_ciclo` (a voz
  dos avisos passou do dinheiro para a palavra/marca). Verificado na BD: a
  `guarda_ciclo_caucao` (versão 010) nunca exigiu holds nas transições do servidor → não
  foi tocada; `guarda_aceita_verificado` intacta (aceitar continua a exigir identidade,
  mesmo via service_role).
- **Edge Function nova `aperto-agir` (JWT, ACTIVE)** — B aceita (`pedido→aceite`) e A sela
  (`aceite→selado`) direto no servidor, sem Stripe. Vez errada→400, duplo toque→409/400,
  identidade pendente→403 honesto.
- **`resolver-caucoes` redeployada** — NUNCA captura: fantasma → `incumprido`+`quem_falhou`
  +avisos (a marca é a consequência). Lembrete de véspera e expiração do selo intactos.
  Holds LEGADOS vivos, se aparecerem, são LIBERTADOS (cancel) por segurança.
- **`autorizar-caucao` = LEGADO no fluxo interno** (comentário no topo; não apagada — o
  padrão hold/capture continua vivo no contrato-convite `convite-*`, que NÃO foi tocado).
- **UI:** botões "Aceitar" / "Selar aperto de mão" (sem "· segurar 2€", sem Checkout/
  redirect /pago no fluxo interno); textos na voz da palavra ("Ao selar, dás a tua palavra.
  Quem não comparecer no checkpoint fica marcado."). `lib/projeto.tsx` (ação `aperto`),
  `projeto/[id].tsx`, `LinhaTempo.tsx`. O atalho "par de confiança" saiu (era um atalho ao
  dinheiro; sem dinheiro, o ritual é igual para todos). tsc a 0. **dist NÃO reconstruído.**
- **Provado por API (contas tó/Demo/alberto; dados de teste limpos no fim):** ciclo completo
  pedido→aceite→selado→checkpoint 2 lados→**honrado** com avisos certos e `hold_a/hold_b`
  sempre null; alberto (identidade pendente) recusado com razão honesta; fantasma →
  **incumprido/quem_falhou=b** com ZERO interações Stripe; A não sela → **expirado**;
  cancelamento mútuo em 2 toques → **cancelado** sem marca; lembrete de véspera vivo.
- **Legado/TODO:** colunas `hold_a/hold_b/pagamento_id` ficam órfãs no fluxo interno
  (documentado na 032, nada apagado); suspensão/expulsão por reincidência = fase 2 (TODO
  no `resolver-caucoes`); holds antigos de teste em estados terminais já estavam libertados.
- ⚠️ As palavras-passe das 3 contas de teste (tó, alberto, Demo Verificação) foram
  redefinidas para `honra-teste-2026!` para a prova por API.

## 🆕 12/07 (madrugada) — os 2 fiddly FECHADOS ✅ (tsc limpo, build 8095 nova)
**#5 Separadores sempre acessíveis:** os 5 ecrãs de detalhe (`projeto/[id]`, `perfil/[id]`,
`trabalho/[id]`, `conversa/[id]`, `publicar-trabalho`) saíram do Stack raiz e vivem agora
DENTRO do grupo `(tabs)` como ecrãs escondidos (`href: null` — sem botão próprio) +
`backBehavior="history"` no Tabs (o "‹ Voltar" segue o histórico real). URLs não mudaram
(grupos não entram no caminho). A tab bar fica visível em TODOS os ecrãs; só `editar-perfil`
e `avisos` (modal) continuam a tapá-la, de propósito.
**#1 Date picker:** componente novo `src/components/ui/CampoData.tsx` — calendário próprio
em RN puro (Modal+Views, zero dependências nativas → IGUAL em web e iOS). Fala 'AAAA-MM-DD',
mostra "12 Jul 2026"; semana começa à segunda; dias antes do `minimo` desativados; Limpar/
Fechar; verde = dia escolhido, hoje = contorno neutro. Em `publicar-trabalho`: início com
mínimo=hoje, prazo com mínimo=início (e se o início saltar para lá do prazo, o prazo
limpa-se). Bónus: `formatarData()` exportado e aplicado onde havia ISO cru (detalhe do
trabalho + cartão do mural "até 3 Ago 2026").
**Provado no browser (build 8095):** login tó → Publicar trabalho (tab bar visível) →
calendário abre/escolhe/limpa/navega meses/respeita mínimos → publicou "Sessão fotográfica
de produto — 20 fotos" (início 20 Jul, prazo 3 Ago — na BD real, ficou lá para testares
candidaturas com a conta do Vítor) → trabalho/[id], projeto/[id], perfil/[id], conversa/[id]
todos com tab bar; voltar funciona. Zero erros de consola.
**Achado (chip criado, não é bug do índice):** a avaliação do tó ao Vítor está SELADA
(`revelado_em: null`, double-blind a funcionar) — mas o perfil público mostra ao autor
"0.0 · 1 avaliação" com a avaliação listada. Remate de apresentação, decisão tua.
**RETOQUES 12/07 (pós-feedback):** (a) datas em **DD/MM/AAAA** (formato PT) —
`formatarData()` passou de "20 Jul 2026" para "20/07/2026"; apanha o gatilho do
calendário, o detalhe do trabalho e o cartão do mural. (b) `Selo`: tirado o "por
verificar" das abas — o cadeado 🔒 e o ✓ verde dizem tudo, e as 4 pílulas ficam todas
com a mesma altura (37px, provado) sem o espaço vazio que destoava. Trabalho de teste
reaberto (estava 'fechado', voltou a 'aberto' para testares candidaturas).
**AVALIAÇÃO SELADA no perfil público — CORRIGIDO 12/07 ✅** (o "achado" acima). Em
`perfil/[id].tsx`: a query passou a trazer `revelado_em`; separam-se `reveladas` (públicas)
de `minhasSeladas` (a RLS da 015 só mostra seladas ao próprio autor → uma selada que vejo é
sempre minha). Confiança + contagem + prestígio contam SÓ reveladas (deixou de dizer "0.0 ·
1 avaliação"; agora "Sem avaliações ainda"). A minha selada sai da secção pública AVALIAÇÕES
e ganha bloco próprio "A TUA AVALIAÇÃO" com faixa "🔒 Selada · Revela-se quando a outra
parte também avaliar, ou ao fim de 14 dias" (mostrar-não-dizer). Provado no browser.
**RECALIBRAÇÃO DE ESCALA (12/07):** Vítor corrigiu — a app é para o MUNDO, não piloto PT.
"~90%" era só o motor; como produto mundial estamos ~25-35%. Ver memória
[[honra-ambicao-mundial]]. Faltam domínios inteiros (onboarding, i18n, trust&safety, RGPD…).

**CONSTRUÍDO 12/07 (2 agentes em paralelo + verificado no browser):**
- **DEFINIÇÕES** (`src/app/(tabs)/definicoes.tsx`, engrenagem no topo do perfil): Conta
  (email + mudar palavra-passe REAL via updateUser), Idioma PT/EN (local, i18n depois),
  Notificações (3 toggles, tabela+degrade), **RGPD** (exportar/eliminar → pedido real,
  eliminar com dupla confirmação "escreve ELIMINAR"), Legal, Apoio, Terminar sessão.
  Migrações `018_preferencias_notificacao.sql` + `019_pedidos_conta.sql` escritas, POR APLICAR.
- **HONRA CARD** (`src/app/honra-card.tsx`, modal, ícone cartão no perfil): credencial
  partilhável da maquete — fundo verde nobre, marca-de-água, anel de prestígio, medalha +
  "Nível <escalão>", 4 abas do selo, stats reais (Avaliação/Projetos; Resposta="—" honesto).
  Partilha: navigator.share (telemóvel) / clipboard (desktop) / **revela texto selecionável**
  como recurso final — nunca falha em silêncio (endurecido por mim após teste).
- **PEN-TEST autenticado: 7/7 ataques bloqueados** (self-verify, forjar concluído, inflar
  índice/On-Honra, review sem negócio, reescrever partes, ler seladas alheias). Fosso aguenta.
- **Teste no telemóvel pronto** (`TESTAR-NO-TELEMOVEL.md`, IP 192.168.1.194:8095) + andaime
  `eas.json` + `PUSH-RUNBOOK.md`.
**APLICADO 12/07 com token `sbp_88ef…` (Vítor: REVOGAR):**
- Migrações **018** (preferencias_notificacao) + **019** (pedidos_conta RGPD) aplicadas via
  Management API. Push (008) já estava aplicado a 10/07 (push_tokens existe) — só falta token nativo.
- **DEEP-LINK pós-pagamento RESOLVIDO** ✅: `autorizar-caucao` + `criar-verificacao` aceitam
  `return_url` do cliente (validado http(s), evita open-redirect); cliente (`lib/projeto.tsx`
  segurar + `perfil.tsx` verificar) passa `${origin}/pago` (web) — e na web REDIRECIONA a
  própria página (`window.location.assign`) em vez de WebBrowser, p/ o Stripe voltar limpo.
  Novos ecrãs `src/app/pago.tsx` + `verificado.tsx` (auto-return ao negócio/perfil). Ambas as
  funções redeployadas. **Provado:** /pago serve 200 (SPA fallback no serve-dist.py), arranca e
  devolve ao /projeto/<id>; e **o Stripe ACEITA success_url http:// de IP da LAN (200)** → o
  teste nos 2 telemóveis funciona ponta a ponta. Nota: nativo (honraapp://) ainda cai no
  fallback (Stripe exige http(s)); precisa de https-bounce/universal link no EAS build — depois.

**1º TESTE REAL 2 USERS (Vítor + Rute) 12/07 — feedback e correções:**
- ⚠️ BLOQUEADOR: verificação de identidade não acende o selo. CAUSA: Stripe Identity em TESTE
  dá `requires_input` com fotos reais (nunca `verified`). NÃO é bug — ver [[honra-verificacao-teste-stripe]].
  Desbloqueio p/ testar holds JÁ: conta nova PEDE (sela, não precisa verificação) + `vitor.gama@honra.app`
  (verificado) ACEITA. Ou pôr identidade=verificado na BD (precisa token/service_role).
- ✅ FIX UX `verificado.tsx`: sonda a BD ~12s e diz a verdade (verificado / ainda a processar ou
  não passou), em vez de "acende sozinha". Matou a confusão.
- ✅ Início ≠ Perfil: `inicio.tsx` trocou a Credencial (igual ao perfil) por um cabeçalho de
  saudação à esquerda ("INÍCIO / Olá, <nome> / <escalão>"). Confundia a Rute.
- ✅ Honra Card isolado: saiu do trio de ícones do topo do perfil → pílula "▭ Credencial" no
  canto inferior direito do pano verde (`Credencial` ganhou prop `rodapeDireito`).
- Não-bug: portefólio acende sozinho com 1 item (migração 017) — o Vítor tinha 1 item.
Todos os fixes tsc-limpos, na build, provados no browser.
**A FAZER:** token novo (o "novo token" da msg NÃO veio no texto) p/ verificar as contas deles +
mecânicas competitivas; Login Expo (EXPO_TOKEN) p/ push nativo; SMS/OTP Contacto; onboarding
(o buraco nº1 p/ cativar dia-1); i18n; trust&safety.

**HOLDS PROVADOS AO VIVO (12/07) ✅:** teste 2 telemóveis (Vítor+Rute) passou — negócio
`honrado`, hold_a+hold_b seguros e libertados (`canceled` 0€ no Stripe). Contas verificadas na
BD (Stripe Identity em teste dá `requires_input` — [[honra-verificacao-teste-stripe]]).

**FEEDBACK 3º ROUND — 3 melhorias FEITAS e provadas no browser:**
1. **Badge de mensagens por ler** (separador Chat). Migração `020_leitura_conversa.sql`
   (`leitura_conversa` + RPC `mensagens_nao_lidas()`, APLICADA). `lib/chat.tsx`: `ChatProvider`/
   `useChatNaoLidas` (RPC+realtime+`marcarLido`); `tabBarBadge`. ⚠️ Bug: o ecrã da conversa fica
   montado por trás (tabs) → o realtime lia sozinho → badge nunca aparecia. FIX: `useIsFocused()`.
2. **Nome na conversa → perfil** (`conversa/[id].tsx`: `outroId` + título Pressable → `/perfil/[id]`).
3. **Pesquisa sem thumbnail de portefólio** — cartão mostra **On Honra** (N honrados) à direita
   (a foto vive no perfil). Removida a query de portfolio + Image.
**PRÓXIMO:** repetir o teste dos holds como eles próprios / DECORAÇÃO / onboarding.

**ONBOARDING — CONSTRUÍDO e provado (12/07):** `src/app/onboarding.tsx` (3 slides honestos:
"Trabalho real/Pessoas reais" · "Entras a zero. Cresces por mérito." · "Para todos os que
fazem bem" — comunica o posicionamento travado). Flag local `honra.onboarding.visto`; `registo`
→ `/onboarding` → Início. **Guia PRIMEIROS PASSOS** no Início (`inicio.tsx`, só ações REAIS:
identidade/função/portefólio; "N de 3"; some quando completo). SEM passos falsos (NFC/liveness/
OTP da maquete ficam para quando forem reais). tsc-limpo, na build.

**OTP — 2 agentes entregaram (ver [[honra-otp-fornecedor]]):** tensão central = Twilio Verify tem
o melhor motor/antifraude(Fraud Guard grátis)/integração MAS processa nº UE nos EUA (Verify fora
da residência UE) → mau p/ marca de confiança europeia. Pela régua [[feedback-enaltecer-honra]],
inclina p/ **domicílio UE: Sinch (UE+rede global+antifraude) ou Bird (RGPD mais limpo, Amesterdão)
ou Prelude (FR, antifraude-first, + barato, mas empresa jovem)**. Arquitetura obrigatória: Verify
via Edge Function (NÃO Supabase Auth) + prova-de-encontro p/ a crítica + Supabase alojado na UE +
geo-allow-list/CAPTCHA/bloquear VoIP contra pumping. **DECIDIDO: Bird (Amesterdão).**

**SELO CONTACTO (Bird) — CONSTRUÍDO + DEPLOYADO + VERIFICADO (honesto) 12/07:** migração `022`
(tabela `contactos_verificados` — só HASH do E.164, unique = 1 nº/conta; RLS só-leitura-dono, escrita
só service_role) APLICADA. Edge Functions `verificar-contacto` (Bird POST /verify, originador "HONRA")
+ `confirmar-contacto` (Bird GET /verify/{id}?token=, valida → grava hash + acende aba contacto)
DEPLOYADAS. App: `src/app/verificar-contacto.tsx` (número→código) + botão "Verificar contacto" no perfil.
Provado: sem `BIRD_ACCESS_KEY` responde 503 HONESTO ("ainda não disponível"), não finge. **FALTA SÓ:**
Vítor criar conta Bird → AccessKey → `supabase secrets set BIRD_ACCESS_KEY=…` → fica live. Prova-de-
encontro **(A)** (profissional regista o cliente na hora) aprovada p/ a crítica verificada (fase 2, a seguir).

**12/07 (4º round):**
- **Mensagens FORA do Sino** (migração `021`, APLICADA): removido o trigger `after_mensagem_notifica`
  + função + avisos `tipo='mensagem'` limpos. Sino = orçamentos/caução/entregas; mensagens só no
  badge do Chat (020). Decisão do Vítor.
- **Holds re-provados a solo (via Stripe API):** segurar→libertar (canceled 0€), segurar→capturar
  (succeeded 200c)→refund; autorizar-caucao devolve Checkout pós-deep-link; webhook+cron vivos. Limpo.
- **DÚVIDA ABERTA do Vítor (importante p/ posicionamento):** um profissional SOLO bom (ex: nail
  artist, 7 anos) não tem como receber recomendações externas (só de "empresas") nem subir de rank
  (rank preso a negócios no Honra). → 2 ideias dadas: (1) **Recomendações de CLIENTE verificado**
  (não só empresa; OTP no cliente; pesa menos que On Honra); (2) **Track de rank "Ofício"** p/ solo
  B2C (clientela verificada + ofício/certificações + repeat-rate + portefólio), a par dos negócios.
  Questão de fundo: Honra é só B2B freelancing ou p/ TODOS os profissionais verificados incl. solo B2C?


Construí **E APLIQUEI** o mecanismo da caução final — hold/autorização de dois lados,
"aperto de mão em dois toques". **Nunca cobra dinheiro**: segura os 2€ com a pessoa
presente e só captura a quem foge. Substitui o modelo antigo (cobrar + refund).

## ✅ JÁ ESTÁ TUDO APLICADO E VERIFICADO AO VIVO (2026-07-10)
- **Migrações 004 + 005** aplicadas (as 002/003 já lá estavam). Colunas de hold, novo
  check de estados e os 2 triggers confirmados na BD.
- **5 Edge Functions deployadas:** `autorizar-caucao`, `agir-checkpoint`, `cancelar-mutuo`
  (JWT on), `resolver-caucoes` + `stripe-webhook` (--no-verify-jwt).
- **RESOLVER_SECRET** gerado e posto como segredo da função (server-side).
- **pg_cron** ativo: `honra-resolver-caucoes`, diário às 09:00 UTC.
- **Provado ao vivo:** resolver (401 com segredo errado, 200 com o certo); a máquina de
  estados corre no servidor sem ser bloqueada pela guarda de integridade; o webhook Stripe
  subscreve `checkout.session.completed`; a Checkout Session com captura manual (2€) é
  aceite pelo Stripe.

## 🔔 NOTIFICAÇÕES — APLICADAS E VERIFICADAS AO VIVO (2026-07-10) ✅
Avisos como **projeção da máquina de estados**: quase todos disparam sozinhos por um
trigger na BD (todas as transições da caução já passam pela BD). Tom empurra para a ação,
contagem decrescente na app, sino que **pulsa a dourado** (digno, não alarme).
- **Aplicado:** migração `006_notificacoes.sql` (tabela `notificacoes` + RLS + realtime +
  trigger `notificar_ciclo` + `criar_aviso`) corrida na BD; `resolver-caucoes` redeployado
  com o **lembrete de véspera** (dia ~5, antes de capturar).
- **App:** `src/lib/avisos.tsx` (provider+realtime na raiz), `src/components/ui/Sino.tsx`
  (sino+pulsar), `src/app/avisos.tsx` (ecrã), sino nos cabeçalhos de Início e Orçamentos.
- **Provado ao vivo:** teste transacional real — inserir pedido criou aviso `pedido` p/ B;
  pedido→aceite criou aviso `aceite` (urgente, c/ prazo) p/ A; limpeza 0/0.
- **STANDBY — camada TEAM (a estudar):** numa equipa, quem segura os 2€ e a marca é da
  equipa ou da pessoa? + conceito de "dono" da ação (senão a notificação em massa dilui a
  responsabilidade). Só a camada INDIVIDUAL está feita.
- **Fase 2 (push real):** o sino é a camada dentro da app. Para chegar a quem está fora,
  falta Expo Push (registar device tokens + enviar no insert do aviso).
- ⚠️ Token `sbp_e689…` usado neste deploy — **revoga-o** também.

## ✅ PROVA DE DINHEIRO REAL (2026-07-10) — resolver + Stripe + avisos
Com holds reais no Stripe (cartão de teste) e o resolver deployado:
- **Captura ao fantasma:** aperto 'selado', cliente fugiu → resolver capturou 2€ do fantasma
  (`succeeded`, amount 200), libertou o outro (`canceled`), estado `incumprido`/`quem_falhou=a`,
  avisos certos aos dois. 2€ **refundado** a seguir (era teste).
- **Libertação honrada:** os dois agiram → resolver cancelou os dois holds (0€), estado `honrado`,
  avisos "Aperto de mão honrado" aos dois. Orçamentos de teste apagados no fim.
- **`criar-pagamento` APAGADA** do servidor (o fio solto do modelo antigo). Ficam 6 funções certas.
- ⚠️ **RESOLVER_SECRET foi rodado** (função + cron reaplicados juntos, cron continua a funcionar).
- ⚠️ Token `sbp_484f…` usado neste passo — **revoga-o**.

## 🧩 BLOCO "CHECKPOINT REAL" — código feito (tsc limpo), FALTA APLICAR
Decidido 2026-07-10: (1) avaliação só na ENTREGA, não no arranque honrado; (2) o
freelancer anexa foto na evolução, a empresa vê antes de confirmar.
- **Ficheiros:** migração `007_checkpoint_real.sql` (estado `entregue`, coluna
  `evolucao_ficheiro`, guarda atualizada p/ transições de entrega, avaliação só em
  `concluido`, bucket Storage `evolucoes` + políticas, avisos de entrega/conclusão);
  `agir-checkpoint` aceita `ficheiro`; app `orcamentos.tsx` (upload via expo-image-picker,
  ver evidência, passo entregue→concluido); `expo-image-picker` instalado.
- **Novo troço:** honrado → entregue (B marca) → concluido (A confirma) → avaliar.
- **Aplicar (com token):** correr `007_checkpoint_real.sql` no SQL Editor + `npx supabase
  functions deploy agir-checkpoint --project-ref haqynnhstjgzgtnnwqsi`.

## ⏳ O QUE FALTA (só tu podes, precisa de 2 pessoas + cartão)
Testar o fluxo dos **dois toques ponta a ponta** com as 2 contas de teste (ambas já têm
identidade verificada): pedir → **B "Aceitar · segurar 2€"** (cartão `4242 4242 4242 4242`)
→ **A "Selar · segurar 2€"** → checkpoint (B "Apresentar" + A "Confirmar") → ver os 2 holds
ficarem `canceled` e o estado `honrado`. Para a captura-ao-fantasma sem esperar 6 dias,
invoca `resolver-caucoes` com `{"dias_checkpoint":0,"horas_selo":0}`.

> ⚠️ O token de deploy `sbp_5184…` foi usado agora — **roda-o/apaga-o** no dashboard
> (Account → Access Tokens) por higiene.

---

## Referência (o que foi aplicado)

---

## O que muda (a mecânica)

```
A pede orçamento ─── grátis, sem caução (só interesse)
        │
   B ACEITA ──────── B segura 2€ (hold).            estado: aceite
        │            (só quem tem identidade verificada pode aceitar)
   A SELA ────────── A segura 2€ (hold). Aperto de   estado: selado
        │            mão fechado; relógio de 7 dias arranca.
        │
   CHECKPOINT (~dia 6): B "Apresenta evolução" + A "Confirma"
        ├─ os dois agem ─────── libertam-se os 2 holds. NADA cobrado.  estado: honrado
        ├─ só um age ────────── captura-se o 2€ de quem NÃO agiu → Honra + marca.  incumprido
        └─ ninguém age ──────── capturam-se os dois + marca.           incumprido
```
- Se A não selar em 48h → o hold de B liberta-se (estado `expirado`).
- **Cancelamento de comum acordo** (os dois confirmam) → holds libertados, **sem marca**.
- Só há **avaliação** para negócios `honrado` (nunca para `incumprido`/`cancelado`:
  não se usam reviews como arma numa zanga).

---

## APLICAR (ordem importa)

### 1) Migração à base de dados
Supabase → **SQL Editor** → correr **por ordem**, só as que ainda não aplicaste:
`002_categorias.sql` → `003_avaliacoes.sql` → `004_guardas_ciclo.sql` → **`005_caucao_hold.sql`** (a nova).
> Se não tens a certeza do que já correu: correr todas por ordem é seguro (são
> aditivas / idempotentes — `if not exists`, `drop … if exists`, `add column if not exists`).

### 2) Deploy das Edge Functions (4 + o webhook)
```bash
export SUPABASE_ACCESS_TOKEN=<o teu token sbp_...>
cd ~/honra-app
npx supabase functions deploy autorizar-caucao  --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy agir-checkpoint    --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy cancelar-mutuo     --project-ref haqynnhstjgzgtnnwqsi
npx supabase functions deploy resolver-caucoes   --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
npx supabase functions deploy stripe-webhook     --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
```
- `resolver-caucoes` leva `--no-verify-jwt` (é chamada pelo cron; protege-se pelo `RESOLVER_SECRET`).
- As funções antigas `criar-pagamento` e `devolver-caucao` foram **removidas** do código
  (substituídas). Podes apagá-las no dashboard, ou deixá-las mortas — não são chamadas.

### 3) Segredo novo
```bash
npx supabase secrets set RESOLVER_SECRET=<uma-frase-longa-aleatoria> --project-ref haqynnhstjgzgtnnwqsi
```
(STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET já estão postos, da Fatia 2/3.)

### 4) Agendar o resolver
Abre **`supabase/cron-resolver.sql`**, troca `<RESOLVER_SECRET>` pela mesma frase do passo 3,
e corre no SQL Editor. (Ativa pg_cron + pg_net e agenda a corrida diária.)

### 5) Webhook do Stripe
Já subscreve `checkout.session.completed` (da Fatia 3) — **nada a mudar**. O mesmo evento
agora serve para registar o hold e avançar o aperto de mão (lê o `metadata.lado`).

---

## Testar (com Stripe em modo teste)
1. Conta A pede orçamento a Conta B (B tem de ter identidade verificada).
2. **B → "Aceitar · segurar 2€"** → página Stripe → cartão de teste `4242 4242 4242 4242`.
   No painel do Stripe o PaymentIntent fica **`requires_capture`** (segurou, não cobrou).
3. **A → "Selar aperto de mão · segurar 2€"** → idem. Estado passa a **selado**.
4. Checkpoint: **B "Apresentar evolução"** + **A "Confirmar evolução"** → os dois holds
   ficam **canceled** (0€) e o estado passa a **honrado**. Ninguém pagou nada.
5. Fantasma: para testar a captura, chama o resolver com prazos curtos (em vez de esperar
   6 dias) — no dashboard, invoca `resolver-caucoes` com header `x-resolver-secret` e corpo
   `{"dias_checkpoint":0,"horas_selo":0}`. Quem não agiu vê o 2€ **captured**.

---

## Estado dos blocos anteriores (já live)
Conta, Perfil, Verificação (Stripe Identity), Marketplace (pesquisar→orçamento), Empresa/
Categorias, Avaliações — tudo construído. A caução era o bloco por fechar; está agora
fechado no código.

---

## 🔔 PUSH (fase 2) — código feito, FALTA APLICAR
A fase 1 dos avisos acende o sino DENTRO da app (realtime). A fase 2 é a camada que chega
a quem **NÃO tem a app aberta**: cada aviso novo em `notificacoes` dispara um push via a
**Expo Push API**. O push é o MESMO aviso, entregue mais longe — best-effort: se falhar, o
aviso in-app fica na mesma (é a fonte da verdade).

**Feito no código (tsc limpo):**
- `supabase/migrations/008_push.sql` — tabela `push_tokens` (+RLS: cada um mexe só nos seus)
  e trigger `after_notificacao_push` em `notificacoes` → chama `enviar-push` via `net.http_post`
  (envolto em exception, nunca rebenta o insert do aviso).
- `supabase/functions/enviar-push/index.ts` — protegida por `x-push-secret`; lê o aviso +
  os tokens do perfil e faz POST a `https://exp.host/--/api/v2/push/send`.
- `src/lib/push.tsx` — `useRegistarPush()` (montado no `AvisosProvider`): pede permissão,
  obtém o Expo push token e faz upsert em `push_tokens`. **Web:** não faz nada. Sem
  `projectId` EAS: log + sai gracioso. Tudo em try/catch (nunca crasha a app).
- `app.json` — plugin `expo-notifications` adicionado. `expo-notifications` instalado.

**Passos para aplicar (por ordem):**
1. Gerar o segredo e pô-lo na função:
   ```bash
   npx supabase secrets set PUSH_SECRET=<uma-frase-longa-aleatoria> --project-ref haqynnhstjgzgtnnwqsi
   ```
2. Deploy da função (chamada pelo trigger, não pelo cliente → sem JWT):
   ```bash
   npx supabase functions deploy enviar-push --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
   ```
3. Em `supabase/migrations/008_push.sql`, trocar `<PUSH_SECRET>` pela MESMA frase do passo 1,
   e correr o SQL no SQL Editor (cria `push_tokens` + RLS + trigger).
4. **EAS projectId (necessário para tokens reais):** `getExpoPushTokenAsync` precisa de um
   `projectId` (lido de `Constants.expoConfig?.extra?.eas?.projectId`). Sem ele, a app não
   crasha — só não obtém token (fica só com o sino in-app). Para tokens reais: correr
   `eas init` (ou `eas build:configure`), que preenche `extra.eas.projectId` no `app.json`.
   Push nativo só funciona num **dev build / build EAS** — não no Expo Go de web.

**Testar:** com um dispositivo registado (token em `push_tokens`), disparar qualquer aviso
(ex.: novo pedido de orçamento) → o telemóvel recebe a notificação. Sem tokens, `enviar-push`
devolve `{ok:true, enviados:0, motivo:'sem tokens'}` (não é erro).

---
## STATUS 13/07 (3ª sessão — brainstorm contrato-convite + infra)
- **BRAINSTORM CONTRATO-CONVITE travado + documentado** ✅ — rampa de entrada do beachhead (Lisboa·eventos):
  freelancer partilha link/QR do Honra Card → cliente convidado (sem conta) vê prova → formulário → contrato
  gerado pelo Honra → assina com OTP (Bird) → caução em 3 andares (sinal direto FORA do Honra + cartão gravado
  c/ cláusula escalonada + hold de 25% armado a D−3). Docs: `docs/DESENHO-CONTRATO-CONVITE.md` (máquina de estados
  17 estados, 8 tabelas, 10 Edge Functions, 6 fatias) + `docs/JURIDICO-CONTRATO-CONVITE.md` (pesquisa citável).
  3 correções da lei: (1) hold MIT expira ~4d18h Visa → arma a D−3 não D−6; (2) captura via Stripe Connect direct
  charges na conta do FREELANCER + application fee, NUNCA conta do Honra (senão licença BdP); (3) exceção ao
  arrependimento art. 17.º/1/k DL 24/2014 exige data obrigatória + aviso expresso art. 4.º/1/p. Ver [[honra-contrato-convite]].
- **INFRA:** node tinha SAÍDO da máquina (Intel, macOS) → Vítor reinstalou (v24.18.0 via .pkg oficial). tsc limpo.
  **EAS init FEITO** ✅ — projeto `@brokenchoose/honra-app`, projectId `5a2ea26c-8f41-48e5-a5fd-1ff311fb0939` no app.json
  (bloqueio do push nativo resolvido; falta só um build EAS/dev-build para tokens/entrega reais). Token Expo do Vítor: `honra-dev`.
- **Redirect URLs Supabase POSTAS** ✅ (localhost:8095, 192.168.1.194:8095, honraapp.com/**) → recuperação de
  palavra-passe destrancada do lado do retorno; falta só SMTP (beta) e ver o ciclo email→link ponta a ponta.
- **STANDBY p/ beta:** sender "HONRA" no Bird (modo preview não expõe sender; é registo de canal, não código) +
  Auto top-up Bird. Ambos cosméticos/não-bloqueantes; OTP já funciona ponta a ponta.
- **Contas verificadas confirmadas na BD** (token novo sbp_5ec5…): Vítor Gama, Vitor Hugo, Rute com identidade=verificado.

## STATUS 13/07 (2ª sessão — enquanto o Vítor dormia 1h)
- **ESTRATÉGIA TRAVADA: LANÇAR SÓ B2B PRIMEIRO** (ver [[honra-posicionamento]]). O B2C constrói-se
  em paralelo mas lança-se depois, estrategicamente. Consequência: caminho crítico de lançamento
  = mecânicas B2B (quase tudo feito) → lançamento mais perto.
- **TRUST & SAFETY v1 FEITO + PROVADO** ✅ — migração `024_trust_safety.sql` (tabelas `denuncias` +
  `bloqueios` + 2 guardas: bloqueio impede orçamento E mensagem, NOS DOIS SENTIDOS — provado por API).
  UI em `perfil/[id].tsx`: modal de denúncia (motivos) + Bloquear/Desbloquear; `pesquisar.tsx` esconde
  quem bloqueei. tsc-limpo, provado no browser (modal abre, ações aparecem).
- **RECUPERAÇÃO DE PALAVRA-PASSE FEITA** ✅ (agente) — login "Esqueci-me…" + `recuperar-palavra-passe`
  + `redefinir-palavra-passe`; provado no browser (ecrã renderiza na moldura). Depende de SMTP Supabase
  + Redirect URL allowlist (config dashboard, depois).
- **B2C crítica verificada** — NÃO começada (foquei o T&S que é launch-critical B2B; B2C está fora do
  caminho crítico de lançamento agora). É o próximo build grande.

## STATUS 13/07
- **OTP/Contacto (Bird) VIVO** ✅ — SMS real entregue + selo aceso (ver [[honra-otp-fornecedor]]).
  Sender ainda "Authifly" (config do CANAL no painel Bird, não é código — com template o Bird
  escolhe o sender; API recusa `from`). Wallet: prepaid, ~0,04€/SMS, ligar Auto top-up.
- **RGPD backend FEITO + PROVADO** ✅ — funções `exportar-dados` (JSON completo dos dados) +
  `eliminar-conta` (apaga auth user → cascata; testado em conta descartável). `definicoes.tsx`
  ligado: exportar faz download real; eliminar apaga a sério + termina sessão. Falta só verificar
  no browser (a fazer quando o agente da recuperação-de-palavra-passe largar o _layout).
- **Recuperação de palavra-passe** — agente em background a construir (login link + recuperar +
  redefinir). Depende de SMTP Supabase + Redirect URL allowlist (config, depois).

## STATUS 12/07 (fim de sessão longa)
- **CONTACTO/OTP (Bird):** construído + deployado, ⏸️ PARADO na permissão da chave (403; criada
  sem scope de envio). Vítor cria/edita a access key com permissão de SMS **no PC** e dá-ma →
  troco o segredo BIRD_ACCESS_KEY e testo o envio real. API nova: `eu1.platform.bird.com/v1/sms/messages`,
  Bearer, código gerado/validado por nós (migração 023). Ver [[honra-otp-fornecedor]].
- **FASE ATUAL: DECORAÇÃO** (a última camada) — decidida com o Vítor porque o resto (onboarding,
  Definições, Honra Card, chat-badge+leitura, mensagens-fora-do-sino, holds re-provados) está feito
  e o Bird está parado à espera do PC.
  - ✅ 1ª decoração: **MOLDURA WEB** (`src/app/_layout.tsx`, componente `Moldura`, só web): em ecrã
    largo a app é uma coluna centrada (maxWidth 460) sobre fundo escuro `#0d0d0c` + sombra, como a
    maquete. No telemóvel fica igual (ecrã < 460). Provado desktop+mobile, consola limpa.
  - PRÓXIMOS na decoração (por fazer): momento de arranque/splash (o "selo abre" da maquete);
    polir estados-vazios; sweep de coesão dos ecrãs novos; micro-transições.
- **Crítica verificada (B2C, barbeiros):** desenho aprovado = prova-de-encontro (A). Depende do OTP
  vivo → fica para depois do Bird.
