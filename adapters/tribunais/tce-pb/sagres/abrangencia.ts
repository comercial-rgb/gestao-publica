/**
 * ═══ A ABRANGÊNCIA DE CADA ARQUIVO DO SAGRES — POR UG, OU DO ENTE (V33) ═══
 *
 * ⚠️ POR QUE ESTA TABELA EXISTE. Até a V32 a UG pedida só virava o código de 6 posições no NOME do arquivo e na
 * coluna `codUnidadeGestora` de cada linha: os leitores (`lerFatos*`) liam o ente inteiro. Com uma UG operada
 * isso é certo — a base é dela. Com duas ou mais, o pacote da Câmara levava os empenhos da Prefeitura com o
 * código da Câmara em cada linha.
 *
 * ⚠️ NÃO É UM FILTRO GLOBAL CEGO. Cada tabela declara:
 *   · `abrangencia` — POR_UG (cada UG envia o seu) ou DO_ENTE (a Prefeitura envia, pelo ente);
 *   · `base` — LEIAUTE quando o HTML oficial (`docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html`)
 *     diz; INFERENCIA quando é leitura nossa, e aí a decisão é revisável;
 *   · `recorte` — como a UG de cada registro é conhecida:
 *       FILTRA_POR_UG           o leitor já seleciona pela UG (vínculo no modelo: frota, farmácia, transferência);
 *       POR_UO_NA_LINHA         pelo código da unidade orçamentária QUE ESTÁ NA LINHA, e o vínculo DECLARADO
 *                               unidade → UG (`VinculoDaUnidadeOrcamentariaComUg`). O recorte é o que o Tribunal lê;
 *       DERIVADO                as linhas valem se o documento delas está num arquivo que ficou (fornecedor do empenho);
 *       SEM_VINCULO             POR_UG, e nem o modelo nem a linha dizem de que UG é o registro;
 *       CONSOLIDADO             DO_ENTE, e a linha leva o código de quem envia (a Prefeitura);
 *       CONSOLIDADO_UG_NA_LINHA DO_ENTE, e CADA LINHA leva a UG dona da unidade orçamentária da linha (a dotação da
 *                               Câmara sai pela Prefeitura com o código da Câmara — regra do leiaute).
 *
 * Fail-closed: na dúvida, o arquivo fica FORA do pacote com o motivo. Nenhuma UG é atribuída por órgão, por ordem de
 * cadastro ou por nome: a unidade sem vínculo declarado RECUSA o arquivo inteiro, nomeando o código.
 */

import * as LEIAUTES from "./layout-2026v11.js";

export type Abrangencia = "POR_UG" | "DO_ENTE";
export type Base = "LEIAUTE" | "INFERENCIA";
export type Recorte =
  | { readonly tipo: "FILTRA_POR_UG" }
  | { readonly tipo: "POR_UO_NA_LINHA"; readonly campo: string }
  | { readonly tipo: "POR_CONTA_NA_LINHA"; readonly contas: readonly ContaNaLinha[] }
  | { readonly tipo: "DERIVADO"; readonly campo: string; readonly de: string; readonly campoDe: string }
  | { readonly tipo: "SEM_VINCULO" }
  | { readonly tipo: "CONSOLIDADO" }
  | { readonly tipo: "CONSOLIDADO_UG_NA_LINHA"; readonly campoUo: string };

/** Os três campos que identificam uma conta bancária na linha do leiaute (banco, agência com dígito, conta com dígito). */
export interface ContaNaLinha {
  readonly banco: string;
  readonly agencia: string;
  readonly conta: string;
}

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

