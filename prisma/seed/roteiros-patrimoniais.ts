import "dotenv/config";
import type { PrismaClient } from "../generated/client/client.js";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * ═══ OS ROTEIROS DA DÍVIDA — CONTAS REAIS DO PCASP, ESCOLHIDAS PELO NOME OFICIAL ═══
 *
 * ⚠️ A PENDÊNCIA QUE ISTO FECHA. No ENT03c o smoke provou que a tela ALCANÇA o caso de uso
 * da dívida fundada e da dívida ativa, e que o caso de uso **RECUSA** por falta de roteiro
 * parametrizado — `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`. A recusa era o comportamento
 * certo: o próprio módulo diz, na mensagem de erro, "as contas do PCASP vêm por PARÂMETRO
 * — nenhuma conta é inventada no código". Faltava a TABELA, e a tabela chegou com o
 * `seed:pcasp-oficial`.
 *
 * ⚠️ O QUE É FATO AQUI, E O QUE É ESCOLHA — a distinção importa mais do que o resultado.
 *
 * **Fato:** todo código abaixo existe no PCASP oficial publicado pelo TCE-PB, é ANALÍTICO
 * (recebe partida) e vem com o nome oficial ao lado, copiado do arquivo. Isso é conferível
 * linha a linha, e o seed RECUSA rodar se qualquer um deixar de existir ou de ser analítico.
 *
 * **Escolha:** QUAL par débito/crédito corresponde a cada evento é doutrina contábil
 * (mecânica do MCASP), não um dado que o arquivo do TCE forneça. A escolha está explicada
 * em cada linha. **Ela é do contador do ente** — este seed a torna explícita e revisável em
 * um lugar só, em vez de deixá-la implícita e espalhada pelo código.
 *
 * ⚠️ A LIMITAÇÃO DO MODELO, NOMEADA. `RoteiroDividaAtiva.tipo` é `@unique`: há UMA linha por
 * tipo de movimento, então UMA conta de dívida ativa para todas as inscrições. Mas o PCASP
 * separa a dívida ativa POR TRIBUTO (IPTU em `1.1.2.5.1.01.05`, ISS em `…07`, ITBI em
 * `…06`). Um município que inscreve IPTU e ISS vai ver os dois na mesma conta, e o
 * demonstrativo por tributo fica impossível. É a família "cardinalidade UM onde o documento
 * pede UM OU MAIS", a mesma da conta multifonte — pendência
 * **`DIVIDA-ATIVA-SEM-TRIBUTO-NO-ROTEIRO`**. Enquanto ela existe, a conta usada é a
 * genérica `…99` (OUTROS IMPOSTOS), que é honesta: não finge ser IPTU.
 */

interface ParDeContas {
  readonly debito: string;
  readonly credito: string;
  readonly porque: string;
}

/**
 * ⚠️ O ESTORNO É O PAR INVERTIDO, e não uma escolha nova. A razão é append-only: estornar
 * não apaga, grava o lançamento contrário. Derivar em vez de repetir impede a divergência
 * em que alguém corrige o roteiro e esquece o do estorno.
 */
function inverso(p: ParDeContas): ParDeContas {
  return {
    debito: p.credito,
    credito: p.debito,
    porque: `inverso de: ${p.porque}`,
  };
}

const DIVIDA_ATIVA_TRIBUTARIA = "1.1.2.5.1.01.99"; // DÍVIDA ATIVA TRIBUTÁRIA DE OUTROS IMPOSTOS
const BANCO_CONTA_MOVIMENTO = "1.1.1.1.1.19.00"; // BANCOS CONTA MOVIMENTO - DEMAIS CONTAS
const GANHO_INCORPORACAO = "4.6.3.9.1.00.00"; // OUTROS GANHOS COM INCORPORAÇÃO DE ATIVOS - CONSOLIDAÇÃO
const DESINCORP_DIVIDA_ATIVA = "3.6.5.1.1.01.00"; // DESINCORPORAÇÃO DE DÍVIDA ATIVA TRIBUTÁRIA
const JUROS_DIVIDA_ATIVA = "4.4.2.4.1.16.00"; // MULTAS E JUROS DE DÍVIDA ATIVA TRIBUTÁRIA

