import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { publicarRoteiroOrcamentario } from "../../modules/m05-despesa/servico-roteiro-orcamentario.js";

/**
 * PARAMETRIZAÇÃO DE DEMONSTRAÇÃO (V22) — as decisões contábeis que o ente tomaria na tela de
 * roteiros orçamentários, tomadas aqui para o AMBIENTE DE DEMONSTRAÇÃO, pelo mesmo serviço que a
 * tela chama (`publicarRoteiroOrcamentario`, versionado, com fundamento). Num ente real, quem
 * publica é o contador do ente, em `/contabilidade/roteiros-orcamentarios`.
 *
 * Decisão: a RESERVA DE DOTAÇÃO é pré-empenho, e no PCASP o crédito pré-empenhado tem conta
 * própria dentro do crédito indisponível — 6.2.2.1.2.02.00 CRÉDITO PRÉ-EMPENHADO. As irmãs não
 * servem: .01 BLOQUEIO DE CRÉDITO é contingenciamento (limitação de empenho, LRF art. 9º), e .99 é
 * residual. Pendência que isto resolve na demonstração: `ROTEIRO-RESERVA-SEM-CONTA`.
 *
 * Idempotente: roteiro já publicado com as mesmas contas não gera versão nova.
 * Recusa rodar fora do banco local da V22.
 */

const DISPONIVEL = "6.2.2.1.1.00.00";
const PRE_EMPENHADO = "6.2.2.1.2.02.00";
const AUTOR = "admin@cg.pb.gov.br";

const ROTEIROS = [
  {
    tipo: "RESERVA",
    contaDebitoCodigo: DISPONIVEL,
    contaCreditoCodigo: PRE_EMPENHADO,
    fundamento:
      "Reserva de dotação é pré-empenho: o crédito sai do disponível para o crédito indisponível " +
      "pré-empenhado (PCASP 6.2.2.1.2.02). Configuração do ambiente de demonstração.",
  },
  {
    tipo: "RESERVA_LIBERADA",
    contaDebitoCodigo: PRE_EMPENHADO,
    contaCreditoCodigo: DISPONIVEL,
    fundamento:
      "Liberação da reserva não usada: o pré-empenhado volta ao crédito disponível — o inverso da " +
      "reserva. Configuração do ambiente de demonstração.",
  },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/\/gestao_publica_local(\?|$)/.test(url)) {
    throw new Error("Recusado: este script só parametriza o banco gestao_publica_local. Nada foi feito.");
  }
  const prisma = criarPrismaClient(url);
  try {
    for (const r of ROTEIROS) {
      const vigente = await prisma.roteiroOrcamentario.findFirst({
        where: { tipo: r.tipo },
        orderBy: { versao: "desc" },
        select: { versao: true, contaDebito: { select: { codigo: true } }, contaCredito: { select: { codigo: true } } },
      });
      if (vigente !== null && vigente.contaDebito.codigo === r.contaDebitoCodigo && vigente.contaCredito.codigo === r.contaCreditoCodigo) {
        console.log(`= ${r.tipo}: já publicado (versão ${vigente.versao}), D ${r.contaDebitoCodigo} / C ${r.contaCreditoCodigo}`);
        continue;
      }
      const p = await publicarRoteiroOrcamentario(prisma, { ...r, tipoCredito: null, abertura: null, criadoPor: AUTOR });
      console.log(`+ ${r.tipo}: publicado na versão ${p.versao}, D ${r.contaDebitoCodigo} / C ${r.contaCreditoCodigo}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
