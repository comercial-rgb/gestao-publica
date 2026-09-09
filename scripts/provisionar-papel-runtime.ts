import "dotenv/config";
import { Client } from "pg";
import {
  papelDoAmbiente,
  provisionarPapelDeRuntime,
  urlDoRuntime,
} from "../prisma/papel-runtime.js";

/**
 * Provisiona o papel de runtime nos bancos indicados. Conecta como DONO (a URL do
 * ambiente) e concede ao papel; ao final, CONFERE conectando como o próprio papel.
 *
 * Uso:
 *   npm run db:papel                    # DATABASE_URL e DATABASE_URL_TEST
 *   npm run db:papel -- <url>           # um banco específico
 *   APP_DB_SCHEMA=<schema> npm run db:papel
 *
 * ⚠️ O SCHEMA É PARÂMETRO (default `public`). Ver
 * `docs/adr/ADR-eixo-de-municipio.md`: o produto vai atender vários municípios por
 * schema por município, e é este script que dá acesso da aplicação a cada schema novo.
 * Enquanto houver um só, o default cobre tudo — mas a suposição sai do código agora,
 * enquanto é barata.
 *
 * ⚠️ Rode-o DEPOIS de `prisma migrate deploy`: os grants são sobre tabelas que têm de
 * existir. Rodar de novo depois de uma migration nova é barato e idempotente — e é o que
 * realinha o papel com o schema.
 */
async function provisionarEm(urlDoDono: string, schema: string): Promise<void> {
  const papel = papelDoAmbiente();
  const dono = new Client({ connectionString: urlDoDono });
  await dono.connect();
  try {
    await provisionarPapelDeRuntime(dono, papel, schema);
  } finally {
    await dono.end();
  }

  // A CONFERÊNCIA É O PONTO. Um provisionamento que não se prova é uma promessa: o
  // interessante aqui não é "os comandos rodaram", é "o papel entra e NÃO é superusuário".
  const comoPapel = new Client({
    connectionString: urlDoRuntime(urlDoDono, papel),
  });
  await comoPapel.connect();
  try {
    const { rows } = await comoPapel.query<{
      usuario: string;
      superusuario: boolean;
      bypassrls: boolean;
      pode_criar: string | null;
    }>(
      // ⚠️ A CONFERÊNCIA PERGUNTA PELO SCHEMA PROVISIONADO, não por `public`. Conceder
      // num schema e conferir noutro é o jeito de um provisionamento passar sem ter
      // acontecido — e com um schema por município isso deixaria de ser hipótese.
      `SELECT current_user AS usuario,
              r.rolsuper    AS superusuario,
              r.rolbypassrls AS bypassrls,
              has_schema_privilege(current_user, $1, 'CREATE')::text AS pode_criar
         FROM pg_roles r WHERE r.rolname = current_user`,
      [schema]
    );
    const l = rows[0];
    if (l === undefined) throw new Error("pg_roles não devolveu o papel corrente.");
    if (l.superusuario || l.bypassrls || l.pode_criar === "true") {
      throw new Error(
        `Papel "${l.usuario}" provisionado com privilégio a mais ` +
          `(superusuario=${l.superusuario}, bypassrls=${l.bypassrls}, CREATE em ${schema}=${l.pode_criar}).`
      );
    }
    const alvo = new URL(urlDoDono).pathname.replace(/^\//, "");
    console.log(
      `[papel] ${alvo} (schema ${schema}): "${l.usuario}" ok — sem superusuário, sem BYPASSRLS, sem DDL.`
    );
  } finally {
    await comoPapel.end();
  }
}

async function main(): Promise<void> {
  const informadas = process.argv.slice(2);
  const urls =
    informadas.length > 0
      ? informadas
      : [process.env["DATABASE_URL"], process.env["DATABASE_URL_TEST"]].filter(
          (u): u is string => typeof u === "string" && u.trim() !== ""
        );

  if (urls.length === 0) {
    throw new Error(
      "Nenhum banco para provisionar: defina DATABASE_URL (e DATABASE_URL_TEST) ou passe a URL como argumento."
    );
  }

  // Um schema por execução: provisionar N schemas de uma vez esconderia qual deles
  // falhou. Quem provisiona vários chama o script várias vezes, e vê o resultado de cada.
  const schema = (process.env["APP_DB_SCHEMA"] ?? "public").trim() || "public";

  for (const url of urls) {
    await provisionarEm(url, schema);
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
