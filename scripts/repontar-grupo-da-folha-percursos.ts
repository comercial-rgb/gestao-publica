import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * CIRURGIA NO BANCO DE DEMONSTRAÇÃO — repontar o grupo de empenho da folha para a ficha de
 * PESSOAL. Parte da resolução de `FICHA-DE-PESSOAL-NOS-PERCURSOS`.
 *
 * ⚠️ ISTO NÃO É CAPACIDADE DO PRODUTO, E O PRODUTO A PROÍBE DE PROPÓSITO. Trocar a ficha de um
 * grupo já empenhado moveria a despesa de dotação sem tocar num lançamento, e por isso `fichaId`
 * está FORA do grant do papel de runtime (`prisma/papel-runtime.ts`). Este script roda como DONO
 * do banco, sobre o banco de DEMONSTRAÇÃO, e existe por uma razão medida: o grupo dos percursos
 * nasceu apontado para uma ficha de 339039 com 1.000,00 disponíveis, a apropriação parava no
 * primeiro servidor, e sem empenho não havia o que liquidar — o percurso do atesto nunca
 * alcançava o caminho completo.
 *
 * ⚠️ REPONTAR, E NÃO APAGAR. Os empenhos já gerados por este grupo são FATOS no razão e ficam
 * intactos, com a ficha que era a deles: a tela mostra a ficha DO EMPENHO, não a do grupo. O que
 * muda é para onde vão os PRÓXIMOS. Apagar o grupo levaria junto o elo competência × despesa de
 * uma folha de demonstração — evidência que existe e que não há motivo para destruir.
 *
 * Uso: `DATABASE_URL=<percursos> npx tsx scripts/repontar-grupo-da-folha-percursos.ts`
 * Idempotente: grupo já apontado para a ficha de pessoal é no-op.
 */

const NATUREZA_DA_FOLHA = process.env["NATUREZA_DA_FOLHA"] ?? "319011";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    const alvo = await prisma.fichaOrcamentaria.findFirst({
      where: { naturezaDespesa: { codigoCompleto: NATUREZA_DA_FOLHA } },
      orderBy: { saldoDisponivel: "desc" },
      select: { id: true, numero: true, saldoDisponivel: true },
    });
    if (alvo === null) throw new Error(`Não há ficha de ${NATUREZA_DA_FOLHA} neste banco. Rode antes scripts/ficha-de-pessoal-percursos.ts.`);

    const grupos = await prisma.grupoDeEmpenhoDaFolha.findMany({
      select: { id: true, codigo: true, fichaId: true, ficha: { select: { numero: true, saldoDisponivel: true, naturezaDespesa: { select: { codigoCompleto: true } } } }, _count: { select: { empenhos: true } } },
    });
    for (const g of grupos) {
      if (g.fichaId === alvo.id) {
        console.log(`[repontar] ${g.codigo} já aponta para a ficha ${alvo.numero} — no-op.`);
        continue;
      }
      await prisma.grupoDeEmpenhoDaFolha.update({ where: { id: g.id }, data: { fichaId: alvo.id } });
      console.log(
        `[repontar] ${g.codigo}: ficha ${g.ficha.numero} (${g.ficha.naturezaDespesa.codigoCompleto}, disponível ${String(g.ficha.saldoDisponivel)}) ` +
          `-> ficha ${alvo.numero} (${NATUREZA_DA_FOLHA}, disponível ${String(alvo.saldoDisponivel)}). ` +
          `${g._count.empenhos} empenho(s) já gerado(s) por ele CONTINUAM na ficha que era a deles.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
