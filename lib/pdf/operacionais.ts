import { gerarPdfDoDemonstrativo, type ResultadoPdf } from "./gerar";
import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { mascararCpfCnpj } from "../format/mascaras";
import { dataBr } from "../recorte";
import { lerArrecadacoes, type ArrecadacaoDaTela } from "../portas/arrecadacao";
import { listarEmpenhosDaExecucao, type EmpenhoDaTela } from "../portas/empenho";
import { listarLiquidacoesDaExecucao, type LiquidacaoDaTela } from "../portas/liquidacao";
import { lerFilasDePagamento } from "../portas/pagamento";
import { lerDecretos } from "../portas/creditos";
import { lerSaldosExtra, lerRetencoes, lerDispendiosExtra } from "../portas/extraorcamentario";
import { lerPosicaoPatrimonial, lerDividas } from "../portas/patrimonio";
import {
  gerarTextoDecretoCmd,
  gerarTextoDecretoMba,
  lerCmdVigente,
  lerConfrontoMba,
  lerMbaVigente,
  type PlanoProgramacao,
  type VersaoProgramacao,
} from "../portas/programacao";
import {
  filtrarAtualizacoes,
  linhasDeAtualizacao,
  totaisDeAtualizacoes,
  type FiltroAtualizacoes,
} from "../relatorios/atualizacoes-orcamentarias";

/**
 * EMISSÃO/IMPRESSÃO das listas operacionais e dos documentos individuais (S8-b) — pelo MESMO motor
 * da publicação (7.15): monta um `DocumentoPdf` (cabeçalho institucional, tabela, notas) e o
 * `gerarPdfDoDemonstrativo` imprime, com o rodapé de sempre (SHA-256 + "não assinado — ICP pendente"
 * + hora de emissão). É a MESMA leitura da tela — "o PDF é a tela".
 *
 * ⚠️ ZONA 1 (não é porta): lê o motor SÓ via `lib/portas/**` — nunca `modules/**`. Nada de escrita,
 * nada de aritmética nova: os totais/saldos já vêm somados das portas; aqui só se formata.
 *
 * ⚠️ ENTE constante por ora (pendência de dado IDENTIFICACAO-DO-ENTE, como em demonstrativos.ts).
 */

const ENTE = "Município de Campina Grande — PB";

const brl = (v: string): string => formatarMoeda(v).texto;
/** O valor da anulação entra com sinal − (como na coluna Valor da tela). */
const brlSinal = (v: string, negativo: boolean): string => brl(negativo ? `-${v}` : v);

// ── F1: LISTA — ARRECADAÇÃO ──────────────────────────────────────────────────────
export async function montarPdfArrecadacao(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const periodo = await lerArrecadacoes({ exercicio: p.exercicio });
  const secao: SecaoPdf = {
    colunas: [
      { rotulo: "Data" }, { rotulo: "Guia" }, { rotulo: "Natureza" }, { rotulo: "Descrição" },
      { rotulo: "Fonte" }, { rotulo: "CO" }, { rotulo: "Tipo" }, { rotulo: "Valor", alinhamento: "direita" },
    ],
    linhas: periodo.linhas.map((l: ArrecadacaoDaTela) => [
      dataBr(l.dataArrecadacao), l.numeroReceita, l.naturezaCodigo, l.naturezaDescricao,
      l.fonteCodigo, l.coCodigo ?? "—", l.sinal === -1 ? "Anulação" : "Arrecadação",
      brlSinal(l.valor, l.sinal === -1),
    ]),
  };
  return {
    ente: ENTE,
    titulo: "Arrecadação — guias do exercício",
    subtitulo: "Execução da receita — a receita é do ente, sem unidade orçamentária",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [secao],
    notas: [
      `Receita realizada líquida: ${brl(periodo.total)} — Σ(arrecadações) − Σ(anulações).`,
      `${periodo.linhas.length} guia(s) · valores em R$ · corte pela data de arrecadação (o fato).`,
    ],
  };
}

// ── F1: LISTA — EMPENHOS ─────────────────────────────────────────────────────────
export async function montarPdfEmpenhos(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }): Promise<DocumentoPdf> {
  const empenhos = await listarEmpenhosDaExecucao({ exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo });
  const secao: SecaoPdf = {
    colunas: [
      { rotulo: "Nº" }, { rotulo: "Data" }, { rotulo: "Credor" }, { rotulo: "Ficha" }, { rotulo: "Fonte" },
      { rotulo: "Empenhado", alinhamento: "direita" }, { rotulo: "Liquidado", alinhamento: "direita" },
      { rotulo: "Pago", alinhamento: "direita" }, { rotulo: "A liquidar", alinhamento: "direita" },
      { rotulo: "A pagar", alinhamento: "direita" }, { rotulo: "Status" },
    ],
    linhas: empenhos.map((e: EmpenhoDaTela) => [
      e.numero, dataBr(e.data), e.credorCpfCnpj, String(e.fichaNumero), e.fonteCodigo,
      brl(e.empenhadoLiquido), brl(e.liquidado), brl(e.pago), brl(e.saldoALiquidar), brl(e.saldoAPagar), e.status,
    ]),
  };
  return {
    ente: ENTE,
    titulo: "Empenhos — execução da despesa",
    subtitulo: `Empenhado, liquidado, pago e saldos${p.unidadeCodigo !== undefined ? ` · unidade ${p.unidadeCodigo}` : ""}`,
    periodo: `Exercício ${p.exercicio}`,
    secoes: [secao],
    notas: [`${empenhos.length} empenho(s) · valores em R$ · empenhado já líquido das anulações.`],
  };
}

