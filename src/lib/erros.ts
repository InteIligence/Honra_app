/**
 * HONRA — a voz do erro (063 · #15). Os erros do Supabase Auth chegam em
 * inglês e técnicos ("Invalid login credentials"). Aqui traduzem-se para a
 * língua do Honra, uma vez, num sítio só. Tudo o que não reconhecemos cai num
 * genérico digno — nunca a `.message` crua no ecrã.
 *
 * IRMÃO DESTE: `lib/funcoes.ts`. Aqui é o VOCABULÁRIO do Auth (traduzir o que
 * o Supabase diz); lá é OUVIR as Edge Functions (a razão real vem em
 * `error.context` e não no `error.message`, e quase ninguém a lia). Se andas
 * atrás de "porque é que a app mostrou um erro genérico", é num destes dois.
 */
import type { ChaveI18n, TFn } from '@/i18n';

type ComMensagem = { message?: string } | null | undefined;

// Assinaturas conhecidas do Supabase Auth → chave i18n. A ordem importa: a
// primeira que casar ganha (as mais específicas primeiro).
const PADROES: { casa: RegExp; chave: ChaveI18n }[] = [
  { casa: /invalid login credentials/i, chave: 'erro.credenciais' },
  { casa: /email not confirmed/i, chave: 'erro.email_por_confirmar' },
  { casa: /user already registered|already been registered/i, chave: 'erro.email_usado' },
  { casa: /password should be at least|password.*too short|at least 6/i, chave: 'erro.pass_curta' },
  { casa: /unable to validate email|invalid format|invalid email/i, chave: 'erro.email_invalido' },
  { casa: /for security purposes|rate limit|too many requests|over_email_send_rate/i, chave: 'erro.demasiadas' },
  { casa: /network|failed to fetch|timeout/i, chave: 'erro.rede' },
  { casa: /same.*password|new password should be different/i, chave: 'erro.pass_igual' },
];

/**
 * Traduz um erro de auth para uma frase humana. `fallback` é a chave a usar
 * quando a mensagem não casa com nenhum padrão conhecido.
 */
export function mensagemAuth(erro: ComMensagem, t: TFn, fallback: ChaveI18n = 'erro.generico'): string {
  const msg = erro?.message ?? '';
  for (const p of PADROES) {
    if (p.casa.test(msg)) return t(p.chave);
  }
  return t(fallback);
}
