import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * ═══ A DERIVA ENTRE O BANCO E O MODELO — GUARD DE GATE ═══
 *
 * ⚠️ O QUE ACONTECEU, E VAI ACONTECER DE NOVO. No ENT03b a primeira migration do lote veio
 * querendo `DROP INDEX "MovimentoBancario_fonteId_idx"` — um índice que existia no banco e
 * que o `schema.prisma` não declarava. Ninguém pediu isso: o Prisma gera a migration a
 * partir da DIFERENÇA entre o banco e o modelo, e tudo que existe no banco sem estar no
 * modelo ele entende como sobra a remover. O achado foi por leitura do diff, na sorte.
 *
 * ⚠️ E A SUPERFÍCIE DE RISCO É GRANDE: são 22 arquivos em `prisma/sql/` criando índices
 * parciais e CHECKs condicionais que o Prisma NÃO SABE EXPRESSAR — cada um deles é um
 * objeto que existe no banco e não existe no modelo. Eles são deliberados; é justamente
 * por isso que a deriva acidental se esconde tão bem no meio deles.
 *
 * Este script separa as duas coisas, e é essa separação que ele existe para fazer:
 *
 *   (1) **MIGRATIONS × MODELO** tem de ser VAZIO. As migrations são geradas do modelo; se
 *       sobra diferença, ou alguém mexeu no modelo sem migrar, ou uma migration fez algo
 *       que o modelo não declara. É o caso do índice do ENT03b.
 *   (2) **BANCO COMPLETO (migrations + prisma/sql) × MODELO** só pode conter remoções dos
 *       objetos que `prisma/sql/` cria de propósito. Qualquer outra coisa é deriva.
 *
 * Sai com código 1 quando acha deriva, imprimindo o SQL que o Prisma geraria.
 *
 * Uso:  npm run deriva
 */

function exigirUrlBase(): string {
  const u = process.env["DATABASE_URL"];
  if (u === undefined || u === "") {
    throw new Error("DATABASE_URL não configurada — não há servidor onde montar a sombra.");
  }
  return u;
}

const URL_BASE: string = exigirUrlBase();

/** O banco de SOMBRA: descartável, recriado do zero a cada execução. */
const NOME_SOMBRA = "gestao_deriva_sombra";

/** O banco que o próprio Prisma usa para REPRODUZIR as migrations no passo (1). */
const NOME_REPLAY = "gestao_deriva_replay";

function urlDeBanco(base: string, nome: string): string {
  const u = new URL(base);
  u.pathname = `/${nome}`;
  return u.toString();
}

function urlAdministrativa(base: string): string {
  const u = new URL(base);
  u.pathname = "/postgres";
  return u.toString();
}

/**
 * Os nomes de objeto que `prisma/sql/` cria. São a ÚNICA sobra tolerada no passo (2).
 *
 * ⚠️ A LISTA É LIDA DOS ARQUIVOS, não escrita aqui. Um `.sql` novo entra sozinho — e é
 * assim que tem de ser: uma lista à mão envelheceria em silêncio, e o efeito de envelhecer
 * seria tolerar uma deriva de verdade por achar que era um índice parcial conhecido.
 */
function objetosDoSqlManual(): readonly string[] {
  const nomes: string[] = [];
  for (const arquivo of readdirSync("prisma/sql").filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join("prisma/sql", arquivo), "utf8");
    for (const m of sql.matchAll(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi
    )) {
      if (m[1] !== undefined) nomes.push(m[1]);
    }
    for (const m of sql.matchAll(/ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?/gi)) {
      if (m[1] !== undefined) nomes.push(m[1]);
    }
  }
  return nomes;
}

/**
 * ⚠️ O PRISMA 7 NÃO TEM MAIS `--from-url`. A única origem-banco é
 * `--from-config-datasource`, que lê o datasource do `prisma.config.ts` — ou seja,
 * `DATABASE_URL`. Por isso a sombra entra por VARIÁVEL DE AMBIENTE do subprocesso, e não
 * por argumento: é o mesmo diff, apontado para outro banco.
 */
