import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
import {
  parsearNaturezaReceita,
  type OrigemReceita,
} from "../m04-receita/natureza.js";
// Rótulos OFICIAIS dos grupos de natureza da despesa (Portaria Interministerial STN/SOF
// 163/2001) — a mesma fonte única que o Anexo 12 usa. Nada é rebatizado aqui.
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
} from "../../prisma/seed/dados/natureza-componentes.js";

/**
 * DOMAIN da DEMONSTRAÇÃO DOS FLUXOS DE CAIXA (DFC) — MCASP, Parte V. SEM I/O.
 *
 * ═══ O QUE ELA É, E O QUE ELA NÃO É ═══
 * O Balanço Financeiro (Anexo 13) conta o caixa pela ótica ORÇAMENTÁRIA: despesa pela
 * EMPENHADA, compensada pela inscrição de restos a pagar. A DFC conta o MESMO caixa pela
 * ótica do DINHEIRO QUE SAIU: despesa PAGA (a coluna "pagas" do Anexo 12, pelo bruto), restos
 * a pagar PAGOS, receita ARRECADADA e o dinheiro de terceiros (depósitos restituíveis) — e
 * reparte tudo em três atividades: OPERACIONAL, INVESTIMENTO e FINANCIAMENTO.
 *
 * ═══ A AMARRAÇÃO (e a recusa) ═══
 *   geração líquida de caixa = Σ(ingressos − desembolsos) das três atividades
 *   caixa final DERIVADO     = caixa inicial + geração líquida
 * O caixa final derivado é CONFERIDO contra o caixa REAL apurado pelas partidas do razão nas
 * contas de disponibilidade (a mesma função e o mesmo recorte do Anexo 13). Divergiu, a DFC
 * NÃO SAI, e a mensagem nomeia a diferença — mesma doutrina do Balanço Financeiro: fechar por
 * construção não prova nada.
 *
 * ═══ A CLASSIFICAÇÃO VEM DO CÓDIGO DA NATUREZA, E É FECHADA ═══
 * Receita: pela ORIGEM (1º e 2º dígitos), decomposta pelo parser do M04 (`ORIGEM_RECEITA`,
 * Portaria 163/2001 consolidada pela Portaria Conjunta STN/SOF 103/2021). Despesa: pela
 * CATEGORIA ECONÔMICA e pelo GRUPO DE NATUREZA DA DESPESA (`codCategoria` e `codNatureza` da
 * `NaturezaDespesa`). A correspondência origem/grupo → atividade é a do leiaute da DFC no MCASP
 * (Parte V): as tabelas abaixo são EXAUSTIVAS no tipo (um `Record` sobre a união fechada), e o
 * que o critério normativo não decide com segurança fica NÃO CLASSIFICADO.
 *
 * ═══ NÃO CLASSIFICADO = RECUSA NOMEADA (escolha documentada) ═══
 * Entre "recusar nomeando o item" e "mostrar uma linha 'não classificado' que impede o
 * fechamento", a DFC RECUSA. Uma linha "não classificado" que impede o fechamento nunca seria
 * vista (a demonstração não sairia), e uma que NÃO impedisse publicaria uma geração líquida
 * por atividade que ninguém sabe se está certa — o total fecharia com o caixa e cada atividade
 * estaria errada, que é exatamente o erro que o total não acusa. A recusa lista cada item com
 * valor e motivo, para o operador saber o que reclassificar.
 */

export type AtividadeDfc = "OPERACIONAL" | "INVESTIMENTO" | "FINANCIAMENTO";

export const ATIVIDADES_DFC: readonly AtividadeDfc[] = [
  "OPERACIONAL",
  "INVESTIMENTO",
  "FINANCIAMENTO",
];

const TITULO_ATIVIDADE: Record<AtividadeDfc, string> = {
  OPERACIONAL: "FLUXOS DE CAIXA DAS ATIVIDADES OPERACIONAIS",
  INVESTIMENTO: "FLUXOS DE CAIXA DAS ATIVIDADES DE INVESTIMENTO",
  FINANCIAMENTO: "FLUXOS DE CAIXA DAS ATIVIDADES DE FINANCIAMENTO",
};

