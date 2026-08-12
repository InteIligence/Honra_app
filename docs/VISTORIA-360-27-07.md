# VISTORIA 360° AO HONRA — 27/07/2026

> Três auditores independentes, lentes complementares, read-only: **Segurança & integridade**, **Coerência do ciclo & regras de negócio**, **App / UX / i18n**. Consolidado e sem duplicados. Os achados que a [VISTORIA-CICLO-27-07](VISTORIA-CICLO-27-07.md) (E2E ao vivo) já cobriu não se repetem; estes estão por baixo ou ao lado.
>
> Legenda: **[SEG]** segurança · **[CICLO]** lógica · **[UX]** experiência. **BUG** = o código não faz o que a lei diz · **DECISÃO** = falta o Vítor decidir · **DEPLOY** = confirmar no ambiente vivo. ✅ = verificado por mim no código.

---

## 🔴 CRÍTICO

### 1. [CICLO · BUG ✅] O profissional pode ficar com a honra e trancar a crítica
O fim do ciclo `honrado → entregue → concluido` não tem resolver. Ao agregar os checkpoints, o negócio vai a `honrado` e **ambos ganham +1 negócio honrado + a Confiança sobe** ([048:199-201](../supabase/migrations/048_escada_suspensao.sql)). Mas a **avaliação só abre em `concluido`** ([037:31](../supabase/migrations/037_avaliacao_unidirecional.sql)), que exige o profissional marcar `entregue` (gesto manual, [projeto.tsx](../src/lib/projeto.tsx) `marcarEntregue`) — e **nenhum cron avança o tail** ([resolver-caucoes](../supabase/functions/resolver-caucoes/index.ts) só trata `aceite` e `selado`), `cancelar-mutuo` só existe em `selado`.
- **Exploração:** prevendo má crítica, o profissional nunca toca "entregue". Fica em `honrado` para sempre — com a honra contada e o cliente **sem nunca poder avaliar**. A crítica (o fosso do produto) é sabotável pela própria máquina de estados.
- **Correção:** fundir a entrega final no último checkpoint (`honrado` = fim) OU pôr resolver com prazo no tail (auto-conclusão por silêncio informado) **e** abrir a avaliação a partir de `honrado`.

### 2. [SEG · RISCO SISTÉMICO ✅] Fosso repo↔BD viva sem guardrail — já causou regressões críticas
As migrações [044](../supabase/migrations/044_drift_avaliacoes_leitura.sql) e [043:266](../supabase/migrations/043_fuga_c_sockpuppets.sql) **provam** que a BD real já esteve com regressões por aplicação manual parcial: `verif_dono_tudo` presente (o dono **auto-verificava a identidade** — furava a blindagem toda), `avaliacoes` bidirecional, avaliações por revelar expostas. Repostas à mão. As migrações correm uma a uma no SQL Editor sem forma de afirmar que a RLS viva == repo.
- **Porque importa:** toda a garantia da auditoria estática assenta em repo == BD. O histórico mostra que não esteve — e uma regressão de RLS aqui reabre a forja de selos, que é o produto inteiro.
- **Correção:** script de verificação pós-deploy (dump de `pg_policies` + triggers + `storage.buckets` comparado ao repo); a prazo, migrar para `supabase db push` versionado.

### 3. [CICLO · BUG ✅] Checkpoint contestado não tem resolução automática — congela para sempre
Contestar põe o checkpoint em `contestado` ([agir-checkpoint:216](../supabase/functions/agir-checkpoint/index.ts)); a agregação deixa o orçamento em `selado` ([047:258](../supabase/migrations/047_checkpoints_orcamento.sql)); o resolver **nunca** processa `contestado` ([resolver-caucoes:197](../supabase/functions/resolver-caucoes/index.ts)). Só `checkpoint-disputa` (admin manual) resolve.
- **Cenário:** o cliente contesta, o admin (Vítor, solo) ausenta-se → negócio preso, anúncio `a_decorrer`, reputação em suspenso, sem SLA. A fatia E (convite) tem `disputa_arquivada` automática; o fluxo interno não tem equivalente.
- **Correção:** relógio na contestação interna (N dias sem decisão → arquiva/reabre) ou, no mínimo, painel + alerta garantidos.

