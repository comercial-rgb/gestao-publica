import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * M07 — O CADASTRO DOS TIPOS DE CONSIGNAÇÃO (V11 V8.3).
 *
 * ═══ ⚠️ ESTE ARQUIVO FECHA UMA PENDÊNCIA QUE ERA DO PRODUTO, NÃO DO ENTE ═══
 * `CONSIGNACAO-CONTA-SINTETICA` dizia: os sete tipos semeados apontam para `2.1.8.8.1.01.00`, que
 * é SINTÉTICA no PCASP oficial e não recebe partida; escolher uma das trinta analíticas sob ela é
 * classificação contábil do ente, e inventá-la aqui seria inventar norma da STN.
 *
 * Tudo isso continua verdadeiro. O que estava errado era outra coisa: **o ente não tinha onde
 * decidir**. `TipoConsignacao` só era criado por seed e por teste — não havia caso de uso, não
 * havia ação no censo e não havia tela. O sistema exigia uma decisão que ninguém podia tomar, e em
 * instalação limpa a retenção simplesmente não existia.
 *
 * A pendência não se fecha escolhendo a conta. Fecha-se dando ao ente o lugar de escolher — com
 * fundamento, e com o histórico de quando ele mudou de ideia.
 *
 * ═══ ⚠️ APPEND-ONLY, E NÃO POR ESTILO ═══
 * A decisão é um FATO (`DecisaoDoTipoDeConsignacao`), e a vigente é a última. Duas razões que se
 * somam: um razão escriturado há cinco anos foi feito contra a decisão DAQUELA época, e a pergunta
 * "desde quando o INSS ia para esta conta?" precisa de resposta; e o papel de runtime não tem
 * `UPDATE` em `TipoConsignacao` — afrouxar o grant para caber um desenho é o oposto da regra.
 *
 * ═══ ⚠️ O QUE O DOMÍNIO RECUSA, E POR QUÊ ═══
 *   · conta que não existe no plano carregado;
 *   · conta SINTÉTICA — é exatamente o defeito que a pendência nomeia, e deixá-la passar aqui
 *     mudaria o lugar da falha do seed para o meio de um pagamento;
 *   · conta fora do PASSIVO (primeiro dígito 2) — retenção na fonte vira DÍVIDA com o
 *     consignatário; classificá-la em despesa ou em ativo é erro de natureza, não de preferência;
 *   · fundamento curto — uma escolha contábil sem justificativa é uma conta inventada com
 *     aparência de decisão.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * ⚠️ O PISO É 20, E O NÚMERO FOI MEDIDO, NÃO ESCOLHIDO. Com 10 caracteres, `"porque sim"` passava
 * — e é exatamente o que um piso de fundamento existe para barrar. Vinte não garante uma boa
 * justificativa, mas não cabe num muxoxo: obriga a citar alguma coisa (o item do plano do ente, a
 * norma, o ofício do TCE), que é o que alguém vai procurar daqui a cinco anos ao perguntar por que
 * a retenção foi parar naquela conta.
 */
const zFundamento = z
  .string()
  .trim()
  .min(20, "Diga POR QUE esta conta recebe esta consignação, citando o plano do ente, a norma ou a orientação — a classificação é do ente, e sem fundamento ela é um palpite com aparência de decisão.")
  .max(500);

export const zCadastrarTipoDeConsignacao = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Z0-9_]+$/, "O código usa maiúsculas, dígitos e '_'."),
  descricao: z.string().trim().min(3).max(160),
  contaPassivoCodigo: z.string().trim().min(1),
  fundamento: zFundamento,
  criadoPor: z.string().min(1),
});
export type CadastrarTipoDeConsignacaoInput = z.input<typeof zCadastrarTipoDeConsignacao>;

/**
 * A CONTA TEM DE SER ANALÍTICA E DE PASSIVO. Devolve o id, ou recusa dizendo o que há sob a conta
 * sintética — porque a pessoa que está escolhendo precisa ver as opções, não só ouvir "não".
 */
