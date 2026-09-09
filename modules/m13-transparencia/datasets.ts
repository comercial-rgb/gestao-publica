import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ═══ NADA AQUI SOMA. Cada número vem do DONO, com a função nomeada. ═══
import { previsaoPorNaturezaFonte } from "../m02-planejamento/consultas.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import {
  exposicaoDoElemento,
  identificarDocumento,
  type LinhaSerializada,
  type MotivoDeOmissao,
  type TipoDocumento,
} from "./dominio.js";

/**
 * M13 — DATASETS ABERTOS. LEITURA PURA (TR 7.3, 7.4, 7.48).
 *
 * ═══ ZERO ARITMÉTICA, ZERO ESCRITA ═══
 * Este módulo não tem `create`, não tem `update`, não tem `delete` e não tem `SUM` — há
 * um TESTE que roda o grep e falha se aparecer algum. Um portal que CALCULA é um portal
 * que pode divergir do balanço; e o dia em que divergir, é o portal que o cidadão lê.
 *
 * ═══ O GRÃO DA DESPESA É A FASE (TR 7.3.1) ═══
 * Empenho, liquidação e pagamento são TRÊS FATOS, e cada um vira uma LINHA. Publicar só
 * "o pago" esconde o comprometido; publicar um "valor da despesa" consolidado esconde
 * as três datas — e é justamente entre elas que a fila do art. 141 acontece.
 *
 * E as ANULAÇÕES aparecem, com o fato de origem apontado. O ledger é append-only: uma
 * anulação é um FATO NOVO, e um dataset que a escondesse publicaria um empenho que já
 * não existe. Quem quiser o líquido soma as linhas — o sinal está explícito.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DESPESA (TR 7.3)
// ═══════════════════════════════════════════════════════════════════════════

export type FaseDaDespesa = "EMPENHO" | "LIQUIDACAO" | "PAGAMENTO";

/**
 * ⚠️ TUDO STRING (ou `null`). É a SERIALIZAÇÃO — a mesma que vira JSON e a mesma que
 * vira CSV. `Decimal` nunca sai daqui como número: um `float` de JavaScript não
 * representa 2.500,10 exatamente, e um dataset público que arredonda é um dataset que
 * mente. Datas em ISO-8601 (UTC), sem localização — o dado é para MÁQUINA.
 */
export type LinhaDespesa = {
  readonly fase: FaseDaDespesa;
  readonly id: string;
  readonly numero: string;
  readonly data: string;
  readonly valor: string;
  /** Append-only: a linha ANULA outra? Qual? (7.3.1 — a anulação é um fato.) */
  readonly estornoDe: string | null;
  /** TR 5.35 — anulação PARCIAL: o fato original continua valendo, por menos. */
  readonly anulacaoParcialDe: string | null;

  // ─── 7.3.2 — a classificação. TODA ela deriva da FichaOrcamentaria. ───
  readonly exercicio: string;
  readonly fichaNumero: string;
  readonly orgaoCodigo: string;
  readonly orgaoNome: string;
  readonly unidadeOrcamentariaCodigo: string;
  readonly unidadeOrcamentariaDescricao: string;
  readonly funcaoCodigo: string;
  readonly funcaoNome: string;
  readonly subfuncaoCodigo: string;
  readonly subfuncaoNome: string;
  readonly programaCodigo: string;
  readonly programaDescricao: string;
  readonly acaoCodigo: string;
  readonly acaoDescricao: string;
  readonly naturezaDespesaCodigo: string;
  readonly naturezaDespesaDescricao: string;
  readonly elementoCodigo: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;

  // ─── 7.3.4 — o beneficiário. ───
  readonly beneficiarioDocumento: string | null;
  readonly beneficiarioTipo: TipoDocumento | null;
  /** `null` quando o beneficiário está publicado. Estruturado, nunca vazio mudo. */
  readonly beneficiarioOmitidoPor: MotivoDeOmissao | null;
  /** Só o CONTRATO tem o nome (M11). O empenho avulso não o tem — ver MODULO.md. */
  readonly beneficiarioNome: string | null;

  // ─── 7.3.6 — o processo licitatório, quando houver. ───
  readonly contratoNumero: string | null;
  readonly processoNumero: string | null;
  readonly processoModalidade: string | null;

  // ─── 7.3.7 — o que foi comprado. ───
  readonly descricao: string;
};

const iso = (d: Date): string => d.toISOString();