const INSCRICAO: ParDeContas = {
  debito: DIVIDA_ATIVA_TRIBUTARIA,
  credito: GANHO_INCORPORACAO,
  porque:
    "inscrever cria um CRÉDITO A RECEBER que não existia no ativo; a contrapartida é a " +
    "VPA de incorporação. Não é receita orçamentária: a receita só ocorre no recebimento.",
};

const ATUALIZACAO: ParDeContas = {
  debito: DIVIDA_ATIVA_TRIBUTARIA,
  credito: JUROS_DIVIDA_ATIVA,
  porque:
    "a atualização aumenta o crédito a receber contra a VPA de multas e juros da própria " +
    "dívida ativa — a conta que o PCASP nomeia para isso.",
};

const RECEBIMENTO: ParDeContas = {
  debito: BANCO_CONTA_MOVIMENTO,
  credito: DIVIDA_ATIVA_TRIBUTARIA,
  porque:
    "receber troca crédito por disponibilidade: entra no banco, baixa o valor a receber. " +
    "O reflexo ORÇAMENTÁRIO da receita é do M04 e não passa por este roteiro.",
};

const CANCELAMENTO: ParDeContas = {
  debito: DESINCORP_DIVIDA_ATIVA,
  credito: DIVIDA_ATIVA_TRIBUTARIA,
  porque:
    "cancelar (prescrição, remissão, decisão judicial) BAIXA o ativo sem entrada de caixa; " +
    "a contrapartida é a VPD de desincorporação de dívida ativa tributária.",
};

export const ROTEIROS_DIVIDA_ATIVA: Readonly<Record<string, ParDeContas>> = {
  INSCRICAO,
  ATUALIZACAO,
  RECEBIMENTO,
  CANCELAMENTO,
  ESTORNO_INSCRICAO: inverso(INSCRICAO),
  ESTORNO_ATUALIZACAO: inverso(ATUALIZACAO),
  ESTORNO_RECEBIMENTO: inverso(RECEBIMENTO),
  ESTORNO_CANCELAMENTO: inverso(CANCELAMENTO),
};

const VARIACAO_MONETARIA_DIVIDA = "3.4.3.1.1.01.00"; // VARIAÇÕES MONETARIAS DE DÍVIDA CONTRATUAL INTERNA - CONSOLIDAÇÃO
const EMPRESTIMO_INTERNO_CONTRATO = "2.2.2.1.1.02.98"; // OUTROS CONTRATOS - EMPRÉSTIMOS INTERNOS

const ATUALIZACAO_MONETARIA: ParDeContas = {
  debito: VARIACAO_MONETARIA_DIVIDA,
  credito: EMPRESTIMO_INTERNO_CONTRATO,
  porque:
    "a correção da dívida fundada AUMENTA o passivo de longo prazo contra a VPD de " +
    "variação monetária. É a única movimentação da dívida sem contrapartida orçamentária " +
    "— por isso tem roteiro próprio.",
};

/**
 * ⚠️ SÓ OS DOIS TIPOS QUE O CÓDIGO LÊ. `INGRESSO_OPERACAO_CREDITO` e `AMORTIZACAO` NÃO
 * entram aqui: eles têm contrapartida orçamentária e são lançados pelo caminho da receita e
 * do pagamento. Semear roteiro para eles criaria uma segunda origem para o mesmo
 * lançamento — e no dia em que as duas divergissem, nenhuma seria autoridade.
 */
export const ROTEIROS_DIVIDA: Readonly<Record<string, ParDeContas>> = {
  ATUALIZACAO_MONETARIA,
  ESTORNO_ATUALIZACAO_MONETARIA: inverso(ATUALIZACAO_MONETARIA),
};

