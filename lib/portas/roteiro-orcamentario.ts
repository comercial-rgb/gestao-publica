import {
  publicarRoteiroOrcamentario,
  roteiroVigente,
} from "../../modules/m05-despesa/servico-roteiro-orcamentario.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ O ROTEIRO ORÇAMENTÁRIO NA TELA (V11 V8.4) ═══
 *
 * ⚠️ ELA EXISTE PARA FECHAR `ROTEIRO-RESERVA-SEM-CONTA` e
 * `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS` — e não escolhendo as contas, o que seria
 * inventar norma da STN, mas dando ao ente o LUGAR de escolher. Um roteiro que só o seed podia
 * criar, e que o seed recusa (com razão) quando não pode decidir, é um movimento que o sistema
 * recusa para sempre.
 *
 * ⚠️ A LISTA DOS PARES É A MESMA QUE O RAZÃO EXIGE. Ela mora aqui, e não no banco, porque é o
 * DOMÍNIO que define quais movimentos lançam: `LANCA_PELO_ROTEIRO_ORCAMENTARIO` no M05. Uma lista
 * própria divergiria no dia em que nascesse um movimento novo, e a tela ofereceria configurar algo
 * que o razão não usa — ou pior, deixaria de oferecer o que ele exige.
 */

export interface ParDeRoteiro {
  readonly tipo: string;
  readonly tipoCredito: string | null;
  /**
   * ⚠️ A TERCEIRA DIMENSÃO (V11 V8.8) — só no especial e no extraordinário. `null` nos demais, e
   * isso não é "ainda não decidido": é a norma não partindo.
   */
  readonly abertura: "ABERTO" | "REABERTO" | null;
  readonly rotulo: string;
  /** O que o movimento faz — para quem configura saber o que está classificando. */
  readonly explicacao: string;
}

/**
 * ⚠️ OS CINCO MOVIMENTOS QUE LANÇAM NO RAZÃO, e o crédito adicional partido POR TIPO (V7.1): o
 * PCASP separa suplementar, especial e extraordinário em contas próprias, e um roteiro só para os
 * três faria o balancete não distinguir o que a norma distingue.
 */
export const PARES_DO_ROTEIRO: readonly ParDeRoteiro[] = [
  {
    tipo: "DOTACAO_INICIAL",
    tipoCredito: null,
    abertura: null,
    rotulo: "Dotação inicial",
    explicacao: "O orçamento aprovado pela LOA entrando no razão. Sem este roteiro, nenhuma ficha nasce.",
  },
  {
    tipo: "CREDITO_ADICIONAL",
    tipoCredito: "SUPLEMENTAR",
    abertura: null,
    rotulo: "Crédito adicional — suplementar",
    explicacao:
      "Reforço de dotação que já existe (Lei 4.320, art. 41, I). NÃO se parte em aberto e reaberto: o suplementar morre com o exercício, e o § 2º não o alcança.",
  },
  // ⚠️ QUATRO LINHAS ONDE HAVIA DUAS (V11 V8.8), e não é recorte de tela: o PCASP parte cada um
  // destes dois ramos em ABERTOS e REABERTOS, em contas diferentes, e é essa diferença que o TCE
  // lê. Com uma linha só, o crédito reaberto do exercício seguinte lançava na conta do aberto
  // (pendência `ROTEIRO-SEM-DIMENSAO-DA-ABERTURA`). Quem diz qual é qual não é quem configura: é
  // o ano do decreto contra o ano e a data da lei, lido no lançamento.
  {
    tipo: "CREDITO_ADICIONAL",
    tipoCredito: "ESPECIAL",
    abertura: "ABERTO",
    rotulo: "Crédito adicional — especial, ABERTO",
    explicacao:
      "Despesa sem dotação específica (art. 41, II), autorizada e aberta NESTE exercício. O sistema classifica sozinho: decreto do mesmo ano da lei.",
  },
  {
    tipo: "CREDITO_ADICIONAL",
    tipoCredito: "ESPECIAL",
    abertura: "REABERTO",
    rotulo: "Crédito adicional — especial, REABERTO",
    explicacao:
      "O saldo de um especial autorizado nos últimos quatro meses do exercício anterior, reaberto neste (CF art. 167 § 2º). Decreto do ano seguinte ao da lei.",
  },
  {
    tipo: "CREDITO_ADICIONAL",
    tipoCredito: "EXTRAORDINARIO",
    abertura: "ABERTO",
    rotulo: "Crédito adicional — extraordinário, ABERTO",
    explicacao: "Despesa urgente e imprevisível (art. 41, III), aberta neste exercício.",
  },
  {
    tipo: "CREDITO_ADICIONAL",
    tipoCredito: "EXTRAORDINARIO",
    abertura: "REABERTO",
    rotulo: "Crédito adicional — extraordinário, REABERTO",
    explicacao: "O saldo do extraordinário do exercício anterior, reaberto neste pelo § 2º.",
  },
  {
    tipo: "ANULACAO_CREDITO",
    tipoCredito: null,
    abertura: null,
    rotulo: "Anulação de dotação",
    explicacao:
      "A REDUÇÃO de dotação — e ela NÃO mora no ramo do crédito adicional. O plano tem duas candidatas com o nome IDÊNTICO, em ramos diferentes; escolher por semelhança de nome é escolher entre nomes iguais.",
  },
  {
    tipo: "RESERVA",
    tipoCredito: null,
    abertura: null,
    rotulo: "Reserva de dotação",
    explicacao:
      "O bloqueio do saldo antes do empenho. O sistema chama a conta de 'crédito reservado'; no PCASP ela é CRÉDITO INDISPONÍVEL, com BLOQUEIO, PRÉ-EMPENHADO e OUTRAS sob ela.",
  },
  {
    tipo: "RESERVA_LIBERADA",
    tipoCredito: null,
    abertura: null,
    rotulo: "Reserva liberada",
    explicacao: "A devolução do saldo reservado que não virou empenho — o inverso da reserva.",
  },
];

