/**
 * HONRA — CHAMAR UMA EDGE FUNCTION E OUVIR O QUE ELA RESPONDEU.
 *
 * ── O PROBLEMA QUE ISTO RESOLVE ──────────────────────────────────────────
 * O cliente do Supabase, quando uma Edge Function responde com estado de erro,
 * NÃO põe a razão no `error.message` — põe lá um genérico ("Edge Function
 * returned a non-2xx status code") e guarda a resposta real em `error.context`,
 * que é um `Response` por ler. Quem escrever o óbvio
 *
 *     const { data, error } = await supabase.functions.invoke('x', { body });
 *     if (error) setErro('Não foi possível.');
 *
 * está a deitar fora a única frase que explicava o que aconteceu — e a app
 * passa a mentir por omissão a quem está do outro lado.
 *
 * ── O QUE ISTO CUSTOU (01/08) ────────────────────────────────────────────
 * Criar um grupo falhava com "Precisas da identidade verificada", mostrado a
 * quem tinha as quatro abas verdes. A mensagem era fixa no cliente; o servidor
 * dizia outra coisa completamente diferente (era uma leitura recusada por RLS,
 * ver migração 079). Meia hora a perseguir um problema de identidade que não
 * existia, porque a app não repetiu o que o servidor lhe disse.
 *
 * Uma vistoria contou 48 chamadas assim e apenas 3 a ler o `context` — e essas
 * 3 usavam uma cópia privada, enterrada no `projeto.tsx`, que mais ninguém
 * podia importar. É por isso que isto vive aqui, no `lib`: um remédio que não
 * está à mão de todos não é um remédio, é uma exceção.
 *
 * ── COMO SE USA ──────────────────────────────────────────────────────────
 *     const { data, erro } = await invocarFuncao('convite-pagina', { perfil }, t('x.erro'));
 *     if (erro) return setErro(erro);   // já é a razão do servidor, ou o teu fallback
 *
 * `erro` é `null` quando correu bem, e uma frase PRONTA A MOSTRAR quando não.
 * Nunca devolve o genérico do Supabase: ou a razão real, ou o fallback que
 * quem chama escolheu (esse sim, na língua da pessoa).
 */
import { supabase } from './supabase';

export type Resposta<T> = { data: T | null; erro: string | null };

/**
 * A razão REAL de uma Edge Function falhada. O corpo vem em `error.context`
 * (um `Response`), que pode ser JSON `{ error }` ou texto simples.
 */
export async function razaoDoServidor(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context as
    | { text?: () => Promise<string>; json?: () => Promise<unknown> }
    | undefined;
  if (!ctx) return null;

  // O CORPO LÊ-SE UMA VEZ SÓ. Um `Response` gasta-se na primeira leitura: a
  // versão anterior chamava `json()` e, se falhasse, tentava `text()` — que
  // rebentava sempre por o corpo já ter sido consumido. Uma função que
  // respondesse em texto cru ficava sem voz, e foi um teste que o apanhou.
  // Agora lê-se o texto e é dele que se tenta o JSON.
  let bruto: string;
  try {
    bruto = (await ctx.text?.())?.trim() ?? '';
  } catch {
    return null;
  }
  if (!bruto) return null;

  try {
    const corpo = JSON.parse(bruto) as { error?: unknown; message?: unknown };
    const razao = corpo?.error ?? corpo?.message;
    if (typeof razao === 'string' && razao.trim()) return razao.trim();
    // JSON válido mas sem razão nenhuma lá dentro — o fallback da casa serve
    // melhor do que despejar o objeto em bruto no ecrã.
    return null;
  } catch {
    // Não era JSON: fica o texto simples, se for uma frase e não uma página.
    // Um 502 do gateway devolve HTML, e HTML não é uma frase para mostrar.
    return bruto.length <= 300 && !bruto.startsWith('<') ? bruto : null;
  }
}

/**
 * Chama a função e devolve a razão já legível. `fallback` é o que se mostra
 * quando o servidor não explicou nada (rede em baixo, 502, corpo vazio) — deve
 * vir do i18n, porque é a única parte desta frase que a casa controla.
 */
export async function invocarFuncao<T = unknown>(
  nome: string,
  body: Record<string, unknown>,
  fallback: string
): Promise<Resposta<T>> {
  const { data, error } = await supabase.functions.invoke(nome, { body });

  if (error) return { data: null, erro: (await razaoDoServidor(error)) ?? fallback };

  // Recusa educada: a função respondeu 200 mas com `{ error: "..." }` no corpo.
  // Várias das nossas fazem-no (é a forma de dizer "não" sem gastar um estado
  // HTTP), e quem chama tinha de se lembrar de espreitar lá — metade lembrava-se,
  // metade não. Aqui a distinção deixa de existir: quem chama recebe SEMPRE a
  // razão no mesmo sítio, venha ela do estado ou do corpo.
  const corpo = data as { error?: unknown } | null;
  if (typeof corpo?.error === 'string' && corpo.error.trim()) {
    return { data: (data ?? null) as T | null, erro: corpo.error.trim() };
  }

  return { data: (data ?? null) as T | null, erro: null };
}