/**
 * A CLASSIFICAÇÃO 7.3.2 SAI INTEIRA DA FICHA — nenhum join inventado.
 *
 * `FichaOrcamentaria` carrega órgão, UO, função, subfunção, programa, ação, natureza e
 * fonte como FKs. O empenho aponta para a ficha; a liquidação, para o empenho; o
 * pagamento, para a liquidação. A cadeia é a do M05, e é a mesma que o Anexo 12 usa —
 * por isso o portal e o balanço não podem discordar sobre em que função o dinheiro foi
 * gasto.
 */
const FICHA_COMPLETA = {
  select: {
    exercicio: true,
    numero: true,
    orgao: { select: { codigo: true, nome: true } },
    unidadeOrc: { select: { codigo: true, descricao: true } },
    funcao: { select: { codigo: true, nome: true } },
    subfuncao: { select: { codigo: true, nome: true } },
    programa: { select: { codigo: true, descricao: true } },
    acao: { select: { codigo: true, descricao: true } },
    naturezaDespesa: {
      select: { codigoCompleto: true, descricao: true, codElemento: true },
    },
    fonte: { select: { codigo: true, descricao: true } },
  },
} as const;

const EMPENHO_COMPLETO = {
  select: {
    id: true,
    numero: true,
    data: true,
    valor: true,
    historico: true,
    credorCpfCnpj: true,
    estornoDeId: true,
    anulacaoParcialDeId: true,
    ficha: FICHA_COMPLETA,
    contrato: {
      select: {
        numeroContrato: true,
        contratadoNome: true,
        processo: { select: { numeroProcesso: true, modalidade: true } },
      },
    },
  },
} as const;

type EmpenhoLido = {
  readonly ficha: {
    readonly exercicio: number;
    readonly numero: number;
    readonly orgao: { readonly codigo: string; readonly nome: string };
    readonly unidadeOrc: { readonly codigo: string; readonly descricao: string };
    readonly funcao: { readonly codigo: string; readonly nome: string };
    readonly subfuncao: { readonly codigo: string; readonly nome: string };
    readonly programa: { readonly codigo: string; readonly descricao: string };
    readonly acao: { readonly codigo: string; readonly descricao: string };
    readonly naturezaDespesa: {
      readonly codigoCompleto: string;
      readonly descricao: string;
      readonly codElemento: string;
    };
    readonly fonte: { readonly codigo: string; readonly descricao: string };
  };
  readonly historico: string;
  readonly credorCpfCnpj: string;
  readonly contrato: {
    readonly numeroContrato: string;
    readonly contratadoNome: string;
    readonly processo: {
      readonly numeroProcesso: string;
      readonly modalidade: string;
    };
  } | null;
};

/**
 * ⚠️ A DECISÃO DE EXPOR, NUM LUGAR SÓ. Os três estágios são atravessados na ordem, e a
 * ordem é o próprio fail-closed:
 *   1. o ELEMENTO manda omitir (7.3.4 — folha/previdência)?   -> omite, com motivo
 *   2. o documento é CPF ou CNPJ de verdade?                  -> não? omite, com motivo
 *   3. só então publica (CPF mascarado, CNPJ inteiro)
 */
function beneficiarioDe(e: EmpenhoLido): {
  readonly beneficiarioDocumento: string | null;
  readonly beneficiarioTipo: TipoDocumento | null;
  readonly beneficiarioOmitidoPor: MotivoDeOmissao | null;
  readonly beneficiarioNome: string | null;
} {
  const vazio = {
    beneficiarioDocumento: null,
    beneficiarioTipo: null,
    beneficiarioNome: null,
  };

  if (
    exposicaoDoElemento(e.ficha.naturezaDespesa.codElemento) ===
    "OMITE_FOLHA_OU_PREVIDENCIA"
  ) {
    return { ...vazio, beneficiarioOmitidoPor: "FOLHA_OU_PREVIDENCIA" };
  }

  const doc = identificarDocumento(e.credorCpfCnpj);
  if (doc === null) {
    return { ...vazio, beneficiarioOmitidoPor: "DOCUMENTO_INVALIDO" };
  }

  return {
    beneficiarioDocumento: doc.documento,
    beneficiarioTipo: doc.tipo,
    beneficiarioOmitidoPor: null,
    // O nome só existe no CONTRATO (M11). Empenho não tem `credorNome` — e inventar
    // um "nome do credor" a partir do documento seria fabricar dado.
    beneficiarioNome: e.contrato?.contratadoNome ?? null,
  };
}

/** A classificação + o beneficiário + o processo — herdados do empenho pelas 3 fases. */
function contextoDoEmpenho(e: EmpenhoLido): Omit<
  LinhaDespesa,
  "fase" | "id" | "numero" | "data" | "valor" | "estornoDe" | "anulacaoParcialDe"
