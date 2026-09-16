#!/usr/bin/env bash
# Ensaio das pré-condições, dentro do container Linux. Binários de mentira no PATH.
set -u
mkdir -p /mentira
export PATH=/mentira:$PATH

cria() { printf '#!/bin/bash\n%s\n' "$2" > "/mentira/$1"; chmod +x "/mentira/$1"; }
limpa() { rm -f /mentira/*; }

caso() {
  local nome="$1" esperado="$2"
  bash /repo/scripts/conferir-runtime.sh > /tmp/saida.txt 2>&1
  local codigo=$?
  if [ "$codigo" = "$esperado" ]; then
    printf 'OK   %-42s saida=%s  %s\n' "$nome" "$codigo" "$(grep '⚠️' /tmp/saida.txt | head -1 | cut -c1-72)"
  else
    printf 'FALHOU %-40s esperado=%s obtido=%s\n' "$nome" "$esperado" "$codigo"
    cat /tmp/saida.txt
  fi
}

echo "== ensaio das pre-condicoes, em $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2) =="
echo

limpa
caso "1. node ausente" 10

limpa
cria node 'if [ "$1" = "-p" ]; then echo 20.19.0; fi'
caso "2. node de outra linha (v20)" 10

# ⚠️ "psql TOTALMENTE ausente" nao e reproduzivel numa imagem que embarca o psql — e o ramo do
# `command -v` ja foi visto acusando no caso 1, com o node. O que se ensaia aqui e o vizinho, que
# e um risco real: o binario existe e NAO responde a versao (pacote quebrado, wrapper errado).
limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria psql 'exit 1'
caso "3. psql presente e mudo" 11

limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria psql 'echo "psql (PostgreSQL) 16.4"'
caso "4. postgres de outra linha (16)" 11

limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria psql 'echo "psql (PostgreSQL) 18.6"'
caso "5. chromium ausente" 12

limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria psql 'echo "psql (PostgreSQL) 18.6"'
cria chromium 'echo chromium'
caso "6. fontconfig ausente" 12

limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria psql 'echo "psql (PostgreSQL) 18.6"'
cria chromium 'echo chromium'
cria fc-list 'echo "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf: Liberation Sans"'
caso "7. tudo certo (o verde e alcancavel)" 0

echo
echo "== e o psql REAL do container, sem mentira nenhuma =="
limpa
cria node 'if [ "$1" = "-p" ]; then echo 22.23.2; fi'
cria chromium 'echo chromium'
cria fc-list 'echo "Liberation Sans"'
bash /repo/scripts/conferir-runtime.sh 2>&1 | sed 's/^/  /'
echo "  saida=$?"
