import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { publicarRoteiroOrcamentario } from "../../modules/m05-despesa/servico-roteiro-orcamentario.js";
import {
  classificarAcaoParaOManad,
  classificarNaturezaDespesaParaOManad,
  classificarNaturezaReceitaParaOManad,
  classificarUnidadeParaOManad,
} from "../../modules/m02-planejamento/classificacao-do-manad.js";

/**
 * A CLASSIFICAÇÃO PARA O MANAD deste banco — o que o ente responderia na tela
 * `/contabilidade/exportacoes-federais/classificacao`, pelo MESMO serviço, e só onde está pendente:
 * - as unidades são secretarias da Prefeitura (administração direta): 01 - Prefeitura;
 * - não há regime próprio de previdência neste banco: toda ação é 02 - Demais;
 * - as naturezas cadastradas são o último desdobramento do código, portanto analíticas, no nível do
 *   último campo: despesa C.G.MM.EE = nível 4; receita C.O.E.DD.D.T = nível 7 (as 7 posições da
 *   estrutura da natureza da receita, Portaria STN/MF 1.458/2025).
 */
const TIPO_DAS_UNIDADES = "01";
const TIPO_DAS_ACOES = "02";
const NIVEL_DA_DESPESA = 4;
const NIVEL_DA_RECEITA = 7;

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
  if (!/\/gestao_publica_(local|apresentacao)(\?|$)/.test(url)) {
    throw new Error("Recusado: este script só parametriza os bancos de demonstração (gestao_publica_local ou gestao_publica_apresentacao). Nada foi feito.");
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
    // As descrições do ementário foram gravadas com meia-risca ("IPTU – Principal"); a tabela
    // oficial da STN usa hífen ("IPTU - Principal"), e a meia-risca não existe no Latin-1 do
    // arquivo da Receita — o MANAD recusava o cadastro. Corrigido na origem
    // (`lib/portas/recursos/ementario-receita.ts`) e, aqui, no que já estava gravado.
    for (const r of await prisma.naturezaReceita.findMany({ where: { descricao: { contains: "–" } }, select: { codigo: true, descricao: true } })) {
      const nova = r.descricao.replace(/\s*–\s*/g, " - ");
      await prisma.naturezaReceita.update({ where: { codigo: r.codigo }, data: { descricao: nova } });
      console.log(`+ natureza ${r.codigo}: "${r.descricao}" -> "${nova}"`);
    }

    for (const u of await prisma.unidadeOrcamentaria.findMany({ where: { tipoManad: null }, select: { id: true, codigo: true } })) {
      await classificarUnidadeParaOManad(prisma, { unidadeId: u.id, tipo: TIPO_DAS_UNIDADES, criadoPor: AUTOR });
      console.log(`+ MANAD: unidade ${u.codigo} -> ${TIPO_DAS_UNIDADES}`);
    }
    for (const a of await prisma.acao.findMany({ where: { tipoManad: null }, select: { id: true, codigo: true } })) {
      await classificarAcaoParaOManad(prisma, { acaoId: a.id, tipo: TIPO_DAS_ACOES, criadoPor: AUTOR });
      console.log(`+ MANAD: ação ${a.codigo} -> ${TIPO_DAS_ACOES}`);
    }
    for (const d of await prisma.naturezaDespesa.findMany({ where: { OR: [{ indTipoContaManad: null }, { nivelContaManad: null }] }, select: { id: true, codigoCompleto: true } })) {
      await classificarNaturezaDespesaParaOManad(prisma, { naturezaId: d.id, tipoDeConta: "A", nivel: NIVEL_DA_DESPESA, criadoPor: AUTOR });
      console.log(`+ MANAD: natureza da despesa ${d.codigoCompleto} -> A/${NIVEL_DA_DESPESA}`);
    }
    for (const r of await prisma.naturezaReceita.findMany({ where: { OR: [{ indTipoContaManad: null }, { nivelContaManad: null }] }, select: { id: true, codigo: true } })) {
      await classificarNaturezaReceitaParaOManad(prisma, { naturezaId: r.id, tipoDeConta: "A", nivel: NIVEL_DA_RECEITA, criadoPor: AUTOR });
      console.log(`+ MANAD: natureza da receita ${r.codigo} -> A/${NIVEL_DA_RECEITA}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
