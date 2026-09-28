import "dotenv/config";
import { spawn } from "node:child_process";
import { papelDoAmbiente, urlDoRuntime } from "../prisma/papel-runtime.js";

/**
 * Sobe o `next start` apontando para o banco dos percursos.
 *
 * O script `percursos:servir` do package.json não carrega `.env` sozinho: o npm
 * não exporta `DATABASE_URL_PERCURSOS`. Este arquivo lê o dotenv, recusa se a
 * URL faltar, e herda `PUPPETEER_EXECUTABLE_PATH` / `PUPPETEER_CACHE_DIR` para
 * o motor de PDF (`lib/pdf/gerar.ts`) achar o Chromium.
 *
 * V7 M1 U6 — três parâmetros, todos por ambiente:
 *   PERCURSO_BANCO=<nome>     o banco (descartável) da execução, no mesmo servidor da URL dos percursos;
 *   PERCURSO_COMO_RUNTIME=1   a aplicação conecta com o PAPEL DE RUNTIME (`APP_DB_USUARIO`), não com o
 *                             dono — é o que o produto usa, e o que os percursos precisam exercitar;
 *   PERCURSO_PORTA=<n>        a porta (padrão 3010); o diretório de trabalho é o do artefato (worktree).
 * Nenhuma credencial é impressa.
 *
 * Não é publicação. Sem alvo autorizado, o artefato permanece local.
 */

const bruta = process.env["DATABASE_URL_PERCURSOS"];
if (bruta === undefined || bruta === "") {
  console.error("DATABASE_URL_PERCURSOS ausente. Defina no .env (não versionado).");
  process.exit(1);
}
const u = new URL(bruta);
const banco = process.env["PERCURSO_BANCO"];
if (banco !== undefined && banco !== "") u.pathname = `/${banco}`;
const comoRuntime = process.env["PERCURSO_COMO_RUNTIME"] === "1";
process.env["DATABASE_URL"] = comoRuntime ? urlDoRuntime(u.toString(), papelDoAmbiente()) : u.toString();
const porta = process.env["PERCURSO_PORTA"] ?? "3010";
console.log(`[servir-percursos] banco ${u.pathname.slice(1)} · conexão ${comoRuntime ? `papel de runtime (${papelDoAmbiente().usuario})` : "dono"} · porta ${porta} · diretório ${process.cwd()}`);

/**
 * ⚠️ `PERCURSO_MODO=dev` SERVE COM `next dev` — e a razão é de MÁQUINA, não de gosto.
 *
 * `next start` exige artefato de build, e `next build` (heap de 5,3 GB) mais o navegador é o par
 * que travou esta máquina de 8 GB duas vezes. Pior: um `.next` ANTIGO faz o `next start` servir
 * código velho, e o percurso reprovaria uma tela que existe — o vermelho seria do artefato.
 * `next dev` compila sob demanda, cabe junto com o navegador, e serve a ÁRVORE.
 *
 * Não é o modo do candidato de homologação: esse continua sendo `next start` sobre build próprio.
 */
const modo = process.env["PERCURSO_MODO"] === "dev" ? ["next", "dev", "-p", porta] : ["next", "start", "-p", porta];
const child = spawn("npx", modo, {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (codigo) => {
  process.exit(codigo ?? 1);
});
