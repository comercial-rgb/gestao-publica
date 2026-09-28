import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma.js";
import { criarReceitaPrevista } from "../../modules/m02-planejamento/servico.js";

/**
 * A RECEITA PREVISTA DA LOA DE DEMONSTRAÇÃO (V22) — para que a LOA de 2026 do ambiente de
 * demonstração saia equilibrada: a despesa fixada nas fichas soma 660.000,00 e a receita prevista
 * tinha só 150.000,00. Os 510.000,00 que faltam são previstos nos quatro impostos do extrato
 * oficial do ementário (já cadastrados em /receita/naturezas), na fonte 500, pelo MESMO serviço
 * que a tela usa (`criarReceitaPrevista`, autorizado no ente).
 *
 * Idempotente: natureza + fonte + exercício já previstos não são previstos de novo.
 * Recusa rodar fora do banco local da V22.
 */

const AUTOR = "admin@cg.pb.gov.br";
const EXERCICIO = 2026;
const PREVISOES = [
  { natureza: "11180111", rotulo: "IPTU", valor: "180000.00" },
  { natureza: "11180141", rotulo: "ITBI", valor: "60000.00" },
  { natureza: "11180231", rotulo: "ISSQN", valor: "220000.00" },
  { natureza: "11130311", rotulo: "IRRF – Trabalho", valor: "50000.00" },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/\/gestao_publica_local(\?|$)/.test(url)) {
    throw new Error("Recusado: este script só prevê receita no banco gestao_publica_local. Nada foi feito.");
  }
  const prisma = criarPrismaClient(url);
  try {
    for (const p of PREVISOES) {
      const ja = await prisma.receitaPrevista.findFirst({
        where: { exercicio: EXERCICIO, naturezaReceita: { codigo: p.natureza }, fonte: { codigo: "500" } },
        select: { valorPrevisto: true },
      });
      if (ja !== null) {
        console.log(`= ${p.rotulo} (${p.natureza}/500): já prevista em ${ja.valorPrevisto.toFixed(2)}`);
        continue;
      }
      await criarReceitaPrevista(
        { exercicio: EXERCICIO, naturezaReceita: p.natureza, fonte: "500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: p.valor, criadoPor: AUTOR },
        criarM02Deps(prisma)
      );
      console.log(`+ ${p.rotulo} (${p.natureza}/500): prevista em ${p.valor}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
