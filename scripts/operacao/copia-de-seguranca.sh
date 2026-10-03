#!/usr/bin/env bash
# CÓPIA DE SEGURANÇA DO BANCO (V32).
#
# Gera um pg_dump no formato custom (-Fc, comprimido), com o sha256 ao lado, apaga as cópias locais mais velhas
# que a retenção e, SE houver destino externo configurado, envia a cópia para fora da máquina (S3 com
# criptografia no servidor). Sem destino externo, a cópia local é feita e a saída diz, com todas as letras,
# que a cópia externa está INDISPONÍVEL — código 2, para que o agendador acuse. Nunca finge sucesso.
#
# Variáveis:
#   BANCO              nome do banco (obrigatório)
#   PGHOST/PGPORT/PGUSER e senha por ~/.pgpass ou PGPASSWORD (o dono do banco; nunca o papel da aplicação)
#   DESTINO_LOCAL      pasta das cópias (padrão /var/backups/gestao-publica)
#   RETENCAO_DIAS      quantos dias de cópias locais manter (padrão 14)
#   COPIA_EXTERNA_S3   s3://balde/prefixo — opcional; exige o aws cli com credencial própria da cópia
#
# Saída: 0 = local e externa feitas; 2 = local feita, externa indisponível; 1 = falha.
set -euo pipefail

: "${BANCO:?informe BANCO}"
DESTINO_LOCAL="${DESTINO_LOCAL:-/var/backups/gestao-publica}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"
case "$RETENCAO_DIAS" in ''|*[!0-9]*) echo "RETENCAO_DIAS tem de ser um número de dias" >&2; exit 1 ;; esac

mkdir -p "$DESTINO_LOCAL"
CARIMBO="$(date -u +%Y%m%dT%H%M%SZ)"
ARQUIVO="$DESTINO_LOCAL/${BANCO}-${CARIMBO}.dump"
PARCIAL="$ARQUIVO.parcial"

# O dump vai para um nome provisório e só ganha o nome final inteiro: uma cópia interrompida nunca parece boa.
pg_dump -Fc --no-owner --no-acl -d "$BANCO" -f "$PARCIAL"
mv "$PARCIAL" "$ARQUIVO"
( cd "$DESTINO_LOCAL" && sha256sum "$(basename "$ARQUIVO")" > "$(basename "$ARQUIVO").sha256" )
TAMANHO="$(stat -c %s "$ARQUIVO" 2>/dev/null || wc -c < "$ARQUIVO")"
echo "copia local: $ARQUIVO ($TAMANHO bytes)"
cat "$ARQUIVO.sha256"

# Retenção: só arquivos deste banco, só os que têm o carimbo no nome.
find "$DESTINO_LOCAL" -maxdepth 1 -type f \( -name "${BANCO}-*.dump" -o -name "${BANCO}-*.dump.sha256" \) -mtime +"$RETENCAO_DIAS" -print -delete | sed 's/^/apagada pela retencao: /'

if [ -z "${COPIA_EXTERNA_S3:-}" ]; then
  echo "copia externa: INDISPONIVEL — COPIA_EXTERNA_S3 nao configurado (destino e credencial sao do responsavel pela operacao)" >&2
  exit 2
fi
if ! command -v aws >/dev/null 2>&1; then
  echo "copia externa: INDISPONIVEL — aws cli ausente nesta maquina" >&2
  exit 2
fi
aws s3 cp "$ARQUIVO" "${COPIA_EXTERNA_S3%/}/$(basename "$ARQUIVO")" --sse AES256 --only-show-errors
aws s3 cp "$ARQUIVO.sha256" "${COPIA_EXTERNA_S3%/}/$(basename "$ARQUIVO").sha256" --sse AES256 --only-show-errors
echo "copia externa: ${COPIA_EXTERNA_S3%/}/$(basename "$ARQUIVO")"