> {
  const f = e.ficha;
  return {
    exercicio: String(f.exercicio),
    fichaNumero: String(f.numero),
    orgaoCodigo: f.orgao.codigo,
    orgaoNome: f.orgao.nome,
    unidadeOrcamentariaCodigo: f.unidadeOrc.codigo,
    unidadeOrcamentariaDescricao: f.unidadeOrc.descricao,
    funcaoCodigo: f.funcao.codigo,
    funcaoNome: f.funcao.nome,
    subfuncaoCodigo: f.subfuncao.codigo,
    subfuncaoNome: f.subfuncao.nome,
    programaCodigo: f.programa.codigo,
    programaDescricao: f.programa.descricao,
    acaoCodigo: f.acao.codigo,
    acaoDescricao: f.acao.descricao,
    naturezaDespesaCodigo: f.naturezaDespesa.codigoCompleto,
    naturezaDespesaDescricao: f.naturezaDespesa.descricao,
    elementoCodigo: f.naturezaDespesa.codElemento,
    fonteCodigo: f.fonte.codigo,
    fonteDescricao: f.fonte.descricao,
    ...beneficiarioDe(e),
    contratoNumero: e.contrato?.numeroContrato ?? null,
    processoNumero: e.contrato?.processo.numeroProcesso ?? null,
    processoModalidade: e.contrato?.processo.modalidade ?? null,
    descricao: e.historico,
  };
}

/** O client OU uma transação dele. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ O CORTE É PELA DATA DO FATO — `data` do empenho, da liquidação, do pagamento.
 * Nunca `criadoEm`. Um empenho de março digitado em maio pertence a março, e um portal
 * que o publicasse em maio estaria republicando o passado toda vez que alguém digitasse
 * atrasado.
 */