const FILTRA: Recorte = { tipo: "FILTRA_POR_UG" };
const SEM: Recorte = { tipo: "SEM_VINCULO" };
const CONS: Recorte = { tipo: "CONSOLIDADO" };
const UO: Recorte = { tipo: "POR_UO_NA_LINHA", campo: "codUnidadeOrcamentaria" };
const porUg = (base: Base, recorte: Recorte, citaOs?: readonly string[]): AbrangenciaDaTabela => ({ abrangencia: "POR_UG", base, recorte, ...(citaOs !== undefined ? { citaOs } : {}) });
const doEnte = (base: Base, recorte: Recorte): AbrangenciaDaTabela => ({ abrangencia: "DO_ENTE", base, recorte });
const CONTA = (conta: string, agencia = "numAgencia", banco = "codBanco"): Recorte => ({ tipo: "POR_CONTA_NA_LINHA", contas: [{ banco, agencia, conta }] });
const UG_NA_LINHA: Recorte = { tipo: "CONSOLIDADO_UG_NA_LINHA", campoUo: "codUnidadeOrcamentaria" };

/**
 * As 58 tabelas do leiaute 2026 v1.1, pelo nome do arquivo (a "entidade" de `nomeArquivo`).
 * Um arquivo cujo nome não esteja aqui é recusado: tabela nova nasce com a abrangência declarada.
 */
