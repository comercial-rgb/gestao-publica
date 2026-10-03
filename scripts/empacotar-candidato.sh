#!/usr/bin/env bash
# ═══ O PACOTE DO CANDIDATO — uma cadeia de proveniência só (V10 T5) ═══
#
# ⚠️ O QUE ESTE SCRIPT CORRIGE. O roteiro anterior empacotava com `git archive HEAD` e depois
# falava do candidato pelo nome `<sha>+<digesto>` — e os dois não descrevem a mesma coisa:
#   · `git archive HEAD` traz o conteúdo RASTREADO do commit, e ignora qualquer arquivo não
#     rastreado que esteja na árvore (nesta repo há três, de terceiros, que NÃO devem ir);
#   · o digesto do nome do candidato é do `.next` construído NO MAC — e o build que roda no
#     servidor é outro, feito na arquitetura de lá.
# Rotular o pacote do servidor com o digesto do Mac é afirmar uma identidade que não se conferiu.
#
# ⚠️ A CADEIA AQUI É: fonte rastreada do commit -> manifesto imutável com o digesto do FONTE ->
# pacote -> conferência do digesto DEPOIS da transferência -> build no servidor -> identidade
# publicada pelo `/release`. O que o `--candidato` do aceite compara é o nome do PACOTE, e ele é
# derivado do fonte, não do `.next` de máquina nenhuma.
#
# USO: scripts/empacotar-candidato.sh [destino]
set -euo pipefail

DESTINO="${1:-/tmp}"
cd "$(dirname "$0")/.."

# ─────────────────────────────────────────────────────────────────────────────
# 1. A ÁRVORE TEM DE ESTAR LIMPA NO QUE É RASTREADO.
#
# ⚠️ Empacotar com alteração rastreada pendente produz um pacote cujo conteúdo não corresponde a
# commit nenhum — e o nome dele passaria a mentir sobre o que foi revisado.
SUJOS="$(git status --porcelain --untracked-files=no)"
if [ -n "$SUJOS" ]; then
  echo "ARVORE SUJA — ha alteracao RASTREADA pendente:"
  echo "$SUJOS"
  echo ""
  echo "O pacote e do COMMIT. Empacotar agora produziria um artefato que nao corresponde a"
  echo "commit nenhum, e o nome dele mentiria sobre o que foi revisado. Nada foi gerado."
  exit 1
fi

SHA="$(git rev-parse HEAD)"
CURTO="$(git rev-parse --short=7 HEAD)"

# ─────────────────────────────────────────────────────────────────────────────
# 2. O MANIFESTO DO FONTE — completo, ordenado e com o sha256 de cada arquivo.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git archive --format=tar HEAD | (cd "$TMP" && tar x)

MANIFESTO="$TMP/MANIFESTO-DO-FONTE.txt"
{
  echo "# MANIFESTO DO FONTE — gerado por scripts/empacotar-candidato.sh"
  echo "# commit: $SHA"
  echo "# gerado-em: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "#"
  echo "# ⚠️ O QUE ESTE MANIFESTO COBRE: todo arquivo RASTREADO do commit acima — inclusive"
  echo "# prisma/schema, prisma/migrations, prisma/sql, scripts, public e package-lock.json."
  echo "# ⚠️ O QUE ELE NAO COBRE, e por isso o servidor os resolve e confere la:"
  echo "#   · node_modules      -> instalado por 'npm ci' contra este package-lock;"
  echo "#   · prisma/generated  -> gerado por 'prisma generate' NA ARQUITETURA DO SERVIDOR;"
  echo "#   · .next             -> construido no servidor;"
  echo "#   · Chromium e fontes -> pacotes do sistema, com versao conferida na instalacao;"
  echo "#   · .env              -> configuracao e segredo, que NUNCA viajam no pacote."
  echo "#"
  # Uma chamada de shasum para todos os arquivos (e não um processo por arquivo): no Windows o laço
  # antigo levava mais de 10 minutos. A saída é a mesma: "<hash>  <caminho>", em ordem de caminho.
  ( cd "$TMP" && find . -type f -not -name "MANIFESTO-DO-FONTE.txt" -print0 | LC_ALL=C sort -z \
      | xargs -0 shasum -a 256 | sed 's#^\([0-9a-f]\{64\}\) [ *]\./#\1  #' )
} > "$MANIFESTO"

ARQUIVOS="$(grep -c '^[0-9a-f]\{64\}  ' "$MANIFESTO")"
# ⚠️ O DIGESTO DO FONTE é o sha256 do MANIFESTO — que por sua vez é o sha256 de cada arquivo.
# Um arquivo alterado muda o sha dele, muda o manifesto, muda o digesto. É verificável de fora.
DIGESTO="$(shasum -a 256 "$MANIFESTO" | cut -d' ' -f1 | cut -c1-12)"
CANDIDATO="${CURTO}+${DIGESTO}"

PACOTE="$DESTINO/gestao-publica-${CANDIDATO}.tgz"
( cd "$TMP" && tar czf "$PACOTE" . )
SHA_DO_PACOTE="$(shasum -a 256 "$PACOTE" | cut -d' ' -f1)"

cat > "$DESTINO/gestao-publica-${CANDIDATO}.manifesto" <<FIM
candidato=$CANDIDATO
commit=$SHA
arquivos=$ARQUIVOS
digesto-do-fonte=$DIGESTO
sha256-do-pacote=$SHA_DO_PACOTE
FIM

echo "candidato:        $CANDIDATO"
echo "commit:           $SHA"
echo "arquivos no fonte: $ARQUIVOS"
echo "pacote:           $PACOTE"
echo "sha256 do pacote: $SHA_DO_PACOTE"
echo ""
echo "Confira o sha256 DEPOIS da transferencia, no servidor:"
echo "  shasum -a 256 /tmp/$(basename "$PACOTE")"
echo ""
echo "⚠️ O nome do candidato vai para IDENTIDADE_DO_CANDIDATO na unit do servico, e e ele que"
echo "   'scripts/pos-dns.sh --candidato' compara com o que /release publica."