export async function datasetDespesa(
  leitor: Leitor,
  p: { readonly ate: Date; readonly exercicio?: number | undefined }
): Promise<readonly LinhaDespesa[]> {
  const doExercicio =
    p.exercicio !== undefined ? { ficha: { exercicio: p.exercicio } } : {};

  const [empenhos, liquidacoes, pagamentos] = await Promise.all([
    leitor.empenho.findMany({
      where: { data: { lte: p.ate }, ...doExercicio },
      ...EMPENHO_COMPLETO,
      orderBy: { data: "asc" },
    }),
    leitor.liquidacao.findMany({
      where: {
        data: { lte: p.ate },
        ...(p.exercicio !== undefined
          ? { empenho: { ficha: { exercicio: p.exercicio } } }
          : {}),
      },
      select: {
        id: true,
        numero: true,
        data: true,
        valor: true,
        estornoDeId: true,
        anulacaoParcialDeId: true,
        empenho: EMPENHO_COMPLETO,
      },
      orderBy: { data: "asc" },
    }),
    leitor.pagamento.findMany({
      where: {
        data: { lte: p.ate },
        ...(p.exercicio !== undefined
          ? { liquidacao: { empenho: { ficha: { exercicio: p.exercicio } } } }
          : {}),
      },
      select: {
        id: true,
        numero: true,
        data: true,
        valor: true,
        estornoDeId: true,
        anulacaoParcialDeId: true,
        liquidacao: { select: { empenho: EMPENHO_COMPLETO } },
      },
      orderBy: { data: "asc" },
    }),
  ]);

  const linhas: LinhaDespesa[] = [];

  for (const e of empenhos) {
    linhas.push({
      fase: "EMPENHO",
      id: e.id,
      numero: e.numero,
      data: iso(e.data),
      valor: e.valor.toFixed(2),
      estornoDe: e.estornoDeId,
      anulacaoParcialDe: e.anulacaoParcialDeId,
      ...contextoDoEmpenho(e),
    });
  }
  for (const l of liquidacoes) {
    linhas.push({
      fase: "LIQUIDACAO",
      id: l.id,
      numero: l.numero,
      data: iso(l.data),
      valor: l.valor.toFixed(2),
      estornoDe: l.estornoDeId,
      anulacaoParcialDe: l.anulacaoParcialDeId,
      ...contextoDoEmpenho(l.empenho),
    });
  }
  for (const g of pagamentos) {
    linhas.push({
      fase: "PAGAMENTO",
      id: g.id,
      numero: g.numero,
      data: iso(g.data),
      valor: g.valor.toFixed(2),
      estornoDe: g.estornoDeId,
      anulacaoParcialDe: g.anulacaoParcialDeId,
      ...contextoDoEmpenho(g.liquidacao.empenho),
    });
  }

  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// RECEITA (TR 7.4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ NÃO EXISTE, E NÃO PODE EXISTIR, CAMPO DE CONTRIBUINTE AQUI (TR 7.4.2).
 *
 * O sigilo fiscal (CTN, art. 198) não é dispensado pela transparência: publicar "IPTU,
 * 12.345,67, 03/03, guia 987" é publicar QUEM pagou para quem tem o cadastro imobiliário
 * ao lado. Por isso o dataset da receita é AGREGADO — e a garantia não é um comentário:
 * é o TIPO. Não há campo para vazar, nem por engano.
 *
 * ⚠️ O GRÃO É NATUREZA × FONTE, E O CO FICOU DE FORA — DE PROPÓSITO.
 * A `ReceitaPrevista` (M02) NÃO tem código de acompanhamento: a LOA prevê por natureza e
 * fonte. Um grão que incluísse o CO repetiria a MESMA previsão em várias linhas, e a
 * coluna passaria a mentir na primeira vez que alguém a somasse. Um dataset aberto não
 * publica número que estoura ao ser somado. Ver MODULO.md.
 */
export type LinhaReceita = {
  /** 7.4.4 — a classificação. O código de 8 dígitos É a classificação. */
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** 7.4.1 — previsão da LOA (líquida de deduções: `SINAL_PREVISAO`, M02). */
  readonly previsto: string;
  /** 7.4.3 — arrecadado LÍQUIDO (a anulação subtrai: `SINAL_RECEITA_REALIZADA`, M04). */
  readonly arrecadado: string;
};

export async function datasetReceita(
  leitor: Leitor,
  p: { readonly exercicio: number; readonly ate: Date }
): Promise<readonly LinhaReceita[]> {
  // ═══ Os dois lados vêm dos DONOS. Zero aritmética aqui. ═══
  const [previsoes, arrecadacoes, fontes] = await Promise.all([
    previsaoPorNaturezaFonte(leitor, { exercicio: p.exercicio }),
    arrecadadoPorNaturezaFonte(leitor, { ate: p.ate }),
    leitor.fonteRecurso.findMany({
      select: { id: true, codigo: true, descricao: true },
    }),
  ]);
  const fontePorId = new Map(fontes.map((f) => [f.id, f]));

  // TODA combinação que aparece em QUALQUER lado entra: a natureza prevista e não
  // arrecadada é informação (frustração de receita), e a arrecadada sem previsão também
  // (é o excesso de arrecadação, e ele lastreia crédito adicional).
  const chaves = new Map<
    string,
    { readonly naturezaCodigo: string; readonly fonteId: string }
  >();
  const descricaoDaNatureza = new Map<string, string>();

  for (const a of arrecadacoes) {
    chaves.set(`${a.naturezaCodigo}|${a.fonteId}`, {
      naturezaCodigo: a.naturezaCodigo,
      fonteId: a.fonteId,
    });
    descricaoDaNatureza.set(a.naturezaCodigo, a.naturezaDescricao);
  }
  for (const v of previsoes) {
    chaves.set(`${v.naturezaCodigo}|${v.fonteId}`, {
      naturezaCodigo: v.naturezaCodigo,
      fonteId: v.fonteId,
    });
  }

  const previstoPorChave = new Map(
    previsoes.map((v) => [`${v.naturezaCodigo}|${v.fonteId}`, v.previsto])
  );
  const arrecadadoPorChave = new Map(
    arrecadacoes.map((a) => [`${a.naturezaCodigo}|${a.fonteId}`, a.arrecadado])
  );

  const linhas: LinhaReceita[] = [];
  for (const [chave, k] of [...chaves.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    const fonte = fontePorId.get(k.fonteId);
    if (fonte === undefined) {
      // FAIL-CLOSED: fonte referenciada e inexistente é base quebrada. Publicar a linha
      // com a fonte em branco esconderia o problema no lugar mais lido do sistema.
      throw new Error(
        `Fonte ${k.fonteId} não existe, mas há receita classificada nela ` +
          `(natureza ${k.naturezaCodigo}). O dataset aberto NÃO publica classificação ` +
          `quebrada.`
      );
    }

    linhas.push({
      naturezaCodigo: k.naturezaCodigo,
      naturezaDescricao: descricaoDaNatureza.get(k.naturezaCodigo) ?? "",
      fonteCodigo: fonte.codigo,
      fonteDescricao: fonte.descricao,
      previsto: (previstoPorChave.get(chave)?.toFixed(2) ?? "0.00"),
      arrecadado: (arrecadadoPorChave.get(chave)?.toFixed(2) ?? "0.00"),
    });
  }

  return linhas;
}
