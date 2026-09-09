import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
} from "../../packages/ledger/index.js";
// Os GRUPOS oficiais (Portaria STN/SOF 163/2001) já vivem no repo — fonte única.
import { GRUPOS_NATUREZA_DESPESA } from "../../prisma/seed/dados/natureza-componentes.js";

/**
 * DOMAIN do M10 — SEM I/O.
 *
 * ═══ O VALOR DE UM BEM É UMA FUNÇÃO, NÃO UMA COLUNA ═══
 * `BemPatrimonial` não tem `valorAtual`, e `ClasseDeBens` não tem `saldo`. O
 * valor contábil é `Σ(valor × sinal do tipo)` sobre os movimentos append-only.
 * Uma coluna precisaria de UPDATE a cada depreciação — e derraparia no primeiro
 * estorno, exatamente como o `status` que o M05 se recusou a ter.
 */

export type TipoMovimentoPatrimonial =
  // ── aumentam (+1) ──
  | "AQUISICAO"
  | "AVALIACAO_INICIAL"
  | "CUSTO_SUBSEQUENTE"
  | "DOACAO_RECEBIDA"
  | "REAVALIACAO_AUMENTO"
  // ── reduzem (−1) ──
  | "DEPRECIACAO"
  | "AMORTIZACAO"
  | "EXAUSTAO"
  | "IMPAIRMENT"
  | "REAVALIACAO_REDUCAO"
  | "DOACAO_REALIZADA"
  | "BAIXA_ALIENACAO"
  // ── retificadora que AUMENTA o contábil (+1) ──
  | "BAIXA_DE_ATUALIZACAO_ACUMULADA"
  // ── estornos: sinal OPOSTO ao do movimento que desfazem ──
  | "ESTORNO_AQUISICAO"
  | "ESTORNO_AVALIACAO_INICIAL"
  | "ESTORNO_CUSTO_SUBSEQUENTE"
  | "ESTORNO_DOACAO_RECEBIDA"
  | "ESTORNO_REAVALIACAO_AUMENTO"
  | "ESTORNO_DEPRECIACAO"
  | "ESTORNO_AMORTIZACAO"
  | "ESTORNO_EXAUSTAO"
  | "ESTORNO_IMPAIRMENT"
  | "ESTORNO_REAVALIACAO_REDUCAO"
  | "ESTORNO_DOACAO_REALIZADA"
  | "ESTORNO_BAIXA_ALIENACAO"
  | "ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA";

/** As chaves de roteiro do RESULTADO da alienação — NÃO são movimento (TR 4.65). */
export type ChaveResultadoAlienacao = "GANHO_ALIENACAO" | "PERDA_ALIENACAO";

/**
 * ⚠️ A FONTE ÚNICA DO SINAL. Toda soma de movimentos patrimoniais DEVE passar
 * por aqui — nenhum `SUM(valor)` cru, em lugar nenhum.
 *
 * O `valor` do movimento é SEMPRE positivo: quem dá o sinal é o TIPO. Assim não
 * existe movimento com valor negativo escondendo uma baixa.
 *
 * ESTA É A LIÇÃO DO M08. Lá os estornos chegaram depois, e dois `SUM` brutos
 * escaparam: o estorno passou a REDUZIR o saldo em vez de devolvê-lo (345af7d),
 * e o mesmo erro se repetiu no outro tipo (4768cff). Aqui os 22 tipos existem
 * desde o dia 1, e o `Record` exaustivo faz o TypeScript apontar quem esquecer de
 * tratar um tipo novo.
 */
export const SINAL_MOVIMENTO_PATRIMONIAL: Record<
  TipoMovimentoPatrimonial,
  1 | -1