/**
 * ── F1: LISTA — RELATÓRIO GERENCIAL DE EMPENHOS (por credor e por fonte) ──────────
 *
 * ⚠️ NÃO É `montarPdfEmpenhos` COM PARÂMETROS A MAIS — é OUTRO DOCUMENTO, e por isso é outro
 * montador. A relação de empenhos (acima) é a lista operacional da área de Despesa: fixa, sem
 * recorte, com o credor cru como o razão o guarda. Este é o relatório GERENCIAL: recortável pelo
 * usuário, com a unidade em coluna própria (o recorte pode atravessar UGs) e o credor MASCARADO,
 * porque um papel gerencial circula mais do que a lista de trabalho. Fundi-los daria um documento
 * que não serve bem a nenhum dos dois leitores.
 *
 * ⚠️ O RECORTE DESCE AO SQL. Credor e fonte vão a `listarEmpenhosDaExecucao`, que os resolve no
 * `where` do M05 — o PDF não recorta lista pronta, senão o total das notas mentiria sobre o que
 * foi lido.
 *
 * ⚠️ O RECORTE VAI IMPRESSO nas notas. Relatório filtrado que não se declara filtrado é pior que
 * relatório nenhum: quem recebe o papel não tem como saber que faltam linhas.
 */
export async function montarPdfGerencialEmpenhos(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly credorCpfCnpj?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  /** O período por extenso, como a tela o descreve — o PDF é a tela. */
  readonly periodo: string;
}): Promise<DocumentoPdf> {
  const empenhos = await listarEmpenhosDaExecucao({
    exercicio: p.exercicio,
    unidadeCodigo: p.unidadeCodigo,
    credorCpfCnpj: p.credorCpfCnpj,
    fonteCodigo: p.fonteCodigo,
  });

  const recorteEmTexto = [
    ...(p.credorCpfCnpj !== undefined && p.credorCpfCnpj !== "" ? [`credor ${mascararCpfCnpj(p.credorCpfCnpj)}`] : []),
    ...(p.fonteCodigo !== undefined && p.fonteCodigo !== "" ? [`fonte ${p.fonteCodigo}`] : []),
  ];

  const secao: SecaoPdf = {
    colunas: [
      { rotulo: "Nº" }, { rotulo: "Data" }, { rotulo: "Credor (CPF/CNPJ)" }, { rotulo: "UG" },
      { rotulo: "Ficha" }, { rotulo: "Fonte" },
      { rotulo: "Empenhado", alinhamento: "direita" }, { rotulo: "Liquidado", alinhamento: "direita" },
      { rotulo: "Pago", alinhamento: "direita" }, { rotulo: "A liquidar", alinhamento: "direita" },
      { rotulo: "A pagar", alinhamento: "direita" }, { rotulo: "Status" },
    ],
    linhas: empenhos.map((e: EmpenhoDaTela) => [
      e.numero, dataBr(e.data), mascararCpfCnpj(e.credorCpfCnpj), e.unidadeCodigo,
      String(e.fichaNumero), e.fonteCodigo,
      brl(e.empenhadoLiquido), brl(e.liquidado), brl(e.pago), brl(e.saldoALiquidar), brl(e.saldoAPagar), e.status,
    ]),
  };

  return {
    ente: ENTE,
    titulo: "Relatório gerencial — despesa por credor e fonte",
    subtitulo: `Empenhado, liquidado, pago e saldos${p.unidadeCodigo !== undefined ? ` · unidade ${p.unidadeCodigo}` : ""}`,
    periodo: p.periodo,
    secoes: [secao],
    notas: [
      recorteEmTexto.length > 0
        ? `⚠️ RELATÓRIO FILTRADO: ${recorteEmTexto.join(" · ")}. Só os empenhos deste recorte estão listados.`
        : "Sem filtro: todos os empenhos do recorte de exercício/unidade.",
      "O filtro de credor é casamento por CPF/CNPJ — este sistema não tem cadastro de credores, e o empenho guarda apenas o documento. Não há busca por nome.",
      `${empenhos.length} empenho(s) · valores em R$ · empenhado já líquido das anulações.`,
    ],
  };
}

