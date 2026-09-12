import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

/**
 * APLICA O SQL QUE O PRISMA NÃO EXPRESSA (prisma/sql/) — o passo que faltava no roteiro de subida.
 *
 * ⚠️ POR QUE ISTO EXISTE (Achado A da S-fechamento). A suíte de testes aplica esta pasta sozinha
 * (`test/global-setup.ts`), mas o roteiro de subida de um banco de DEMONSTRAÇÃO era
 * `migrate deploy` + seeds — e `migrate deploy` NÃO cria índices parciais nem CHECKs condicionais,
 * porque o schema.prisma não sabe expressá-los. O resultado silencioso: um banco de demonstração
 * ficava SEM as travas de append-only (duplo estorno, dotação inicial única, XOR do movimento
 * contratual). Os testes passavam — eles aplicam o SQL — enquanto o ambiente demonstrado não tinha
 * as travas. Este script fecha esse buraco, e o roteiro do README-POC passa a chamá-lo (hoje
 * em `docs/historico/poc-pregao-330-2026/README-POC.md`).
 *
 * IDEMPOTENTE: `CREATE UNIQUE INDEX` vira `... IF NOT EXISTS` (mesma transformação do global-setup),
 * então rodar duas vezes é no-op. Aplica a pasta INTEIRA e ordenada: um `.sql` novo entra sozinho,
 * sem editar este arquivo.
 *
 * Uso:  npm run db:sql
 */

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL não configurada — não há banco onde aplicar as travas de prisma/sql/.");
}

const cliente = new Client({ connectionString: url });
await cliente.connect();
try {
  const arquivos = readdirSync("prisma/sql")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (arquivos.length === 0) {
    console.log("[db:sql] prisma/sql/ está vazia — nada a aplicar.");
  }
  for (const arquivo of arquivos) {
    const sql = readFileSync(join("prisma/sql", arquivo), "utf8");
    // /gi: um arquivo pode trazer MAIS DE UM índice (o do M05 traz dois).
    await cliente.query(sql.replace(/CREATE UNIQUE INDEX/gi, "CREATE UNIQUE INDEX IF NOT EXISTS"));
    console.log(`[db:sql] ✓ ${arquivo}`);
  }
  console.log(`[db:sql] ${arquivos.length} arquivo(s) aplicado(s) — as travas que o Prisma não expressa estão no banco.`);
} finally {
  await cliente.end();
}