// ═══════════════════════════════════════════════════════════════════════════
// RECEITA — origem → atividade (MCASP, Parte V, leiaute da DFC)
// ═══════════════════════════════════════════════════════════════════════════

type ClassificacaoReceita =
  | { readonly atividade: AtividadeDfc; readonly rotulo: string }
  | { readonly atividade: null; readonly motivo: string };

/**
 * ⚠️ EXAUSTIVO NO TIPO: uma origem nova no rol do M04 não compila até alguém decidir aqui.
 *
 * - Correntes (origens 1.1 a 1.9): ingressos OPERACIONAIS — receitas derivadas e originárias e
 *   transferências correntes recebidas.
 * - 2.1 Operações de crédito e 2.4 Transferências de capital: FINANCIAMENTO.
 * - 2.2 Alienação de bens e 2.3 Amortização de empréstimos concedidos: INVESTIMENTO.
 * - 2.9 Outras receitas de capital: NÃO CLASSIFICADA. A origem é, por definição, "o que não
 *   coube" nas outras, e o MCASP distribui o conteúdo dela entre investimento e financiamento
 *   (ex.: integralização de capital social é financiamento). O 2º dígito não decide — chutar
 *   uma das duas seria publicar geração líquida por atividade sem base. Mesmo tratamento que o
 *   Anexo 6 do RREO dá a esta origem.
 */
const CLASSIFICACAO_RECEITA: Record<OrigemReceita, ClassificacaoReceita> = {
  IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA: { atividade: "OPERACIONAL", rotulo: "Receita Tributária" },
  CONTRIBUICOES: { atividade: "OPERACIONAL", rotulo: "Receita de Contribuições" },
  RECEITA_PATRIMONIAL: { atividade: "OPERACIONAL", rotulo: "Receita Patrimonial" },
  RECEITA_AGROPECUARIA: { atividade: "OPERACIONAL", rotulo: "Receita Agropecuária" },
  RECEITA_INDUSTRIAL: { atividade: "OPERACIONAL", rotulo: "Receita Industrial" },
  RECEITA_DE_SERVICOS: { atividade: "OPERACIONAL", rotulo: "Receita de Serviços" },
  TRANSFERENCIAS_CORRENTES: { atividade: "OPERACIONAL", rotulo: "Transferências Correntes Recebidas" },
  OUTRAS_RECEITAS_CORRENTES: { atividade: "OPERACIONAL", rotulo: "Outras Receitas Derivadas e Originárias" },
  ALIENACAO_DE_BENS: { atividade: "INVESTIMENTO", rotulo: "Alienação de Bens" },
  AMORTIZACAO_DE_EMPRESTIMOS: {
    atividade: "INVESTIMENTO",
    rotulo: "Amortização de Empréstimos e Financiamentos Concedidos",
  },
  OPERACOES_DE_CREDITO: { atividade: "FINANCIAMENTO", rotulo: "Operações de Crédito" },
  TRANSFERENCIAS_DE_CAPITAL: { atividade: "FINANCIAMENTO", rotulo: "Transferências de Capital Recebidas" },
  OUTRAS_RECEITAS_DE_CAPITAL: {
    atividade: null,
    motivo:
      "a origem \"outras receitas de capital\" reúne ingressos que o manual reparte entre " +
      "investimento e financiamento, e o código da natureza não diz qual é este",
  },
};

/** A ordem das linhas de receita no leiaute: a ordem de declaração da tabela. */
const ORDEM_ORIGENS = Object.keys(CLASSIFICACAO_RECEITA) as OrigemReceita[];

