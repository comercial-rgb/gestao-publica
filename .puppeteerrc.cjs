// @ts-check
const { join } = require("node:path");

/**
 * O NAVEGADOR DOS PERCURSOS E DO GERADOR DE PDF — em lugar controlado pelo projeto (V7 M1 U0).
 *
 * O Chrome ficava no cache do usuário (~/.cache/puppeteer), compartilhado com outros projetos da
 * máquina; ele sumiu durante a sessão V6.2 por causa desconhecida e os percursos pararam no launch.
 * Este arquivo é lido pelo Puppeteer (runner dos percursos E `next start`, que usa `lib/pdf/gerar.ts`)
 * a partir do diretório do projeto. O binário fica em `.cache-puppeteer/` (ignorado pelo Git).
 *
 * Versão: a que o `puppeteer` do package-lock exige (ver `scripts/preflight-navegador.ts`). Reposição:
 *   npx puppeteer browsers install chrome   (CLI LOCAL, dentro do projeto)
 * Nada baixa sozinho durante uma requisição.
 *
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, ".cache-puppeteer"),
};
