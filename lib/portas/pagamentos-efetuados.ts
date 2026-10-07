import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import {
  agruparPagamentos,
  pagamentosEfetuados,
  totaisDosPagamentos,
  type AgrupamentoDosPagamentos,
  type OrigemDoPagamento,
} from "../../modules/m05-despesa/pagamentos-efetuados";
import { dispendiosEfetuados, totalDosDispendios } from "../../modules/m07-extraorcamentario/dispendios-efetuados";
import { temLeituraDoEnte } from "./leitura";

/**
 * V36 — PORTA DO RELATÓRIO DE PAGAMENTOS EFETUADOS. O filtro é lido da URL pela tela e pelo PDF do mesmo jeito
 * (`filtroDosPagamentos`), a leitura é a do M05 e o resultado vai em strings de dinheiro.
 */

export interface FiltroDosPagamentos {
  readonly desde: string;
  readonly ate: string;
  readonly credor: string;
  readonly fonte: string;
  readonly conta: string;
  readonly agrupar: "" | AgrupamentoDosPagamentos;
  readonly comRetencoes: boolean;
  /** V36 (TR 5.10.2.4) — "" (todos), "sim" ou "nao". */
  readonly anexo: "" | "sim" | "nao";
  readonly assinatura: "" | "sim" | "nao";
}

const simNao = (v: string): "" | "sim" | "nao" => (v === "sim" || v === "nao" ? v : "");

const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const ehDia = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Período padrão: o exercício inteiro. Dia malformado vira o padrão, nunca um corte inventado. */
export function filtroDosPagamentos(sp: Record<string, string | string[] | undefined>, exercicio: number): FiltroDosPagamentos {
  const desde = um(sp["desde"]);
  const ate = um(sp["ate"]);
  const agrupar = um(sp["agrupar"]);
  return {
    desde: ehDia(desde) ? desde : `${String(exercicio)}-01-01`,
    ate: ehDia(ate) ? ate : `${String(exercicio)}-12-31`,
    credor: um(sp["credor"]).replace(/\D/g, ""),
    fonte: um(sp["fonte"]),
    conta: um(sp["conta"]),
    agrupar: agrupar === "credor" || agrupar === "fonte" || agrupar === "conta" ? agrupar : "",
    comRetencoes: um(sp["retencoes"]) !== "nao",
    anexo: simNao(um(sp["anexo"])),
    assinatura: simNao(um(sp["assinatura"])),
  };
}

export interface PagamentoEfetuadoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly origem: OrigemDoPagamento;
  readonly exercicioDaDotacao: number;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly liquidacaoNumero: string;
  readonly credorCpfCnpj: string;
  readonly credorNome: string | null;
  readonly fonteCodigo: string;
  readonly contaBancaria: string;
  readonly pagoVivo: string;
  readonly retido: string;
  readonly liquido: string;
  readonly anulado: boolean;
  readonly comAnexo: boolean;
  readonly assinado: boolean;
}

export interface TotaisDaTela {
  readonly pagoVivo: string;
  readonly retido: string;
  readonly liquido: string;
}

export interface DispendioDaTela {
  readonly id: string;
  readonly data: Date;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  readonly fonteCodigo: string | null;
  readonly contaBancaria: string;
  readonly historico: string;
  readonly lancamentoId: string;
  readonly valor: string;
  readonly estornado: string;
  readonly vivo: string;
}

/**
 * V36 — OS DISPÊNDIOS EXTRAORÇAMENTÁRIOS do mesmo período, numa seção própria. Eles são do FINANCEIRO e do ENTE: só
 * aparecem a quem lê o financeiro no ente inteiro, e não se recortam por unidade orçamentária (o movimento extra não
 * tem unidade). Fora disso, a seção diz por que não está ali — nunca some calada.
 */
export type DispendiosDaTela =
  | { readonly disponivel: true; readonly linhas: readonly DispendioDaTela[]; readonly total: string }
  | { readonly disponivel: false; readonly motivo: string };

export interface PagamentosEfetuadosDaTela {
  readonly extra: DispendiosDaTela;
  readonly linhas: readonly PagamentoEfetuadoDaTela[];
  readonly grupos: readonly { readonly chave: string; readonly rotulo: string; readonly linhas: readonly PagamentoEfetuadoDaTela[]; readonly totais: TotaisDaTela }[];
  readonly totais: TotaisDaTela;
  readonly opcoes: { readonly credores: readonly { readonly documento: string; readonly nome: string | null }[]; readonly fontes: readonly string[]; readonly contas: readonly string[] };
}

