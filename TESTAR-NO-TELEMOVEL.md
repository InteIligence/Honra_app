# Testar o Honra no telemóvel 📱

Há **dois caminhos**. O A funciona **já hoje**, sem contas nem builds. O B é para
testar o **push nativo** (só compensa depois do `eas init` + login Expo).

---

## Caminho A — a app inteira no telemóvel, HOJE (web na Wi-Fi)

Testa tudo (contas, perfil, caução, mural, chat, avisos com o sino em tempo real).
**Não** testa o push nativo (banner com a app fechada) — para isso é o Caminho B.

**Pré-requisito:** o telemóvel e o Mac na **mesma rede Wi-Fi**. O Mac tem de ficar ligado.

1. No Mac, na pasta `~/honra-app`, gera a build e serve-a (o servidor já aceita ligações da rede):
   ```bash
   export PATH="$HOME/.local/nodejs/bin:$PATH"
   npx expo export -p web
   python3 scripts/serve-dist.py 8095
   ```
2. No telemóvel, abre o **Safari/Chrome** e vai a:
   ```
   http://192.168.1.194:8095
   ```
   (Este é o IP do Mac agora. Se mudar de rede, redescobre com `ipconfig getifaddr en0`.)
3. Entra com uma das contas de teste (as duas já têm identidade verificada e já
   honraram um negócio juntas):
   - **cliente@teste.app** · `honra2026` (cliente / "tó")
   - **vitor.gama@honra.app** · `honra2026` (freelancer verificado)

> Para testares os **dois toques** a sério, usa **dois telemóveis** (ou um telemóvel +
> o Mac), cada um com uma conta. Cartão de teste do Stripe: `4242 4242 4242 4242`,
> validade futura qualquer, CVC qualquer. O dinheiro é **segurado, não cobrado**.

**Dica "app a sério":** no Safari, Partilhar → *Adicionar ao ecrã principal* dá-te um
ícone e abre em ecrã cheio, sem barra do browser — quase indistinguível da app nativa.

---

## Caminho B — build nativo para o PUSH nativo (precisa de conta Expo)

O push nativo (notificação com a app fechada) **não funciona em web** — só num *dev build*
ou build EAS num telemóvel real. Passos (fazes tu, precisa do teu login Expo):

1. Login e inicialização (cria o `projectId` no `app.json`):
   ```bash
   export PATH="$HOME/.local/nodejs/bin:$PATH"
   npx eas login          # a tua conta Expo
   npx eas init           # preenche extra.eas.projectId
   ```
2. Build de desenvolvimento para iOS (ou Android):
   ```bash
   npx eas build --profile development --platform ios
   ```
   (O `eas.json` já está criado com o perfil `development`.)
3. Instala o dev build no telemóvel (o EAS dá um QR/link), abre-o, faz login, e
   **aceita as notificações** quando a app pedir → o token fica em `push_tokens`.
4. Dispara um aviso (ex.: pede um orçamento a partir da outra conta) → o telemóvel
   recebe a notificação mesmo com a app fechada.

> Antes disto funcionar do lado do servidor, é preciso aplicar a migração `008_push.sql`,
> pôr o segredo `PUSH_SECRET` e fazer deploy da função `enviar-push` — ver o runbook em
> `PUSH-RUNBOOK.md` (precisa de um token Supabase fresco).