### 4. [CICLO · BUG ✅] A primeira falha fecha o orçamento; a culpa "ambos" depende do calendário
`avaliar_checkpoints_orcamento` ([047:241](../supabase/migrations/047_checkpoints_orcamento.sql)) fecha `incumprido` + `quem_falhou` à **primeira** falha, com outros checkpoints por resolver.
- **Cenário A:** dois checkpoints falham em dias diferentes → a corrida do 1º marca só um lado (`'b'`); o 2º já não é processado. Se os prazos coincidissem, marcaria `'ambos'`. A atribuição de culpa depende de coincidência de calendário.
- **Cenário B:** um checkpoint contestado (em revisão) + outro falha → fecha `incumprido` já; quando o admin resolver o contestado, a decisão fica inócua (orçamento já não é `selado`) mas a marca/escada já dispararam.
- **Correção:** só declarar `incumprido` quando nenhum checkpoint está `pendente/entregue/contestado`, somando todas as culpas de uma vez (aí `'ambos'` é determinístico).

### 5. [UX · BUG ✅] `chat.tsx` engole o erro e mostra "sem conversas" — mente sobre os dados
[chat.tsx:48-66](../src/app/(tabs)/chat.tsx) faz `.then(({ data }) => …)` sem olhar para `error`. Numa falha de rede/RLS, mostra o estado vazio ("ainda não tens conversas"). Num produto cuja lei é "a pill nunca mente", faz um profissional crer que nenhum cliente lhe falou — pode custar negócio. Mesmo padrão silencioso em ~43 queries que só destructuram `{ data }`.
- **Correção:** destructurar `{ data, error }` e mostrar `<Erro>` (já existe) em vez do vazio.

### 6. [SEG · ABERTO] Fuga A: apagar+recriar renasce a reputação após a suspensão expirar
[eliminar-conta:41-52](../supabase/functions/eliminar-conta/index.ts) só recusa o apagamento enquanto a suspensão está viva. Conta nunca suspensa (marcas < 2) ou com suspensão expirada apaga-se e renasce limpa; `criar-verificacao` cria nova sessão Stripe sem consultar hash de documento nem denylist.
- **Nota:** é o fosso central ("a honra segue a pessoa"), conhecido e dependente do parecer jurídico (Q10-A) — listado para não fingir que está resolvido.
- **Correção:** hash irreversível do documento numa tabela que sobrevive ao apagamento + denylist; decisão jurídica de retenção por interesse legítimo.

---

## 🟠 IMPORTANTE

### 7. [SEG · BUG ✅] Buckets de storage sem limite de tamanho nem de MIME
Todos os buckets nascem só com `(id, name, public)`. O único teto (60 MB no portfolio, [059:104](../supabase/migrations/059_video_portefolio.sql)) está num `exception when others` que avisa-e-segue → pode não aplicar.
- **Cenário:** nos buckets **públicos** (`avatares`, `portfolio`), SVG/HTML servido inline = **XSS armazenado** na origem de storage; hosting arbitrário grátis; DoS de armazenamento sem teto.
- **Correção:** `file_size_limit` + `allowed_mime_types` na criação de cada bucket (à mão no Dashboard onde o ALTER for bloqueado).

### 8. [SEG · BUG ✅] `convite-formulario` (público) sobrescreve o registo de cliente entre profissionais
Função pública (`--no-verify-jwt`) faz upsert por telefone sobrescrevendo `nome`/`email` ([convite-formulario:102](../supabase/functions/convite-formulario/index.ts)); `clientes_convidados` é único por telefone.
- **Cenário:** qualquer um (sem conta) submete o formulário com o telefone de um cliente que já existe (de outro profissional) → reescreve o nome/email da linha partilhada (que o outro profissional vê no contrato) e cria um contrato falso na fila dele. Agrava a fuga K (smishing) com corrupção de dados cross-tenant.
- **Correção:** registo de cliente por-contrato (ou dedup só dentro do mesmo profissional); nunca sobrescrever nome/email de uma linha existente por submissão nova.

### 9. [SEG · RGPD] PII de convidados sem apagamento nem TTL
`clientes_convidados` (nome/telefone/email em claro), `otp_convidado`, `eventos_convite` (IP, user-agent, telefone, nome no payload) acumulam indefinidamente. `eliminar-conta` só apaga `auth.users` — estes titulares nunca tiveram conta e não têm como exercer o apagamento (art. 17). Assimetria com o telefone hasheado dos utilizadores internos (022).
- **Correção:** TTL/purga após estado terminal, erasure a pedido do convidado, minimização (hash do telefone onde o SMS já não é preciso).

