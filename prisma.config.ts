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
  },
});