export const ABRANGENCIA_DO_SAGRES: Readonly<Record<string, AbrangenciaDaTabela>> = {
  // ── do ente: a LOA, os créditos e as normas — "SOMENTE a Prefeitura Municipal (Poder Executivo) enviará" ──
  Dotacao: doEnte("LEIAUTE", UG_NA_LINHA),
  AtualizacaoOrcamentaria: doEnte("LEIAUTE", UG_NA_LINHA),
  DecretoseOficios: doEnte("LEIAUTE", CONS),
  NormasOrcamentarias: doEnte("LEIAUTE", CONS),
  Programas: doEnte("INFERENCIA", CONS),
  Acao: doEnte("INFERENCIA", CONS),
  ReceitaPrevista: doEnte("INFERENCIA", CONS),
  PloaAcao: doEnte("INFERENCIA", CONS),
  PloaPrograma: doEnte("INFERENCIA", CONS),
  PloaReceitaPrevista: doEnte("INFERENCIA", CONS),
  PloaUnidadeOrcamentaria: doEnte("INFERENCIA", CONS),
  PloaDotacao: doEnte("INFERENCIA", UG_NA_LINHA),
  ResponsavelSiafic: doEnte("INFERENCIA", CONS),
  // ── por UG, com o vínculo no modelo ──
  // a conta da transferência (numeroConta, codBanco, numAgencia) é a do CadastroContaBancaria
  TransfRecebida: porUg("LEIAUTE", FILTRA, ["CadastroContaBancaria"]),
  TransfConcedida: porUg("LEIAUTE", FILTRA, ["CadastroContaBancaria"]),
  // o agrupamento da folha leva numEmpenho e numLiquidacao
  RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento: porUg("INFERENCIA", FILTRA, ["Empenhos", "Liquidacao"]),
  ProprietarioFrota: porUg("INFERENCIA", FILTRA),
  LocadorPrestador: porUg("INFERENCIA", FILTRA),
  Veiculos: porUg("INFERENCIA", FILTRA),
  Maquinas: porUg("INFERENCIA", FILTRA),
  SituacaoFrota: porUg("INFERENCIA", FILTRA),
  Abastecimento: porUg("INFERENCIA", FILTRA),
  Farmacia: porUg("LEIAUTE", FILTRA),
  EstoqueFarmacia: porUg("LEIAUTE", FILTRA),
  // ── por UG, pela unidade orçamentária da linha (a cadeia da despesa e dos restos) ──
  UnidadeOrcamentaria: porUg("LEIAUTE", { tipo: "POR_UO_NA_LINHA", campo: "codigo" }),
  Empenhos: porUg("INFERENCIA", UO),
  Estornos: porUg("INFERENCIA", UO),
  Liquidacao: porUg("INFERENCIA", UO, ["Empenhos"]),
  EstornoLiquidacao: porUg("INFERENCIA", UO),
  Pagamentos: porUg("INFERENCIA", UO, ["Liquidacao"]),
  EstornoPagamento: porUg("INFERENCIA", UO),
  Retencao: porUg("INFERENCIA", UO, ["Pagamentos"]),
  EstornoRetencao: porUg("INFERENCIA", UO),
  PagamentosRestos: porUg("INFERENCIA", UO),
  EstornoPagamentoRestos: porUg("INFERENCIA", UO),
  CancelamentoRestos: porUg("INFERENCIA", UO),
  LiquidacaoRestos: porUg("INFERENCIA", UO),
  EstornoLiquidacaoRestos: porUg("INFERENCIA", UO),
  RetencaoRestos: porUg("INFERENCIA", UO),
  EstornoRetencaoRestos: porUg("INFERENCIA", UO),
  RestosInscritos: porUg("INFERENCIA", UO),
  RelacionamentoEmpenhoObra: porUg("INFERENCIA", UO, ["Empenhos"]),
  RelacionamentoEmpenhoLicitacao: porUg("INFERENCIA", UO, ["Empenhos"]),
  RelacionamentoEmpenhoNaturezaContratacao: porUg("INFERENCIA", UO, ["Empenhos"]),
  RelacionamentoLiquidacaoPagamento: porUg("INFERENCIA", UO, ["Liquidacao", "Pagamentos"]),
  // o fornecedor do dia é o credor dos empenhos do dia: vale se o empenho dele ficou no arquivo desta UG
  Fornecedores: porUg("LEIAUTE", { tipo: "DERIVADO", campo: "cpfCnpj", de: "Empenhos", campoDe: "cpfCnpjFornecedor" }),
  // ── por UG, pela conta bancária da linha (titular declarado: conta → entidade → UG) e, sem vínculo, os extras, a
  //    receita (a conta arrecadadora é um parâmetro da remessa) e o ordenador ──
  ReceitaOrcamentaria: porUg("INFERENCIA", SEM),
  ReceitaExtra: porUg("INFERENCIA", SEM),
  DespesaExtra: porUg("INFERENCIA", SEM),
  EstornoReceitaExtra: porUg("INFERENCIA", SEM),
  EstornoDespesaExtra: porUg("INFERENCIA", SEM),
  CadastroContaBancaria: porUg("LEIAUTE", CONTA("numero")),
  RelacionamentoCCorrenteFontePagadora: porUg("LEIAUTE", CONTA("numContaBancaria")),
  SaldoInicial: porUg("INFERENCIA", CONTA("numContaBancaria")),
  SaldoMensal: porUg("INFERENCIA", CONTA("numContaBancaria")),
  ConciliacaoBancaria: porUg("INFERENCIA", CONTA("numContaBancaria")),
  // "as contas devem pertencer à mesma UG" (leiaute): as duas pontas da linha têm de ser da UG pedida.
  MovimentacaoEntreContasBancarias: porUg("LEIAUTE", {
    tipo: "POR_CONTA_NA_LINHA",
    contas: [
      { banco: "codBancoOrigem", agencia: "numAgenciaOrigem", conta: "numeroCtaOrigem" },
      { banco: "codBancoDestino", agencia: "numAgenciaDestino", conta: "numeroCtaDestino" },
    ],
  }),
  Ordenador: porUg("INFERENCIA", SEM),
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
  /** O código da UG pedida. */
  readonly ugPedida: string;
  /** Código da unidade orçamentária → código da UG, pelo vínculo declarado vigente no dia. Sem vínculo: ausente. */
  readonly ugDaUo: ReadonlyMap<string, string>;
  /** Chave da conta (`chaveDaConta`) → código da UG, pelo titular declarado vigente. Sem titular: ausente. */
  readonly ugDaConta: ReadonlyMap<string, string>;
}

/** A chave de uma conta bancária: só dígitos, sem zeros à esquerda — a régua comum da linha e do cadastro. */
export function chaveDaConta(banco: string, agencia: string, conta: string): string {
  const n = (v: string): string => v.replace(/\D/g, "").replace(/^0+/, "");
  return `${n(banco)}|${n(agencia)}|${n(conta)}`;
}

export type RegraDaAbrangencia = "RECORTE_POR_UG_INDISPONIVEL" | "ARQUIVO_SO_DA_PREFEITURA" | "TABELA_SEM_ABRANGENCIA" | "UNIDADE_SEM_UG_DECLARADA" | "CONTA_SEM_TITULAR_DECLARADO";

