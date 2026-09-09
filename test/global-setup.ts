import "dotenv/config";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { erroDeBancoInacessivel } from "./banco.js";
import { alvoDoBanco, urlDoBancoDeTeste } from "./db-teste.js";

/**
 * GLOBAL SETUP do Vitest — roda UMA vez, antes de toda a suíte.
 *
 * 1. Aplica o guarda-chuva (aborta se DATABASE_URL_TEST faltar ou for igual ao
 *    DATABASE_URL) — ANTES de qualquer conexão.
 * 2. Cria o database de teste se ele não existir.
 * 3. Aplica as migrations nele (`prisma migrate deploy`).
 * 4. Aplica o SQL que o Prisma não expressa (índices parciais em prisma/sql/).
 *
 * ⚠️ BANCO INACESSÍVEL = FALHA, NUNCA SKIP. Esta é a PRIMEIRA das duas linhas de defesa
 * contra o falso-verde (a segunda é o `exigirBanco` no topo de cada arquivo de teste).
 * Ela é a que dá a mensagem boa; a outra é a que impede que os 700 testes evaporem em
 * silêncio se alguém rodar com outra config. Ver `banco.ts` para o porquê das duas.
 *
 * O seed MÍNIMO não é feito aqui: cada teste de integração semeia o que precisa
 * no seu próprio `beforeEach`.
 */
export default async function setup(): Promise<void> {
  // (1) FAIL-CLOSED antes de tudo.
  const urlTeste = urlDoBancoDeTeste();
  const alvo = alvoDoBanco(urlTeste);

  // (2) cria o database de teste, se preciso. Conecta no `postgres` (database
  //     administrativo) porque não dá para criar um database estando dentro dele.
  const urlAdmin = new URL(urlTeste);
  urlAdmin.pathname = "/postgres";
  urlAdmin.search = "";

  const admin = new Client({ connectionString: urlAdmin.toString() });

  // ⚠️ FAIL-HARD, E COM ENDEREÇO. O `connect()` já derrubava a execução — mas com um
  // `ECONNREFUSED ::1:5432` cru, que não diz ao humano o que fazer. Agora ele diz: o
  // container é o `pg-siafic`, e o comando é `docker start pg-siafic`. Ver `banco.ts`.
  try {
    await admin.connect();
  } catch (causa) {
    throw erroDeBancoInacessivel(urlTeste, causa);
  }

  try {
    const existe = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [alvo.database]
    );
    if (existe.rowCount === 0) {
      // identificador não é parametrizável — daí a checagem de formato.
      if (!/^[a-zA-Z0-9_]+$/.test(alvo.database)) {
        throw new Error(
          `Nome de database inseguro para CREATE: "${alvo.database}".`
        );
      }
      await admin.query(`CREATE DATABASE "${alvo.database}"`);
      console.log(`[teste] database "${alvo.database}" criado.`);
    }
  } finally {
    await admin.end();
  }

  // (3) migrations no banco de TESTE. `prisma migrate deploy` lê DATABASE_URL
  //     (via prisma.config.ts), então sobrescrevemos só para este processo.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: urlTeste },
    stdio: "pipe",
  });

  // (4) TODO SQL fora do alcance do Prisma — índices parciais etc. Sem isto, os
  //     testes de duplo estorno (M01, M04), que provam o append-only sob
  //     concorrência, passariam a testar nada. Aplica a pasta inteira: um SQL
  //     novo em prisma/sql/ entra na suíte sozinho, sem editar este arquivo.
  const cliente = new Client({ connectionString: urlTeste });
  await cliente.connect();
  try {
    const arquivos = readdirSync("prisma/sql")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const arquivo of arquivos) {
      const sql = readFileSync(join("prisma/sql", arquivo), "utf8");
      // idempotente: os índices podem já existir de uma rodada anterior.
      // /gi: um arquivo pode trazer MAIS DE UM índice (o do M05 traz dois).
      await cliente.query(
        sql.replace(
          /CREATE UNIQUE INDEX/gi,
          "CREATE UNIQUE INDEX IF NOT EXISTS"
        )
      );
    }
    console.log(`[teste] SQL manual aplicado: ${arquivos.join(", ")}`);
  } finally {
    await cliente.end();
  }

  console.log(
    `[teste] banco isolado pronto: ${alvo.host}:${alvo.porta}/${alvo.database}` +
      `?schema=${alvo.schema}`
  );
}