> = {
  AQUISICAO: 1,
  AVALIACAO_INICIAL: 1,
  CUSTO_SUBSEQUENTE: 1,
  DOACAO_RECEBIDA: 1,
  REAVALIACAO_AUMENTO: 1,

  DEPRECIACAO: -1,
  AMORTIZACAO: -1,
  EXAUSTAO: -1,
  IMPAIRMENT: -1,
  REAVALIACAO_REDUCAO: -1,
  DOACAO_REALIZADA: -1,
  BAIXA_ALIENACAO: -1,

  /**
   * ⚠️ +1, e é contraintuitivo: ela BAIXA a depreciação acumulada.
   * A acumulada entra NEGATIVA no valor contábil; retirar um número negativo
   * AUMENTA o contábil. É o par da BAIXA_ALIENACAO: o bem sai do ativo pelo BRUTO
   * (−) e leva junto a depreciação dele (+). O líquido baixado é a diferença.
   */
  BAIXA_DE_ATUALIZACAO_ACUMULADA: 1,

  // Cada estorno tem o sinal OPOSTO ao do movimento que desfaz.
  ESTORNO_AQUISICAO: -1,
  ESTORNO_AVALIACAO_INICIAL: -1,
  ESTORNO_CUSTO_SUBSEQUENTE: -1,
  ESTORNO_DOACAO_RECEBIDA: -1,
  ESTORNO_REAVALIACAO_AUMENTO: -1,

  ESTORNO_DEPRECIACAO: 1,
  ESTORNO_AMORTIZACAO: 1,
  ESTORNO_EXAUSTAO: 1,
  ESTORNO_IMPAIRMENT: 1,
  ESTORNO_REAVALIACAO_REDUCAO: 1,
  ESTORNO_DOACAO_REALIZADA: 1,
  ESTORNO_BAIXA_ALIENACAO: 1,
  ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA: -1,
};

/** Os tipos que NÃO são estorno (os únicos que precisam de roteiro contábil). */
export const TIPOS_BASE: readonly TipoMovimentoPatrimonial[] = (
  Object.keys(SINAL_MOVIMENTO_PATRIMONIAL) as TipoMovimentoPatrimonial[]
).filter((t) => !t.startsWith("ESTORNO_"));

/** O tipo do estorno de cada movimento. Um estorno não se estorna. */
export function tipoDoEstorno(
  tipo: TipoMovimentoPatrimonial
): TipoMovimentoPatrimonial {
  if (tipo.startsWith("ESTORNO_")) {
    throw new Error(
      `Movimento do tipo ${tipo} JÁ É um estorno — um estorno não se estorna.`
    );
  }
  return `ESTORNO_${tipo}` as TipoMovimentoPatrimonial;
}

export interface MovimentoPatrimonial {
  readonly tipo: TipoMovimentoPatrimonial;
  readonly valor: Money;
}

/**
 * O VALOR CONTÁBIL — a única aritmética do módulo. PURA.
 *
 * Serve para a classe (TR 5.15) e para o bem (TR 3.1): o que muda é o conjunto de
 * movimentos que se passa, nunca a conta.
 */
