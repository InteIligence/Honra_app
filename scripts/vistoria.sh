#!/usr/bin/env bash
#
# HONRA — VISTORIA. Confronta o CÓDIGO com o SERVIDOR e com as regras da casa.
#
# Corre isto antes de uma mudança grande, depois de aplicar migrações, ou
# sempre que houver dúvida se o que está escrito bate certo com o que está a
# correr. Demora ~2 minutos.
#
#     bash scripts/vistoria.sh
#
# ── PORQUE EXISTE ────────────────────────────────────────────────────────
# A 12/08 encontrámos o ecrã de perfil partido há SEMANAS: pedia `select('*')`
# a uma tabela com grants por coluna e recebia sempre recusa. Ninguém deu por
# isso porque a app dizia "Não foi possível carregar este perfil", que soa a
# rede em baixo. No mesmo dia encontrámos cinco tabelas a responder a quem não
# tem conta, que uma migração anterior tinha deixado passar.
#
# Nenhuma das duas se vê a ler código. Vêem-se a PERGUNTAR AO SERVIDOR. É isso
# que este ficheiro faz, e é por isso que deve correr sozinho em vez de
# depender de alguém se lembrar.
#
# ── O QUE NÃO FAZ ────────────────────────────────────────────────────────
# Não substitui percorrer a app à mão. Aqui provam-se LIGAÇÕES (existe? é
# legível? escapa?); o que a app FAZ com elas — um botão que leva ao sítio
# errado, um ícone que promete o que não cumpre — só se apanha a usar.
#
# ── CREDENCIAIS ──────────────────────────────────────────────────────────
# As consultas autenticadas precisam de uma conta de teste. Põe no `.env`
# (que já está fora do Git e a 600):
#     HONRA_TESTE_EMAIL=assistente@honra.app
#     HONRA_TESTE_PASS=...
# Sem elas o script corre à mesma e salta essa secção, dizendo-o.

set -uo pipefail
cd "$(dirname "$0")/.."

VERDE=$'\033[32m'; VERM=$'\033[31m'; AMAR=$'\033[33m'; CINZ=$'\033[90m'; FIM=$'\033[0m'
FALHAS=0; AVISOS=0
ok()    { echo "  ${VERDE}✓${FIM} $1"; }
mau()   { echo "  ${VERM}✗${FIM} $1"; FALHAS=$((FALHAS+1)); }
aviso() { echo "  ${AMAR}⚠${FIM} $1"; AVISOS=$((AVISOS+1)); }
titulo(){ echo; echo "${CINZ}── $1 ${FIM}"; }

ANON=$(grep -m1 "^EXPO_PUBLIC_SUPABASE_ANON_KEY=" .env 2>/dev/null | cut -d= -f2-)
URL=$(grep -m1 "^EXPO_PUBLIC_SUPABASE_URL=" .env 2>/dev/null | cut -d= -f2-)
EMAIL=$(grep -m1 "^HONRA_TESTE_EMAIL=" .env 2>/dev/null | cut -d= -f2-)
PASS=$(grep -m1 "^HONRA_TESTE_PASS=" .env 2>/dev/null | cut -d= -f2-)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "${CINZ}HONRA · vistoria · $(date '+%d/%m/%Y %H:%M')${FIM}"

# ══════════════════════════════════════════════════════════════════════════
titulo "1. SEGREDOS"
# ══════════════════════════════════════════════════════════════════════════
# Só chaves DE VERDADE. A palavra "service_role" aparece em dezenas de
# comentários das migrações e não é fuga nenhuma — procurar por ela dava 133
# falsos alarmes e ensinava a ignorar o alarme, que é pior do que não o ter.
CHAVES=$(git log --all -p 2>/dev/null \
  | grep -oE "sbp_[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]{20,}|rk_live_[a-zA-Z0-9]{20,}" \
  | sort -u)
[ -z "$CHAVES" ] && ok "nenhuma chave no histórico do Git" \
  || { mau "CHAVES NO HISTÓRICO DO GIT — rodá-las hoje:"; echo "$CHAVES" | sed 's/^/      /'; }

for f in .env supabase/.env.deploy; do
  [ -f "$f" ] || continue
  git check-ignore -q "$f" && ok "$f fora do Git" || mau "$f NÃO está no .gitignore"
  P=$(stat -f "%OLp" "$f" 2>/dev/null || stat -c "%a" "$f" 2>/dev/null)
  [ "$P" = "600" ] && ok "$f só legível por ti (600)" || aviso "$f com permissões $P — devia ser 600 (chmod 600 $f)"
done

# ══════════════════════════════════════════════════════════════════════════
titulo "2. O QUE ESCAPA A QUEM NÃO TEM CONTA"
# ══════════════════════════════════════════════════════════════════════════
# O teste que mais vale: com a chave anónima e SEM sessão, o que responde?
# `categorias` e as vistas `_publico` ficam de fora — são públicas de propósito.
if [ -z "$ANON" ] || [ -z "$URL" ]; then
  aviso "sem URL/chave no .env — secção saltada"
