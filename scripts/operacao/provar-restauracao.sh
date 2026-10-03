#!/usr/bin/env bash
# PROVA DE RESTAURAÇÃO (V32).
#
# Restaura uma cópia num banco de ENSAIO novo e confere que ela serve: o sha256 bate com o da cópia, as
# tabelas centrais têm linhas (e as mesmas do banco de origem, quando ele é informado), o razão fecha
# (soma dos débitos = soma dos créditos) e a última migration aplicada é a esperada. Escreve o relatório ao
# lado da cópia. Não toca em banco que não seja de ensaio: o nome tem de começar por gestao_publica_ensaio_
# e o banco não pode existir.
#
# Uso: provar-restauracao.sh <arquivo.dump> <banco_de_ensaio> [banco_de_origem]
# Saída: 0 só quando todas as conferências passam.
set -euo pipefail

DUMP="${1:?informe o arquivo da copia}"
ENSAIO="${2:?informe o banco de ensaio}"
ORIGEM="${3:-}"

if ! [[ "$ENSAIO" =~ ^gestao_publica_ensaio_[a-z0-9_]+$ ]]; then
  echo "RECUSADO: o banco de ensaio tem de se chamar gestao_publica_ensaio_<algo> — esta prova nao restaura sobre banco de uso." >&2
  exit 1
fi
if psql -d postgres -tAc "select 1 from pg_database where datname = '$ENSAIO'" | grep -qx 1; then
  echo "RECUSADO: o banco $ENSAIO ja existe. Use outro nome; a prova nao sobrescreve nada." >&2
  exit 1
fi

RELATORIO="${DUMP%.dump}.restauracao-$(date -u +%Y%m%dT%H%M%SZ).txt"
FALHAS=0
registra() { echo "$1" | tee -a "$RELATORIO"; }
falha() { registra "FALHA: $1"; FALHAS=$((FALHAS + 1)); }

registra "prova de restauracao — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
registra "copia: $DUMP"
registra "banco de ensaio: $ENSAIO"

if [ -f "$DUMP.sha256" ]; then
  ESPERADO="$(cut -d' ' -f1 "$DUMP.sha256")"
  OBTIDO="$(sha256sum "$DUMP" | cut -d' ' -f1)"
  if [ "$ESPERADO" = "$OBTIDO" ]; then registra "sha256 confere: $OBTIDO"; else falha "sha256 da copia ($OBTIDO) difere do registrado ($ESPERADO)"; fi
else
  falha "a copia nao tem o arquivo .sha256 ao lado"
fi

INICIO=$(date +%s)
createdb "$ENSAIO"
pg_restore --no-owner --no-acl -d "$ENSAIO" "$DUMP"
registra "restaurado em $(( $(date +%s) - INICIO )) s"

TABELAS='"ContaPcasp" "LancamentoContabil" "PartidaContabil" "Usuario" "PermissaoDePerfil" "FichaOrcamentaria" "Empenho" "Liquidacao" "Pagamento" "ReceitaArrecadada"'
for T in $TABELAS; do
  N="$(psql -d "$ENSAIO" -tAc "select count(*) from $T")"
  if [ -n "$ORIGEM" ]; then
    M="$(psql -d "$ORIGEM" -tAc "select count(*) from $T")"
    if [ "$N" = "$M" ]; then registra "$T: $N linhas (origem $M)"; else falha "$T: $N linhas na restauracao e $M na origem"; fi
  else
    registra "$T: $N linhas"
  fi
done
if [ "$(psql -d "$ENSAIO" -tAc 'select count(*) from "ContaPcasp"')" = "0" ]; then falha "a restauracao nao tem plano de contas"; fi

DIF="$(psql -d "$ENSAIO" -tAc "select coalesce(sum(case when tipo = 'DEBITO' then valor else -valor end), 0) from \"PartidaContabil\"")"
if [ "$DIF" = "0" ] || [ "$DIF" = "0.00" ]; then registra "razao fecha: debitos - creditos = $DIF"; else falha "razao nao fecha: debitos - creditos = $DIF"; fi

ULTIMA="$(psql -d "$ENSAIO" -tAc 'select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1')"
registra "ultima migration aplicada: $ULTIMA"
if [ -n "$ORIGEM" ]; then
  ULTIMA_O="$(psql -d "$ORIGEM" -tAc 'select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1')"
  if [ "$ULTIMA" != "$ULTIMA_O" ]; then falha "ultima migration da restauracao ($ULTIMA) difere da origem ($ULTIMA_O)"; fi
fi

if [ "$FALHAS" -eq 0 ]; then registra "RESULTADO: restauracao provada"; else registra "RESULTADO: $FALHAS falha(s)"; fi
registra "relatorio: $RELATORIO"
registra "o banco de ensaio $ENSAIO ficou criado para inspecao; apague-o com: dropdb $ENSAIO"
[ "$FALHAS" -eq 0 ]
