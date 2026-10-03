/**
 * ═══ A ABRANGÊNCIA DE CADA ARQUIVO DO SAGRES — POR UG, OU DO ENTE (V33) ═══
 *
 * ⚠️ POR QUE ESTA TABELA EXISTE. Até a V32 a UG pedida só virava o código de 6 posições no NOME do arquivo e na
 * coluna `codUnidadeGestora` de cada linha: os leitores (`lerFatos*`) liam o ente inteiro. Com uma UG operada
 * isso é certo — a base é dela. Com duas ou mais, o pacote da Câmara levava os empenhos da Prefeitura com o
 * código da Câmara em cada linha. Não é um filtro que falta: na maior parte do modelo NÃO HÁ o vínculo
 * (empenho, liquidação, pagamento, ficha, unidade orçamentária e órgão não carregam UG nem entidade).
 *
 * ⚠️ NÃO É UM FILTRO GLOBAL CEGO. Cada tabela declara:
 *   · `abrangencia` — POR_UG (cada UG envia o seu) ou DO_ENTE (a Prefeitura envia, pelo ente);
 *   · `base` — LEIAUTE quando o HTML oficial (`docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html`)
 *     diz; INFERENCIA quando é leitura nossa, e aí a decisão é revisável;
 *   · `recorte` — o que o gerador SABE fazer hoje:
 *       FILTRA_POR_UG          o leitor seleciona pela UG (vínculo comprovado no modelo);
 *       SEM_VINCULO            POR_UG, mas o modelo não diz de que UG é cada registro;
 *       CONSOLIDADO            DO_ENTE, e a linha leva o código de quem envia (a Prefeitura);
 *       CONSOLIDADO_UG_NA_LINHA DO_ENTE, mas CADA LINHA leva a UG dona do registro (a dotação da Câmara
 *                              sai pela Prefeitura com o código da Câmara) — e o modelo não tem esse vínculo.
 *
 * A decisão (`decidirArquivo`) é pura e fail-closed: na dúvida, o arquivo fica FORA do pacote com o motivo.
 * Ela não "consola" a ausência de vínculo atribuindo UG por órgão ou por ordem de cadastro.
 */

export type Abrangencia = "POR_UG" | "DO_ENTE";
export type Base = "LEIAUTE" | "INFERENCIA";
export type Recorte = "FILTRA_POR_UG" | "SEM_VINCULO" | "CONSOLIDADO" | "CONSOLIDADO_UG_NA_LINHA";

export interface AbrangenciaDaTabela {
  readonly abrangencia: Abrangencia;
  readonly base: Base;
  readonly recorte: Recorte;
  /**
   * Os arquivos que as linhas deste CITAM (número do empenho, conta bancária). Se um deles fica fora do pacote,
   * este fica junto: entrar sozinho deixaria a referência apontando para o que o Tribunal não recebeu.
   */
  readonly citaOs?: readonly string[];
}

const porUg = (base: Base, recorte: "FILTRA_POR_UG" | "SEM_VINCULO"): AbrangenciaDaTabela => ({ abrangencia: "POR_UG", base, recorte });
const doEnte = (base: Base, recorte: "CONSOLIDADO" | "CONSOLIDADO_UG_NA_LINHA"): AbrangenciaDaTabela => ({ abrangencia: "DO_ENTE", base, recorte });

/**
 * As 58 tabelas do leiaute 2026 v1.1, pelo nome do arquivo (a "entidade" de `nomeArquivo`).
 * Um arquivo cujo nome não esteja aqui é recusado: tabela nova nasce com a abrangência declarada.
 */