export type DecisaoDoArquivo =
  | { readonly incluir: true }
  | { readonly incluir: false; readonly regra: RegraDaAbrangencia; readonly detalhe: string };

/**
 * A decisão que não depende do CONTEÚDO: entra (inteiro ou para recortar) ou fica fora, e por quê. O recorte pela
 * linha (`aplicarAbrangencia`) ainda pode recusar um arquivo que aqui "entra" — a unidade da linha sem vínculo.
 */
export function decidirArquivo(tabela: string, ctx: Pick<ContextoDasUgs, "operadas" | "pedidaEhAPrefeitura">): DecisaoDoArquivo {
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
  if (a.recorte.tipo === "SEM_VINCULO") {
    return {
      incluir: false,
      regra: "RECORTE_POR_UG_INDISPONIVEL",
      detalhe: `Há ${String(ctx.operadas)} unidades gestoras escrituradas aqui, e os registros de ${tabela} não dizem a qual delas pertencem. O arquivo sairia com os dados de todas sob o código desta. Fica fora até o vínculo dos registros com a unidade gestora.`,
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

// ═══ O RECORTE PELA LINHA ═══════════════════════════════════════════════════════════════════════════════════════

type Posicao = { readonly ini: number; readonly fim: number };

/** Posição (1-indexada, inclusiva, em caracteres — a régua do `serializarRegistro`) de um campo no leiaute da tabela. */
export function posicaoDoCampo(tabela: string, campo: string): Posicao | null {
  for (const v of Object.values(LEIAUTES) as unknown[]) {
    if (typeof v !== "object" || v === null || !("entidade" in v) || !("campos" in v)) continue;
    const l = v as { readonly entidade: string; readonly campos: readonly { readonly nome: string; readonly posInicial: number; readonly posFinal: number }[] };
    if (l.entidade !== tabela) continue;
    const c = l.campos.find((x) => x.nome === campo);
    return c === undefined ? null : { ini: c.posInicial, fim: c.posFinal };
  }
  return null;
}

const ler = (linha: string, p: Posicao): string => linha.slice(p.ini - 1, p.fim).trim();
const linhasDo = (conteudo: Buffer): string[] => conteudo.toString("utf8").split("\r\n").filter((l) => l.length > 0);
const montar = (linhas: readonly string[]): Buffer => Buffer.from(linhas.map((l) => `${l}\r\n`).join(""), "utf8");

export interface ArquivoDoPacote {
  readonly nome: string;
  readonly conteudo: Buffer;
  readonly registros: number;
}

export interface ForaDoPacote {
  readonly arquivo: string;
  readonly regra: RegraDaAbrangencia;
  readonly detalhe: string;
}

function semUg(tabela: string, codigos: ReadonlySet<string>): ForaDoPacote {
  const lista = [...codigos].sort();
  return {
    arquivo: tabela,
    regra: "UNIDADE_SEM_UG_DECLARADA",
    detalhe: `Há linhas de ${tabela} da${lista.length > 1 ? "s" : ""} unidade${lista.length > 1 ? "s" : ""} orçamentária${lista.length > 1 ? "s" : ""} ${lista.join(", ")}, sem unidade gestora declarada. Sem o vínculo não se sabe de quem é cada linha, e o arquivo fica fora. Declare em Contabilidade › Unidades gestoras.`,
  };
}

/**
 * Aplica a abrangência a um pacote: o que entra (inteiro, ou com as linhas desta UG, ou com o código da UG dona em
 * cada linha) e a recusa nomeada do que fica fora — uma por tabela.
 *
 * ⚠️ ORDEM: primeiro as tabelas que ninguém cita de volta, depois as que citam ou derivam. Um arquivo que cita outro
 * só entra se o citado entrou NESTE pacote — inclusive quando o citado foi recusado pelo conteúdo (unidade sem UG).
 */
export function aplicarAbrangencia<T extends ArquivoDoPacote>(
  arquivos: readonly T[],
  ctx: ContextoDasUgs
): { readonly arquivos: readonly ArquivoDoPacote[]; readonly fora: readonly ForaDoPacote[] } {
  const foraPorTabela = new Map<string, ForaDoPacote>();
  const recortados = new Map<string, ArquivoDoPacote[]>();
  const ordem = [...arquivos].sort((x, y) => peso(tabelaDoArquivo(x.nome)) - peso(tabelaDoArquivo(y.nome)));
  const recusar = (f: ForaDoPacote): void => {
    if (!foraPorTabela.has(f.arquivo)) foraPorTabela.set(f.arquivo, f);
  };

  for (const arq of ordem) {
    const tabela = tabelaDoArquivo(arq.nome);
    if (foraPorTabela.has(tabela)) continue;
    const d = decidirArquivo(tabela, ctx);
    if (!d.incluir) {
      recusar({ arquivo: tabela, regra: d.regra, detalhe: d.detalhe });
      continue;
    }
    const a = ABRANGENCIA_DO_SAGRES[tabela];
    if (a === undefined) continue;
    const citadoFora = (a.citaOs ?? []).map((c) => foraPorTabela.get(c)).find((f) => f !== undefined);
    if (citadoFora !== undefined) {
      recusar({ arquivo: tabela, regra: citadoFora.regra, detalhe: `${tabela} cita registros de ${citadoFora.arquivo}, que fica fora do pacote; entrar sozinho deixaria a referência sem destino.` });
      continue;
    }
    const r = ctx.operadas <= 1 ? { arquivo: arq as ArquivoDoPacote } : recortar(tabela, a.recorte, arq, ctx, recortados);
    if ("fora" in r) {
      recusar(r.fora);
      continue;
    }
    recortados.set(tabela, [...(recortados.get(tabela) ?? []), r.arquivo]);
  }

  const dentro = arquivos.flatMap((arq) => {
    const tabela = tabelaDoArquivo(arq.nome);
    if (foraPorTabela.has(tabela)) return [];
    return (recortados.get(tabela) ?? []).filter((r) => r.nome === arq.nome);
  });
  return { arquivos: dentro, fora: [...foraPorTabela.values()] };
}

/** Quem cita ou deriva vai depois de quem é citado. */
function peso(tabela: string): number {
  const a = ABRANGENCIA_DO_SAGRES[tabela];
  if (a === undefined) return 0;
  return a.recorte.tipo === "DERIVADO" ? 2 : (a.citaOs ?? []).length > 0 ? 1 : 0;
}

function recortar(
  tabela: string,
  recorte: Recorte,
  arq: ArquivoDoPacote,
  ctx: ContextoDasUgs,
  jaRecortados: ReadonlyMap<string, readonly ArquivoDoPacote[]>
): { readonly arquivo: ArquivoDoPacote } | { readonly fora: ForaDoPacote } {
  const comLinhas = (linhas: readonly string[]): { readonly arquivo: ArquivoDoPacote } => ({ arquivo: { nome: arq.nome, conteudo: montar(linhas), registros: linhas.length } });
  const semPosicao = (campo: string): { readonly fora: ForaDoPacote } => ({
    fora: { arquivo: tabela, regra: "RECORTE_POR_UG_INDISPONIVEL", detalhe: `O leiaute de ${tabela} não tem o campo ${campo} para recortar pela linha. Fica fora.` },
  });
  switch (recorte.tipo) {
    case "FILTRA_POR_UG":
    case "CONSOLIDADO":
      return { arquivo: arq };
    case "SEM_VINCULO":
      // `decidirArquivo` já recusou com duas ou mais; aqui só chega com uma.
      return { arquivo: arq };
    case "POR_UO_NA_LINHA": {
      const p = posicaoDoCampo(tabela, recorte.campo);
      if (p === null) return semPosicao(recorte.campo);
      const linhas = linhasDo(arq.conteudo);
      const sem = new Set(linhas.map((l) => ler(l, p)).filter((uo) => !ctx.ugDaUo.has(uo)));
      if (sem.size > 0) return { fora: semUg(tabela, sem) };
      return comLinhas(linhas.filter((l) => ctx.ugDaUo.get(ler(l, p)) === ctx.ugPedida));
    }
    case "POR_CONTA_NA_LINHA": {
      const posicoes = recorte.contas.map((c) => ({ banco: posicaoDoCampo(tabela, c.banco), agencia: posicaoDoCampo(tabela, c.agencia), conta: posicaoDoCampo(tabela, c.conta) }));
      const faltando = posicoes.find((p) => p.banco === null || p.agencia === null || p.conta === null);
      if (faltando !== undefined) return semPosicao(recorte.contas.map((c) => c.conta).join("/"));
      const chaves = (l: string): string[] => posicoes.map((p) => chaveDaConta(ler(l, p.banco as Posicao), ler(l, p.agencia as Posicao), ler(l, p.conta as Posicao)));
      const linhas = linhasDo(arq.conteudo);
      const semTitular = new Set(linhas.flatMap((l) => chaves(l).filter((k) => !ctx.ugDaConta.has(k))));
      if (semTitular.size > 0) {
        return {
          fora: {
            arquivo: tabela,
            regra: "CONTA_SEM_TITULAR_DECLARADO",
            detalhe: `Há linhas de ${tabela} de conta bancária sem titular declarado (${[...semTitular].map((k) => k.split("|").join("/")).sort().join(", ")}). Sem o titular não se sabe de que unidade gestora é a conta, e o arquivo fica fora. Declare o titular em Financeiro › Contas bancárias.`,
          },
        };
      }
      const misturadas = linhas.filter((l) => new Set(chaves(l).map((k) => ctx.ugDaConta.get(k))).size > 1);
      if (misturadas.length > 0) {
        return { fora: { arquivo: tabela, regra: "RECORTE_POR_UG_INDISPONIVEL", detalhe: `${tabela} tem ${String(misturadas.length)} linha(s) entre contas de unidades gestoras diferentes; o leiaute exige contas da mesma unidade. O arquivo fica fora.` } };
      }
      return comLinhas(linhas.filter((l) => ctx.ugDaConta.get(chaves(l)[0] ?? "") === ctx.ugPedida));
    }
    case "CONSOLIDADO_UG_NA_LINHA": {
      const p = posicaoDoCampo(tabela, recorte.campoUo);
      const pUg = posicaoDoCampo(tabela, "codUnidadeGestora");
      if (p === null) return semPosicao(recorte.campoUo);
      if (pUg === null || pUg.fim - pUg.ini + 1 !== 6) return semPosicao("codUnidadeGestora");
      const linhas = linhasDo(arq.conteudo);
      const sem = new Set(linhas.map((l) => ler(l, p)).filter((uo) => !ctx.ugDaUo.has(uo)));
      if (sem.size > 0) return { fora: semUg(tabela, sem) };
      // A linha passa a levar a UG dona da unidade (mesma largura: 6 posições).
      return comLinhas(linhas.map((l) => `${l.slice(0, pUg.ini - 1)}${String(ctx.ugDaUo.get(ler(l, p)))}${l.slice(pUg.fim)}`));
    }
    case "DERIVADO": {
      const p = posicaoDoCampo(tabela, recorte.campo);
      const pDe = posicaoDoCampo(recorte.de, recorte.campoDe);
      if (p === null) return semPosicao(recorte.campo);
      if (pDe === null) return semPosicao(`${recorte.de}.${recorte.campoDe}`);
      const fontes = jaRecortados.get(recorte.de);
      if (fontes === undefined) {
        return { fora: { arquivo: tabela, regra: "RECORTE_POR_UG_INDISPONIVEL", detalhe: `${tabela} depende de ${recorte.de}, que não entrou neste pacote. Fica fora.` } };
      }
      const validos = new Set(fontes.flatMap((f) => linhasDo(f.conteudo).map((l) => ler(l, pDe))));
      return comLinhas(linhasDo(arq.conteudo).filter((l) => validos.has(ler(l, p))));
    }
  }
}