export async function lerPagamentosEfetuados(f: FiltroDosPagamentos, unidadeCodigo: string | undefined): Promise<PagamentosEfetuadosDaTela> {
  const prisma = cliente();
  const periodo = { de: inicioDoDiaCivil(f.desde), ate: fimDoDiaCivil(f.ate), ...(unidadeCodigo !== undefined ? { unidadeCodigo } : {}) };
  const filtrado = f.credor !== "" || f.fonte !== "" || f.conta !== "" || f.anexo !== "" || f.assinatura !== "";
  const [linhas, todas] = await Promise.all([
    pagamentosEfetuados(prisma, {
      ...periodo,
      ...(f.credor !== "" ? { credorCpfCnpj: f.credor } : {}),
      ...(f.fonte !== "" ? { fonteCodigo: f.fonte } : {}),
      ...(f.conta !== "" ? { contaBancaria: f.conta } : {}),
      ...(f.anexo !== "" ? { comAnexo: f.anexo === "sim" } : {}),
      ...(f.assinatura !== "" ? { assinado: f.assinatura === "sim" } : {}),
    }),
    // As opções dos filtros ignoram os próprios filtros (senão o select colapsaria na opção escolhida).
    filtrado ? pagamentosEfetuados(prisma, periodo) : null,
  ]);
  const base = todas ?? linhas;
  const { extra, opcoesDoExtra } = await lerDispendios(f, periodo, unidadeCodigo);
  const nomes = await nomesDosCredores([...new Set(base.map((l) => l.credorCpfCnpj))]);
  const tela = linhas.map((l) => ({
    id: l.id,
    numero: l.numero,
    data: l.data,
    origem: l.origem,
    exercicioDaDotacao: l.exercicioDaDotacao,
    empenhoId: l.empenhoId,
    empenhoNumero: l.empenhoNumero,
    liquidacaoNumero: l.liquidacaoNumero,
    credorCpfCnpj: l.credorCpfCnpj,
    credorNome: nomes.get(l.credorCpfCnpj) ?? null,
    fonteCodigo: l.fonteCodigo,
    contaBancaria: l.contaBancaria,
    pagoVivo: l.pagoVivo.toFixed(2),
    retido: l.retido.toFixed(2),
    liquido: l.liquido.toFixed(2),
    anulado: l.anulado,
    comAnexo: l.comAnexo,
    assinado: l.assinado,
  }));
  const porId = new Map(tela.map((t) => [t.id, t]));
  const emTexto = (t: ReturnType<typeof totaisDosPagamentos>): TotaisDaTela => ({ pagoVivo: t.pagoVivo.toFixed(2), retido: t.retido.toFixed(2), liquido: t.liquido.toFixed(2) });
  const grupos =
    f.agrupar === ""
      ? []
      : agruparPagamentos(linhas, f.agrupar).map((g) => ({
          chave: g.chave,
          rotulo: f.agrupar === "credor" ? (nomes.get(g.chave) ?? g.chave) : f.agrupar === "fonte" ? `fonte ${g.chave}` : `conta ${g.chave}`,
          linhas: g.linhas.map((l) => porId.get(l.id)).filter((x): x is PagamentoEfetuadoDaTela => x !== undefined),
          totais: emTexto({ pagoVivo: g.pagoVivo, retido: g.retido, liquido: g.liquido }),
        }));
  return {
    extra,
    linhas: tela,
    grupos,
    totais: emTexto(totaisDosPagamentos(linhas)),
    opcoes: {
      credores: [...new Set(base.map((l) => l.credorCpfCnpj))].map((d) => ({ documento: d, nome: nomes.get(d) ?? null })).sort((a, b) => (a.nome ?? a.documento).localeCompare(b.nome ?? b.documento)),
      fontes: [...new Set([...base.map((l) => l.fonteCodigo), ...opcoesDoExtra.fontes])].sort(),
      contas: [...new Set([...base.map((l) => l.contaBancaria), ...opcoesDoExtra.contas])].sort(),
    },
  };
}

async function lerDispendios(
  f: FiltroDosPagamentos,
  periodo: { readonly de: Date; readonly ate: Date },
  unidadeCodigo: string | undefined
): Promise<{ readonly extra: DispendiosDaTela; readonly opcoesDoExtra: { readonly fontes: readonly string[]; readonly contas: readonly string[] } }> {
  const nenhuma = { fontes: [], contas: [] };
  if (unidadeCodigo !== undefined) {
    return { opcoesDoExtra: nenhuma, extra: { disponivel: false, motivo: "Os dispêndios extraorçamentários são do ente e não se recortam por unidade orçamentária; escolha o consolidado para vê-los." } };
  }
  if (!(await temLeituraDoEnte("CONSULTAR_FINANCEIRO"))) {
    return { opcoesDoExtra: nenhuma, extra: { disponivel: false, motivo: "Os dispêndios extraorçamentários pedem a consulta do financeiro no ente inteiro, que o seu perfil não tem." } };
  }
  // Os filtros valem também aqui; as opções dos selects saem das linhas SEM filtro, como as dos pagamentos.
  const filtrado = f.credor !== "" || f.fonte !== "" || f.conta !== "";
  const todas = filtrado ? await dispendiosEfetuados(cliente(), periodo) : null;
  const linhas = await dispendiosEfetuados(cliente(), {
    de: periodo.de,
    ate: periodo.ate,
    ...(f.credor !== "" ? { consignatario: f.credor } : {}),
    ...(f.fonte !== "" ? { fonteCodigo: f.fonte } : {}),
    ...(f.conta !== "" ? { contaBancaria: f.conta } : {}),
  });
  const base = todas ?? linhas;
  const opcoesDoExtra = {
    fontes: base.flatMap((l) => (l.fonteCodigo === null ? [] : [l.fonteCodigo])),
    contas: base.map((l) => l.contaBancaria),
  };
  const extra: DispendiosDaTela = {
    disponivel: true,
    total: totalDosDispendios(linhas).toFixed(2),
    linhas: linhas.map((l) => ({
      id: l.id, data: l.data, tipoCodigo: l.tipoCodigo, consignatario: l.consignatario, fonteCodigo: l.fonteCodigo,
      contaBancaria: l.contaBancaria, historico: l.historico, lancamentoId: l.lancamentoId,
      valor: l.valor.toFixed(2), estornado: l.estornado.toFixed(2), vivo: l.vivo.toFixed(2),
    })),
  };
  return { extra, opcoesDoExtra };
}