export const ABRANGENCIA_DO_SAGRES: Readonly<Record<string, AbrangenciaDaTabela>> = {
  // ── do ente: a LOA, os créditos e as normas — "exclusivamente pela Prefeitura" ──
  Dotacao: doEnte("LEIAUTE", "CONSOLIDADO_UG_NA_LINHA"),
  AtualizacaoOrcamentaria: doEnte("LEIAUTE", "CONSOLIDADO_UG_NA_LINHA"),
  DecretoseOficios: doEnte("LEIAUTE", "CONSOLIDADO"),
  NormasOrcamentarias: doEnte("LEIAUTE", "CONSOLIDADO"),
  Programas: doEnte("INFERENCIA", "CONSOLIDADO"),
  Acao: doEnte("INFERENCIA", "CONSOLIDADO"),
  ReceitaPrevista: doEnte("INFERENCIA", "CONSOLIDADO"),
  PloaAcao: doEnte("INFERENCIA", "CONSOLIDADO"),
  PloaPrograma: doEnte("INFERENCIA", "CONSOLIDADO"),
  PloaReceitaPrevista: doEnte("INFERENCIA", "CONSOLIDADO"),
  PloaUnidadeOrcamentaria: doEnte("INFERENCIA", "CONSOLIDADO"),
  PloaDotacao: doEnte("INFERENCIA", "CONSOLIDADO_UG_NA_LINHA"),
  ResponsavelSiafic: doEnte("INFERENCIA", "CONSOLIDADO"),
  // ── por UG, com o vínculo no modelo ──
  // a conta da transferência (numeroConta, codBanco, numAgencia) é a do CadastroContaBancaria
  TransfRecebida: { ...porUg("LEIAUTE", "FILTRA_POR_UG"), citaOs: ["CadastroContaBancaria"] },
  TransfConcedida: { ...porUg("LEIAUTE", "FILTRA_POR_UG"), citaOs: ["CadastroContaBancaria"] },
  // o agrupamento da folha leva numEmpenho e numLiquidacao
  RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento: { ...porUg("INFERENCIA", "FILTRA_POR_UG"), citaOs: ["Empenhos", "Liquidacao"] },
  ProprietarioFrota: porUg("INFERENCIA", "FILTRA_POR_UG"),
  LocadorPrestador: porUg("INFERENCIA", "FILTRA_POR_UG"),
  Veiculos: porUg("INFERENCIA", "FILTRA_POR_UG"),
  Maquinas: porUg("INFERENCIA", "FILTRA_POR_UG"),
  SituacaoFrota: porUg("INFERENCIA", "FILTRA_POR_UG"),
  Abastecimento: porUg("INFERENCIA", "FILTRA_POR_UG"),
  Farmacia: porUg("LEIAUTE", "FILTRA_POR_UG"),
  EstoqueFarmacia: porUg("LEIAUTE", "FILTRA_POR_UG"),
  // ── por UG, sem o vínculo no modelo (a cadeia da despesa, da receita, dos extras, das contas e dos restos) ──
  UnidadeOrcamentaria: porUg("LEIAUTE", "SEM_VINCULO"),
  Empenhos: porUg("INFERENCIA", "SEM_VINCULO"),
  Estornos: porUg("INFERENCIA", "SEM_VINCULO"),
  Liquidacao: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoLiquidacao: porUg("INFERENCIA", "SEM_VINCULO"),
  Pagamentos: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoPagamento: porUg("INFERENCIA", "SEM_VINCULO"),
  Retencao: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoRetencao: porUg("INFERENCIA", "SEM_VINCULO"),
  ReceitaOrcamentaria: porUg("INFERENCIA", "SEM_VINCULO"),
  ReceitaExtra: porUg("INFERENCIA", "SEM_VINCULO"),
  DespesaExtra: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoReceitaExtra: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoDespesaExtra: porUg("INFERENCIA", "SEM_VINCULO"),
  CadastroContaBancaria: porUg("LEIAUTE", "SEM_VINCULO"),
  RelacionamentoCCorrenteFontePagadora: porUg("LEIAUTE", "SEM_VINCULO"),
  SaldoInicial: porUg("INFERENCIA", "SEM_VINCULO"),
  SaldoMensal: porUg("INFERENCIA", "SEM_VINCULO"),
  ConciliacaoBancaria: porUg("INFERENCIA", "SEM_VINCULO"),
  MovimentacaoEntreContasBancarias: porUg("LEIAUTE", "SEM_VINCULO"),
  PagamentosRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoPagamentoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  CancelamentoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  LiquidacaoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoLiquidacaoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  RetencaoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  EstornoRetencaoRestos: porUg("INFERENCIA", "SEM_VINCULO"),
  RestosInscritos: porUg("INFERENCIA", "SEM_VINCULO"),
  Fornecedores: porUg("LEIAUTE", "SEM_VINCULO"),
  Ordenador: porUg("INFERENCIA", "SEM_VINCULO"),
  RelacionamentoEmpenhoObra: porUg("INFERENCIA", "SEM_VINCULO"),
  RelacionamentoEmpenhoLicitacao: porUg("INFERENCIA", "SEM_VINCULO"),
  RelacionamentoEmpenhoNaturezaContratacao: porUg("INFERENCIA", "SEM_VINCULO"),
  RelacionamentoLiquidacaoPagamento: porUg("INFERENCIA", "SEM_VINCULO"),
};

