import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";

/**
 * QUANTO DO EIXO FINANCEIRO DO PATRIMÔNIO ESTÁ PARAMETRIZADO — a medição que abre o ENT11.
 *
 * ⚠️ ELA MORA EM `scripts/` E NÃO NUM `-e` DE TERMINAL. Uma sonda fora do projeto não acha
 * `dotenv/config` nem o cliente gerado, e a falha chega como "módulo não encontrado" —
 * acusando a sonda, não o banco. Já custou cinco tentativas num lote anterior.
 */
const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL não configurada — não há banco para medir.");
}

const prisma = criarPrismaClient(url);
try {
  const [roteiros, resultados, contas, analiticas, classes, movimentos] = await Promise.all([
    prisma.roteiroPatrimonial.count(),
    prisma.roteiroResultadoAlienacao.count(),
    prisma.contaPcasp.count(),
    prisma.contaPcasp.count({ where: { analitica: true } }),
    prisma.classeDeBens.count(),
    prisma.movimentoPatrimonial.count(),
  ]);

  const parametrizados = await prisma.roteiroPatrimonial.findMany({
    select: { tipo: true },
    orderBy: { tipo: "asc" },
  });

  console.log(`RoteiroPatrimonial ............ ${roteiros}`);
  console.log(`RoteiroResultadoAlienacao ..... ${resultados}`);
  console.log(`ContaPcasp .................... ${contas} (${analiticas} analiticas)`);
  console.log(`ClasseDeBens .................. ${classes}`);
  console.log(`MovimentoPatrimonial .......... ${movimentos}`);
  console.log(`tipos parametrizados: ${parametrizados.map((r) => r.tipo).join(", ") || "(nenhum)"}`);
} finally {
  await prisma.$disconnect();
}
