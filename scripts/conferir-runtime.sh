#!/usr/bin/env bash
# ═══ AS PRÉ-CONDIÇÕES DO RUNTIME, CONFERIDAS (V10 T5) ═══
#
# ⚠️ POR QUE ISTO É UM SCRIPT PRÓPRIO. O roteiro de implantação dizia `apt-get install -y
# postgresql` e seguia — e isso não é escolher versão: a distribuição entrega o que tiver no dia.
# O candidato foi construído e medido contra Node 22 e PostgreSQL 18. Aqui a versão é LIDA e
# comparada, e a instalação PARA quando não bate.
#
# ⚠️ E ELE É SEPARADO PARA PODER SER ENSAIADO. `scripts/instalar-no-servidor.sh` o chama; o ensaio
# em Linux (`docs/operacao/ENSAIO-DA-INSTALACAO.md`) o roda num container com binários de mentira
# no PATH, e vê cada recusa acontecer. Um guard que nunca foi visto acusando é um guard que
# ninguém sabe se acusa.
#
# CÓDIGOS: 0 tudo certo · 10 Node · 11 PostgreSQL · 12 Chromium/fontes
set -uo pipefail

NODE_MAIOR_ESPERADO="${NODE_MAIOR_ESPERADO:-22}"
PG_MAIOR_ESPERADO="${PG_MAIOR_ESPERADO:-18}"

erro() { echo "  ⚠️ $1"; exit "$2"; }

echo "[runtime] as versões exigidas pelo candidato: Node $NODE_MAIOR_ESPERADO, PostgreSQL $PG_MAIOR_ESPERADO"

command -v node > /dev/null 2>&1 || erro "node nao encontrado nesta maquina." 10
NODE_VERSAO="$(node -p 'process.versions.node' 2>/dev/null || echo "")"
[ -n "$NODE_VERSAO" ] || erro "node presente, mas nao respondeu a versao." 10
NODE_MAIOR="${NODE_VERSAO%%.*}"
echo "  node: v$NODE_VERSAO"
[ "$NODE_MAIOR" = "$NODE_MAIOR_ESPERADO" ] || \
  erro "node v$NODE_MAIOR: esperado v$NODE_MAIOR_ESPERADO — a linha em que o candidato foi construido e testado." 10

command -v psql > /dev/null 2>&1 || erro "psql nao encontrado nesta maquina." 11
PG_VERSAO="$(psql --version 2>/dev/null | awk '{print $3}')"
[ -n "$PG_VERSAO" ] || erro "psql presente, mas nao respondeu a versao." 11
PG_MAIOR="${PG_VERSAO%%.*}"
echo "  postgresql: $PG_VERSAO"
[ "$PG_MAIOR" = "$PG_MAIOR_ESPERADO" ] || \
  erro "postgresql $PG_VERSAO: esperado a linha $PG_MAIOR_ESPERADO. 'apt-get install postgresql' entrega o que a distribuicao tiver." 11

# ⚠️ CHROMIUM E FONTES — e existir não é renderizar. O ensaio de verdade (um PDF real) é o
# `preflight-navegador.ts`, que roda depois do build, no servidor.
CHROMIUM="$(command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || true)"
[ -n "$CHROMIUM" ] || erro "chromium nao encontrado — o PDF nao sai sem ele." 12
echo "  chromium: $CHROMIUM"

if command -v fc-list > /dev/null 2>&1; then
  # ⚠️ SEM `grep -q`: com `pipefail`, o -q sai na primeira linha, o fc-list recebe SIGPIPE (141) e o
  # encadeamento falha — o servidor com 295 fontes era recusado por "nenhuma fonte" (medido na EC2, V29).
  fc-list 2>/dev/null | grep -i "liberation\|dejavu\|noto" > /dev/null || \
    erro "nenhuma fonte de texto encontrada (liberation/dejavu/noto): o PDF sai com caixas no lugar das letras." 12
  echo "  fontes: presentes"
else
  erro "fontconfig (fc-list) nao encontrado — sem ele nao da para afirmar que ha fonte instalada." 12
fi

echo "[runtime] pre-condicoes satisfeitas."
exit 0
