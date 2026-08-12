# HONRA — a app real (esqueleto)

Este é o **esqueleto real** da app Honra: Expo (React Native) + Supabase.
Não é o protótipo HTML — é a app a sério, ligada a um cérebro.

## O que já está construído (Fatia 1 — Conta + Perfil)
- **Registo** e **login** reais (Porteiro = Supabase Auth).
- **Perfil real** guardado na base de dados (não inventado).
- **Selo** com as 4 abas (por agora a cinzento — acendem na Fatia 2).
- Base de dados desenhada: gavetas `perfis`, `verificacoes`, `orcamentos` (ver `supabase/schema.sql`).

## Passos para o pôr a funcionar (≈15 min, uma vez)

### 1. Criar o cérebro (Supabase)
1. Vai a **supabase.com** → cria conta → **New project** (grátis).
2. Dá-lhe um nome (ex.: `honra`), define uma password de base de dados e escolhe a região **West EU**.
3. Quando abrir, vai a **Project Settings → API** e copia:
   - **Project URL**
   - **anon public key**

### 2. Ligar a app ao cérebro
Abre o ficheiro **`.env`** (nesta pasta) e cola:
```
EXPO_PUBLIC_SUPABASE_URL=<a tua Project URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<a tua anon public key>
```

### 3. Criar as gavetas
No Supabase: **SQL Editor** → New query → cola **todo** o conteúdo de
`supabase/schema.sql` → **Run**. Cria as tabelas, as regras de segurança e a
automação que dá um perfil a cada novo utilizador.

### 4. (Dev) Desligar a confirmação de email
Para testares sem confirmar email a cada registo:
**Authentication → Sign In / Providers → Email** → desliga **Confirm email** → Save.
(Voltas a ligar antes do lançamento.)

### 5. Correr a app
Nesta pasta (`honra-app`), no terminal:
```
export PATH="$HOME/.local/nodejs/bin:$PATH"   # Node instalado em user-space
npm start
```
Depois:
- Carrega **w** para abrir no browser (mais rápido para ver), **ou**
- Instala **Expo Go** no telemóvel e lê o QR code para veres no telemóvel real.

## Provar que é real
Cria uma conta → vais parar ao Início com o teu nome → abre o Perfil.
Fecha a app e volta a abrir: **continuas com sessão** (a "pulseira" ficou guardada).
No Supabase, em **Table Editor → perfis**, vês a tua ficha lá. Isso é o cérebro a funcionar.

## O que vem a seguir
- **Fatia 2:** Stripe Identity → a aba "Identidade" do selo acende a verde de verdade.
- **Fatia 3:** pedir/aceitar orçamento entre duas contas + os 2€ (modo teste).

## Nota sobre o Node
O Node foi instalado em `~/.local/nodejs` (sem admin). Para o teres sempre no teu
terminal, acrescenta esta linha ao teu `~/.zshrc`:
```
export PATH="$HOME/.local/nodejs/bin:$PATH"
```
