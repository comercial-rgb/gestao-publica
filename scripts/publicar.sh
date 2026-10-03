#!/usr/bin/env bash
# ═══ PUBLICAR EM PRODUÇÃO — um comando, como na frota ═══
#
#   npm run publicar
#
# 1. confere que a árvore está limpa (o que vai ao ar é um COMMIT);
# 2. roda a conferência de tipos aqui — ela pede mais de 6 GB e não cabe no servidor de 2 GB;
# 3. grava a aprovação ENXUTA em scripts/implantacao/aprovacao-de-tipos.json (um arquivo só, sobrescrito)
#    e a commita — o servidor a encontra dentro do próprio commit e só dispensa o tsc se o digesto bater;
# 4. envia para a `main` do GitHub. O GitHub Actions (.github/workflows/publicar.yml) entra no servidor e
#    roda scripts/atualizar-no-servidor.sh: versão nova ao lado da antiga, troca sem derrubar o site.
#
# Acompanhar: `gh run watch` (ou a aba Actions do repositório). Conferir: https://<domínio>/release.
set -euo pipefail
cd "$(dirname "$0")/.."

SUJOS="$(git status --porcelain --untracked-files=no)"
if [ -n "$SUJOS" ]; then
  echo "Há alteração não commitada. Commite antes de publicar — o que vai ao ar é um commit:"
  echo "$SUJOS"
  exit 1
fi

echo "[publicar] conferência de tipos (a mesma do build)"
npx next typegen > /dev/null
npm run tipos:conferir

node --input-type=module -e '
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { digestoDeTipos } from "./scripts/conferencia-de-tipos.mjs";
const { digesto } = digestoDeTipos();
const completa = JSON.parse(readFileSync(`.registro-de-execucao/conferencia-de-tipos/${digesto}.json`, "utf8"));
const enxuta = { digesto, quando: completa.quando, comando: completa.comando, duracaoMs: completa.duracaoMs, heapMb: completa.heapMb, node: completa.node, sha: completa.sha };
const destino = "scripts/implantacao/aprovacao-de-tipos.json";
const antes = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")).digesto : "";
// Mesmo digesto: o arquivo fica como está (reescrever só a data geraria um commit sem conteúdo novo).
if (antes !== digesto) writeFileSync(destino, JSON.stringify(enxuta, null, 1) + "\n");
console.log(antes === digesto ? "[publicar] aprovação já estava no repositório" : `[publicar] aprovação ${digesto.slice(0, 12)} gravada`);
'

if [ -n "$(git status --porcelain scripts/implantacao/aprovacao-de-tipos.json)" ]; then
  git add scripts/implantacao/aprovacao-de-tipos.json
  git commit -q -m "Publicação: aprovação de tipos $(node -p 'require("./scripts/implantacao/aprovacao-de-tipos.json").digesto.slice(0,12)')"
fi

echo "[publicar] enviando $(git rev-parse --short HEAD) para a main"
git push origin "HEAD:main"
echo "[publicar] enviado. Acompanhe com: gh run watch"
