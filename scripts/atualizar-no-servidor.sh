#!/usr/bin/env bash
# ═══ ATUALIZAÇÃO NO SERVIDOR — versão nova ao lado da antiga, troca sem derrubar o site (V22) ═══
#
# ⚠️ É O MESMO FLUXO DO `instalar-no-servidor.sh`, NÃO UM SEGUNDO. A instalação inicial (usuário do
# serviço, .env conferido, runtime conferido) continua sendo dele. Este script faz o que vem depois,
# a cada versão nova da `main`, reaproveitando os mesmos passos e a mesma ordem:
#   conferir runtime -> código do commit -> npm ci -> prisma generate -> migrate deploy -> db:papel
#   -> db:sql -> permissões -> licenciamento -> next build -> preflight do PDF
#
# ⚠️ O QUE ELE ACRESCENTA: a versão nova é montada numa PASTA PRÓPRIA (`versoes/<commit>`), sobe numa
# SEGUNDA PORTA, e só recebe o tráfego depois de responder `/release` com o commit certo. O nginx troca
# de destino com `reload` (as conexões em curso terminam na versão antiga). Se a nova não responder, a
# antiga continua no ar e o script sai com erro — nada foi trocado.
#
# ⚠️ AS MIGRATIONS RODAM ANTES DA TROCA, e isso só é seguro porque elas são ADITIVAS (CLAUDE.md:
# "Migration é aditiva. Zero DROP"). A versão antiga continua funcionando sobre o banco novo durante
# os segundos da troca. Uma migration que removesse coluna quebraria essa garantia — e é proibida.
#
# USO (no servidor, como usuário com sudo):
#   scripts/atualizar-no-servidor.sh --commit <sha> [--raiz /opt/gestao-publica] [--simular]
#
#   --simular  imprime cada comando em vez de executar (ensaio; ver test/atualizar-no-servidor.test.ts).
#              Em simulação, SIMULAR_SAUDE=falha faz a versão nova não responder (prova do retorno).
set -euo pipefail

RAIZ="/opt/gestao-publica"
USUARIO="gestao-publica"
# Repositório privado: o servidor lê com uma CHAVE DE IMPLANTAÇÃO só de leitura (deploy key), nunca com senha.
REPOSITORIO="git@github.com:comercial-rgb/gestao-publica.git"
COMMIT=""
SIMULAR=0
MANTER_VERSOES=5

while [ $# -gt 0 ]; do
  case "$1" in
    --commit) COMMIT="${2:-}"; shift 2 ;;
    --raiz) RAIZ="${2:-}"; shift 2 ;;
    --repositorio) REPOSITORIO="${2:-}"; shift 2 ;;
    --simular) SIMULAR=1; shift ;;
    *) echo "argumento desconhecido: $1"; exit 2 ;;
  esac
done

passo() { printf '\n[%s] %s\n' "$1" "$2"; }
erro() { echo "  ⚠️ $1"; exit "${2:-1}"; }
# Executa — ou, em simulação, só mostra. Todo efeito passa por aqui.
x() { if [ "$SIMULAR" -eq 1 ]; then echo "+ $*"; else "$@"; fi; }
# Executa como o usuário do serviço, dentro da pasta da versão.
na_versao() { x sudo -u "$USUARIO" env -C "$VERSAO" "$@"; }

[ -n "$COMMIT" ] || erro "--commit é obrigatório (o sha que o GitHub enviou)." 2
case "$COMMIT" in *[!0-9a-f]*) erro "commit inválido: $COMMIT" 2 ;; esac
CURTO="$(printf '%s' "$COMMIT" | cut -c1-7)"
VERSAO="$RAIZ/versoes/$COMMIT"
ENV="$RAIZ/.env"
UPSTREAM="/etc/nginx/conf.d/gestao-publica-upstream.conf"

# ─────────────────────────────────────────────────────────────────────────────
passo 1 "o runtime e o .env (os mesmos critérios da instalação)"
if [ "$SIMULAR" -eq 0 ]; then
  "$(dirname "$0")/conferir-runtime.sh" || exit $?
  [ -f "$ENV" ] || erro "falta $ENV — a instalação inicial é do instalar-no-servidor.sh." 14
  for chave in DATABASE_URL APP_DB_USUARIO APP_DB_SENHA ANEXOS_DIR SEED_IDENTIDADE LICENCA_NUMERO LICENCA_CLIENTE AMBIENTE_DE_EXECUCAO; do
    grep -q "^${chave}=" "$ENV" || erro "falta $chave no $ENV" 14
  done
fi
echo "  runtime e .env conferidos"

# ─────────────────────────────────────────────────────────────────────────────
passo 2 "a porta livre (a versão no ar continua atendendo)"
ATIVA="3000"
if [ "$SIMULAR" -eq 0 ] && [ -f "$UPSTREAM" ]; then
  ATIVA="$(grep -o '127.0.0.1:[0-9]*' "$UPSTREAM" | cut -d: -f2)"
elif [ "$SIMULAR" -eq 1 ]; then
  ATIVA="${SIMULAR_PORTA_ATIVA:-3000}"
fi
if [ "$ATIVA" = "3000" ]; then NOVA="3001"; else NOVA="3000"; fi
echo "  no ar: $ATIVA   ·   versão nova: $NOVA"

