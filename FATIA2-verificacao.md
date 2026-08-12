# HONRA — Fatia 2: Verificação (Stripe Identity)

Objetivo: tocar "Verificar identidade" na app → Stripe pede documento + selfie →
quando aprova, a aba **Identidade** do selo acende a **verde**.

## O que JÁ está construído (feito enquanto dormias)
- **App:** botão "Verificar identidade" no Perfil (`src/app/(tabs)/perfil.tsx`).
- **Servidor (Supabase Edge Functions):**
  - `supabase/functions/criar-verificacao/` — pede a sessão ao Stripe.
  - `supabase/functions/stripe-webhook/` — recebe o resultado e acende a aba.

## O que falta (amanhã, ~10 min, eu guio-te ao vivo)

### 1. No Stripe (modo teste) — cliques teus
- **Ativar o Identity:** dashboard → procurar "Identity" → ativar (em teste é imediato).
- **Copiar a chave secreta de teste:** Developers → API keys → **Secret key** (`sk_test_...`).

### 2. No terminal — comandos (eu corro contigo)
```
export PATH="$HOME/.local/nodejs/bin:$PATH"
cd ~/honra-app
npx supabase login                 # abre o browser para autorizares (passo teu)
npx supabase link --project-ref haqynnhstjgzgtnnwqsi
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_XXX
npx supabase functions deploy criar-verificacao
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

### 3. Ligar o webhook do Stripe — cliques teus
- Copiar o URL da função `stripe-webhook` (aparece no deploy).
- Stripe → Developers → Webhooks → Add endpoint → colar o URL.
- Eventos a ouvir: `identity.verification_session.verified` (e `...requires_input`).
- Copiar o **Signing secret** (`whsec_...`) → guardar como segredo:
  ```
  npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXX
  npx supabase functions deploy stripe-webhook --no-verify-jwt
  ```

### 4. Testar
- Na app → Perfil → "Verificar identidade" → completa com os **documentos de teste do Stripe** (fornecidos, falsos).
- A aba **Identidade** passa a **verde**. 🟢

> Segurança: o `sk_test_` e o `whsec_` são de TESTE e vivem só como segredos no Supabase (nunca na app). Podes rolá-los quando quiseres.