/** A entidade do leiaute a partir do nome do arquivo: `201078` + data + `Empenhos` + `.txt`, ou o PDF do decreto. */
export function tabelaDoArquivo(nome: string): string {
  if (/^Decreto\d{6}.*\.pdf$/i.test(nome)) return "DecretoseOficios";
  return nome.replace(/^\d{6}\d{4}(\d{2}(\d{2})?)?/, "").replace(/\.txt$/i, "");
}

/** O que a remessa sabe das UGs no dia — lido pela porta, decidido aqui. */
export interface ContextoDasUgs {
  /** Quantas UGs escrituradas aqui estão vigentes no dia. */
  readonly operadas: number;
  /** A UG pedida é a Prefeitura do ente (natureza PREFEITURA_OU_SECRETARIA, e a única assim entre as operadas)? */
  readonly pedidaEhAPrefeitura: boolean;
}

export type RegraDaAbrangencia = "RECORTE_POR_UG_INDISPONIVEL" | "ARQUIVO_SO_DA_PREFEITURA" | "TABELA_SEM_ABRANGENCIA";

export type DecisaoDoArquivo =
  | { readonly incluir: true }
  | { readonly incluir: false; readonly regra: RegraDaAbrangencia; readonly detalhe: string };

/**
 * Entra ou fica fora, e por quê. Uma UG operada: tudo entra (a base é dela; comportamento anterior, byte a byte),
 * exceto o arquivo do ente pedido por UG que não é a Prefeitura.
 */
export function decidirArquivo(tabela: string, ctx: ContextoDasUgs): DecisaoDoArquivo {
  const a = ABRANGENCIA_DO_SAGRES[tabela];
  if (a === undefined) {
    return { incluir: false, regra: "TABELA_SEM_ABRANGENCIA", detalhe: `O arquivo ${tabela} não tem a abrangência declarada (por unidade gestora ou do ente). Fica fora até a declaração.` };
  }
  if (a.abrangencia === "DO_ENTE" && !ctx.pedidaEhAPrefeitura && ctx.operadas >= 1) {
    return {
      incluir: false,
      regra: "ARQUIVO_SO_DA_PREFEITURA",
      detalhe: `${tabela} é do ente e só a Prefeitura o envia${a.base === "LEIAUTE" ? " (regra do leiaute)" : ""}. Esta unidade gestora não o remete.`,
    };
  }
  if (ctx.operadas <= 1) return { incluir: true };
  if (a.recorte === "SEM_VINCULO") {
    return {
      incluir: false,
      regra: "RECORTE_POR_UG_INDISPONIVEL",
      detalhe: `Há ${String(ctx.operadas)} unidades gestoras escrituradas aqui, e os registros de ${tabela} não dizem a qual delas pertencem. O arquivo sairia com os dados de todas sob o código desta. Fica fora até o vínculo dos registros com a unidade gestora.`,
    };
  }
  if (a.recorte === "CONSOLIDADO_UG_NA_LINHA") {
    return {
      incluir: false,
      regra: "RECORTE_POR_UG_INDISPONIVEL",
      detalhe: `${tabela} vai pela Prefeitura com a unidade gestora dona de cada linha, e os registros não dizem de qual das ${String(ctx.operadas)} unidades são. Fica fora até o vínculo.`,
    };
  }
  for (const citado of a.citaOs ?? []) {
    const d = decidirArquivo(citado, ctx);
    if (!d.incluir) {
      return {
        incluir: false,
        regra: d.regra,
        detalhe: `${tabela} cita registros de ${citado}, que fica fora do pacote; entrar sozinho deixaria a referência sem destino. ${d.detalhe}`,
      };
    }
  }
  return { incluir: true };
}

/** Aplica a decisão a uma lista de arquivos: os que entram, e a recusa nomeada dos que ficam fora. */
export function aplicarAbrangencia<T extends { readonly nome: string }>(
  arquivos: readonly T[],
  ctx: ContextoDasUgs
): { readonly arquivos: readonly T[]; readonly fora: readonly { readonly arquivo: string; readonly regra: RegraDaAbrangencia; readonly detalhe: string }[] } {
  const dentro: T[] = [];
  const fora: { arquivo: string; regra: RegraDaAbrangencia; detalhe: string }[] = [];
  const vistos = new Set<string>();
  for (const arq of arquivos) {
    const tabela = tabelaDoArquivo(arq.nome);
    const d = decidirArquivo(tabela, ctx);
    if (d.incluir) dentro.push(arq);
    else if (!vistos.has(tabela)) {
      vistos.add(tabela);
      fora.push({ arquivo: tabela, regra: d.regra, detalhe: d.detalhe });
    }
  }
  return { arquivos: dentro, fora };
}