// ── PROVISÕES (M10) ───────────────────────────────────────────────────────────

const VPD_PROVISAO_TRABALHISTA = "3.9.7.1.1.00.00"; // VPD DE PROVISÃO PARA RISCOS TRABALHISTAS - CONSOLIDAÇÃO
const VPA_REVERSAO_PROVISAO = "4.9.7.1.1.01.00"; // REVERSÃO DE PROVISÃO PARA RISCOS TRABALHISTAS
const PASSIVO_PROVISAO = "2.2.7.4.1.99.00"; // OUTRAS PROVISÕES PARA RISCOS CÍVEIS A LONGO PRAZO

const CONSTITUICAO: ParDeContas = {
  debito: VPD_PROVISAO_TRABALHISTA,
  credito: PASSIVO_PROVISAO,
  porque:
    "constituir provisão RECONHECE uma obrigação que ainda não venceu: o patrimônio " +
    "diminui hoje (VPD) contra um passivo de longo prazo. Não é despesa orçamentária e " +
    "não consome dotação — a despesa vem quando (e se) a obrigação se concretizar.",
};

const ATUALIZACAO_PROVISAO: ParDeContas = {
  debito: VPD_PROVISAO_TRABALHISTA,
  credito: PASSIVO_PROVISAO,
  porque:
    "a atualização do valor provisionado aumenta o passivo pela mesma VPD da constituição " +
    "— é a revisão do cálculo, não um fato novo de natureza diferente.",
};

const REVERSAO: ParDeContas = {
  debito: PASSIVO_PROVISAO,
  credito: VPA_REVERSAO_PROVISAO,
  porque:
    "reverter é baixar o passivo porque o risco NÃO se concretizou; a contrapartida é a " +
    "VPA de reversão de provisão, que o PCASP nomeia para isto. ⚠️ NÃO é o estorno da " +
    "constituição: estorno desfaz um lançamento errado, reversão registra um fato novo.",
};

/**
 * ⚠️ A CONTA DE PASSIVO AQUI É O **PADRÃO DO ROTEIRO**, e a provisão tem a sua própria em
 * `ProvisaoMatematica.contaContabilId`. Elas convivem porque o roteiro é por TIPO DE
 * MOVIMENTO e o cadastro é por PROVISÃO — e a do cadastro é a que o operador escolhe.
 * Pendência **`ROTEIRO-PROVISAO-IGNORA-CONTA-DO-CADASTRO`**: hoje o lançamento usa a do
 * roteiro, então duas provisões de naturezas diferentes (trabalhista e cível) caem na
 * mesma conta. É a mesma família do roteiro da dívida ativa sem tributo.
 */
export const ROTEIROS_PROVISAO: Readonly<Record<string, ParDeContas>> = {
  CONSTITUICAO,
  ATUALIZACAO: ATUALIZACAO_PROVISAO,
  REVERSAO,
  ESTORNO_CONSTITUICAO: inverso(CONSTITUICAO),
  ESTORNO_ATUALIZACAO: inverso(ATUALIZACAO_PROVISAO),
  ESTORNO_REVERSAO: inverso(REVERSAO),
};

/**
 * Resolve os códigos em ids, COBRANDO que cada conta exista e seja ANALÍTICA.
 *
 * ⚠️ O `analitica` NÃO É ZELO EXCESSIVO. O `INVARIANTE 5` do adapter recusa partida em
 * conta sintética. Um roteiro apontando para sintética grava no banco sem reclamar e só
 * falha no meio do primeiro lançamento do operador — longe daqui, com uma mensagem que
 * não menciona roteiro nenhum.
 */
