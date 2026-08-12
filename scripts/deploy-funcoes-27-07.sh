#!/usr/bin/env bash
# HONRA — Redeploy das Edge Functions tocadas em 27/07 (vistoria + pagamento-na-entrega).
# A flag --no-verify-jwt está CERTA em cada função (lida do cabeçalho de cada uma):
#   · sem flag  = função chamada pela APP com o JWT do utilizador.
#   · com flag  = função PÚBLICA (convidado sem conta) ou chamada por CRON/manual.
# Deployar com a flag errada PARTE a função — por isso estão separadas.
#
# Antes de correr:  export SUPABASE_ACCESS_TOKEN=<o teu token sbp_… FRESCO>
set -e
cd "$(dirname "$0")/.."
REF=haqynnhstjgzgtnnwqsi

# NOTA: entrega-decidir/entrega-pagamento NÃO entram aqui — são da sessão do
# pagamento-na-entrega e já estão online; cada sessão deploya as suas.
echo "▶ JWT normal (chamadas pela app):"
for f in aperto-agir agir-checkpoint convite-decidir exportar-dados; do
  echo "  · $f"
  npx supabase functions deploy "$f" --project-ref "$REF"
done

echo "▶ Públicas / cron (sem verificação de JWT):"
for f in convite-formulario convite-otp convite-checkpoint convite-cancelar convite-cartao convite-comparencia resolver-caucoes resolver-convites; do
  echo "  · $f"
  npx supabase functions deploy "$f" --project-ref "$REF" --no-verify-jwt
done

echo "✓ Deploy concluído. A seguir: colar supabase/cron-purga-convidados.sql e confirmar o cron do resolver-convites."