else
  EXPOSTAS=0
  for t in perfis verificacoes orcamentos mensagens bloqueios avaliacoes \
           portfolio_itens trabalhos trabalhos_comprovados perfil_categorias \
           combinados contratos_convite denuncias agenda_notas tarefas listas \
           listas_membros notificacoes candidaturas checkpoints_orcamento \
           conversas_livres grupos_conversa grupo_membros push_tokens \
           preferencias_notificacao pedidos_profissao cedulas contas_connect \
           entregas evolucoes leitura_conversa pesquisas_guardadas; do
    R=$(curl -s "$URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON" \
        -H "Authorization: Bearer $ANON" --max-time 10)
    case "$R" in
      '['*']') [ "$R" != "[]" ] && { mau "$t responde a quem não tem conta"; EXPOSTAS=1; } ;;
    esac
  done
  [ $EXPOSTAS -eq 0 ] && ok "nenhuma tabela de pessoas responde sem sessão"
fi

# ══════════════════════════════════════════════════════════════════════════
titulo "3. CÓDIGO ↔ SERVIDOR"
# ══════════════════════════════════════════════════════════════════════════
# O LOGIN FICA FORA DA REDIREÇÃO. Tinha-o dentro do bloco que manda tudo para
# um ficheiro, e o "não consegui entrar" ia para o ficheiro em vez do ecrã: o
# script corria sem sessão, não dizia nada, e dava resultados falsos com ar de
# certos. Um alarme que se cala sozinho é pior do que não haver alarme.
TK=""
if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  aviso "sem HONRA_TESTE_EMAIL/PASS no .env — secções 3 e 4 saltadas (são as mais úteis)"
else
  TK=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
       -H "Content-Type: application/json" \
       -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" --max-time 20 \
       | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  if [ -z "$TK" ]; then
    mau "NÃO CONSEGUI ENTRAR com a conta de teste ($EMAIL) — palavra-passe mudou?"
    echo "      As secções 3 e 4 vão ser saltadas. Sem sessão não se prova nada"
    echo "      sobre colunas nem funções."
  fi
fi

if [ -n "$TK" ]; then
  python3 - "$URL" "$ANON" "$TK" > "$TMP/consultas.txt" 2>&1 <<'PY_FIM'
import re, glob, sys, urllib.request, urllib.error
URL, ANON, TK = sys.argv[1], sys.argv[2], sys.argv[3]
pares=set()
for p in glob.glob('src/**/*.tsx',recursive=True)+glob.glob('src/**/*.ts',recursive=True):
    s=open(p,encoding='utf-8').read()
    # `storage.from('x')` NAO e' tabela: apanha-lo dava um falso positivo (o
    # bucket `portfolio` confundido com a tabela `portfolio_itens`).
    s=re.sub(r"storage\s*\.from\('[a-z_-]+'\)", "storage.BUCKET", s)
    for m in re.finditer(r"\.from\('([a-z_]+)'\)([\s\S]{0,400}?)\.select\(\s*(?:`([^`]*)`|'([^']*)')", s):
        tab, cols = m.group(1), (m.group(3) or m.group(4) or '').strip()
        if not cols: continue
        if cols == '*':
            print(f"AVISO|{tab}|select('*')|{p}"); continue
        cols = re.sub(r'\$\{[^}]*\}', '', cols)
        cols = re.sub(r'[a-z_]+\([^)]*\)', '', cols)
        limpas=[c.strip() for c in cols.split(',') if c.strip() and ':' not in c and '(' not in c]
        if limpas: pares.add((tab, ','.join(sorted(set(limpas))), p))
for tab, cols, fich in sorted(pares):
    req=urllib.request.Request(f"{URL}/rest/v1/{tab}?select={cols}&limit=1",
        headers={'apikey':ANON,'Authorization':'Bearer '+TK})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except urllib.error.HTTPError as e:
        corpo=e.read().decode()
        codigo=('42703 coluna inexistente' if '42703' in corpo else
                '42501 sem permissão'      if '42501' in corpo else
                'PGRST205 tabela inexistente' if 'PGRST205' in corpo else corpo[:70])
        print(f"MAU|{tab}|{cols}|{fich}|{codigo}")
    except Exception as e:
        print(f"AVISO|{tab}|{cols}|{fich}|{str(e)[:60]}")
print("FIM|"+str(len(pares)))
PY_FIM

  TOTAL=$(grep "^FIM|" "$TMP/consultas.txt" | cut -d'|' -f2)
  while IFS='|' read -r _ tab cols fich cod; do
    mau "$tab ($cod)"; echo "      colunas: $cols"; echo "      em: $fich"
  done < <(grep "^MAU|" "$TMP/consultas.txt")
  while IFS='|' read -r _ tab cols fich _; do
    aviso "$tab usa $cols — numa tabela com grants por coluna isto rebenta"
    echo "      em: $fich"
  done < <(grep "^AVISO|" "$TMP/consultas.txt")
  MAUS=$(grep -c "^MAU|" "$TMP/consultas.txt" || true)
  [ "${MAUS:-0}" = "0" ] && [ -n "${TOTAL:-}" ] && ok "$TOTAL consultas verificadas, todas passam"
