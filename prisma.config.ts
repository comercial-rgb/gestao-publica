import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7: schema multi-arquivo = apontar para a PASTA que contém os .prisma.
// O arquivo com datasource/generator (_base.prisma) deve estar dentro dela.
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),

    // ⚠️ O BANCO DE SOMBRA SÓ EXISTE PARA O `migrate diff --from-migrations`, que precisa
    // REPRODUZIR as migrations num banco vazio para saber o que elas produzem. Quem o
    // define é `scripts/deriva-de-schema.ts` (npm run deriva), que cria e derruba o banco
    // na mesma execução — ver o cabeçalho daquele arquivo.
    //
    // ⚠️ A CHAVE SÓ EXISTE QUANDO A VARIÁVEL EXISTE, e não é firula: `env()` LANÇA quando
    // a variável está ausente — não devolve indefinido. Declará-la incondicionalmente
    // quebrou `prisma validate` e `prisma migrate dev` para todo mundo que não estivesse
    // rodando o guard de deriva.
    ...(process.env["SHADOW_DATABASE_URL"] !== undefined
      ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }
      : {}),
  },
});