async function exigirContaDePassivoAnalitica(tx: Tx, codigo: string): Promise<string> {
  const conta = await tx.contaPcasp.findUnique({
    where: { codigo },
    select: { id: true, nome: true, analitica: true },
  });
  if (conta === null) {
    throw new Error(
      `A conta ${codigo} não existe no plano carregado. Confira o código no plano de contas do ente. Nada foi gravado.`
    );
  }
  if (!conta.analitica) {
    // ⚠️ AS FILHAS ENTRAM NA MENSAGEM. Recusar sem dizer o que existe embaixo devolve a pessoa ao
    // ponto de partida — e foi assim que esta escolha ficou pendente por vários lotes.
    const filhas = await tx.contaPcasp.findMany({
      where: { codigo: { startsWith: codigo.slice(0, 9) }, analitica: true },
      orderBy: { codigo: "asc" },
      take: 40,
      select: { codigo: true, nome: true },
    });
    throw new Error(
      `A conta ${codigo} ("${conta.nome}") é SINTÉTICA no plano e não recebe partida — a retenção ` +
        `seria recusada no meio de um pagamento. Escolha uma analítica sob ela: ` +
        `${filhas.map((f) => `${f.codigo} ${f.nome}`).join("; ") || "(nenhuma analítica sob esta conta)"}. ` +
        `Nada foi gravado.`
    );
  }
  if (!codigo.startsWith("2")) {
    throw new Error(
      `A conta ${codigo} ("${conta.nome}") não é do PASSIVO. Uma retenção na fonte vira DÍVIDA com ` +
        `o consignatário — classificá-la fora do grupo 2 é erro de natureza, e o balanço a ` +
        `mostraria no lugar errado. Nada foi gravado.`
    );
  }
  return conta.id;
}

export async function cadastrarTipoDeConsignacao(
  prisma: PrismaClient,
  input: CadastrarTipoDeConsignacaoInput
): Promise<{ readonly tipoId: string }> {
  const d = zCadastrarTipoDeConsignacao.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTipoDeConsignacao, "ENTE");

    const repetido = await tx.tipoConsignacao.findUnique({
      where: { codigo: d.codigo },
      select: { descricao: true },
    });
    if (repetido !== null) {
      throw new Error(
        `Já existe o tipo de consignação "${d.codigo}" (${repetido.descricao}). Para trocar a conta ` +
          `dele, redefina — não crie outro: dois códigos para a mesma retenção partiriam o saldo do ` +
          `consignatário em dois. Nada foi gravado.`
      );
    }

    const contaId = await exigirContaDePassivoAnalitica(tx, d.contaPassivoCodigo);

    // ⚠️ A COLUNA E O FATO NASCEM JUNTOS, na mesma transação. A coluna é a que os leitores
    // antigos usam; o fato é o que guarda o PORQUÊ e o QUANDO. Nascerem separados abriria uma
    // janela em que o tipo existe sem decisão nenhuma.
    const t = await tx.tipoConsignacao.create({
      data: { codigo: d.codigo, descricao: d.descricao, contaPassivoId: contaId, criadoPor: d.criadoPor },
      select: { id: true },
    });
    await tx.decisaoDoTipoDeConsignacao.create({
      data: { tipoId: t.id, ativo: true, contaPassivoId: contaId, fundamento: d.fundamento, criadoPor: d.criadoPor },
    });
    return { tipoId: t.id };
  });
}

export const zRedefinirContaDaConsignacao = z.object({
  tipoId: z.string().min(1),
  contaPassivoCodigo: z.string().trim().min(1),
  fundamento: zFundamento,
  criadoPor: z.string().min(1),
});

/**
 * TROCA A CONTA de um tipo — fato novo, a anterior permanece.
 *
 * ⚠️ E ELA NÃO REESCREVE O PASSADO. O que já foi retido continua no passivo em que foi
 * escriturado; a decisão nova vale para o que vier. Mexer no razão a partir daqui seria corrigir
 * lançamento por UPDATE, que é a invariante 2 desta casa.
 */