fi

# ══════════════════════════════════════════════════════════════════════════
titulo "4. FUNÇÕES E EDGE FUNCTIONS"
# ══════════════════════════════════════════════════════════════════════════
if [ -n "$ANON" ] && [ -n "$TK" ]; then
  FALTAM=0
  for f in $(grep -rhoE "\.rpc\('[a-z_]+'" src/ | sed "s/\.rpc('//;s/'//" | sort -u); do
    R=$(curl -s -X POST "$URL/rest/v1/rpc/$f" \
        -H "apikey: $ANON" -H "Authorization: Bearer $TK" \
        -H "Content-Type: application/json" -d '{}' --max-time 10)
    # PGRST202 = não existe função com este NOME. Um 404 sem PGRST202 quer
    # dizer que existe mas leva argumentos — e isso não é problema nenhum.
    case "$R" in
      *PGRST202*) mau "função $f não existe no servidor (migração por aplicar?)"; FALTAM=1 ;;
    esac
  done
  [ $FALTAM -eq 0 ] && ok "todas as funções que o código chama existem"

  FALTAM=0
  for f in $(grep -rh --include='*.ts' --include='*.tsx' -E "functions\.invoke\('[a-z-]+'" src/ \
             | grep -vE "^\s*(\*|//)" \
             | grep -oE "functions\.invoke\('[a-z-]+'" | sed "s/functions\.invoke('//;s/'//" | sort -u); do
    C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/functions/v1/$f" \
        -H "Authorization: Bearer $TK" -H "Content-Type: application/json" -d '{}' --max-time 12)
    [ "$C" = "404" ] && { mau "Edge Function '$f' não está implantada"; FALTAM=1; }
  done
  [ $FALTAM -eq 0 ] && ok "todas as Edge Functions estão implantadas"
fi

# ══════════════════════════════════════════════════════════════════════════
titulo "5. O CÓDIGO CONSIGO PRÓPRIO"
# ══════════════════════════════════════════════════════════════════════════
npx tsc --noEmit >"$TMP/tsc.txt" 2>&1 \
  && ok "TypeScript sem erros" \
  || { mau "TypeScript com erros:"; head -5 "$TMP/tsc.txt" | sed 's/^/      /'; }

python3 - <<'PY'
import re, glob
def chaves(p): return set(re.findall(r"^\s*'([^']+)':", open(p,encoding='utf-8').read(), re.M))
pt, en = chaves('src/i18n/pt.ts'), chaves('src/i18n/en.ts')
so_pt, so_en = pt-en, en-pt
if so_pt or so_en:
    print(f"  \033[31m✗\033[0m i18n desalinhado: {len(so_pt)} só em pt, {len(so_en)} só em en")
    for k in list(so_pt)[:4]: print(f"      só pt: {k}")
    for k in list(so_en)[:4]: print(f"      só en: {k}")
else:
    print(f"  \033[32m✓\033[0m i18n com {len(pt)} chaves, paridade perfeita")

# chaves usadas mas inexistentes — ignora as que estão em comentários
usadas=set()
for p in glob.glob('src/**/*.tsx',recursive=True)+glob.glob('src/**/*.ts',recursive=True):
    if '/i18n/' in p: continue
    linhas=[l for l in open(p,encoding='utf-8') if not l.lstrip().startswith(('*','//'))]
    usadas |= set(re.findall(r"\bt\('([a-z][a-z0-9_.]+)'", '\n'.join(linhas)))
faltam=sorted(usadas-pt)
if faltam:
    print(f"  \033[31m✗\033[0m {len(faltam)} chaves usadas que não existem:")
    for f in faltam[:6]: print(f"      {f}")
else:
    print("  \033[32m✓\033[0m todas as chaves usadas existem")
PY

# Migrações no repo vs a última que o servidor conhece (pelas funções novas).
ULT=$(ls supabase/migrations/*.sql 2>/dev/null | tail -1 | xargs basename 2>/dev/null)
[ -n "$ULT" ] && echo "  ${CINZ}última migração no repo: $ULT${FIM}"

# ══════════════════════════════════════════════════════════════════════════
titulo "6. DEPENDÊNCIAS"
# ══════════════════════════════════════════════════════════════════════════
N=$(npm audit --omit=dev --json 2>/dev/null \
    | python3 -c "import json,sys
try:
    v=json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{})
    print(v.get('high',0)+v.get('critical',0))
except Exception:
    print('?')" 2>/dev/null | tr -d '\n')
[ -z "$N" ] && N="?"
[ "$N" = "0" ] && ok "sem vulnerabilidades altas" || aviso "$N vulnerabilidades altas/críticas (npm audit para ver)"

# ══════════════════════════════════════════════════════════════════════════
echo
if [ $FALHAS -eq 0 ]; then
  echo "${VERDE}══ VISTORIA LIMPA ══${FIM}  ${AVISOS} aviso(s)"
  exit 0
else
  echo "${VERM}══ ${FALHAS} PROBLEMA(S) ══${FIM}  ${AVISOS} aviso(s)"
  exit 1
fi