// ── F1: LISTA — LIQUIDAÇÕES ──────────────────────────────────────────────────────
export async function montarPdfLiquidacoes(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }): Promise<DocumentoPdf> {
  const liqs = await listarLiquidacoesDaExecucao({ exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo });
  const secao: SecaoPdf = {
    colunas: [
      { rotulo: "Nº" }, { rotulo: "Data" }, { rotulo: "Empenho" }, { rotulo: "Credor" }, { rotulo: "Fonte" },
      { rotulo: "Atesto (responsável)" }, { rotulo: "Liquidado", alinhamento: "direita" },
      { rotulo: "Pago", alinhamento: "direita" }, { rotulo: "A pagar", alinhamento: "direita" },
    ],
    linhas: liqs.map((l: LiquidacaoDaTela) => [
      l.numero, dataBr(l.data), l.empenhoNumero, l.credorCpfCnpj, l.fonteCodigo,
      l.responsavelAtesto, brl(l.liquidadoLiquido), brl(l.pago), brl(l.saldoAPagar),
    ]),
  };
  return {
    ente: ENTE,
    titulo: "Liquidações — exigibilidade da despesa",
    subtitulo: `O marco que põe a despesa na fila do art. 141${p.unidadeCodigo !== undefined ? ` · unidade ${p.unidadeCodigo}` : ""}`,
    periodo: `Exercício ${p.exercicio}`,
    secoes: [secao],
    notas: [`${liqs.length} liquidação(ões) · valores em R$ · o saldo a pagar é a posição na ordem cronológica.`],
  };
}

/**
 * ── F1: LISTA — FILA DE PAGAMENTOS (a ordem cronológica, art. 141) ────────────────
 *
 * ⚠️ O FILTRO DE FONTE DESCE ATÉ A PORTA, e não é recorte de documento pronto. `lerFilasDePagamento`
 * já aceita `{ fonteCodigo }`: passá-lo adiante lê do banco só a fila pedida, em vez de trazer todas
 * as fontes para descartar as outras depois. É a mesma disciplina do "zero pós-filtro em JS" do M12.
 *
 * ⚠️ UM MONTADOR SÓ para `/despesa/pagamentos/pdf` (sem fonte) e `/despesa/ordem-cronologica/pdf`
 * (com fonte). Dois montadores da mesma fila divergiriam na primeira coluna que alguém mudasse num
 * lado só — e seriam dois documentos diferentes do MESMO artigo de lei.
 */
export async function montarPdfFilaPagamentos(p: { readonly fonteCodigo?: string | undefined } = {}): Promise<DocumentoPdf> {
  const fonte = p.fonteCodigo !== undefined && p.fonteCodigo !== "" ? p.fonteCodigo : undefined;
  const grupos = await lerFilasDePagamento(fonte !== undefined ? { fonteCodigo: fonte } : undefined);
  const secoes: SecaoPdf[] = grupos.map((g) => ({
    titulo: `Fonte ${g.fonteCodigo} · ${g.categoria} — total a pagar: ${brl(g.total)}`,
    colunas: [
      { rotulo: "Pos.", alinhamento: "direita" }, { rotulo: "Liquidação" }, { rotulo: "Liquidada em" },
      { rotulo: "Empenho" }, { rotulo: "Credor" }, { rotulo: "Liquidado", alinhamento: "direita" },
      { rotulo: "A pagar", alinhamento: "direita" },
    ],
    linhas: g.linhas.map((l) => [
      String(l.posicao), l.numero, dataBr(l.dataLiquidacao), l.empenhoNumero, l.credorCpfCnpj,
      brl(l.valorLiquidado), brl(l.saldoAPagar),
    ]),
  }));
  // ⚠️ FILA VAZIA NÃO É DOCUMENTO VAZIO. Quem precisa provar "esta fonte nada devia nesta data"
  // precisa que o papel AFIRME isso — um PDF sem seção nenhuma pareceria falha de geração.
  const vazio: SecaoPdf = {
    colunas: [{ rotulo: "Situação" }],
    linhas: [[fonte !== undefined ? `Sem liquidações aguardando pagamento na fonte ${fonte}.` : "Sem liquidações aguardando pagamento."]],
  };
  return {
    ente: ENTE,
    titulo: "Fila de pagamentos — ordem cronológica",
    subtitulo: `Por fonte e categoria · Lei 14.133/2021, art. 141${fonte !== undefined ? ` · fonte ${fonte}` : ""}`,
    periodo: "Posição atual da fila",
    secoes: secoes.length > 0 ? secoes : [vazio],
    notas: [
      "Valores em R$ · a posição é a ordem de exigibilidade dentro de cada fonte/categoria.",
      // ⚠️ O RECORTE VAI IMPRESSO. Um documento filtrado que não diz que é filtrado passa por
      // completo, e quem o recebe conclui que o ente só devia isto — a fonte omitida some sem aviso.
      ...(fonte !== undefined
        ? [`⚠️ RELATÓRIO FILTRADO: fonte de recurso ${fonte}. As demais fontes são filas próprias e não constam deste documento.`]
        : []),
    ],
  };
}