export async function redefinirContaDaConsignacao(
  prisma: PrismaClient,
  input: z.input<typeof zRedefinirContaDaConsignacao>
): Promise<{ readonly decisaoId: string; readonly anterior: string | null }> {
  const d = zRedefinirContaDaConsignacao.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.redefinirContaDaConsignacao, "ENTE");

    const tipo = await tx.tipoConsignacao.findUnique({
      where: { id: d.tipoId },
      select: { id: true, codigo: true },
    });
    if (tipo === null) throw new Error(`Tipo de consignação ${d.tipoId} não existe. Nada foi gravado.`);

    const vigente = await decisaoVigente(tx, d.tipoId);
    const contaId = await exigirContaDePassivoAnalitica(tx, d.contaPassivoCodigo);

    if (vigente !== null && vigente.ativo && vigente.contaPassivoCodigo === d.contaPassivoCodigo) {
      throw new Error(
        `A consignação ${tipo.codigo} já vai para ${d.contaPassivoCodigo}. Redecidir o mesmo não é ` +
          `um fato novo. Nada foi gravado.`
      );
    }

    const nova = await tx.decisaoDoTipoDeConsignacao.create({
      data: { tipoId: d.tipoId, ativo: true, contaPassivoId: contaId, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { decisaoId: nova.id, anterior: vigente?.contaPassivoCodigo ?? null };
  });
}

export const zDesativarTipoDeConsignacao = z.object({
  tipoId: z.string().min(1),
  fundamento: zFundamento,
  criadoPor: z.string().min(1),
});

/**
 * DESATIVA um tipo — ele deixa de ser oferecido na retenção.
 *
 * ⚠️ O SALDO NÃO SOME. O que se deve a cada consignatário continua sendo `Σ(valor × sinal)` por
 * (tipo, credor); desativar impede movimento NOVO e não apaga dívida nenhuma. Um tipo com saldo
 * aberto continua aparecendo nas consultas — e é assim que se descobre que ainda há o que repassar.
 */
export async function desativarTipoDeConsignacao(
  prisma: PrismaClient,
  input: z.input<typeof zDesativarTipoDeConsignacao>
): Promise<{ readonly decisaoId: string }> {
  const d = zDesativarTipoDeConsignacao.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.desativarTipoDeConsignacao, "ENTE");

    const tipo = await tx.tipoConsignacao.findUnique({ where: { id: d.tipoId }, select: { codigo: true } });
    if (tipo === null) throw new Error(`Tipo de consignação ${d.tipoId} não existe. Nada foi gravado.`);

    const vigente = await decisaoVigente(tx, d.tipoId);
    if (vigente !== null && !vigente.ativo) {
      throw new Error(`A consignação ${tipo.codigo} já está desativada. Nada foi gravado.`);
    }

    const nova = await tx.decisaoDoTipoDeConsignacao.create({
      data: { tipoId: d.tipoId, ativo: false, contaPassivoId: null, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { decisaoId: nova.id };
  });
}

export interface DecisaoVigente {
  readonly ativo: boolean;
  readonly contaPassivoCodigo: string | null;
  readonly fundamento: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/**
 * A DECISÃO VIGENTE de um tipo — a última. `null` quando nunca houve decisão.
 *
 * ⚠️ `null` NÃO É "SEM CONTA": é "este tipo é anterior ao cadastro" (as linhas que o seed criou
 * antes da V8.3). Quem lê trata os dois casos separadamente — ver `exigirTipoAtivo`, que cai para
 * as colunas antigas nesse caso. Confundi-los tornaria inútil todo tipo já semeado.
 */
export async function decisaoVigente(tx: Tx, tipoId: string): Promise<DecisaoVigente | null> {
  const d = await tx.decisaoDoTipoDeConsignacao.findFirst({
    where: { tipoId },
    orderBy: { criadoEm: "desc" },
    select: {
      ativo: true,
      fundamento: true,
      criadoEm: true,
      criadoPor: true,
      contaPassivo: { select: { codigo: true } },
    },
  });
  if (d === null) return null;
  return {
    ativo: d.ativo,
    contaPassivoCodigo: d.contaPassivo?.codigo ?? null,
    fundamento: d.fundamento,
    criadoEm: d.criadoEm,
    criadoPor: d.criadoPor,
  };
}
