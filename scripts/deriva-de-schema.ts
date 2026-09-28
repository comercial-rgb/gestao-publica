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
      // No Windows `npx` é `npx.cmd`, que o Node não executa sem shell (V21 R0). Os argumentos são
      // flags fixas, sem espaço.
      shell: process.platform === "win32",
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

/**
 * A MESMA TRANSFORMAÇÃO QUE OS OUTROS DOIS CONSUMIDORES DE `prisma/sql/` APLICAM.
 *
 * ⚠️ FOI A AUSÊNCIA DESTA LINHA QUE DEIXOU O `npm run deriva` SEM MEDIR. Diagnosticado na
 * V15: `prisma/sql/` tem três consumidores — `scripts/aplicar-sql-manual.ts` (`npm run db:sql`),
 * `test/global-setup.ts` e este script. Os dois primeiros trocam `CREATE UNIQUE INDEX` por
 * `CREATE UNIQUE INDEX IF NOT EXISTS`; este aplicava o arquivo CRU. E o 28º e último arquivo da
 * pasta, `uq_roteiro_sem_tipo_de_credito.sql`, cria um índice que a migration
 * `20261006090000_v11_v84_roteiro_versionado` JÁ CRIOU de propósito (ela o recria junto com a
 * coluna `versao` para não abrir janela sem unicidade durante a migração). Sobre uma sombra que
 * acabou de receber `migrate deploy`, o `CREATE` cru morria com `42P07 relation already exists`.
 *
 * Reproduzido nas duas direções, no próprio banco de sombra:
 *     CREATE UNIQUE INDEX ...                 -> ERROR: relation ... already exists   rc=3
 *     CREATE UNIQUE INDEX IF NOT EXISTS ...   -> NOTICE: ... skipping / CREATE INDEX   rc=0
 *
 * ⚠️ E ISTO NÃO É CONTORNO PARA A CONFERÊNCIA PASSAR: é FIDELIDADE. A sombra existe para
 * representar um banco real, e um banco real é montado por `migrate deploy` + `npm run db:sql` —
 * que aplica a pasta com esta transformação. Modelar a sombra de outro jeito mediria um ambiente
 * que não existe. O schema não foi tocado, e o `.sql` não foi tocado.
 */
function idempotente(sql: string): string {
  // /gi: um arquivo pode trazer MAIS DE UM índice (o do M05 traz dois).
  return sql.replace(/CREATE UNIQUE INDEX/gi, "CREATE UNIQUE INDEX IF NOT EXISTS");
}

/**
 * Os objetos que `prisma/sql/` cria E uma migration também cria — a ressalva que acompanha o
 * resultado, porque a credibilidade da medição depende dela.
 *
 * ⚠️ O BURACO QUE ELA NOMEIA, e que NÃO é artefato deste guard: onde há colisão, o `IF NOT
 * EXISTS` mantém a definição da MIGRATION e descarta a do arquivo em silêncio. Se as duas
 * divergirem, o banco real (`npm run db:sql`) fica com a da migration, e o passo (2) daqui não
 * acusa, porque ele filtra as sobras por NOME, não por definição. Hoje as duas definições são a
 * mesma. Fechar isto pede comparar `pg_get_indexdef` com o que o arquivo produziria — pendência
 * nomeada, não construída nesta rodada.
 */
function colisoesComMigrations(): readonly { readonly nome: string; readonly migration: string }[] {
  const declarados = new Set(objetosDoSqlManual());
  const achadas: { nome: string; migration: string }[] = [];
  const raiz = "prisma/migrations";
  for (const dir of readdirSync(raiz, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const arquivo of readdirSync(join(raiz, dir.name)).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(raiz, dir.name, arquivo), "utf8");
      for (const m of sql.matchAll(
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi
      )) {
        const nome = m[1];
        if (nome !== undefined && declarados.has(nome)) achadas.push({ nome, migration: dir.name });
      }
    }
  }
  return achadas;
}