function diff(de: readonly string[], url?: string): string {
  return execFileSync(
    "npx",
    ["prisma", "migrate", "diff", ...de, "--to-schema=prisma/schema", "--script"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: url === undefined ? process.env : { ...process.env, DATABASE_URL: url },
    }
  );
}

/** Comentários e linhas em branco não são instrução — só o que EXECUTA conta. */
function instrucoes(script: string): readonly string[] {
  return script
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"));
}

async function montarSombra(): Promise<string> {
  await recriar(NOME_SOMBRA);

  const url = urlDeBanco(URL_BASE, NOME_SOMBRA);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // O mesmo SQL manual que `npm run db:sql` aplica, na mesma ordem.
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    for (const arquivo of readdirSync("prisma/sql")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await cliente.query(readFileSync(join("prisma/sql", arquivo), "utf8"));
    }
  } finally {
    await cliente.end();
  }
  return url;
}

async function recriar(nome: string): Promise<void> {
  const admin = new Client({ connectionString: urlAdministrativa(URL_BASE) });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${nome}"`);
  } finally {
    await admin.end();
  }
}

async function derrubar(...nomes: readonly string[]): Promise<void> {
  const admin = new Client({ connectionString: urlAdministrativa(URL_BASE) });
  await admin.connect();
  try {
    for (const nome of nomes) {
      await admin.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  const problemas: string[] = [];

  // ── (1) MIGRATIONS × MODELO — tem de ser vazio ───────────────────────────
  // O Prisma precisa de um banco VAZIO para reproduzir as migrations e ver o que elas
  // produzem. Ele é criado aqui e derrubado no fim — nunca um banco existente.
  await recriar(NOME_REPLAY);
  process.env["SHADOW_DATABASE_URL"] = urlDeBanco(URL_BASE, NOME_REPLAY);
  const passo1 = instrucoes(diff(["--from-migrations", "prisma/migrations"]));
  if (passo1.length > 0) {
    problemas.push(
      "MIGRATIONS × MODELO não está vazio. Ou o schema mudou sem migration, ou uma " +
        "migration criou objeto que o schema não declara — foi o caso do índice\n" +
        "`MovimentoBancario_fonteId_idx` no ENT03b, que a migration seguinte ia DERRUBAR.\n\n" +
        passo1.map((l) => `    ${l}`).join("\n")
    );
  }

  // ── (2) BANCO COMPLETO × MODELO — só as sobras declaradas em prisma/sql ──
  const sombra = await montarSombra();
  try {
    const declarados = objetosDoSqlManual();
    const inesperadas = instrucoes(
      diff(["--from-config-datasource"], sombra)
    ).filter(
      (l) => !declarados.some((nome) => l.includes(nome))
    );
    if (inesperadas.length > 0) {
      problemas.push(
        "BANCO COMPLETO × MODELO tem diferença que `prisma/sql/` não explica.\n" +
          `(objetos manuais conhecidos: ${declarados.length})\n\n` +
          inesperadas.map((l) => `    ${l}`).join("\n")
      );
    }
  } finally {
    await derrubar(NOME_SOMBRA, NOME_REPLAY);
  }

  if (problemas.length > 0) {
    console.error("\n⚠️ DERIVA ENTRE O BANCO E O MODELO:\n");
    for (const p of problemas) console.error(`${p}\n`);
    console.error(
      "Declare o objeto no schema (`@@index`, `@@unique`) e regenere a migration, ou\n" +
        "acrescente o SQL a `prisma/sql/` se o Prisma não souber expressá-lo.\n"
    );
    process.exit(1);
  }

  console.log(
    "\n[deriva] migrations x modelo: limpo. " +
      `banco completo x modelo: só os ${objetosDoSqlManual().length} objetos de prisma/sql/.\n`
  );
}

await main();