// ═══════════════════════════════════════════════════════════════════════════
// DESPESA — categoria econômica × grupo de natureza → atividade
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chave `${codCategoria}${codNatureza}`. SÓ os seis pares que a Portaria 163 forma: os grupos
 * 1, 2 e 3 são correntes; 4, 5 e 6 são de capital. Um par fora daqui (reserva de contingência
 * executada, grupo de capital em categoria corrente) não é despesa que a DFC saiba ler —
 * fica NÃO CLASSIFICADO, nomeado.
 *
 * - 3.1 Pessoal, 3.2 Juros e encargos da dívida, 3.3 Outras despesas correntes: OPERACIONAL.
 * - 4.4 Investimentos e 4.5 Inversões financeiras: INVESTIMENTO.
 * - 4.6 Amortização da dívida: FINANCIAMENTO.
 *
 * ⚠️ JUROS SÃO OPERACIONAIS: o leiaute da DFC do setor público põe "juros e encargos da dívida"
 * nos desembolsos operacionais; só o PRINCIPAL (grupo 6) é financiamento.
 */
const ATIVIDADE_DA_DESPESA: Readonly<Record<string, AtividadeDfc>> = {
  "31": "OPERACIONAL",
  "32": "OPERACIONAL",
  "33": "OPERACIONAL",
  "44": "INVESTIMENTO",
  "45": "INVESTIMENTO",
  "46": "FINANCIAMENTO",
};

/** A ordem das linhas de despesa: a de declaração dos pares acima (grupos 1 a 6). */
const ORDEM_PARES = Object.keys(ATIVIDADE_DA_DESPESA);

function rotuloDoGrupo(codGrupo: string): string {
  const g = GRUPOS_NATUREZA_DESPESA.find((x) => x.codigo === codGrupo);
  if (g === undefined) {
    // Inalcançável para as chaves da tabela acima — e se um dia ficar alcançável, é aqui que
    // aparece, e não num rótulo inventado.
    throw new Error(`Grupo de natureza da despesa "${codGrupo}" sem rótulo na tabela oficial.`);
  }
  return g.descricao;
}

