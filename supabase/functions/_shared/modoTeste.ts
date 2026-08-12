// HONRA — Modo-teste seguro (063 · #10 segurança).
//
// O modo-teste revela OTPs e magic-links no corpo HTTP (para conduzir fluxos de
// contrato-convite sem SMS real). Antes bastava `CONVITE_MODO_TESTE=1` — um
// único flip de env var em produção tornava assináveis/cobráveis contratos por
// qualquer um. Agora exige DUAS coisas ao mesmo tempo:
//   1) CONVITE_MODO_TESTE = '1'
//   2) MODO_TESTE_REF = o project-ref EXATO deste ambiente (o subdomínio de
//      SUPABASE_URL). Assim um `CONVITE_MODO_TESTE=1` esquecido/copiado para o
//      ambiente de produção (project-ref diferente) NÃO revela nada.
//
// Para testar em DEV: pôr as duas — `CONVITE_MODO_TESTE=1` e
// `MODO_TESTE_REF=<ref-de-dev>` (o subdomínio antes de .supabase.co).
export function modoTeste(): boolean {
  if ((Deno.env.get('CONVITE_MODO_TESTE') ?? '') !== '1') return false;
  const refPin = (Deno.env.get('MODO_TESTE_REF') ?? '').trim();
  if (!refPin) return false; // sem pin explícito do ref, nunca liga
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  const refAtual = m?.[1] ?? '';
  return refAtual !== '' && refAtual === refPin;
}
