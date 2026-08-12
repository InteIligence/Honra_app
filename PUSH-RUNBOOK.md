# Push nativo — runbook de ativação

O código do push já existe (fase 2, feita há dias): migração `008_push.sql` (tabela
`push_tokens` + trigger que chama a função a cada aviso novo), função `enviar-push`
(fala com a Expo Push API), e o cliente `src/lib/push.tsx` (regista o token do
dispositivo). Falta **ligar** — 4 passos, precisa de um **token Supabase fresco**
(`sbp_...`) e do teu **login Expo**.

## 1) Segredo da função
```bash
export SUPABASE_ACCESS_TOKEN=<sbp_... fresco>
cd ~/honra-app
npx supabase secrets set PUSH_SECRET=<frase-longa-aleatoria> --project-ref haqynnhstjgzgtnnwqsi
```

## 2) Deploy da função (é chamada por um trigger, não pelo cliente → sem JWT)
```bash
npx supabase functions deploy enviar-push --project-ref haqynnhstjgzgtnnwqsi --no-verify-jwt
```

## 3) Migração — cria `push_tokens` + o trigger
Em `supabase/migrations/008_push.sql`, troca `<PUSH_SECRET>` pela MESMA frase do passo 1,
e corre o SQL no **SQL Editor** do Supabase.

## 4) Token do dispositivo (precisa de dev build — ver `TESTAR-NO-TELEMOVEL.md`, Caminho B)
`getExpoPushTokenAsync` precisa do `projectId` do EAS (`npx eas init`) e de correr num
**dev build / build EAS** num telemóvel real. Na web e no Expo Go não regista token —
a app não crasha, fica só com o sino in-app.

## Testar
Com um dispositivo registado (linha em `push_tokens`), dispara qualquer aviso (ex.: a
outra conta pede-te um orçamento) → o telemóvel recebe a notificação mesmo com a app
fechada. Sem tokens, `enviar-push` responde `{ok:true, enviados:0, motivo:'sem tokens'}`
(não é erro).

> ⚠️ Roda/apaga o token Supabase depois de usares (Account → Access Tokens).