function rotuloDaCategoria(cod: string): string {
  return CATEGORIAS_ECONOMICAS.find((c) => c.codigo === cod)?.descricao ?? `categoria ${cod}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FATOS — o que a camada de leitura entrega (já somado, já com sinal)
// ═══════════════════════════════════════════════════════════════════════════

export interface FatoReceitaDfc {
  /** Código STN da natureza (8 dígitos), como está no banco. */
  readonly codigoNatureza: string;
  readonly descricao: string;
  /** ARRECADADO − ANULADO na janela. */
  readonly valor: Money;
}

export interface FatoDespesaDfc {
  readonly codCategoria: string;
  readonly codGrupo: string;
  /** PAGO na janela, pelo BRUTO (a retenção entra como depósito recebido). */
  readonly valor: Money;
}

export interface FatosDfc {
  readonly exercicio: number;
  readonly parcial: boolean;
  /** Receita orçamentária arrecadada, por natureza. */
  readonly receitas: readonly FatoReceitaDfc[];
  /** Despesa orçamentária DO EXERCÍCIO paga — a coluna "pagas" do Anexo 12, por ficha. */
  readonly despesasPagas: readonly FatoDespesaDfc[];
  /** Restos a pagar de exercícios anteriores PAGOS na janela, pela natureza do empenho. */
  readonly restosPagos: readonly FatoDespesaDfc[];
  /** M07: INGRESSO − ESTORNO_INGRESSO (retenções, cauções) — o mesmo leitor do Anexo 13. */
  readonly depositosRecebidos: Money;
  /** M07: DISPENDIO − ESTORNO_DISPENDIO (repasses, devoluções) — idem. */
  readonly depositosPagos: Money;
  /** Caixa no encerramento do exercício anterior (zero se não houver). */
  readonly caixaInicial: Money;
  /** O caixa REAL no fim da janela, somado das partidas. A prova dos nove. */
  readonly caixaApurado: Money;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export type NivelLinhaDfc = "ITEM" | "DETALHE";

export interface LinhaDfc {
  readonly rotulo: string;
  /**
   * ITEM entra no total. DETALHE é informativo ("dos quais, restos a pagar") e NÃO soma: o
   * valor dele já está dentro do ITEM imediatamente acima.
   */
  readonly nivel: NivelLinhaDfc;
  readonly valor: Dinheiro;
  /**
   * V33 — a linha que tem documentos atrás dela diz qual composição a abre: `receita:<origem>`
   * (as guias da origem) ou `despesa:<grupo>` (o pago do exercício e os restos a pagar pagos).
   * Ausente nas linhas sem documento próprio (depósitos, transferências, o detalhe dos restos).
   */
  readonly composicao?: string;
}

export interface FluxoDaAtividade {
  readonly atividade: AtividadeDfc;
  readonly titulo: string;
  readonly ingressos: readonly LinhaDfc[];
  readonly desembolsos: readonly LinhaDfc[];
  readonly totalIngressos: Dinheiro;
  readonly totalDesembolsos: Dinheiro;
  /** ingressos − desembolsos. */
  readonly fluxoLiquido: Dinheiro;
}

export interface DemonstracaoFluxosDeCaixa {
  readonly exercicio: number;
  readonly parcial: boolean;
  readonly fluxos: readonly FluxoDaAtividade[];
  /** Σ dos fluxos líquidos das três atividades. */
  readonly geracaoLiquida: Dinheiro;
  readonly caixaInicial: Dinheiro;
  /** caixa inicial + geração líquida — CONFERIDO contra `caixaApuradoPelasPartidas`. */
  readonly caixaFinal: Dinheiro;
  readonly caixaApuradoPelasPartidas: Dinheiro;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS RECUSAS — erros NOMEADOS, para a tela dizer qual das duas
// ═══════════════════════════════════════════════════════════════════════════

export interface ItemNaoClassificado {
  readonly item: string;
  readonly valor: Dinheiro;
  readonly motivo: string;
}

export class DfcItemNaoClassificadoError extends Error {
  readonly itens: readonly ItemNaoClassificado[];
  constructor(exercicio: number, itens: readonly ItemNaoClassificado[]) {
    super(
      `A Demonstração dos Fluxos de Caixa de ${exercicio} não sai: ` +
        `${itens.length === 1 ? "um item" : `${itens.length} itens`} sem atividade ` +
        `(operacional, investimento ou financiamento) definida pelo código da natureza — ` +
        itens.map((i) => `${i.item}, ${i.valor}: ${i.motivo}`).join("; ") +
        `. Publicar a geração líquida por atividade com estes valores escolhidos a esmo daria ` +
        `um total certo com atividades erradas.`
    );
    this.name = "DfcItemNaoClassificadoError";
    this.itens = itens;
  }
}

export class DfcNaoFechaError extends Error {
  readonly diferenca: Dinheiro;
  constructor(mensagem: string, diferenca: Dinheiro) {
    super(mensagem);
    this.name = "DfcNaoFechaError";
    this.diferenca = diferenca;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// O MONTADOR — PURO
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/** Classifica UMA natureza de receita. Código inválido também é "não classificado", nomeado. */
export function classificarReceitaDfc(
  codigoNatureza: string
): { readonly atividade: AtividadeDfc; readonly origem: OrigemReceita; readonly rotulo: string } | { readonly atividade: null; readonly motivo: string } {
  let origem: OrigemReceita;
  try {
    // O parser do M04 é fail-closed na forma, na origem fora do rol e no tipo reservado. Aqui a
    // exceção não derruba sozinha: vira item NÃO CLASSIFICADO com o motivo do parser, e entra
    // na mesma recusa que lista todos os itens de uma vez.
    origem = parsearNaturezaReceita(codigoNatureza).origem;
  } catch (e) {
    return { atividade: null, motivo: e instanceof Error ? e.message : String(e) };
  }
  const c = CLASSIFICACAO_RECEITA[origem];
  if (c.atividade === null) return { atividade: null, motivo: c.motivo };
  return { atividade: c.atividade, origem, rotulo: c.rotulo };
}

/** Classifica UM par categoria × grupo de despesa. */
export function classificarDespesaDfc(
  codCategoria: string,
  codGrupo: string
): { readonly atividade: AtividadeDfc } | { readonly atividade: null; readonly motivo: string } {
  const atividade = ATIVIDADE_DA_DESPESA[`${codCategoria}${codGrupo}`];
  if (atividade === undefined) {
    return {
      atividade: null,
      motivo:
        `a despesa de ${rotuloDaCategoria(codCategoria)} no grupo ${codGrupo} não é par que a ` +
        `classificação oficial forme (correntes: grupos 1 a 3; capital: grupos 4 a 6)`,
    };
  }
  return { atividade };
}

/**
 * Monta a DFC. PURA — a mesma função serve o banco e o teste.
 *
 * FAIL-CLOSED em dois pontos, nesta ordem:
 *  1. todo fato com valor precisa ter atividade — senão `DfcItemNaoClassificadoError`;
 *  2. caixa inicial + geração líquida tem de bater com o caixa das partidas — senão
 *     `DfcNaoFechaError`, com a diferença.
 */
export function montarDfc(f: FatosDfc): DemonstracaoFluxosDeCaixa {
  const naoClassificados: ItemNaoClassificado[] = [];

  // ── RECEITAS: acumula por origem ──────────────────────────────────────
  const receitaPorOrigem = new Map<OrigemReceita, Money>();
  for (const r of f.receitas) {
    if (r.valor.isZero()) continue;
    const c = classificarReceitaDfc(r.codigoNatureza);
    if (c.atividade === null) {
      naoClassificados.push({
        item: `receita ${r.codigoNatureza} (${r.descricao})`,
        valor: serializar(r.valor),
        motivo: c.motivo,
      });
      continue;
    }
    receitaPorOrigem.set(c.origem, soma(receitaPorOrigem.get(c.origem) ?? zero(), r.valor));
  }

  // ── DESPESAS: acumula por grupo, separando o exercício dos restos a pagar ─
  const pagoPorGrupo = new Map<string, Money>();
  const restosPorGrupo = new Map<string, Money>();
  const acumular = (
    fatos: readonly FatoDespesaDfc[],
    destino: Map<string, Money>,
    origem: string
  ): void => {
    for (const d of fatos) {
      if (d.valor.isZero()) continue;
      const c = classificarDespesaDfc(d.codCategoria, d.codGrupo);
      if (c.atividade === null) {
        naoClassificados.push({
          item: `${origem} de natureza ${d.codCategoria}.${d.codGrupo}`,
          valor: serializar(d.valor),
          motivo: c.motivo,
        });
        continue;
      }
      destino.set(d.codGrupo, soma(destino.get(d.codGrupo) ?? zero(), d.valor));
    }
  };
  acumular(f.despesasPagas, pagoPorGrupo, "despesa paga");
  acumular(f.restosPagos, restosPorGrupo, "restos a pagar pagos");

  if (naoClassificados.length > 0) {
    throw new DfcItemNaoClassificadoError(f.exercicio, naoClassificados);
  }

  // ── AS TRÊS ATIVIDADES ─────────────────────────────────────────────────
  const fluxos: FluxoDaAtividade[] = [];
  let geracao = zero();

  for (const atividade of ATIVIDADES_DFC) {
    const ingressos: { rotulo: string; nivel: NivelLinhaDfc; valor: Money; composicao?: string }[] = [];
    const desembolsos: { rotulo: string; nivel: NivelLinhaDfc; valor: Money; composicao?: string }[] = [];

    // Receita: TODAS as linhas da atividade, na ordem do leiaute — zeradas, não omitidas.
    for (const origem of ORDEM_ORIGENS) {
      const c = CLASSIFICACAO_RECEITA[origem];
      if (c.atividade !== atividade) continue;
      ingressos.push({ rotulo: c.rotulo, nivel: "ITEM", valor: receitaPorOrigem.get(origem) ?? zero(), composicao: `receita:${origem}` });
    }

    // Despesa: uma linha por grupo da atividade (exercício + restos a pagar pagos), e o
    // detalhe dos restos logo abaixo quando houver.
    for (const par of ORDEM_PARES) {
      if (ATIVIDADE_DA_DESPESA[par] !== atividade) continue;
      const grupo = par.charAt(1);
      const doExercicio = pagoPorGrupo.get(grupo) ?? zero();
      const deRestos = restosPorGrupo.get(grupo) ?? zero();
      desembolsos.push({ rotulo: rotuloDoGrupo(grupo), nivel: "ITEM", valor: soma(doExercicio, deRestos), composicao: `despesa:${grupo}` });
      if (!deRestos.isZero()) {
        desembolsos.push({
          rotulo: "dos quais, restos a pagar de exercícios anteriores",
          nivel: "DETALHE",
          valor: deRestos,
        });
      }
    }

    if (atividade === "OPERACIONAL") {
      // O dinheiro de terceiros (retenções, cauções) — "outros ingressos/desembolsos
      // operacionais" no leiaute. O mesmo leitor e os mesmos sinais do Anexo 13.
      ingressos.push({ rotulo: "Depósitos Restituíveis e Valores Vinculados", nivel: "ITEM", valor: f.depositosRecebidos });
      desembolsos.push({ rotulo: "Depósitos Restituíveis e Valores Vinculados", nivel: "ITEM", valor: f.depositosPagos });
      // Linhas do leiaute, hoje SEMPRE zero — mesma razão do Anexo 13: o modelo não tem
      // transferência financeira entre órgãos/entidades do mesmo ente. Zeradas, não omitidas.
      ingressos.push({ rotulo: "Transferências Financeiras Recebidas", nivel: "ITEM", valor: zero() });
      desembolsos.push({ rotulo: "Transferências Financeiras Concedidas", nivel: "ITEM", valor: zero() });
    }

    const totalDe = (linhas: readonly { nivel: NivelLinhaDfc; valor: Money }[]): Money =>
      linhas.filter((l) => l.nivel === "ITEM").reduce((acc, l) => soma(acc, l.valor), zero());
    const totalIngressos = totalDe(ingressos);
    const totalDesembolsos = totalDe(desembolsos);
    const liquido = sub(totalIngressos, totalDesembolsos);
    geracao = soma(geracao, liquido);

    const serial = (l: { rotulo: string; nivel: NivelLinhaDfc; valor: Money; composicao?: string }): LinhaDfc => ({
      rotulo: l.rotulo,
      nivel: l.nivel,
      valor: serializar(l.valor),
      ...(l.composicao === undefined ? {} : { composicao: l.composicao }),
    });
    fluxos.push({
      atividade,
      titulo: TITULO_ATIVIDADE[atividade],
      ingressos: ingressos.map(serial),
      desembolsos: desembolsos.map(serial),
      totalIngressos: serializar(totalIngressos),
      totalDesembolsos: serializar(totalDesembolsos),
      fluxoLiquido: serializar(liquido),
    });
  }

  const caixaFinal = soma(f.caixaInicial, geracao);

  // ═══ A CONFERÊNCIA QUE DÁ SENTIDO AO RESTO ═══
  // O caixa final é DERIVADO. A prova é bater com o caixa REAL do razão. Divergiu: ou falta um
  // fluxo aqui, ou há lançamento em conta de caixa que nenhum fato explica. A DFC NÃO SAI.
  if (!caixaFinal.equals(f.caixaApurado)) {
    const diferenca = serializar(sub(caixaFinal, f.caixaApurado));
    throw new DfcNaoFechaError(
      `A Demonstração dos Fluxos de Caixa de ${f.exercicio} não fecha contra o caixa: o caixa ` +
        `final derivado é ${serializar(caixaFinal)} (caixa inicial ${serializar(f.caixaInicial)} + ` +
        `geração líquida ${serializar(geracao)}), mas o caixa apurado pelas partidas das contas ` +
        `de disponibilidade é ${serializar(f.caixaApurado)} — diferença de ${diferenca}. Ou falta ` +
        `um fluxo na demonstração, ou há lançamento em conta de caixa que nenhum fato explica. ` +
        `A demonstração não sai enquanto os dois não baterem.`,
      diferenca
    );
  }

  return {
    exercicio: f.exercicio,
    parcial: f.parcial,
    fluxos,
    geracaoLiquida: serializar(geracao),
    caixaInicial: serializar(f.caixaInicial),
    caixaFinal: serializar(caixaFinal),
    caixaApuradoPelasPartidas: serializar(f.caixaApurado),
  };
}
