import "dotenv/config";
import { spawn } from "node:child_process";

/**
 * Sobe o `next start` na porta 3010 apontando para o banco dos percursos.
 *
 * O script `percursos:servir` do package.json não carrega `.env` sozinho: o npm
 * não exporta `DATABASE_URL_PERCURSOS`. Este arquivo lê o dotenv, recusa se a
 * URL faltar, e herda `PUPPETEER_EXECUTABLE_PATH` / `PUPPETEER_CACHE_DIR` para
 * o motor de PDF (`lib/pdf/gerar.ts`) achar o Chromium.
 *
 * Não é publicação. Sem alvo autorizado, o artefato permanece local.
 */

const url = process.env["DATABASE_URL_PERCURSOS"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL_PERCURSOS ausente. Defina no .env (não versionado).");
  process.exit(1);
}
process.env["DATABASE_URL"] = url;

const child = spawn("npx", ["next", "start", "-p", "3010"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (codigo) => {
  process.exit(codigo ?? 1);
});
