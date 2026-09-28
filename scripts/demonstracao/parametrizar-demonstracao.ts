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

/**
 * O PODER DE CADA ÓRGÃO deste banco (RGF anexo 1, RREO anexo 7). O mapa convencional do seed
 * (`prisma/seed/dados/depara-orgao-poder.ts`) trata o órgão 01 como Câmara; AQUI o órgão 01 é a
 * Prefeitura Municipal, e o 99 é a prefeitura modelo da prova de conceito — os dois do Executivo.
 * Não há Câmara cadastrada neste banco. Decisão do ambiente de demonstração, tomada sobre o
 * cadastro de órgãos que ele tem, e não sobre o do ente real.
 */
const PODER_DOS_ORGAOS = [
  { orgaoCodigo: "01", poder: "EXECUTIVO" },
  { orgaoCodigo: "99", poder: "EXECUTIVO" },
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
    for (const d of PODER_DOS_ORGAOS) {
      const orgao = await prisma.orgao.findFirst({ where: { codigo: d.orgaoCodigo }, select: { nome: true } });
      if (orgao === null) throw new Error(`Órgão ${d.orgaoCodigo} não cadastrado neste banco; o poder dele não foi gravado.`);
      const ja = await prisma.deParaOrgaoPoder.findUnique({ where: { orgaoCodigo: d.orgaoCodigo }, select: { poder: true } });
      if (ja?.poder === d.poder) {
        console.log(`= órgão ${d.orgaoCodigo} (${orgao.nome}): já no poder ${d.poder}`);
        continue;
      }
      await prisma.deParaOrgaoPoder.upsert({
        where: { orgaoCodigo: d.orgaoCodigo },
        update: { poder: d.poder },
        create: { orgaoCodigo: d.orgaoCodigo, poder: d.poder, criadoPor: AUTOR },
      });
      console.log(`+ órgão ${d.orgaoCodigo} (${orgao.nome}): poder ${d.poder}`);
    }
    // A natureza 11130211 veio do seed da POC rotulada "IPTU - Principal". Pela tabela oficial da
    // STN de 2026 (grupo 1113.02) ela é o IRPJ líquido de incentivos; o IPTU é 11180111. A tela do
    // ementário só cadastra natureza nova, e o runtime não tem UPDATE na descrição — a correção do
    // cadastro de demonstração passa por aqui, como dono do banco local.
    const IRPJ = "Imposto sobre a Renda de Pessoa Jurídica - IRPJ - Líquida de Incentivos - Principal";
    const n = await prisma.naturezaReceita.findUnique({ where: { codigo: "11130211" }, select: { descricao: true } });
    if (n !== null && n.descricao !== IRPJ) {
      await prisma.naturezaReceita.update({ where: { codigo: "11130211" }, data: { descricao: IRPJ } });
      console.log(`+ natureza 11130211: "${n.descricao}" -> "${IRPJ}"`);
    } else if (n !== null) {
      console.log("= natureza 11130211: descrição oficial");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
