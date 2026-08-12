# HONRA — Sistema de Design (fonte de verdade)

> Documento-lei. Os agentes (Fable) que decorarem a app **aplicam** isto, **não reinventam**. Destilado do protótipo (`didit-proto/`), dos princípios do Vítor e do `theme/honra.ts`. Objetivo: uma só língua visual → consistência = feature.

---

## 0. Princípios (as leis)

1. **Mostrar, não dizer.** A confiança prova-se com o visual (selo, credencial), não com texto.
2. **Uma cor, uma função.** Cada cor tem significado; nunca se usa por enfeite.
3. **Verde = significado.** Verificado / avançar / confiança. **Nunca decorativo.**
4. **Gold = brilho de marca E prestígio vivo.** Ver secção 3 — é a lei mais importante e específica do Honra.
5. **Trabalho antes do texto.** O que a pessoa faz vem antes do que escreve sobre si.
6. **Consistência = feature.** Mesmos componentes, mesmos espaços, em todo o lado.
7. **Subtileza.** Elegância discreta > impacto ruidoso. O Honra é sóbrio, sério, para quem vence.

---

## 1. Tokens (átomos) — já em `theme/honra.ts`

**Cores (com função):**
- `verde` #1C5A40, `verdeEscuro` #123C2B, `verdeMaisEscuro` #0B2A1E → **significado** (verificado, avançar, confiança). Fundo da credencial.
- `creme` #F2EDE2, `cremeEscuro` #E7DECB, `brancoCreme` #FBF8F1 → **fundo quente**, cartões.
- `dourado` #C5A45F, `douradoClaro` #E6D2A2 → **brilho de marca + prestígio** (secção 3).
- `tinta` #12211B, `tintaSuave` #5B6B62 → texto.
- `verificado` (=verde), `pendente` #B4B2A9, `erro` #9B3B2E → estados.

**Espaço:** `Espaco.{xs4, sm8, md16, lg24, xl32, xxl48}`.
**Cantos:** `Raio.{sm8, md12, lg16, pill}`.
**Tipografia:** pesos 600/700/800; tamanhos 11–44 (rótulos 11-13, corpo 14-16, títulos 22-28, número-herói 40-44).

---

## 2. Reference screen (padrão-ouro)

`src/app/perfil/[id].tsx` — a **credencial**: faixa verde no topo, avatar de anel dourado, nome + ✓, pills, e o bloco de CONFIANÇA. É a língua a copiar. (Aprovado pelo Vítor 2026-07-10.)

---

## 3. ⭐ PRESTÍGIO — o gold que cresce com o escalão (LEI CENTRAL)

**Regra:** o gold não é fixo. Ele **ganha presença à medida que o perfil sobe de escalão**, e o próprio perfil **enobrece-se** — subtilmente. Não é um crachá que grita; é o "escritório a ficar mais nobre". A elevação no Honra é **reputação**, e o visual **dignifica quem a conquistou**.

**Os 5 escalões (percurso):** `Verificado → Provado → Reconhecido → Referência → Mestre`.

**Como o gold escala (cumulativo e discreto — cada passo ACRESCENTA um detalhe pequeno):**
| Nível | Escalão | Tratamento do gold (subtil) |
|---|---|---|
| 0 | Verificado / Provado | Anel dourado fino e sóbrio. Perfil limpo, sem molduras. O mínimo. |
| 1 | Reconhecido | Anel um pouco mais presente; hairline dourado ténue a separar a credencial. |
| 2 | Referência | Anel duplo fino; ✓ do nome em dourado; detalhe de canto dourado discreto na credencial. |
| 3 | Mestre | Tratamento mais nobre (ainda contido): moldura dourada ténue à volta da credencial + pequeno emblema/monograma dourado. O "escritório mais nobre". |

> **Nunca ruidoso.** Entre um nível e o seguinte a diferença deve ser *sentida*, não *gritada*. Se parecer "bling", está errado.

**Implementação:** `src/theme/prestigio.ts` exporta:
- `nivelDeCredencial(perfil) → 0..3` (deriva o escalão; por agora de `indice_confianca` + nº de verificações verdes + projetos confirmados; limiares afináveis).
- `estiloPrestigio(nivel) → { anel, moldura, acentoNome, emblema, ... }` — o config visual que os componentes consomem.
Os componentes (Credencial, Selo, Avatar) **leem o prestígio** e aplicam o tratamento. Assim a lei fica no código, não à mercê de interpretação.

---

## 4. Catálogo de componentes (`src/components/ui/`) — a construir

Cada um é **código real reutilizável**; todos os ecrãs importam daqui (consistência imposta pelo código).

- **`Credencial`** — a faixa verde do perfil: avatar (com prestígio), nome+✓, papel, pills. Lê `estiloPrestigio`.
- **`Avatar`** — iniciais/imagem, anel dourado modulado pelo prestígio.
- **`Selo`** — as 4 abas de verificação (✓ verde / 🔒 por verificar).
- **`Confianca`** — bloco do índice: número-herói + estrelas + nº avaliações.
- **`Chip`** — categoria / filtro (ativo/inativo).
- **`Botao`** — `primario` (verde cheio), `secundario` (outline verde), com estados.
- **`Cartao`** — cartão branco-creme com borda (base de listas/blocos).
- **`Pill`** — etiquetas pequenas (Empresa, Disponível, escalão).
- **`Avaliacao`** — estrelas + comentário + autor.
- **`Estado`** — carregar / vazio / erro (já existe em `components/Estado.tsx`; mover/alinhar).
- **`Campo`** — inputs de texto.

---

## 5. Como os agentes Fable usam isto

1. Importar sempre de `src/components/ui/` — **nunca** re-estilizar do zero num ecrã.
2. Respeitar tokens e as 7 leis (secção 0).
3. Aplicar o prestígio via `estiloPrestigio` onde houver perfil/credencial.
4. Cada agente pega num ecrã; todos falam esta língua → sem frankenstein.
5. Loop de verificação: cada resultado é confirmado por screenshot antes de assentar.
