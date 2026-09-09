import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { raizesExistentes } from "./raizes-dominio.js";

/**
 * ISOLAMENTO ENTRE REQUISIÇÕES — o teste 8 do incremento, e o pré-requisito do lote de
 * tenancy.
 *
 * ═══ A FALHA QUE ISTO EXISTE PARA IMPEDIR ═══
 * O servidor mantém UM pool de conexões por processo. Uma requisição pega uma conexão,
 * usa e devolve; a próxima requisição — de OUTRO usuário — pode pegar a MESMA conexão
 * física. Tudo que ficou gravado no **estado de sessão** daquela conexão atravessa junto.
 *
 * Hoje isso é teórico: nada neste repositório escreve estado de sessão. O contexto
 * (usuário, unidade, exercício) viaja como ARGUMENTO, atravessando as funções até o
 * `criadoPor` do fato.
 *
 * ⚠️ MAS O ADR DO EIXO DE MUNICÍPIO (docs/adr) escolheu **schema por município**, e o
 * jeito natural de implementar isso é `SET search_path`. É exatamente o formato de
 * vazamento que este arquivo mede: o `search_path` do Município A sobrevivendo na conexão
 * devolvida ao pool, e a requisição seguinte — do Município B — lendo as tabelas de A.
 * Sem erro, sem exceção, sem log. **Só o dado errado.**
 *
 * Por isso o teste não se contenta em dizer "não há SET no código". Ele MEDE o vazamento
 * num pool de verdade, para que ninguém precise acreditar que ele é possível — e para que
 * quem for implementar o schema por município já encontre a rede montada.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

function urlDeTeste(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim() === "") {
    throw new Error("DATABASE_URL não definida no processo de teste — ver test/setup.ts.");
  }
  return url;
}

/**
 * ⚠️ `max: 1` NÃO É ATALHO — É O QUE TORNA A MEDIÇÃO DETERMINÍSTICA.
 *
 * Com o pool aberto num tamanho maior, a segunda "requisição" poderia pegar outra conexão
 * e o teste passaria por sorte, escondendo o vazamento. Com uma conexão só, a reutilização
 * é CERTA — e é justamente o caso que acontece em produção quando o pool está saturado,
 * que é quando o sistema está sob carga e ninguém está olhando.
 */
const pool = new Pool({ connectionString: urlDeTeste(), max: 1 });

afterAll(async () => {
  await pool.end();
});

/** Uma "requisição": pega do pool, faz o que tem de fazer, devolve. */
async function requisicao<T>(f: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    return await f(c);
  } finally {
    c.release();
  }
}

describe("isolamento entre requisições — o pool não carrega contexto", () => {
  it("MEDIDO: um SET de sessão SOBREVIVE à requisição e contamina a seguinte", async () => {
    // Requisição 1 — o "Município A" marca a conexão.
    await requisicao(async (c) => {
      await c.query("SET app.municipio = 'MUNICIPIO_A'");
      const { rows } = await c.query<{ v: string }>(
        "SELECT current_setting('app.municipio', true) AS v"
      );
      expect(rows[0]?.v).toBe("MUNICIPIO_A");
    });

    // Requisição 2 — outro usuário, outra requisição, MESMA conexão física.
    const vazou = await requisicao(async (c) => {
      const { rows } = await c.query<{ v: string | null }>(
        "SELECT current_setting('app.municipio', true) AS v"
      );
      return rows[0]?.v ?? null;
    });

    expect(
      vazou,
      "\n\n⚠️ ESTE TESTE PROVA O VAZAMENTO, e é para ele PASSAR assim.\n\n" +
        "Um `SET` de sessão atravessa a devolução ao pool. Se este teste um dia falhar " +
        "porque o valor NÃO vazou, alguma coisa mudou no driver ou no pool — e a " +
        "conclusão dos outros testes deste arquivo precisa ser reexaminada, não " +
        "celebrada.\n"
    ).toBe("MUNICIPIO_A");

    // Limpeza: a conexão é a mesma, e deixá-la suja contaminaria os testes seguintes —
    // o que é, ele próprio, o ponto deste arquivo.
    await requisicao((c) => c.query("RESET app.municipio"));
  });

  it("`SET LOCAL` dentro de transação NÃO sobrevive — é a forma segura, se um dia precisar", async () => {
    await requisicao(async (c) => {
      await c.query("BEGIN");
      await c.query("SET LOCAL app.municipio = 'MUNICIPIO_B'");
      const dentro = await c.query<{ v: string }>(
        "SELECT current_setting('app.municipio', true) AS v"
      );
      expect(dentro.rows[0]?.v).toBe("MUNICIPIO_B");
      await c.query("COMMIT");
    });

    const depois = await requisicao(async (c) => {
      const { rows } = await c.query<{ v: string | null }>(
        "SELECT current_setting('app.municipio', true) AS v"
      );
      return rows[0]?.v ?? null;
    });

    // ⚠️ A DIFERENÇA ENTRE OS DOIS TESTES É UMA PALAVRA — `LOCAL` — e ela é a diferença
    // entre isolamento e vazamento silencioso. Quem for implementar schema por município
    // precisa desta linha na cabeça antes de escrever a primeira.
    expect(depois === null || depois === "").toBe(true);
  });

  it("nenhum SET de sessão no código de produção — o contexto viaja como ARGUMENTO", () => {
    const infratores: string[] = [];

    const varrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
          varrer(p);
          continue;
        }
        if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;

        const rel = p.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
        const fonte = readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

        // `SET LOCAL` e `set_config(..., true)` são as formas de TRANSAÇÃO — permitidas.
        // O que se proíbe é a forma de SESSÃO, que sobrevive à devolução ao pool.
        for (const [padrao, oQue] of [
          [/["'`]\s*SET\s+(?!LOCAL\b)[a-z_][\w.]*\s*(=|TO)\s/i, "SET de sessão"],
          [/["'`]\s*SET\s+ROLE\b/i, "SET ROLE"],
          [/set_config\s*\([^)]*,\s*false\s*\)/i, "set_config(..., false)"],
          [/["'`]\s*SET\s+search_path\b/i, "SET search_path"],
        ] as const) {
          if (padrao.test(fonte)) infratores.push(`${rel} → ${oQue}`);
        }
      }
    };

    for (const r of raizesExistentes(RAIZ)) varrer(r);
    varrer(join(RAIZ, "lib"));
    varrer(join(RAIZ, "packages"));

    expect(
      infratores,
      "\n\n⚠️ ESTADO DE SESSÃO NO CÓDIGO DE PRODUÇÃO.\n\n" +
        "O primeiro teste deste arquivo mede o que acontece: o valor sobrevive à " +
        "devolução da conexão ao pool e a próxima requisição — de outro usuário, de " +
        "outro município — o encontra lá. Sem erro e sem log.\n\n" +
        "Se o contexto precisa mesmo chegar ao banco, use a forma de TRANSAÇÃO " +
        "(`SET LOCAL`, `set_config(..., true)`), que morre no commit. O caminho " +
        "preferido continua sendo o de hoje: o contexto viaja como ARGUMENTO até o " +
        "`criadoPor` do fato.\n\nOcorrências:\n"
    ).toEqual([]);
  });
});
