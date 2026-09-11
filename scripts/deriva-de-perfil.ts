import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { derivaDePerfil, explicarDeriva } from "../modules/m16-travamento/deriva-de-perfil.js";

/**
 * ⚠️ RELATA, NÃO CONSERTA. Conceder permissão é ato administrativo, com autor responsável e
 * registro de operação — e um script que concedesse seria exatamente o que o bootstrap
 * recusa ser. Ver a nota longa em `modules/m16-travamento/deriva-de-perfil.ts`.
 *
 * Sai com 1 quando há deriva, para caber num gate ou num cron de instalação.
 */
const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL não configurada — não há banco para conferir.");
}
const prisma = criarPrismaClient(url);
try {
  const linhas = await prisma.permissaoDePerfil.findMany({ select: { acao: true } });
  const d = derivaDePerfil(linhas.map((l) => String(l.acao)));
  console.log(explicarDeriva(d));
  process.exitCode = d.semPerfil.length === 0 && d.foraDoCenso.length === 0 ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