async function montarSombra(): Promise<string> {
  await recriar(NOME_SOMBRA);

  const url = urlDeBanco(URL_BASE, NOME_SOMBRA);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  // O mesmo SQL manual que `npm run db:sql` aplica, na mesma ordem.
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    for (const arquivo of readdirSync("prisma/sql")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await cliente.query(idempotente(readFileSync(join("prisma/sql", arquivo), "utf8")));
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

  /**
   * ⚠️ A ESTRUTURA DESTE BLOCO É O SEGUNDO CONSERTO DA V15, e ele é independente do primeiro.
   *
   * Antes, `montarSombra()` era chamado FORA do `try`, e o `recriar(NOME_REPLAY)` também. Quando a
   * montagem estourava (era o que acontecia, todas as vezes), a exceção subia direto:
   *
   *   - os DOIS bancos de rascunho ficavam de pé no servidor. Foi essa a pegada que permitiu
   *     diagnosticar sem executar nada: `gestao_deriva_sombra` e `gestao_deriva_replay`
   *     existiam, com 427 tabelas e os 27 primeiros arquivos de `prisma/sql/` aplicados — e
   *     uma corrida BEM-SUCEDIDA os derruba. Eles eram o cadáver, não o ambiente;
   *   - e o resultado do passo (1), que JÁ ESTAVA CALCULADO em `problemas`, era DESCARTADO. Pior
   *     que não medir: a deriva de migrations × modelo podia estar vermelha e ninguém veria,
   *     porque a saída era um stack trace sobre índice duplicado.
   *
   * Agora: tudo dentro do `try`, os rascunhos derrubados no `finally` em qualquer saída, e uma
   * falha do passo (2) entra como PROBLEMA NOMEADO (saída 1) em vez de derrubar o processo — sem
   * apagar o que o passo (1) já disse.
   */
  try {
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
    try {
      const sombra = await montarSombra();
      const declarados = objetosDoSqlManual();
      const inesperadas = instrucoes(diff(["--from-config-datasource"], sombra)).filter(
        (l) => !declarados.some((nome) => l.includes(nome))
      );
      if (inesperadas.length > 0) {
        problemas.push(
          "BANCO COMPLETO × MODELO tem diferença que `prisma/sql/` não explica.\n" +
            `(objetos manuais conhecidos: ${declarados.length})\n\n` +
            inesperadas.map((l) => `    ${l}`).join("\n")
        );
      }
    } catch (erro) {
      // Passo (2) que não roda não é passo limpo. Ele é um problema, com a causa junto.
      problemas.push(
        "O PASSO (2) NÃO PUDE SER MEDIDO — a sombra não subiu, e portanto NADA se sabe sobre " +
          "banco completo × modelo nesta corrida.\n\n" +
          `    ${erro instanceof Error ? erro.message : String(erro)}`
      );
    }
  } finally {
    await derrubar(NOME_SOMBRA, NOME_REPLAY);
  }

  // A ressalva acompanha o resultado, verde ou vermelho — ver `colisoesComMigrations`.
  const colisoes = colisoesComMigrations();
  const ressalva =
    colisoes.length === 0
      ? ""
      : `\n[deriva] ressalva: ${colisoes.length} objeto(s) de prisma/sql/ também criado(s) por migration — ` +
        "onde há colisão, a definição da MIGRATION é a que fica no banco, e o passo (2) filtra por nome:\n" +
        colisoes.map((c) => `    ${c.nome}  <-  ${c.migration}`).join("\n") +
        "\n";

  if (problemas.length > 0) {
    console.error("\n⚠️ DERIVA ENTRE O BANCO E O MODELO:\n");
    for (const p of problemas) console.error(`${p}\n`);
    if (ressalva !== "") console.error(ressalva);
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
  if (ressalva !== "") console.log(ressalva);
}

await main();
