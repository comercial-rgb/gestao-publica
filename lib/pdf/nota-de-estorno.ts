import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { dataBr } from "../recorte";
import { listarAnulacoesDoExercicio, type AnulacaoRegistrada } from "../portas/anulacao";
import { lerLancamento, type PartidaDoLancamento } from "../portas/lancamento-detalhe";
import { EscopoDeLeituraError } from "../portas/leitura";
import { nomeDoEnteParaDocumentos } from "./ente.js";

/**
 * V36 — NOTA DE ESTORNO (TR 5.10.1.15): o documento da anulação de empenho, liquidação ou pagamento.
 *
 * A anulação já era fato próprio (ato novo, original intacto, motivo obrigatório) e aparecia na central de
 * anulações e no dossiê, mas não tinha papel: só a nota de empenho se imprimia. Esta nota diz o que foi anulado,
 * quanto, se integral ou parcial, por quê, por quem, e o lançamento que o estorno gerou.
 *
 * A montagem é PURA (`documentoDaNotaDeEstorno`) e a leitura fica em `montarNotaDeEstorno`, que procura a
 * anulação DENTRO da lista já recortada pelo exercício e pela unidade — o mesmo desenho da nota de empenho:
 * `?id=` de outra unidade cai no "não encontrado", sem segunda regra de autorização.
 */

const ROTULO: Readonly<Record<AnulacaoRegistrada["tipo"], string>> = {
  empenho: "empenho",
  liquidacao: "liquidação",
  pagamento: "pagamento",
};

const brl = (v: string): string => `R$ ${formatarMoeda(v).texto}`;

export interface DadosDaNotaDeEstorno {
  readonly ente: string;
  readonly exercicio: number;
  readonly anulacao: AnulacaoRegistrada;
  /** As partidas do lançamento do estorno; null quando quem emite não lê a contabilidade (a nota diz isso). */
  readonly lancamento: { readonly numeroControle: string; readonly partidas: readonly PartidaDoLancamento[] } | null;
}

export function documentoDaNotaDeEstorno(d: DadosDaNotaDeEstorno): DocumentoPdf {
  const a = d.anulacao;
  const identificacao: SecaoPdf = {
    titulo: "Identificação",
    colunas: [{ rotulo: "Campo" }, { rotulo: "Valor" }],
    linhas: [
      ["Número da anulação", a.numero],
      ["Data", dataBr(a.data)],
      ["Documento anulado", `${ROTULO[a.tipo]} nº ${a.originalNumero}`],
      ["Alcance", a.integral ? "integral (o documento deixa de produzir efeito)" : "parcial (o documento continua, reduzido)"],
      ["Registrada por", a.criadoPor],
    ],
  };
  const valor: SecaoPdf = {
    titulo: "Valor anulado",
    colunas: [{ rotulo: "Rubrica" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [[`Anulação de ${ROTULO[a.tipo]}`, brl(a.valor)]],
    totais: [0],
  };
  const motivo: SecaoPdf = { titulo: "Motivo", colunas: [{ rotulo: "Descrição" }], linhas: [[a.motivo === "" ? "—" : a.motivo]] };
  const secoes: SecaoPdf[] = [identificacao, valor, motivo];
  if (d.lancamento !== null) {
    secoes.push({
      titulo: `Lançamento contábil ${d.lancamento.numeroControle}`,
      colunas: [{ rotulo: "Conta" }, { rotulo: "Subsistema" }, { rotulo: "Débito", alinhamento: "direita" }, { rotulo: "Crédito", alinhamento: "direita" }],
      linhas: d.lancamento.partidas.map((p) => [
        `${p.contaCodigo} ${p.contaTitulo}`,
        p.subsistema.toLowerCase(),
        p.tipo === "DEBITO" ? brl(p.valor) : "",
        p.tipo === "CREDITO" ? brl(p.valor) : "",
      ]),
    });
  }
  return {
    ente: d.ente,
    titulo: `Nota de Estorno nº ${a.numero}`,
    subtitulo: `Anulação de ${ROTULO[a.tipo]}`,
    periodo: `Exercício ${d.exercicio}`,
    numero: a.numero,
    secoes,
    notas: [
      "A anulação é ato próprio: o documento original continua registrado e o estorno o referencia.",
      d.lancamento === null
        ? "As partidas do lançamento não constam: o perfil de quem emitiu não consulta a contabilidade."
        : "Lançamento gerado na mesma transação da anulação.",
    ],
  };
}

export async function montarNotaDeEstorno(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly tipo: AnulacaoRegistrada["tipo"];
  readonly id: string;
}): Promise<DocumentoPdf | null> {
  const anulacoes = await listarAnulacoesDoExercicio({ exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo });
  const anulacao = anulacoes.find((a) => a.tipo === p.tipo && a.id === p.id);
  if (anulacao === undefined) return null;
  let lancamento: DadosDaNotaDeEstorno["lancamento"] = null;
  try {
    const l = await lerLancamento(anulacao.lancamentoId);
    if (l !== null) lancamento = { numeroControle: l.numeroControle, partidas: l.partidas };
  } catch (e) {
    if (!(e instanceof EscopoDeLeituraError)) throw e;
  }
  return documentoDaNotaDeEstorno({ ente: await nomeDoEnteParaDocumentos(), exercicio: p.exercicio, anulacao, lancamento });
}