### 10. [SEG · BUG] `CONVITE_MODO_TESTE=1` colapsa a autenticação do contrato-convite
Com a env var a `1`, `convite-otp`/`convite-decidir`/`convite-checkpoint`/`convite-comparencia` devolvem OTP e magic links no corpo HTTP, ignorando o SMS. Um flip torna assináveis/cobráveis contratos por qualquer um; sem amarração runtime a um project-ref de teste.
- **Correção:** ligar o modo-teste ao project-ref/URL (nunca no ref de produção) ou remover o retorno de segredos fora de localhost.

### 11. [CICLO · DECISÃO] Duas modelações divergentes da "entrega final" + checkpoint default duplica o tail
`aperto-agir:156` cria um checkpoint default "Entrega do trabalho" se não houver nenhum; `projeto/[id].tsx` mostra "APRESENTAÇÃO FINAL" (=`orc.prazo`) e diz "Não é um checkpoint". Resultado: sem checkpoints, o cliente confirma a entrega **duas vezes** (o checkpoint default + o tail); com checkpoints, a entrega final é o tail. A "entrega final" é ora checkpoint, ora tail.
- **Correção:** escolher **um** lugar para a entrega final (liga-se ao ponto 1).

### 12. [CICLO · BUG] Selar sem prazo cria um relógio oculto de 6 dias
Não há guarda a exigir prazo no selo; sem prazo, o resolver marca o profissional como incumprido `selado + 6 dias` ([resolver-caucoes:209](../supabase/functions/resolver-caucoes/index.ts)) — sem que "6 dias" apareça em lado nenhum. Contradiz "informada, nunca emboscada" (047 decisão 3).
- **Correção:** exigir prazo no selo (a par da decisão pendente da 062 sobre exigir valor) ou mostrar o prazo-por-omissão antes de aceitar.

### 13. [CICLO · BUG] O checkpoint default é criado best-effort, fora da transação do selo
`aperto-agir:162` faz o insert sem verificar erro, em statement separado do update do selo. Se falhar, o negócio fica `selado` com 0 checkpoints → a app mostra a UI **legada** e o resolver corre o **caminho legado** (dia 6). Dois motores para negócios idênticos, ao sabor de um insert.
- **Correção:** verificar o erro e falhar o selo, ou criar o checkpoint na mesma transação (trigger ao entrar em `selado`).

### 14. [CICLO · DEPLOY] O cron do `resolver-convites` pode não estar agendado — a fatia E inteira depende dele
`cron-resolver-convites.sql` existe, mas o ACORDAR.md só lista `honra-resolver-caucoes` como ativo. Se o de convites nunca foi agendado, **nada** da fatia E se move (armar holds, ghost do checkpoint, dunning, captura-por-silêncio). Todo o motor de consequência assenta em crons diários.
- **Correção:** confirmar `select jobname, active from cron.job`; alarme de "não correu" nos dois crons.

### 15. [UX · CROSS-LENS] As "3 vozes de erro" — erros crus chegam ao utilizador
Confirmado por duas lentes (segurança e UX) e já anotado no E2E. `login.tsx:44`, `registo.tsx:61`, `editar-perfil.tsx:240` mostram `error.message` do Supabase (inglês/técnico: "Invalid login credentials"). As guardas só-BD vazam Postgres cru (candidatura duplicada, RLS da avaliação); as que passam por função têm frase de negócio — mas só em PT (utilizador EN recebe PT).
- **Correção:** mapear os casos de auth conhecidos para chaves i18n; nunca deixar `.message` como texto primário; a prazo, traduzir as frases das Edge Functions.

### 16. [UX · BUG] O `Botao` base não tem acessibilidade — e passa por ele a app inteira
[Botao.tsx:38](../src/components/ui/Botao.tsx) sem `accessibilityRole="button"` nem estado desativado/ocupado. Um leitor de ecrã não anuncia "botão" nem "desativado" durante `aCarregar`. Um ficheiro, corrige a app toda.
- **Correção:** `accessibilityRole="button"` + `accessibilityState={{ disabled, busy }}`.

### 17. [UX · BUG] Envio de mensagem falha em silêncio
[conversa/[id].tsx:61](../src/app/(tabs)/conversa/[id].tsx) — `enviar()` devolve `false` em erro e não mostra nada; o balão não aparece, sem explicação.
- **Correção:** `<Erro>` ou banner ("Não foi possível enviar").