export function valorContabil(
  movimentos: readonly MovimentoPatrimonial[]
): Money {
  return movimentos.reduce(
    (acc, m) =>
      SINAL_MOVIMENTO_PATRIMONIAL[m.tipo] === 1
        ? toMoney(acc.plus(m.valor))
        : toMoney(acc.minus(m.valor)),
    toMoney("0.00")
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ATUALIZAÇÃO POR COMPETÊNCIA (bloco 2) — depreciação, amortização, exaustão
// ═══════════════════════════════════════════════════════════════════════════

export type MetodoAtualizacao = "DEPRECIACAO" | "AMORTIZACAO" | "EXAUSTAO";

/** O tipo de movimento que cada método gera. O método vem do PARÂMETRO da classe. */
export const TIPO_DO_METODO: Record<
  MetodoAtualizacao,
  TipoMovimentoPatrimonial
> = {
  DEPRECIACAO: "DEPRECIACAO",
  AMORTIZACAO: "AMORTIZACAO",
  EXAUSTAO: "EXAUSTAO",
};

/** O tipo-base de um movimento (o estorno "pertence" ao tipo que desfaz). */
export function tipoBase(
  tipo: TipoMovimentoPatrimonial
): TipoMovimentoPatrimonial {
  return tipo.startsWith("ESTORNO_")
    ? (tipo.slice("ESTORNO_".length) as TipoMovimentoPatrimonial)
    : tipo;
}

/**
 * ⚠️ QUAIS TIPOS SÃO "ATUALIZAÇÃO ACUMULADA" — o Record é EXAUSTIVO de propósito.
 *
 * A depreciação/amortização/exaustão (e os estornos delas) são a RETIFICADORA do
 * ativo: elas não mudam o valor BRUTO, apenas o acumulado que o reduz. Todo o
 * resto — aquisição, doação, custo subsequente, reavaliação (nos DOIS sentidos),
 * impairment, baixa — MEXE NO BRUTO.
 *
 * Sendo um `Record<Tipo, boolean>`, um valor novo no enum NÃO COMPILA até alguém
 * decidir de que lado ele fica. É essa decisão que o tsc força — e é ela que
 * evita o bug que este commit corrige.
 */
export const EH_ATUALIZACAO_ACUMULADA: Record<TipoMovimentoPatrimonial, boolean> = {
  // ── a retificadora (NÃO entra no valor bruto) ──
  DEPRECIACAO: true,
  AMORTIZACAO: true,
  EXAUSTAO: true,
  ESTORNO_DEPRECIACAO: true,
  ESTORNO_AMORTIZACAO: true,
  ESTORNO_EXAUSTAO: true,
  /**
   * TRUE — ela mexe na ACUMULADA, não no bruto. Se entrasse no bruto, o bem
   * alienado sairia do ativo pelo LÍQUIDO (bruto − acumulada), e a base
   * depreciável das parcelas seguintes ficaria MAIOR do que o ativo que sobrou.
   */
  BAIXA_DE_ATUALIZACAO_ACUMULADA: true,
  ESTORNO_BAIXA_DE_ATUALIZACAO_ACUMULADA: true,

  // ── tudo o mais MEXE NO BRUTO ──
  AQUISICAO: false,
  AVALIACAO_INICIAL: false,
  CUSTO_SUBSEQUENTE: false,
  DOACAO_RECEBIDA: false,
  REAVALIACAO_AUMENTO: false,
  IMPAIRMENT: false,
  REAVALIACAO_REDUCAO: false,
  DOACAO_REALIZADA: false,
  BAIXA_ALIENACAO: false,
  ESTORNO_AQUISICAO: false,
  ESTORNO_AVALIACAO_INICIAL: false,
  ESTORNO_CUSTO_SUBSEQUENTE: false,
  ESTORNO_DOACAO_RECEBIDA: false,
  ESTORNO_REAVALIACAO_AUMENTO: false,
  ESTORNO_IMPAIRMENT: false,
  ESTORNO_REAVALIACAO_REDUCAO: false,
  ESTORNO_DOACAO_REALIZADA: false,
  ESTORNO_BAIXA_ALIENACAO: false,
};

export const TIPOS_DE_ATUALIZACAO_ACUMULADA: readonly TipoMovimentoPatrimonial[] =
  (Object.keys(EH_ATUALIZACAO_ACUMULADA) as TipoMovimentoPatrimonial[]).filter(
    (t) => EH_ATUALIZACAO_ACUMULADA[t]
  );

/**
 * O VALOR BRUTO CONTÁBIL da classe — a BASE da depreciação (NBC TSP 07).
 *
 * ═══ POR QUE NÃO É "A SOMA DAS ENTRADAS" (o bug que isto corrige) ═══
 * A base era Σ das entradas (+1). Isso deixava a REAVALIAÇÃO PARA CIMA aumentar a
 * base, mas a reavaliação PARA BAIXO, o impairment e as BAIXAS não a reduziam: uma
 * classe que perdeu metade dos bens continuava depreciando sobre o valor de antes,
 * e a parcela ficaria maior do que o ativo inteiro. Assimétrico e errado.
 *
 * A NBC TSP 07 é clara: reavaliado o ativo, a depreciação passa a incidir sobre o
 * NOVO valor — nos dois sentidos. E o que foi baixado simplesmente não existe mais
 * para depreciar.
 *
 * ═══ POR QUE TAMBÉM NÃO É O `valorContabil` ═══
 * O valor contábil já vem LÍQUIDO da depreciação acumulada. Depreciar sobre ele
 * seria método exponencial: a parcela encolheria todo mês e a vida útil nunca
 * terminaria. O método é LINEAR — parcela constante sobre o BRUTO.
 *
 *   valorContábil = valorBruto − atualização acumulada
 *
 * Lê o MESMO Record de sinal: os estornos descontam sozinhos.
 */
export function valorBruto(
  movimentos: readonly MovimentoPatrimonial[]
): Money {
  return valorContabil(
    movimentos.filter((m) => !EH_ATUALIZACAO_ACUMULADA[m.tipo])
  );
}

/**
 * A ATUALIZAÇÃO ACUMULADA (depreciação/amortização/exaustão acumulada), como
 * número POSITIVO — é assim que ela aparece no balanço, como conta retificadora.
 *
 * O efeito dela no valor contábil é NEGATIVO; o "acumulado" é o OPOSTO desse
 * efeito. O sinal sai do Record, não de uma conta escrita à mão.
 *
 *   valorContábil = valorBruto − atualizaçãoAcumulada
 *
 * A identidade é EXATA por construção: `valorContabil` soma TODOS os tipos, e os
 * dois filtros (`EH_ATUALIZACAO_ACUMULADA` e o seu complemento) particionam o
 * conjunto. Se alguém reescrever um dos dois com uma lista à mão, a amarração do
 * relatório pega.
 */
export function atualizacaoAcumulada(
  movimentos: readonly MovimentoPatrimonial[]
): Money {
  const retificadoras = movimentos.filter(
    (m) => EH_ATUALIZACAO_ACUMULADA[m.tipo]
  );
  return toMoney(valorContabil(retificadoras).negated());
}

/**
 * O RESULTADO DA ALIENAÇÃO (TR 4.65). PURO.
 *
 *   valorLíquidoContábil = brutoBaixado − acumuladaBaixada
 *   ganhoPerda           = valorVenda − valorLíquidoContábil
 *
 * Positivo = GANHO (vendeu por mais do que valia nos livros).
 * Negativo = PERDA. Zero = sem lançamento de resultado.
 */
export interface ResultadoDaAlienacao {
  readonly valorLiquidoContabil: Money;
  readonly ganhoPerda: Money;
  readonly chave: ChaveResultadoAlienacao | null;
  /** O valor a lançar (sempre positivo). Zero quando não há resultado. */
  readonly valorDoResultado: Money;
}

export function calcularResultadoDaAlienacao(
  brutoBaixado: Money,
  acumuladaBaixada: Money,
  valorVenda: Money
): ResultadoDaAlienacao {
  const valorLiquidoContabil = toMoney(brutoBaixado.minus(acumuladaBaixada));
  const ganhoPerda = toMoney(valorVenda.minus(valorLiquidoContabil));

  if (ganhoPerda.isZero()) {
    return {
      valorLiquidoContabil,
      ganhoPerda,
      chave: null,
      valorDoResultado: toMoney("0.00"),
    };
  }
  return {
    valorLiquidoContabil,
    ganhoPerda,
    chave: ganhoPerda.greaterThan(0) ? "GANHO_ALIENACAO" : "PERDA_ALIENACAO",
    valorDoResultado: toMoney(ganhoPerda.abs()),
  };
}

/**
 * O quanto o método JÁ FOI APLICADO numa competência (líquido dos estornos).
 *
 * ⚠️ SINAL: os três métodos REDUZEM (−1 no Record), então o efeito deles no valor
 * contábil é NEGATIVO. O "aplicado" é o OPOSTO desse efeito — e sai do Record, não
 * de um sinal escrito à mão aqui.
 *
 * É este número que serve de guard de idempotência: > 0 significa que a
 * competência já foi rodada e não foi desfeita.
 */
export function aplicadoNaCompetencia(
  movimentos: readonly MovimentoPatrimonial[],
  metodo: MetodoAtualizacao
): Money {
  const tipo = TIPO_DO_METODO[metodo];
  // Fail-closed: se um dia um método passar a somar, esta conta inverte de sinal
  // em silêncio. Melhor estourar aqui.
  if (SINAL_MOVIMENTO_PATRIMONIAL[tipo] !== -1) {
    throw new Error(
      `O método ${metodo} gera o tipo ${tipo}, cujo sinal no Record é ` +
        `${SINAL_MOVIMENTO_PATRIMONIAL[tipo]} — esperava −1 (os três métodos ` +
        `REDUZEM o valor). Corrija o Record antes de usar este método.`
    );
  }
  const doMetodo = movimentos.filter((m) => tipoBase(m.tipo) === tipo);
  // efeito no valor contábil é negativo; o APLICADO é o oposto dele.
  return toMoney(valorContabil(doMetodo).negated());
}

export interface ParametrosDaClasse {
  readonly vidaUtilMeses: number;
  /** Fração (0 ≤ p < 1). Decimal(9,6) — nunca float. */
  readonly percentualResidual: Money;
}

export interface CalculoDaParcela {
  readonly base: Money;
  readonly valorResidual: Money;
  readonly parcelaCheia: Money;
  /** valorContábil − residual. Quanto AINDA cabe atualizar. */
  readonly teto: Money;
  /** min(parcelaCheia, teto) — a última parcela ajusta o resto. */
  readonly valorDaParcela: Money;
}

/**
 * A ARITMÉTICA DA PARCELA. PURA, e conferida no teste contra literal feito à mão.
 *
 *   residual = base × percentualResidual
 *   parcela  = (base − residual) / vidaUtilMeses
 *   teto     = valorContábil − residual
 *   valor    = min(parcela, teto)
 *
 * O `teto` é o que faz a atualização PARAR NO RESIDUAL: a última parcela nunca o
 * atravessa, e o que sobra de arredondamento entra nela. Sem ele, 3 parcelas de
 * 333,33 sobre 1.000 deixariam 0,01 depreciando para sempre.
 */
export function calcularParcela(
  base: Money,
  valorContabilAtual: Money,
  p: ParametrosDaClasse
): CalculoDaParcela {
  if (!Number.isInteger(p.vidaUtilMeses) || p.vidaUtilMeses <= 0) {
    throw new Error(
      `Vida útil inválida: ${p.vidaUtilMeses} meses. Tem de ser inteiro > 0.`
    );
  }
  if (p.percentualResidual.lessThan(0) || p.percentualResidual.greaterThanOrEqualTo(1)) {
    throw new Error(
      `Percentual residual inválido: ${p.percentualResidual.toString()}. ` +
        `Tem de estar em [0, 1) — um residual de 100% significaria que o bem ` +
        `nunca se deprecia.`
    );
  }

  const valorResidual = toMoney(base.times(p.percentualResidual));
  const parcelaCheia = toMoney(
    base.minus(valorResidual).dividedBy(p.vidaUtilMeses)
  );
  const teto = toMoney(valorContabilAtual.minus(valorResidual));
  const valorDaParcela = parcelaCheia.lessThan(teto) ? parcelaCheia : teto;

  return { base, valorResidual, parcelaCheia, teto, valorDaParcela };
}

/** 'YYYY-MM' -> o primeiro instante do mês (UTC). Fail-closed no formato. */
export function competenciaParaData(competencia: string): Date {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competencia);
  if (m === null) {
    throw new Error(
      `Competência inválida: "${competencia}". Use o formato YYYY-MM (ex.: 2026-03).`
    );
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// ═══════════════════════════════════════════════════════════════════════════
// DESPESA DE CAPITAL — a aquisição só nasce de capital
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Os GRUPOS de natureza da despesa que compram BEM (2º dígito da natureza):
 *   4 = Investimentos · 5 = Inversões Financeiras
 *
 * O grupo 6 (Amortização da Dívida) também é despesa de CAPITAL, e é justamente
 * por isso que a checagem NÃO pode ser "categoria == 4": pagar principal de dívida
 * é capital e não traz bem nenhum. O rol vem dos componentes oficiais que o repo
 * já tem (Portaria 163/2001) — nada de literal solto.
 */
export const GRUPOS_DE_CAPITAL: readonly string[] = ["4", "5"];

export function ehGrupoDeCapital(codNatureza: string): boolean {
  return GRUPOS_DE_CAPITAL.includes(codNatureza);
}

export function descricaoDoGrupo(codNatureza: string): string {
  return (
    GRUPOS_NATUREZA_DESPESA.find((g) => g.codigo === codNatureza)?.descricao ??
    `grupo ${codNatureza}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTEIRO CONTÁBIL — por PARÂMETRO (tabela), nunca literal no código
// ═══════════════════════════════════════════════════════════════════════════

export interface RoteiroDoTipo {
  readonly contaDebito: string;
  readonly contaCredito: string;
}

/**
 * Compõe as partidas do movimento e submete ao motor puro do M01 (ΣD == ΣC).
 *
 * TODO movimento patrimonial é PATRIMONIAL puro (TR 5.84): ele não executa
 * orçamento — a execução foi o empenho/liquidação do M05. Uma perna orçamentária
 * aqui contaria a mesma despesa duas vezes.
 */
export function comporPartidas(
  valor: Money,
  roteiro: RoteiroDoTipo
): readonly Partida[] {
  return validarLancamento([
    {
      conta: roteiro.contaDebito,
      tipo: "DEBITO",
      subsistema: "PATRIMONIAL",
      valor,
    },
    {
      conta: roteiro.contaCredito,
      tipo: "CREDITO",
      subsistema: "PATRIMONIAL",
      valor,
    },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Entrada
// ═══════════════════════════════════════════════════════════════════════════

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor do movimento patrimonial deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zAdquirirBemInput = z.object({
  classeDeBensId: z.string().min(1),
  liquidacaoId: z.string().min(1),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type AdquirirBemInput = z.input<typeof zAdquirirBemInput>;

export const zEntradaAvulsaInput = z.object({
  tipo: z.enum(["AVALIACAO_INICIAL", "DOACAO_RECEBIDA"]),
  classeDeBensId: z.string().min(1),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EntradaAvulsaInput = z.input<typeof zEntradaAvulsaInput>;

export const zBaixarBemInput = z.object({
  tipo: z.enum(["BAIXA_ALIENACAO", "DOACAO_REALIZADA"]),
  classeDeBensId: z.string().min(1),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type BaixarBemInput = z.input<typeof zBaixarBemInput>;

export const zAtualizarCompetenciaInput = z.object({
  classeDeBensId: z.string().min(1),
  /** 'YYYY-MM'. */
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM."),
  criadoPor: z.string().min(1),
});
export type AtualizarCompetenciaInput = z.input<typeof zAtualizarCompetenciaInput>;

export const zCustoSubsequenteInput = z.object({
  classeDeBensId: z.string().min(1),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type CustoSubsequenteInput = z.input<typeof zCustoSubsequenteInput>;

export const zReavaliacaoInput = z.object({
  classeDeBensId: z.string().min(1),
  sentido: z.enum(["AUMENTO", "REDUCAO"]),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type ReavaliacaoInput = z.input<typeof zReavaliacaoInput>;

export const zImpairmentInput = z.object({
  classeDeBensId: z.string().min(1),
  valor: zValorPositivo,
  bemId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type ImpairmentInput = z.input<typeof zImpairmentInput>;

export const zAlienarBemInput = z.object({
  classeDeBensId: z.string().min(1),
  bemId: z.string().min(1).optional(),
  /** O valor BRUTO do bem que sai do ativo. */
  valorBrutoBaixado: zValorPositivo,
  /** A depreciação acumulada DELE. Pode ser zero (bem novo). */
  acumuladaBaixada: zMoney.refine((v) => v.greaterThanOrEqualTo(0), {
    message: "A acumulada baixada não pode ser negativa",
  }),
  /** Quanto o comprador pagou. Zero = doação disfarçada; use DOACAO_REALIZADA. */
  valorVenda: zValorPositivo,
  /** TR 4.65 — a receita da alienação (M04), quando já arrecadada. */
  receitaArrecadadaId: z.string().min(1).optional(),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AlienarBemInput = z.input<typeof zAlienarBemInput>;

export const zEstornarMovimentoPatrimonialInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoPatrimonialInput = z.input<
  typeof zEstornarMovimentoPatrimonialInput
>;
