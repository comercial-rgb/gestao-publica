import {
  publicarRoteiroOrcamentario,
  roteiroVigente,
} from "../../modules/m05-despesa/servico-roteiro-orcamentario.js";
import {
  EIXO_HERDADO,
  politicaVigente,
  publicarPoliticaDaDotacaoAdicional,
  publicarRoteiroDaDotacaoPorFonte,
  roteiroPorFonteVigente,
  rotuloDoEixo,
} from "../../modules/m05-despesa/servico-dotacao-por-fonte.js";
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
  // V21 — a realocação por lei específica (CF art. 167, VI). Duas linhas, uma por perna do ato.
  {
    tipo: "REALOCACAO_ACRESCIMO",
    tipoCredito: null,
    abertura: null,
    rotulo: "Remanejamento, transposição ou transferência — ficha que recebe",
    explicacao:
      "Dotação que uma lei específica tira de uma programação e põe nesta. Não é crédito adicional: não traz recurso novo e não consome o limite da LOA. No plano, mora em ALTERAÇÃO DA LEI ORÇAMENTÁRIA — ACRÉSCIMO.",
  },
  {
    tipo: "REALOCACAO_REDUCAO",
    tipoCredito: null,
    abertura: null,
    rotulo: "Remanejamento, transposição ou transferência — ficha que cede",
    explicacao:
      "A outra ponta do mesmo ato: a dotação que sai desta programação. No plano, ALTERAÇÃO DA LEI ORÇAMENTÁRIA — REDUÇÃO.",
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

/**
 * ═══ O EIXO DA DOTAÇÃO ADICIONAL (V11 V8.9) ═══
 *
 * `5.2.2.1.2` (por tipo de crédito) e `5.2.2.1.3` (por fonte) são irmãs no plano e descrevem o
 * MESMO crédito. Lançar nas duas creditaria o crédito disponível DUAS vezes pelo mesmo decreto —
 * por isso o eixo é UM, e quem escolhe é o ente.
 */
export interface EixoNaTela {
  readonly eixo: string;
  /** `false` = ninguém do ente decidiu; vale o herdado da instalação. */
  readonly decidido: boolean;
  readonly versao: number | null;
  readonly fundamento: string | null;
  readonly criadoPor: string | null;
  readonly rotulo: string;
}

export async function lerEixoDaDotacaoAdicional(): Promise<EixoNaTela> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const p = await politicaVigente(cliente() as never);
  const eixo = p?.eixo ?? EIXO_HERDADO;
  return {
    eixo,
    decidido: p !== null,
    versao: p?.versao ?? null,
    fundamento: p?.fundamento ?? null,
    criadoPor: p?.criadoPor ?? null,
    rotulo: rotuloDoEixo(eixo),
  };
}

export interface LinhaPorFonte {
  readonly origem: string;
  readonly rotulo: string;
  readonly explicacao: string;
  readonly versao: number | null;
  readonly debito: string | null;
  readonly debitoNome: string | null;
  readonly credito: string | null;
  readonly fundamento: string | null;
  readonly criadoPor: string | null;
  readonly semFundamento: boolean;
}

/**
 * ⚠️ AS QUATRO ORIGENS SÃO AS DO DOMÍNIO (`OrigemRecurso`), e a lista mora aqui pelo mesmo motivo
 * de `PARES_DO_ROTEIRO`: é o domínio que define quais existem. O plano tem outras três sob
 * `5.2.2.1.3` (reserva de contingência, dotação transferida, recursos sem despesa) — elas ficam
 * de fora porque o sistema não representa esses fatos, e inventar o valor do enum inventaria o
 * fato junto.
 */
export const ORIGENS_DO_RECURSO: readonly { readonly origem: string; readonly rotulo: string; readonly explicacao: string }[] = [
  {
    origem: "SUPERAVIT_FINANCEIRO",
    rotulo: "Superávit financeiro do exercício anterior",
    explicacao: "Recurso novo apurado no balanço do ano anterior (Lei 4.320, art. 43, § 1º, I).",
  },
  {
    origem: "EXCESSO_ARRECADACAO",
    rotulo: "Excesso de arrecadação",
    explicacao: "Recurso novo: a receita entrou acima do previsto (art. 43, § 1º, II).",
  },
  {
    origem: "ANULACAO",
    rotulo: "Anulação de dotação",
    explicacao: "Não é recurso novo — REMANEJA: o crédito sai do saldo de outra ficha (art. 43, § 1º, III).",
  },
  {
    origem: "OPERACAO_CREDITO",
    rotulo: "Operação de crédito",
    explicacao: "Recurso novo contratado (art. 43, § 1º, IV).",
  },
];

export async function lerRoteirosPorFonte(): Promise<readonly LinhaPorFonte[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const linhas: LinhaPorFonte[] = [];
  for (const o of ORIGENS_DO_RECURSO) {
    const v = await roteiroPorFonteVigente(prisma as never, o.origem);
    const nome =
      v === null
        ? null
        : (await prisma.contaPcasp.findUnique({ where: { codigo: v.debito }, select: { nome: true } }))?.nome ?? null;
    linhas.push({
      ...o,
      versao: v?.versao ?? null,
      debito: v?.debito ?? null,
      debitoNome: nome,
      credito: v?.credito ?? null,
      fundamento: v?.fundamento ?? null,
      criadoPor: v?.criadoPor ?? null,
      semFundamento: v !== null && v.fundamento === null,
    });
  }
  return linhas;
}

export async function publicarEixoDaDotacao(input: {
  readonly eixo: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    publicarPoliticaDaDotacaoAdicional(cliente(), {
      eixo: input.eixo as never,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  return (
    `Eixo publicado na versão ${r.versao}: a dotação adicional passa a ser registrada ` +
    `${rotuloDoEixo(input.eixo as never)}` +
    (r.anterior === null
      ? ". Antes disso valia o herdado da instalação (por tipo de crédito)."
      : `, no lugar de ${rotuloDoEixo(r.anterior)}. O que já foi escriturado continua no ramo em que entrou — a troca vale para o que vier.`)
  );
}

export async function publicarRoteiroPorFonte(input: {
  readonly origem: string;
  readonly contaDebitoCodigo: string;
  readonly contaCreditoCodigo: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    publicarRoteiroDaDotacaoPorFonte(cliente(), {
      origem: input.origem as never,
      contaDebitoCodigo: input.contaDebitoCodigo,
      contaCreditoCodigo: input.contaCreditoCodigo,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  return (
    `Roteiro por fonte publicado na versão ${r.versao}: débito ${input.contaDebitoCodigo}, ` +
    `crédito ${input.contaCreditoCodigo}` +
    (r.anterior === null ? "." : `, no lugar de ${r.anterior.debito} / ${r.anterior.credito}.`)
  );
}