# ─────────────────────────────────────────────────────────────────────────────
passo 3 "o código do commit $CURTO (do GitHub, sem cópia de máquina de ninguém)"
x sudo -u "$USUARIO" mkdir -p "$RAIZ/versoes"
if [ "$SIMULAR" -eq 1 ] || [ ! -d "$RAIZ/repositorio/.git" ]; then
  x sudo -u "$USUARIO" git clone --quiet "$REPOSITORIO" "$RAIZ/repositorio"
fi
x sudo -u "$USUARIO" git -C "$RAIZ/repositorio" fetch --quiet origin main
x sudo -u "$USUARIO" git -C "$RAIZ/repositorio" cat-file -e "$COMMIT^{commit}"
x sudo -u "$USUARIO" mkdir -p "$VERSAO"
# `git archive` e não checkout: a pasta da versão é o conteúdo do commit, e só ele.
x sudo -u "$USUARIO" sh -c "git -C '$RAIZ/repositorio' archive '$COMMIT' | tar -x -C '$VERSAO'"
x sudo -u "$USUARIO" ln -sfn "$ENV" "$VERSAO/.env"

# ─────────────────────────────────────────────────────────────────────────────
passo 4 "dependências, banco e permissões (a mesma ordem da instalação)"
na_versao npm ci
na_versao npx prisma generate
# ⚠️ ADITIVAS: a versão no ar continua funcionando sobre o banco migrado.
na_versao npx prisma migrate deploy
na_versao npm run db:papel
na_versao npm run db:sql
na_versao npm run permissoes:atualizar -- pendentes
na_versao npm run licenciamento:instalar -- --aplicar

# ─────────────────────────────────────────────────────────────────────────────
passo 5 "a compilação — enquanto a versão antiga atende"
na_versao env NEXT_PUBLIC_BUILD_COMMIT="$CURTO" npx next build
na_versao npx tsx scripts/preflight-navegador.ts

# ─────────────────────────────────────────────────────────────────────────────
passo 6 "a versão nova sobe na porta $NOVA"
# A unit é um MODELO por porta: `gestao-publica@3000` e `gestao-publica@3001`, cada uma lendo a pasta
# `ativa-<porta>`, que aponta para a versão. Mesmo endurecimento da unit da instalação.
if [ "$SIMULAR" -eq 0 ] && [ ! -f /etc/systemd/system/gestao-publica@.service ]; then
  sudo tee /etc/systemd/system/gestao-publica@.service > /dev/null <<UNIT
[Unit]
Description=Gestao Publica (porta %i)
After=network.target postgresql.service

[Service]
User=$USUARIO
Group=$USUARIO
WorkingDirectory=$RAIZ/ativa-%i
EnvironmentFile=$RAIZ/.env
EnvironmentFile=-$RAIZ/ativa-%i/.candidato
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p %i
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$RAIZ/anexos $RAIZ/versoes

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
fi
x sudo -u "$USUARIO" sh -c "echo IDENTIDADE_DO_CANDIDATO=$CURTO > '$VERSAO/.candidato'"
x sudo -u "$USUARIO" ln -sfn "$VERSAO" "$RAIZ/ativa-$NOVA"
x sudo systemctl restart "gestao-publica@$NOVA"

# ─────────────────────────────────────────────────────────────────────────────
passo 7 "a versão nova responde com o commit certo? (senão, a antiga continua no ar)"
SAUDAVEL=0
if [ "$SIMULAR" -eq 1 ]; then
  echo "+ curl http://127.0.0.1:$NOVA/release (esperando commit $CURTO)"
  [ "${SIMULAR_SAUDE:-ok}" = "ok" ] && SAUDAVEL=1
else
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$NOVA/release" 2>/dev/null | grep -q "\"commit\":\"$CURTO"; then SAUDAVEL=1; break; fi
    sleep 2
  done
fi
if [ "$SAUDAVEL" -ne 1 ]; then
  x sudo systemctl stop "gestao-publica@$NOVA"
  echo "  ⚠️ A versão $CURTO não respondeu em 120 s. NADA FOI TROCADO: o site continua na porta $ATIVA."
  echo "  Veja: journalctl -u gestao-publica@$NOVA -n 100"
  exit 20
fi
echo "  a versão $CURTO responde na porta $NOVA"

# ─────────────────────────────────────────────────────────────────────────────
passo 8 "a troca: o nginx passa a mandar para a porta $NOVA (reload, sem queda)"
x sudo sh -c "printf 'upstream gestao_publica { server 127.0.0.1:%s; }\n' $NOVA > '$UPSTREAM'"
x sudo nginx -t
x sudo systemctl reload nginx
# A antiga para DEPOIS da troca; o reload deixa as conexões em curso terminarem nela.
x sleep 5
x sudo systemctl stop "gestao-publica@$ATIVA"
x sudo systemctl enable "gestao-publica@$NOVA"
x sudo systemctl disable "gestao-publica@$ATIVA"

# ─────────────────────────────────────────────────────────────────────────────
passo 9 "as versões antigas (ficam as $MANTER_VERSOES mais recentes, para voltar se preciso)"
if [ "$SIMULAR" -eq 0 ]; then
  ls -1dt "$RAIZ"/versoes/*/ 2>/dev/null | tail -n +$((MANTER_VERSOES + 1)) | while read -r velha; do
    case "$(readlink -f "$RAIZ/ativa-$NOVA")/" in "$velha") continue ;; esac
    sudo rm -rf -- "$velha"
  done
else
  echo "+ remover versões além das $MANTER_VERSOES mais recentes"
fi

echo ""
echo "ATUALIZADO: commit $CURTO no ar (porta $NOVA). A anterior (porta $ATIVA) foi parada."
