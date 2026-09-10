import "dotenv/config";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { erroDeBancoInacessivel } from "./banco.js";
import { alvoDoBanco, urlDoBancoDeTeste } from "./db-teste.js";
import { travarASuite } from "./trava-da-suite.js";
import {
  papelDoAmbiente,
  provisionarPapelDeRuntime,
} from "../prisma/papel-runtime.js";

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
 *
 * ⚠️ E ELE TOMA A TRAVA DA SUÍTE ANTES DE TOCAR NO BANCO. Duas execuções do Vitest contra
 * o mesmo banco se destroem — e o modo de falha é indireto o bastante para custar horas de
 * investigação num defeito que não existe. Já custou: ver `test/trava-da-suite.ts`.
 */
export default async function setup(): Promise<() => Promise<void>> {
  // (1) FAIL-CLOSED antes de tudo.
  const urlTeste = urlDoBancoDeTeste();
  const alvo = alvoDoBanco(urlTeste);

  // (1b) UM PROCESSO POR BANCO. Antes do migrate, antes do SQL manual, antes de qualquer
  //      escrita: se há outra suíte rodando, ela precisa saber AGORA, e não depois de
  //      contaminar o banco por 107 minutos.
  const trava = await travarASuite(urlTeste);

  // ⚠️ TUDO O QUE VEM DEPOIS DA TRAVA VAI DENTRO DO `try`. Se o migrate falhar (ou o SQL
  // manual, ou o papel de runtime), o trinco TEM de sair junto — senão a próxima execução
  // encontra um banco livre e uma trava presa por um processo que já morreu, e a mensagem
  // que era para ajudar vira o novo problema.
  try {
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

      // (5) O PAPEL DE RUNTIME. Ele tem de existir ANTES da suíte porque os testes de
      //     isolamento conectam COM ELE — e um teste de isolamento rodado com o papel
      //     errado (superusuário dono das tabelas) passa provando nada. Reprovisionar a
      //     cada execução realinha os grants com o schema que as migrations acabaram de
      //     aplicar: tabela nova entra com SELECT/INSERT, e UPDATE/DELETE continuam
      //     saindo só do censo assinado em prisma/papel-runtime.ts.
      await provisionarPapelDeRuntime(cliente, papelDoAmbiente());
      console.log("[teste] papel de runtime provisionado.");
    } finally {
      await cliente.end();
    }

    console.log(
      `[teste] banco isolado pronto: ${alvo.host}:${alvo.porta}/${alvo.database}` +
        `?schema=${alvo.schema}`
    );
  } catch (erro) {
    await trava.liberar();
    throw erro;
  }

  // O TEARDOWN do Vitest. Ele roda depois do último arquivo — e se o processo for morto
  // antes disso, o trinco morre com a conexão de qualquer jeito. Ver `trava-da-suite.ts`.
  return async () => {
    await trava.liberar();
  };
}