// ── F2: NOTA DE EMPENHO (documento individual, TR 5.17/5.19) ──────────────────────
export async function montarNotaEmpenho(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined; readonly id: string }): Promise<DocumentoPdf | null> {
  const empenhos = await listarEmpenhosDaExecucao({ exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo });
  const e = empenhos.find((x) => x.id === p.id);
  if (e === undefined) return null;

  const identificacao: SecaoPdf = {
    titulo: "Identificação",
    colunas: [{ rotulo: "Campo" }, { rotulo: "Valor" }],
    linhas: [
      ["Número do empenho", e.numero],
      ["Data de emissão", dataBr(e.data)],
      ["Credor (CPF/CNPJ)", mascararCpfCnpj(e.credorCpfCnpj)],
      ["Unidade orçamentária", `${e.unidadeCodigo} — ${e.unidadeNome}`],
      ["Ficha / dotação", String(e.fichaNumero)],
      ["Fonte de recurso", e.fonteCodigo],
      ["Natureza da contratação", e.categoria],
      ["Situação", e.status],
    ],
  };
  const valores: SecaoPdf = {
    titulo: "Valores",
    colunas: [{ rotulo: "Rubrica" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [
      ["Empenhado (líquido de anulações)", brl(e.empenhadoLiquido)],
      ["Anulações", brl(e.anulacoes)],
      ["Liquidado", brl(e.liquidado)],
      ["Pago", brl(e.pago)],
      ["Saldo a liquidar", brl(e.saldoALiquidar)],
      ["Saldo a pagar", brl(e.saldoAPagar)],
    ],
    totais: [0],
  };
  const historico: SecaoPdf = {
    titulo: "Histórico",
    colunas: [{ rotulo: "Descrição" }],
    linhas: [[e.historico]],
  };
  return {
    ente: ENTE,
    titulo: `Nota de Empenho nº ${e.numero}`,
    subtitulo: "Documento de execução da despesa",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [identificacao, valores, historico],
    notas: [
      e.anulado ? "Empenho ANULADO — ver a coluna de anulações." : "Valores em R$ · saldos derivados dos fatos (sem coluna de status no banco).",
    ],
  };
}

// ── F3: GUIA DE ARRECADAÇÃO (documento individual) ────────────────────────────────
export async function montarGuiaArrecadacao(p: { readonly exercicio: number; readonly id: string }): Promise<DocumentoPdf | null> {
  const periodo = await lerArrecadacoes({ exercicio: p.exercicio });
  const g = periodo.linhas.find((x) => x.id === p.id);
  if (g === undefined) return null;

  const identificacao: SecaoPdf = {
    titulo: "Identificação da guia",
    colunas: [{ rotulo: "Campo" }, { rotulo: "Valor" }],
    linhas: [
      ["Número da guia", g.numeroReceita],
      ["Data de arrecadação", dataBr(g.dataArrecadacao)],
      ["Natureza da receita", `${g.naturezaCodigo} — ${g.naturezaDescricao}`],
      ["Fonte de recurso", g.fonteCodigo],
      ["Código de acompanhamento (CO)", g.coCodigo ?? "—"],
      ["Tipo de lançamento", g.sinal === -1 ? "Anulação" : "Arrecadação"],
    ],
  };
  const valores: SecaoPdf = {
    titulo: "Valor",
    colunas: [{ rotulo: "Rubrica" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [[g.sinal === -1 ? "Valor anulado" : "Valor arrecadado", brlSinal(g.valor, g.sinal === -1)]],
    totais: [0],
  };
  return {
    ente: ENTE,
    titulo: `Guia de arrecadação nº ${g.numeroReceita}`,
    subtitulo: "Documento da receita orçamentária",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [identificacao, valores],
    notas: [g.sinal === -1 ? "Esta guia é uma ANULAÇÃO (ato próprio, append-only)." : "Valores em R$ · registro append-only (a guia anulada permanece na base)."],
  };
}

// ── DECRETO DE CRÉDITO ADICIONAL (documento individual, TR 4.20–4.30) ──────────────
const ORIGEM_ROTULO: Record<string, string> = {
  ANULACAO: "Anulação de dotações (remanejamento)",
  SUPERAVIT_FINANCEIRO: "Superávit financeiro",
  EXCESSO_ARRECADACAO: "Excesso de arrecadação",
  OPERACAO_CREDITO: "Operação de crédito",
};
const TIPO_CREDITO_ROTULO: Record<string, string> = {
  SUPLEMENTAR: "Suplementar", ESPECIAL: "Especial", EXTRAORDINARIO: "Extraordinário",
};

export async function montarDecreto(p: { readonly ano: number; readonly id: string }): Promise<DocumentoPdf | null> {
  const d = (await lerDecretos({ ano: p.ano })).find((x) => x.id === p.id);
  if (d === undefined) return null;

  const identificacao: SecaoPdf = {
    titulo: "Identificação",
    colunas: [{ rotulo: "Campo" }, { rotulo: "Valor" }],
    linhas: [
      ["Decreto", `${d.numero}/${d.ano}`],
      ["Data", dataBr(d.data)],
      ["Lei autorizadora", `${d.leiNumero}/${d.leiAno}`],
      ["Tipo de crédito", TIPO_CREDITO_ROTULO[d.tipoCredito] ?? d.tipoCredito],
      ["Origem do recurso", ORIGEM_ROTULO[d.origemRecurso] ?? d.origemRecurso],
      ["Situação", d.encerrado ? "Encerrado" : "Ativo"],
    ],
  };
  const itens: SecaoPdf = {
    titulo: "Itens do crédito",
    colunas: [
      { rotulo: "Ficha" }, { rotulo: "Unidade" }, { rotulo: "Fonte" }, { rotulo: "Tipo" },
      { rotulo: "Valor", alinhamento: "direita" },
    ],
    linhas: d.itens.map((i) => [
      String(i.fichaNumero), i.unidadeCodigo, i.fonteCodigo,
      i.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação",
      i.anulado ? `(${brl(i.valor)})` : brl(i.valor),
    ]),
  };
  const totais: SecaoPdf = {
    titulo: "Totais (4.27–4.28)",
    colunas: [{ rotulo: "Rubrica" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [
      ["Suplementado", brl(d.suplementado)],
      ["Anulado", brl(d.anulado)],
      ["Diferença (líquido)", brl(d.diferenca)],
    ],
    totais: [2],
  };
  return {
    ente: ENTE,
    titulo: `Decreto de crédito adicional nº ${d.numero}/${d.ano}`,
    subtitulo: "Créditos adicionais",
    periodo: `Exercício ${p.ano}`,
    secoes: [identificacao, itens, totais],
    notas: [
      d.encerrado && d.encerramento !== null ? `Encerrado em ${dataBr(d.encerramento.data)} — ${d.encerramento.motivo}.` : "Documento ativo.",
      "Valores em R$ · num decreto por anulação, o suplementado fecha com o anulado por fonte.",
    ],
  };
}

// ── EXTRAORÇAMENTÁRIO (M07, TR 5.39–5.49) ──────────────────────────────────────────
export async function montarExtraorcamentario(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const [saldos, retencoes, dispendios] = await Promise.all([
    lerSaldosExtra(), lerRetencoes({ exercicio: p.exercicio }), lerDispendiosExtra({ exercicio: p.exercicio }),
  ]);
  const secaoSaldos: SecaoPdf = {
    titulo: "Saldos por consignatário (5.41)",
    colunas: [
      { rotulo: "Tipo" }, { rotulo: "Consignatário" }, { rotulo: "Ingressado", alinhamento: "direita" },
      { rotulo: "Recolhido", alinhamento: "direita" }, { rotulo: "Saldo a repassar", alinhamento: "direita" },
    ],
    linhas: saldos.map((s) => [`${s.tipoCodigo} ${s.tipoDescricao}`, s.consignatario, brl(s.ingressado), brl(s.dispendido), brl(s.saldo)]),
  };
  const secaoRet: SecaoPdf = {
    titulo: "Retenções na fonte (5.25)",
    colunas: [
      { rotulo: "Data" }, { rotulo: "Tipo" }, { rotulo: "Consignatário" }, { rotulo: "Empenho" },
      { rotulo: "Pagamento" }, { rotulo: "Valor", alinhamento: "direita" },
    ],
    linhas: retencoes.map((r) => [dataBr(r.data), r.tipoCodigo, r.consignatario, r.empenhoNumero ?? "—", r.pagamentoNumero ?? "—", brl(r.valor)]),
  };
  const secaoDisp: SecaoPdf = {
    titulo: "Recolhimentos — despesa extra (5.43–5.45)",
    colunas: [
      { rotulo: "Data" }, { rotulo: "Tipo" }, { rotulo: "Consignatário" }, { rotulo: "Histórico" },
      { rotulo: "Valor", alinhamento: "direita" },
    ],
    linhas: dispendios.map((d) => [dataBr(d.data), d.tipoCodigo, d.consignatario, d.historico, brl(d.valor)]),
  };
  return {
    ente: ENTE,
    titulo: "Extraorçamentário — consignações e retenções",
    subtitulo: "Dinheiro de terceiros no caixa",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [secaoSaldos, secaoRet, secaoDisp],
    notas: ["Valores em R$ · o saldo a repassar é o que o ente ainda deve ao consignatário; o recolhimento nunca excede o retido (5.45/5.107)."],
  };
}

// ── PATRIMÔNIO (M10, TR 5.82–5.86) ─────────────────────────────────────────────────
export async function montarPatrimonio(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const [pos, div] = await Promise.all([lerPosicaoPatrimonial({ exercicio: p.exercicio }), lerDividas({ exercicio: p.exercicio })]);
  const posicao: SecaoPdf = {
    titulo: "Posição patrimonial por classe (5.86)",
    colunas: [
      { rotulo: "Classe" }, { rotulo: "Conta" }, { rotulo: "Saldo anterior", alinhamento: "direita" },
      { rotulo: "Ingressos", alinhamento: "direita" }, { rotulo: "Atualizações", alinhamento: "direita" },
      { rotulo: "Saldo final", alinhamento: "direita" },
    ],
    linhas: [
      ...pos.classes.map((c) => [`${c.codigo} ${c.descricao}`, c.classificacaoContabil, brl(c.saldoAnterior), brl(c.ingressos), brl(c.atualizacoes), brl(c.saldoFinal)]),
      ["TOTAL", "", brl(pos.total.saldoAnterior), brl(pos.total.ingressos), brl(pos.total.atualizacoes), brl(pos.total.saldoFinal)],
    ],
    totais: [pos.classes.length],
  };
  const divida: SecaoPdf = {
    titulo: "Dívida consolidada por tipo (5.82–5.83)",
    colunas: [{ rotulo: "Tipo" }, { rotulo: "Saldo", alinhamento: "direita" }],
    linhas: [["Mobiliária", brl(div.mobiliaria)], ["Contratual", brl(div.contratual)], ["Total (DC)", brl(div.total)]],
    totais: [2],
  };
  return {
    ente: ENTE,
    titulo: "Patrimônio — bens e dívida consolidada",
    subtitulo: "Posição patrimonial por classe",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [posicao, divida],
    notas: ["Valores em R$ · a posição de cada classe é anterior + ingressos + atualizações = final (SUM dos lançamentos). A dívida é o mesmo saldo do RGF Anexo 2."],
  };
}

// ── TRAVA-1 · F2: RELATÓRIO DE ATUALIZAÇÕES ORÇAMENTÁRIAS (TR 4.40) ──────────────
/**
 * O 4.40 IMPRESSO — a MESMA leitura (`lerDecretos`), o MESMO achatamento e os MESMOS filtros da
 * tela (`lib/relatorios/atualizacoes-orcamentarias`, funções puras).
 *
 * ⚠️ NADA É RECALCULADO AQUI. Se esta rota reaplicasse os filtros com a sua própria condição, ou
 * somasse os totais por conta própria, o PDF poderia divergir da tela que o originou — e o
 * documento impresso é justamente o que sai da prefeitura. "O PDF é a tela" só vale se for
 * literalmente o mesmo código.
 *
 * ⚠️ OS FILTROS APLICADOS VÃO IMPRESSOS nas notas. Um relatório filtrado que não diz o recorte
 * mente por omissão: quem recebe o papel não tem como saber que faltam linhas.
 */
export async function montarPdfAtualizacoesOrcamentarias(p: {
  readonly exercicio: number;
  readonly filtro: FiltroAtualizacoes;
}): Promise<DocumentoPdf> {
  const todas = linhasDeAtualizacao(await lerDecretos({ ano: p.exercicio }));
  const linhas = filtrarAtualizacoes(todas, p.filtro);
  const totais = totaisDeAtualizacoes(linhas);

  const movimentos: SecaoPdf = {
    colunas: [
      { rotulo: "Data" }, { rotulo: "Decreto" }, { rotulo: "Lei" }, { rotulo: "Origem" },
      { rotulo: "Ficha", alinhamento: "direita" }, { rotulo: "UG" }, { rotulo: "Fonte" },
      { rotulo: "Movimento" }, { rotulo: "Valor", alinhamento: "direita" }, { rotulo: "Situação" },
    ],
    linhas: linhas.map((l) => [
      dataBr(l.data), `${l.decretoNumero}/${l.decretoAno}`, `${l.leiNumero}/${l.leiAno}`,
      ORIGEM_ROTULO[l.origemRecurso] ?? l.origemRecurso,
      String(l.fichaNumero), l.unidadeCodigo, l.fonteCodigo,
      l.tipo === "SUPLEMENTACAO" ? "Suplementação" : "Anulação",
      brlSinal(l.valor, l.tipo === "ANULACAO"),
      l.anulado ? "Estornado" : l.decretoEncerrado ? "Decreto encerrado" : "Vigente",
    ]),
  };

  const quadroTotais: SecaoPdf = {
    titulo: "Totais das linhas exibidas",
    colunas: [{ rotulo: "Rubrica" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [
      ["Suplementado", brl(totais.suplementado)],
      ["Anulado", brl(totais.anulado)],
      ["Efeito líquido no orçamento", brl(totais.liquido)],
    ],
    totais: [2],
  };

  const recorte = [
    p.filtro.ficha !== undefined && p.filtro.ficha !== "" ? `ficha ${p.filtro.ficha}` : null,
    p.filtro.decreto !== undefined && p.filtro.decreto !== "" ? `decreto ${p.filtro.decreto}` : null,
    p.filtro.fonte !== undefined && p.filtro.fonte !== "" ? `fonte ${p.filtro.fonte}` : null,
    p.filtro.unidade !== undefined && p.filtro.unidade !== "" ? `UG ${p.filtro.unidade}` : null,
  ].filter((x): x is string => x !== null);

  return {
    ente: ENTE,
    titulo: "Atualizações orçamentárias",
    subtitulo: "Movimentos de crédito adicional por ficha, decreto, fonte e unidade",
    periodo: `Exercício ${p.exercicio}`,
    secoes: [movimentos, quadroTotais],
    notas: [
      recorte.length > 0
        ? `⚠️ RELATÓRIO FILTRADO: ${recorte.join(" · ")}. ${linhas.length} de ${todas.length} movimento(s) do exercício.`
        : `Sem filtro: todos os ${todas.length} movimento(s) do exercício.`,
      "Valores em R$ · a anulação vai com sinal negativo (ela reduz a dotação da ficha).",
      "Movimentos ESTORNADOS aparecem listados (o fato aconteceu) e ficam FORA dos totais — o mesmo critério da tela de créditos adicionais.",
    ],
  };
}

// ── PROGRAMAÇÃO FINANCEIRA — CMD/MBA e o DECRETO (M02, TR 4.18/4.19/4.43/4.44) ─────

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const BIMESTRES = ["1º bim.", "2º bim.", "3º bim.", "4º bim.", "5º bim.", "6º bim."] as const;

/**
 * A MATRIZ de um plano (fonte nas linhas, períodos nas colunas) como seção de PDF, com a linha TOTAL.
 *
 * ⚠️ AS COLUNAS SÃO AS DA TELA, na mesma ordem e com a mesma formatação — "o PDF é a tela". Os
 * valores já vêm somados da porta; aqui não se soma nada, só se escreve.
 */
function secaoMatriz(
  titulo: string,
  versao: VersaoProgramacao,
  rotulos: readonly string[],
  /** Fatia dos períodos a imprimir — ver a nota do semestre em `montarProgramacaoFinanceira`. */
  de: number,
  ate: number
): SecaoPdf {
  const indices = Array.from({ length: ate - de }, (_, i) => de + i);
  const linhas = versao.linhas.map((l) => [
    `${l.fonteCodigo} — ${l.fonteDescricao}`,
    ...indices.map((i) => brl(l.parcelas[i] ?? "0.00")),
    brl(l.total),
  ]);
  linhas.push([
    "TOTAL",
    ...indices.map((i) => brl(versao.totalPorPeriodo[i] ?? "0.00")),
    brl(versao.total),
  ]);
  return {
    titulo,
    colunas: [
      { rotulo: "Fonte de recurso" },
      ...indices.map((i) => ({ rotulo: rotulos[i] ?? String(i + 1), alinhamento: "direita" as const })),
      { rotulo: "Total do exercício", alinhamento: "direita" as const },
    ],
    linhas,
    totais: [linhas.length - 1],
  };
}

/**
 * O TEXTO do decreto como seção — uma linha por parágrafo.
 *
 * ⚠️ O `SecaoPdf` só sabe desenhar TABELA (ver `lib/pdf/documento.ts`), então o decreto vai numa
 * coluna única, parágrafo a parágrafo. Não é elegante, mas é o MESMO motor e o MESMO rodapé (hash
 * SHA-256 + "não assinado — ICP pendente") de todo documento que sai daqui: um decreto impresso por
 * um caminho paralelo não carregaria essa honestidade.
 */
function secaoTexto(titulo: string, texto: string): SecaoPdf {
  return {
    titulo,
    colunas: [{ rotulo: "Minuta — modelo de decreto" }],
    linhas: texto
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .map((p) => [p.replace(/\n/g, " ")]),
  };
}

/**
 * O CORPO do decreto (o "anexo" a que o Art. 1º remete): o total programado por fonte.
 *
 * ⚠️ TEXTO, NÃO TABELA — é o que entra no placeholder `{corpo}` do template do ente. O quadro
 * completo (fonte × período) vai nas seções próprias do documento; aqui fica o resumo que a minuta
 * precisa carregar por si, porque a minuta é copiada para o diário oficial sem o resto do PDF.
 */
function corpoDoDecreto(versao: VersaoProgramacao, rotuloPlano: string): string {
  const porFonte = versao.linhas.map((l) => `fonte ${l.fonteCodigo} (${l.fonteDescricao}) — ${brl(l.total)}`).join("; ");
  return (
    `Parágrafo único. O ${rotuloPlano} aprovado totaliza ${brl(versao.total)}, assim distribuído ` +
    `por fonte de recurso: ${porFonte}.`
  );
}

/** Quando não há plano vigente, o documento DIZ isso — em vez de sair com tabelas vazias. */
function secaoSemPlano(titulo: string, plano: PlanoProgramacao, nome: string): SecaoPdf {
  const situacao =
    plano.versoes === 0
      ? `Nenhuma versão de ${nome} registrada para o exercício — não há decreto de programação financeira na base.`
      : `Existem ${plano.versoes} versão(ões) de ${nome}, mas nenhuma vigente em ${dataBr(plano.referencia)}` +
        `${plano.futuras > 0 ? ` (${plano.futuras} com vigência futura)` : ""}.`;
  return { titulo, colunas: [{ rotulo: "Situação" }], linhas: [[situacao]] };
}

/**
 * PROGRAMAÇÃO FINANCEIRA IMPRESSA — os duodécimos do CMD, as metas do MBA, o confronto do art. 9º e
 * as minutas de decreto (TR 4.19).
 *
 * ⚠️ O CMD SAI EM DOIS SEMESTRES. Fonte + 12 meses + total são 14 colunas: em A4 retrato a 9pt os
 * valores quebrariam linha e a régua vertical de algarismos — a que o olho usa para achar o centavo
 * — se perderia. Duas tabelas de sete colunas leem-se; uma de quatorze, não. A coluna "Total do
 * exercício" se repete nas duas de propósito: cada metade fecha com o ano à vista.
 *
 * ⚠️ NADA É INVENTADO QUANDO NÃO HÁ PLANO. Sem versão vigente, as seções dizem o que falta (decreto
 * não registrado × decreto com vigência futura) — o documento em branco é uma resposta legítima, o
 * documento com zeros fabricados não é.
 */
export async function montarProgramacaoFinanceira(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const [cmd, mba, confronto] = await Promise.all([
    lerCmdVigente({ exercicio: p.exercicio }),
    lerMbaVigente({ exercicio: p.exercicio }),
    lerConfrontoMba({ exercicio: p.exercicio }),
  ]);

  const secoes: SecaoPdf[] = [];
  const notas: string[] = [];

  // ── CMD: os duodécimos ──
  if (cmd.vigente !== null) {
    const v = cmd.vigente;
    secoes.push(
      secaoMatriz(`Cronograma Mensal de Desembolso — versão ${v.numero} (ato ${v.atoRef}) · 1º semestre`, v, MESES, 0, 6),
      secaoMatriz(`Cronograma Mensal de Desembolso — 2º semestre`, v, MESES, 6, 12),
      secaoTexto(
        "Decreto do CMD — minuta (LRF art. 8º)",
        await gerarTextoDecretoCmd({
          exercicio: p.exercicio,
          atoRef: v.atoRef,
          dataVigencia: v.vigenteDesde,
          corpo: corpoDoDecreto(v, "Cronograma Mensal de Desembolso"),
        })
      )
    );
    notas.push(
      `CMD vigente: versão ${v.numero}, ato ${v.atoRef}, com efeitos desde ${dataBr(v.vigenteDesde)} ` +
        `(registrada por ${v.criadoPor}). ${cmd.versoes} versão(ões) no exercício — as anteriores permanecem na base (append-only).`
    );
    const semCota = v.linhas.filter((l) => l.periodosSemLinha.length > 0);
    if (semCota.length > 0) {
      notas.push(
        `⚠️ Fonte(s) com MÊS SEM COTA (ausência, não zero): ${semCota
          .map((l) => `${l.fonteCodigo} → ${l.periodosSemLinha.map((i) => MESES[i - 1] ?? i).join(", ")}`)
          .join(" · ")}. Com a limitação de empenho ATIVA, empenhar em fonte/mês sem cota é rejeitado (fail-closed).`
      );
    }
  } else {
    secoes.push(secaoSemPlano("Cronograma Mensal de Desembolso (CMD)", cmd, "CMD"));
  }

  // ── MBA: as metas bimestrais ──
  if (mba.vigente !== null) {
    const v = mba.vigente;
    secoes.push(
      secaoMatriz(`Metas Bimestrais de Arrecadação — versão ${v.numero} (ato ${v.atoRef})`, v, BIMESTRES, 0, 6),
      secaoTexto(
        "Decreto do MBA — minuta (LRF art. 13)",
        await gerarTextoDecretoMba({
          exercicio: p.exercicio,
          atoRef: v.atoRef,
          dataVigencia: v.vigenteDesde,
          corpo: corpoDoDecreto(v, "desdobramento das Metas Bimestrais de Arrecadação"),
        })
      )
    );
    notas.push(
      `MBA vigente: versão ${v.numero}, ato ${v.atoRef}, com efeitos desde ${dataBr(v.vigenteDesde)}.`
    );
  } else {
    secoes.push(secaoSemPlano("Metas Bimestrais de Arrecadação (MBA)", mba, "MBA"));
  }

  // ── O confronto do art. 9º: meta × arrecadado, ACUMULADO ──
  if (confronto.linhas.length > 0) {
    secoes.push({
      titulo: `Confronto do art. 9º da LRF — meta × arrecadado (acumulado até o ${confronto.ateBimestre}º bimestre)`,
      colunas: [
        { rotulo: "Fonte" }, { rotulo: "Bimestre" },
        { rotulo: "Meta acumulada", alinhamento: "direita" },
        { rotulo: "Arrecadado acumulado", alinhamento: "direita" },
        { rotulo: "Diferença", alinhamento: "direita" },
        { rotulo: "Situação" },
      ],
      linhas: confronto.linhas.map((l) => [
        l.fonteCodigo, `${l.bimestre}º`,
        brl(l.metaAcumulada), brl(l.arrecadadoAcumulado), brl(l.diferenca),
        l.frustrada ? "FRUSTRAÇÃO — gatilho do art. 9º" : "Meta cumprida",
      ]),
    });
    notas.push(
      `Confronto acumulado até o ${confronto.ateBimestre}º bimestre (o último INTEIRAMENTE decorrido) — ` +
        `o art. 9º julga "ao final de um bimestre"; comparar contra o bimestre corrente acusaria frustração inexistente.`
    );
  } else if (mba.vigente !== null) {
    notas.push(
      confronto.ateBimestre === 0
        ? "Confronto do art. 9º não emitido: nenhum bimestre do exercício fechou até a data de emissão."
        : `Confronto do art. 9º sem linhas até o ${confronto.ateBimestre}º bimestre — o MBA vigente não tem metas nos bimestres decorridos.`
    );
  }

  notas.push(
    "Valores em R$ · a distribuição fecha ao centavo com a LOA: as parcelas levam o valor truncado e o ÚLTIMO período absorve a diferença.",
    "As minutas de decreto saem do template do ente (TemplateDecreto) ou do modelo default do sistema — são MINUTA, não ato publicado."
  );

  return {
    ente: ENTE,
    titulo: "Programação financeira — CMD e MBA",
    subtitulo: "Cronograma Mensal de Desembolso e Metas Bimestrais de Arrecadação · LRF arts. 8º, 9º e 13",
    periodo: `Exercício ${p.exercicio}`,
    secoes,
    notas,
  };
}

/** Imprime um documento montado — o mesmo motor/rodapé da publicação (7.15). */
export async function emitir(doc: DocumentoPdf, nomeBase: string): Promise<ResultadoPdf> {
  return gerarPdfDoDemonstrativo(doc, { nomeBase });
}