export interface LinhaDoRoteiro extends ParDeRoteiro {
  readonly versao: number | null;
  readonly debito: string | null;
  readonly debitoNome: string | null;
  readonly credito: string | null;
  readonly creditoNome: string | null;
  readonly fundamento: string | null;
  readonly criadoPor: string | null;
  /** `true` quando a linha veio do seed e ninguém do ente decidiu nada ainda. */
  readonly semFundamento: boolean;
}

export async function lerRoteirosOrcamentarios(): Promise<readonly LinhaDoRoteiro[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();

  const linhas: LinhaDoRoteiro[] = [];
  for (const par of PARES_DO_ROTEIRO) {
    const v = await roteiroVigente(prisma as never, par.tipo, par.tipoCredito, par.abertura);
    const nomes =
      v === null
        ? null
        : await prisma.contaPcasp.findMany({
            where: { codigo: { in: [v.debito, v.credito] } },
            select: { codigo: true, nome: true },
          });
    const nomeDe = (codigo: string): string | null => nomes?.find((n) => n.codigo === codigo)?.nome ?? null;
    linhas.push({
      ...par,
      versao: v?.versao ?? null,
      debito: v?.debito ?? null,
      debitoNome: v === null ? null : nomeDe(v.debito),
      credito: v?.credito ?? null,
      creditoNome: v === null ? null : nomeDe(v.credito),
      fundamento: v?.fundamento ?? null,
      criadoPor: v?.criadoPor ?? null,
      // ⚠️ A LINHA DO SEED É NOMEADA COMO TAL. Ela funciona, e ninguém do ente a decidiu — quem
      // olhar precisa saber disso antes de confiar nela numa prestação de contas.
      semFundamento: v !== null && v.fundamento === null,
    });
  }
  return linhas;
}

/**
 * As analíticas do subsistema ORÇAMENTÁRIO (5) e do CONTROLE (6) — as únicas que um roteiro
 * orçamentário usa.
 *
 * ⚠️ O RECORTE É DO SERVIDOR, e é ele que torna a escolha possível: o PCASP oficial tem 7.864
 * contas, e oferecê-las todas seria devolver a pessoa ao problema que a trouxe aqui.
 */
export async function lerContasDoRoteiro(): Promise<readonly { readonly codigo: string; readonly nome: string }[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  return cliente().contaPcasp.findMany({
    where: { analitica: true, OR: [{ codigo: { startsWith: "5." } }, { codigo: { startsWith: "6." } }] },
    orderBy: { codigo: "asc" },
    select: { codigo: true, nome: true },
  });
}

export async function publicarRoteiro(input: {
  readonly tipo: string;
  readonly tipoCredito: string | null;
  readonly abertura: string | null;
  readonly contaDebitoCodigo: string;
  readonly contaCreditoCodigo: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    publicarRoteiroOrcamentario(cliente(), {
      tipo: input.tipo,
      tipoCredito: input.tipoCredito as never,
      abertura: input.abertura as never,
      contaDebitoCodigo: input.contaDebitoCodigo,
      contaCreditoCodigo: input.contaCreditoCodigo,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  return (
    `Roteiro publicado na versão ${r.versao}: débito ${input.contaDebitoCodigo}, crédito ${input.contaCreditoCodigo}` +
    (r.anterior === null
      ? "."
      : `, no lugar de ${r.anterior.debito} / ${r.anterior.credito}. O que já foi escriturado continua como estava — a versão nova vale para o que vier.`)
  );
}