---

## 🟡 MENOR / DECISÃO / HIGIENE

- **[SEG ✅]** `perfis_leitura_publica using(true)` ([schema.sql:70](../supabase/schema.sql)) expõe a anónimos **todas** as colunas: `nif` (PII), `is_admin` (enumerar admins para atacar a moderação), `semente` (mina "pessoas reais"), `suspenso_ate`. → montra por **view** de colunas escolhidas, base restrita ao próprio/servidor.
- **[SEG]** Insert em `perfis` não defende `is_admin`/reputação (só verifica `uid=id`; a guarda é BEFORE UPDATE). → `with check` a fixar `is_admin=false` e contadores a 0.
- **[SEG · RGPD]** `exportar-dados` incompleto (falta infrações, contactos, denúncias, checkpoints, contratos-convite, candidaturas, trabalhos, push_tokens).
- **[CICLO · DECISÃO]** Escalão do contratante é incomputável: exige avaliações recebidas, mas o contratante nunca as recebe (037) → fica Verificado para sempre. A lei "5 ranks nos 2 carris" não está ligada.
- **[CICLO · DECISÃO]** Confiança (cumulativa, sem decay) vs Escalão (com decay 6 meses) contam histórias opostas: um ex-Mestre inativo mostra "Verificado · 95%".
- **[CICLO · HIGIENE]** Estado `em_curso` sem produtor mas com peso em 060/061/`umaPastaPorPar` (empata com `selado` na colisão de pastas). → documentar como legado ou remover.
- **[CICLO/RLS]** `orc_partes_atualizam` sem `with check` ([schema.sql:99](../supabase/schema.sql)): `trabalho_id` não é protegido por guarda → uma parte pode re-apontar um negócio selado para outro anúncio (quebra 058/061).
- **[UX]** Falta `+not-found.tsx` com marca (URL inválido na web → ecrã cru do Expo); `router.back()` encrava em modais/deep-link na web (usar `replace('/inicio')` como fallback); avisos sem destino = toque morto; código-morto do template Expo (cores azuis fora dos tokens); token `erroSuave` em falta (cor `#F6E4E0` à mão); ~99/125 `Pressable` sem rótulo a11y (dói nos só-símbolo: enviar, estrelas de avaliação); marca `Honra` vs wordmark `honra.` em `pago.tsx`; sem pull-to-refresh em lado nenhum.

---

## O QUE ESTÁ BEM (crédito devido)
- **Segurança de base madura:** escrita reservada ao servidor em todas as tabelas sensíveis; webhooks Stripe verificam assinatura; OTP com hash+validade+throttle+apagamento; autorização por dono em cada função; sem segredos no git. As 3 fugas críticas do red-team (**C sockpuppets, D marca por inação, E checkpoint-convite**) estão **genuinamente fechadas**.
- **i18n exemplar:** 1075 chaves, paridade PT/EN **perfeita**, 0 órfãs, 0 duplicadas, ~0 texto hardcoded (imposto pelo tipo `keyof typeof pt`).
- **Design-system real:** componentes `ui/` reutilizados em todo o lado, `estiloPrestigio` a modular o gold pela lei §3, `Estado.tsx` a unificar carregar/vazio/erro. A lei "uma interação por negócio" está genuinamente respeitada no Início.
- **Espinha do ciclo sólida:** pedido→aceite→selado→checkpoints→agregação com o anúncio a seguir o aperto, automação sem gestos redundantes. 0 rotas partidas na app.

---

## VEREDITO E ORDEM SUGERIDA
A fundação é séria — a fraqueza não está no desenho central, está nas **pontas que não fecham** e nas **superfícies periféricas**. Ordem que eu recomendo:

1. **Aplicar 060/061/062** (já construídas — fecham as críticas da 1ª vistoria).
2. **Fechar o tail do ciclo (nº1)** — é a ferida que trai a promessa do produto.
3. **Guardrail de drift (nº2)** — dá valor a tudo o resto; sem ele, nada é garantido.
4. **Contestação e agregação (nº3, nº4)** — determinismo da culpa e fim dos becos sem saída.
5. **Superfícies periféricas de segurança (nº7–10)** — buckets, upsert cross-tenant, PII, modo-teste.
6. **Passe de UX (nº5, 15, 16, 17)** — falhas silenciosas + voz do erro + a11y do Botão.
7. **Decisões de produto (🟡)** — para o Vítor, não são código.
