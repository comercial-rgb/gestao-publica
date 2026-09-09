import "dotenv/config";
import { pathToFileURL } from "node:url";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../../modules/m05-despesa/dominio.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import type { PrismaClient } from "../generated/client/client.js";

/**
 * MASSA POC — A FILA DO ART. 141 (ordem cronológica com posição aberta).
 *
 * ⚠️ POR QUE ESTE SEED EXISTE. A massa principal (`sagres-poc.ts`) PAGA tudo o que liquida — a
 * história dela é a cadeia completa empenho→liquidação→pagamento. O efeito colateral é que a fila
 * do art. 141 fica VAZIA: ela é derivada de "despesa liquidada e ainda não paga", e não havia
 * nenhuma. A tela de ordem cronológica então dizia, com toda a razão, que não há fila — e não
 * havia o que demonstrar sobre o controle que a Lei 14.133 exige.
 *
 * Este seed acrescenta o que faltava: DUAS liquidações SEM pagamento, para que a fila tenha
 * posição 1 e posição 2 e a ordenação por data de exigibilidade fique visível na tela.
 *
 * ⚠️ ISTO MUDA NÚMEROS DE OUTROS DEMONSTRATIVOS, e é para mudar mesmo: passivo de fornecedores
 * sobe, a disponibilidade de caixa por fonte (RGF Anexo 5) passa a ter obrigação a descontar, e o
 * liquidado do exercício cresce sem o pago correspondente. É a situação NORMAL de um ente em
 * qualquer dia do ano — um município que nunca deve nada a ninguém é que seria a ficção.
 *
 * ⚠️ PELOS SERVIÇOS REAIS, nunca por INSERT. `empenhar` e `liquidar` são as mesmas funções que a
 * tela chama: a massa nasce com as travas do domínio (saldo de dotação, TR 4.51) e o funil
 * contábil aplicados. Um INSERT direto criaria uma fila que o razão não conhece.
 *
 * ⚠️ AS DATAS SÃO DE SETEMBRO, dentro do período que a massa principal já cobre — assim os
 * pacotes SAGRES diários desses dias ganham os novos fatos, em vez de abrir um mês novo e vazio.
 *
 * Uso:  npm run seed:poc-fila   (depois de seed:sagres-poc)
 */

const ADMIN_PADRAO = "admin@cg.pb.gov.br";
const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});

/** As duas pendências. Credores DISTINTOS: a fila é por credor, e um só credor esconderia isso. */
const PENDENCIAS = [
  { numero: "10", valor: "8000.00", dataEmpenho: D(9, 22), dataLiquidacao: D(9, 24), credor: "98765432000188", descricao: "Manutencao predial - POC" },
  { numero: "11", valor: "4500.00", dataEmpenho: D(9, 25), dataLiquidacao: D(9, 28), credor: "11222333000144", descricao: "Material de expediente - POC" },
] as const;

export async function semearFilaPoc(prisma: PrismaClient, criadoPor = ADMIN_PADRAO): Promise<void> {
  // GUARDA: pelo primeiro número de empenho desta fatia. Rodar de novo é no-op — nunca duplica a fila.
  const ja = await prisma.empenho.findFirst({ where: { numero: PENDENCIAS[0].numero }, select: { id: true } });
  if (ja !== null) {
    console.log("[seed:poc-fila] empenhos da fila já existem — no-op (idempotente).");
    return;
  }

  const deps = criarM05DepsComAlmoxarifado(prisma);
  const sub = await prisma.subelemento.findFirstOrThrow({ where: { codigo: "040" }, select: { id: true } });

  for (const p of PENDENCIAS) {
    const emp = await empenhar(
      {
        fichaId: "ficha-poc", numero: p.numero, tipo: "ORDINARIO", valor: p.valor, data: p.dataEmpenho,
        credorCpfCnpj: p.credor, historico: `Empenho ${p.descricao}`,
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", subelementoId: sub.id, criadoPor,
      },
      R_EMPENHO, deps
    );
    // LIQUIDA e PARA. É a ausência do `pagar` que põe a linha na fila — o saldo a pagar
    // remanescente é exatamente o que o art. 141 ordena por data de exigibilidade.
    await liquidar(
      {
        empenhoId: emp.empenhoId, numero: p.numero, valor: p.valor, data: p.dataLiquidacao,
        responsavelAtesto: "Ordenador POC", historico: `Liquidacao ${p.descricao}`, criadoPor,
      },
      R_LIQUIDACAO, deps
    );
  }

  const total = PENDENCIAS.reduce((s, p) => s + Number(p.valor), 0).toFixed(2);
  console.log(`[seed:poc-fila] ${PENDENCIAS.length} liquidação(ões) sem pagamento — fila do art. 141 com ${total} a pagar.`);
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const prisma = criarPrismaClient(url);
  try {
    await semearFilaPoc(prisma as unknown as PrismaClient);
  } finally {
    await prisma.$disconnect();
  }
}

const ehEntrada = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehEntrada) {
  main().catch((e: unknown) => {
    console.error("[seed:poc-fila] FALHOU:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