async function resolver(
  prisma: PrismaClient,
  codigos: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  const contas = await prisma.contaPcasp.findMany({
    where: { codigo: { in: [...codigos] } },
    select: { id: true, codigo: true, analitica: true, nome: true },
  });
  const achadas = new Map(contas.map((c) => [c.codigo, c]));

  const ausentes = codigos.filter((c) => !achadas.has(c));
  if (ausentes.length > 0) {
    throw new Error(
      `Contas do PCASP ausentes no banco: ${ausentes.join(", ")}.\n` +
        `Rode antes: npm run seed:pcasp-oficial — ele semeia as 7.864 contas do plano ` +
        `oficial do TCE-PB. Sem elas não há roteiro, e inventar conta não é alternativa.`
    );
  }
  const sinteticas = contas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Estas contas são SINTÉTICAS e não recebem partida:\n` +
        sinteticas.map((c) => `  ${c.codigo} [${c.nome}]`).join("\n") +
        `\nUm roteiro apontado para sintética só falha no meio do lançamento do operador.`
    );
  }
  return new Map(contas.map((c) => [c.codigo, c.id]));
}

export async function semearRoteirosPatrimoniais(
  prisma: PrismaClient,
  criadoPor: string
): Promise<{
  readonly dividaAtiva: number;
  readonly divida: number;
  readonly provisao: number;
}> {
  const codigos = [
    ...new Set(
      [
        ...Object.values(ROTEIROS_DIVIDA_ATIVA),
        ...Object.values(ROTEIROS_DIVIDA),
        ...Object.values(ROTEIROS_PROVISAO),
      ].flatMap((p) => [p.debito, p.credito])
    ),
  ];
  const ids = await resolver(prisma, codigos);
  const id = (codigo: string): string => ids.get(codigo) as string;

  for (const [tipo, par] of Object.entries(ROTEIROS_DIVIDA_ATIVA)) {
    await prisma.roteiroDividaAtiva.upsert({
      where: { tipo: tipo as never },
      update: { contaDebitoId: id(par.debito), contaCreditoId: id(par.credito) },
      create: {
        tipo: tipo as never,
        contaDebitoId: id(par.debito),
        contaCreditoId: id(par.credito),
        criadoPor,
      },
    });
  }
  for (const [tipo, par] of Object.entries(ROTEIROS_DIVIDA)) {
    await prisma.roteiroDivida.upsert({
      where: { tipo: tipo as never },
      update: { contaDebitoId: id(par.debito), contaCreditoId: id(par.credito) },
      create: {
        tipo: tipo as never,
        contaDebitoId: id(par.debito),
        contaCreditoId: id(par.credito),
        criadoPor,
      },
    });
  }

  for (const [tipo, par] of Object.entries(ROTEIROS_PROVISAO)) {
    await prisma.roteiroProvisao.upsert({
      where: { tipo: tipo as never },
      update: { contaDebitoId: id(par.debito), contaCreditoId: id(par.credito) },
      create: {
        tipo: tipo as never,
        contaDebitoId: id(par.debito),
        contaCreditoId: id(par.credito),
        criadoPor,
      },
    });
  }

  return {
    dividaAtiva: Object.keys(ROTEIROS_DIVIDA_ATIVA).length,
    divida: Object.keys(ROTEIROS_DIVIDA).length,
    provisao: Object.keys(ROTEIROS_PROVISAO).length,
  };
}

/** Execução direta: `npm run seed:roteiros-patrimoniais`. */
if (process.argv[1]?.includes("roteiros-patrimoniais") === true) {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o seed não tem banco.");
  }
  const prisma = criarPrismaClient(url);
  const r = await semearRoteirosPatrimoniais(
    prisma,
    process.env["SEED_IDENTIDADE"] ?? "seed:roteiros-patrimoniais"
  );
  console.log(
    `[seed:roteiros-patrimoniais] ${r.dividaAtiva} roteiro(s) de dívida ativa, ` +
      `${r.divida} de dívida fundada e ${r.provisao} de provisão.`
  );
  await prisma.$disconnect();
}
