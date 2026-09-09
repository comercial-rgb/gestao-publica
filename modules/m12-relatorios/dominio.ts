import {
  serializar,
  toMoney,
  type Dinheiro,
  type Money,
} from "../../packages/contracts/index.js";
// Rótulos OFICIAIS (Portaria Interministerial STN/SOF 163/2001) — já existem no
// repo como fonte única. Nada é rebatizado aqui.
import {
  CATEGORIAS_ECONOMICAS,
  GRUPOS_NATUREZA_DESPESA,
} from "../../prisma/seed/dados/natureza-componentes.js";

/**
 * DOMAIN do M12 — SEM I/O. Monta o Balanço Orçamentário (Anexo 12 da Lei
 * 4.320/64) a partir de FATOS já agregados.
 *
 * ═══ A REGRA DO EIXO ═══
 * Este é o documento que vai para o TCE. Todo número entra aqui vindo de SUM
 * sobre os movimentos append-only — NENHUMA coluna cache (`saldoAutorizado`,
 * `saldoDisponivel`…) é lida em lugar nenhum do M12. Cache num relatório oficial
 * viraria verdade, invertendo o invariante do projeto (a coluna é derivada dos
 * movimentos, não o contrário).
 *
 * ═══ DINHEIRO ═══
 * Trafega como `Money` (decimal.js) e SERIALIZA como string `"1234.56"`. Nunca
 * `number` — float no relatório oficial é o mesmo pecado do float no banco.
 *
 * ═══ O LAYOUT NÃO SE INVENTA ═══
 * As linhas, as notas (I…XV) e as fórmulas vêm do esqueleto oficial. O que o
 * layout não especificou está marcado como PENDÊNCIA no MODULO.md — não foi
 * preenchido de memória.
 */

/**
 * Decimal serializado. SEMPRE com 2 casas.
 *
 * A definição mora em `packages/contracts` — é contrato do PROJETO, não do M12: o
 * M09 (conciliação bancária) serializa pela mesma função. Reexportado aqui para
 * não quebrar quem já importa do M12.
 */
export type { Dinheiro };
export { serializar };

export const ZERO: Dinheiro = "0.00";

// ═══════════════════════════════════════════════════════════════════════════
// SINAIS — a verdade é o SUM, e o SUM precisa do sinal certo.
// (A lição do M07/M08: `Record` exaustivo, TypeScript aponta quem esquecer.)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O SINAL DA PREVISÃO MUDOU DE CASA — foi para o M02, dono da `ReceitaPrevista`.
 *
 * Mesmo caminho do `SINAL_RECEITA_REALIZADA` e do `CATEGORIAS_RECEITA` (que foram
 * para o M04): o M03 precisa do previsto por fonte para amarrar o EXCESSO DE
 * ARRECADAÇÃO (TR 4.37), e deixar a tabela aqui obrigaria o módulo de créditos a
 * importar os RELATÓRIOS. Uma tabela só; o que mudou foi o endereço.
 */
export { SINAL_PREVISAO } from "../m02-planejamento/dominio.js";
export type { TipoReceitaPrevista } from "../m02-planejamento/dominio.js";
import { SINAL_PREVISAO } from "../m02-planejamento/dominio.js";
import type { TipoReceitaPrevista } from "../m02-planejamento/dominio.js";

/**
 * ⚠️ O SINAL DA RECEITA REALIZADA MUDOU DE CASA — E VOLTOU PARA O DONO DO FATO.
 *
 * Ele nasceu aqui (Anexo 12), mas o fato é do M04: quem sabe o que uma ANULACAO
 * faz com o total é quem a emite. Enquanto morava no M12, qualquer total de
 * receita fora do M12 teria de importar o M12 — e o superávit por fonte (bloco 4)
 * fecharia um CICLO (m04 → m12 → m04). A tabela é UMA só; o que mudou foi o
 * endereço. O M12 segue reexportando, e nenhum chamador precisou mudar.
 */
export {
  SINAL_RECEITA_REALIZADA,
  sinalDaReceitaRealizada,
} from "../m04-receita/dominio.js";
export type { TipoLancamentoReceita } from "../m04-receita/dominio.js";

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICAÇÃO — as linhas saem do CÓDIGO, que vem do banco.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A CATEGORIA da receita MUDOU DE CASA — voltou para o dono do fato (M04), pelo
 * mesmo motivo do `SINAL_RECEITA_REALIZADA`: o M10 (dívida) precisa classificar a
 * receita da operação de crédito, e importá-la daqui fecharia um ciclo. Uma tabela
 * só; o que mudou foi o endereço.
 */
export {
  CATEGORIAS_RECEITA,
  categoriaDaReceita,
} from "../m04-receita/dominio.js";
import {
  CATEGORIAS_RECEITA,
  categoriaDaReceita,
} from "../m04-receita/dominio.js";

/** As notas romanas das duas categorias que o layout numera. */
const NOTA_CATEGORIA_RECEITA: Record<string, string> = { "1": "I", "2": "II" };

/** Origem = 2º dígito. A linha é "1.7"; o RÓTULO não existe no banco (ver abaixo). */
export function origemDaReceita(codigoNatureza: string): string {
  return `${codigoNatureza.charAt(0)}.${codigoNatureza.charAt(1)}`;
}

const NOTA_CATEGORIA_DESPESA: Record<string, string> = {
  "3": "VIII",
  "4": "IX",
};

function rotuloCategoriaDespesa(cod: string): string {
  const c = CATEGORIAS_ECONOMICAS.find((x) => x.codigo === cod);
  if (c !== undefined) return c.descricao.toUpperCase();
  if (cod === "9") return "RESERVA DE CONTINGÊNCIA";
  throw new Error(
    `Categoria econômica de despesa "${cod}" desconhecida — o Anexo 12 não tem ` +
      `linha para ela.`
  );
}

function rotuloGrupoDespesa(cod: string): string {
  const g = GRUPOS_NATUREZA_DESPESA.find((x) => x.codigo === cod);
  // A reserva de contingência (categoria 9) usa grupo 9 — fora dos 6 GNDs.
  return g?.descricao ?? `Grupo ${cod}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FATOS — o que a camada de leitura entrega (já somado, já com sinal).
// ═══════════════════════════════════════════════════════════════════════════

export interface FatoReceita {
  /** Código STN da natureza (8 dígitos). */
  readonly codigoNatureza: string;
  /** Previsto LÍQUIDO de deduções (SINAL_PREVISAO). */
  readonly previsto: Money;
  /** Realizado LÍQUIDO de anulações (SINAL_RECEITA_REALIZADA). */
  readonly realizado: Money;
}

export interface FatoDespesa {
  readonly codCategoria: string;
  readonly codGrupo: string;
  readonly dotacaoInicial: Money;
  /** Suplementações − anulações de crédito. */
  readonly creditosAdicionais: Money;
  readonly empenhadas: Money;
  readonly liquidadas: Money;
  /** PELO BRUTO — ver a nota do `pago` em `montarQuadroDespesa`. */
  readonly pagas: Money;
}

export type TipoRestos = "PROCESSADO" | "NAO_PROCESSADO";

export interface FatoRestos {
  readonly codCategoria: string;
  readonly tipo: TipoRestos;
  readonly inscritosExerciciosAnteriores: Money;
  readonly inscritos31Dez: Money;
  /** Só faz sentido para NÃO PROCESSADOS (o processado já nasce liquidado). */
  readonly liquidados: Money;
  readonly pagos: Money;
  readonly cancelados: Money;
}

export interface FatosBalanco {
  readonly exercicio: number;
  /** Exercício ABERTO: o balanço é um retrato parcial, intra-exercício. */
  readonly parcial: boolean;
  readonly receitas: readonly FatoReceita[];
  readonly despesas: readonly FatoDespesa[];
  readonly restos: readonly FatoRestos[];
  /** Superávit financeiro de exercícios anteriores USADO em crédito adicional. */
  readonly saldosExerciciosAnteriores: Money;
}

// ═══════════════════════════════════════════════════════════════════════════
// A ESTRUTURA DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export type NivelLinha =
  | "CATEGORIA"
  | "ORIGEM"
  | "GRUPO"
  | "SUBTOTAL"
  | "EQUILIBRIO"
  | "TOTAL"
  | "INFORMATIVA";

export interface LinhaReceita {
  /** Nota romana do layout (I, III, …). `null` nas linhas analíticas. */
  readonly nota: string | null;
  readonly codigo: string | null;
  /**
   * `null` nas ORIGENS: o rol de origens (2º dígito) NÃO existe como tabela no
   * banco — o M02 semeia só naturezas analíticas. Batizar a linha aqui seria
   * inventar nomenclatura oficial. Quando o rol entrar no seed, o rótulo passa a
   * vir do banco e este campo deixa de ser nulo.
   */
  readonly rotulo: string | null;
  readonly nivel: NivelLinha;
  /** (a) */ readonly previsaoInicial: Dinheiro;
  /** (b) */ readonly previsaoAtualizada: Dinheiro;
  /** (c) */ readonly realizadas: Dinheiro;
  /** (d) = c − b */ readonly saldo: Dinheiro;
}

export interface LinhaDespesa {
  readonly nota: string | null;
  readonly codigo: string | null;
  readonly rotulo: string;
  readonly nivel: NivelLinha;
  /** (e) */ readonly dotacaoInicial: Dinheiro;
  /** (f) */ readonly creditosAdicionais: Dinheiro;
  /** (g) = e + f */ readonly dotacaoAtualizada: Dinheiro;
  /** (h) */ readonly empenhadas: Dinheiro;
  /** (i) */ readonly liquidadas: Dinheiro;
  /** (j) — BRUTO */ readonly pagas: Dinheiro;
  /** (k) = g − h */ readonly saldoDotacao: Dinheiro;
}

export interface LinhaRestosNaoProcessados {
  readonly codigo: string | null;
  readonly rotulo: string;
  readonly nivel: NivelLinha;
  readonly inscritosExerciciosAnteriores: Dinheiro;
  readonly inscritos31Dez: Dinheiro;
  readonly liquidados: Dinheiro;
  readonly pagos: Dinheiro;
  readonly cancelados: Dinheiro;
  readonly saldo: Dinheiro;
}

export interface LinhaRestosProcessados {
  readonly codigo: string | null;
  readonly rotulo: string;
  readonly nivel: NivelLinha;
  readonly inscritosExerciciosAnteriores: Dinheiro;
  readonly inscritos31Dez: Dinheiro;
  readonly pagos: Dinheiro;
  readonly cancelados: Dinheiro;
  readonly saldo: Dinheiro;
}

export interface BalancoOrcamentario {
  readonly anexo: "ANEXO 12 — BALANÇO ORÇAMENTÁRIO";
  readonly exercicio: number;
  /** Exercício ainda ABERTO: retrato parcial. */
  readonly parcial: boolean;
  /** QUADRO 1 */ readonly receitas: readonly LinhaReceita[];
  /** QUADRO 2 */ readonly despesas: readonly LinhaDespesa[];
  /** QUADRO 3 */ readonly restosNaoProcessados: readonly LinhaRestosNaoProcessados[];
  /** QUADRO 4 */ readonly restosProcessados: readonly LinhaRestosProcessados[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTAGEM (pura)
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));
/** max(0, v) — usado no déficit/superávit, que nunca são negativos. */
const positivo = (v: Money) => (v.greaterThan(0) ? v : zero());

interface ColunasReceita {
  previsaoInicial: Money;
  previsaoAtualizada: Money;
  realizadas: Money;
}

function linhaReceita(
  nota: string | null,
  codigo: string | null,
  rotulo: string | null,
  nivel: NivelLinha,
  c: ColunasReceita
): LinhaReceita {
  return {
    nota,
    codigo,
    rotulo,
    nivel,
    previsaoInicial: serializar(c.previsaoInicial),
    previsaoAtualizada: serializar(c.previsaoAtualizada),
    realizadas: serializar(c.realizadas),
    // (d) = c − b. NEGATIVO = frustração de receita; positivo = excesso.
    saldo: serializar(sub(c.realizadas, c.previsaoAtualizada)),
  };
}

/**
 * QUADRO 1 — RECEITAS.
 *
 * PREVISÃO INICIAL == PREVISÃO ATUALIZADA, hoje, e isso é FATO, não preguiça: o
 * modelo não tem reprevisão (`ReceitaPrevista` guarda UM `valorPrevisto` por
 * natureza/fonte). Enquanto não houver reestimativa, as duas colunas são o mesmo
 * número — e emitir a atualizada com um valor diferente seria inventá-lo. Ver
 * PENDÊNCIA no MODULO.md.
 */
function montarQuadroReceita(
  fatos: readonly FatoReceita[]
): { linhas: readonly LinhaReceita[]; realizadasComRefin: Money } {
  // categoria -> origem -> colunas
  const porCategoria = new Map<string, Map<string, ColunasReceita>>();

  for (const f of fatos) {
    const cat = categoriaDaReceita(f.codigoNatureza);
    const org = origemDaReceita(f.codigoNatureza);

    const origens =
      porCategoria.get(cat) ?? new Map<string, ColunasReceita>();
    const acc = origens.get(org) ?? {
      previsaoInicial: zero(),
      previsaoAtualizada: zero(),
      realizadas: zero(),
    };
    acc.previsaoInicial = soma(acc.previsaoInicial, f.previsto);
    acc.previsaoAtualizada = soma(acc.previsaoAtualizada, f.previsto);
    acc.realizadas = soma(acc.realizadas, f.realizado);
    origens.set(org, acc);
    porCategoria.set(cat, origens);
  }

  const linhas: LinhaReceita[] = [];
  const subtotal: ColunasReceita = {
    previsaoInicial: zero(),
    previsaoAtualizada: zero(),
    realizadas: zero(),
  };

  // Ordem do layout: 1, 2, e as INTRA (7, 8) só se houver dado — o esqueleto é
  // explícito: não criar linha vazia.
  // `as const` porque o `CATEGORIAS_RECEITA` deixou de ser `Record<string, ...>`: o
  // M04 agora tipa a categoria (1 · 2 · 7 · 8), e o layout tem de falar a MESMA
  // língua — uma categoria a mais no rol quebra aqui, que é onde tem de quebrar.
  for (const cat of ["1", "2", "7", "8"] as const) {
    const origens = porCategoria.get(cat);
    const intra = cat === "7" || cat === "8";
    if (origens === undefined && intra) continue;

    const daCategoria: ColunasReceita = {
      previsaoInicial: zero(),
      previsaoAtualizada: zero(),
      realizadas: zero(),
    };
    for (const c of (origens ?? new Map<string, ColunasReceita>()).values()) {
      daCategoria.previsaoInicial = soma(daCategoria.previsaoInicial, c.previsaoInicial);
      daCategoria.previsaoAtualizada = soma(daCategoria.previsaoAtualizada, c.previsaoAtualizada);
      daCategoria.realizadas = soma(daCategoria.realizadas, c.realizadas);
    }

    linhas.push(
      linhaReceita(
        NOTA_CATEGORIA_RECEITA[cat] ?? null,
        cat,
        CATEGORIAS_RECEITA[cat]!,
        "CATEGORIA",
        daCategoria
      )
    );
    for (const org of [...(origens?.keys() ?? [])].sort()) {
      linhas.push(linhaReceita(null, org, null, "ORIGEM", origens!.get(org)!));
    }

    subtotal.previsaoInicial = soma(subtotal.previsaoInicial, daCategoria.previsaoInicial);
    subtotal.previsaoAtualizada = soma(subtotal.previsaoAtualizada, daCategoria.previsaoAtualizada);
    subtotal.realizadas = soma(subtotal.realizadas, daCategoria.realizadas);
  }

  // (III) SUBTOTAL DAS RECEITAS = soma das categorias EMITIDAS. Com só I e II
  // (o caso de hoje) é literalmente I + II, como manda o layout; se um dia
  // houver intra, ela entra aqui em vez de sumir do subtotal.
  linhas.push(linhaReceita("III", null, "SUBTOTAL DAS RECEITAS", "SUBTOTAL", subtotal));

  // (IV) OPERAÇÕES DE CRÉDITO / REFINANCIAMENTO — zero hoje. A linha EXISTE no
  // layout. Identificar refinanciamento exige uma regra de natureza/elemento que
  // o layout não deu: ver PENDÊNCIA no MODULO.md. Zerada, não omitida.
  const refin: ColunasReceita = {
    previsaoInicial: zero(),
    previsaoAtualizada: zero(),
    realizadas: zero(),
  };
  linhas.push(
    linhaReceita("IV", null, "OPERAÇÕES DE CRÉDITO / REFINANCIAMENTO", "SUBTOTAL", refin)
  );

  // (V) = III + IV
  const comRefin: ColunasReceita = {
    previsaoInicial: soma(subtotal.previsaoInicial, refin.previsaoInicial),
    previsaoAtualizada: soma(subtotal.previsaoAtualizada, refin.previsaoAtualizada),
    realizadas: soma(subtotal.realizadas, refin.realizadas),
  };
  linhas.push(
    linhaReceita("V", null, "SUBTOTAL COM REFINANCIAMENTO", "SUBTOTAL", comRefin)
  );

  return { linhas, realizadasComRefin: comRefin.realizadas };
}

interface ColunasDespesa {
  dotacaoInicial: Money;
  creditosAdicionais: Money;
  empenhadas: Money;
  liquidadas: Money;
  pagas: Money;
}

function colunasDespesaZero(): ColunasDespesa {
  return {
    dotacaoInicial: zero(),
    creditosAdicionais: zero(),
    empenhadas: zero(),
    liquidadas: zero(),
    pagas: zero(),
  };
}

function acumularDespesa(acc: ColunasDespesa, c: ColunasDespesa): void {
  acc.dotacaoInicial = soma(acc.dotacaoInicial, c.dotacaoInicial);
  acc.creditosAdicionais = soma(acc.creditosAdicionais, c.creditosAdicionais);
  acc.empenhadas = soma(acc.empenhadas, c.empenhadas);
  acc.liquidadas = soma(acc.liquidadas, c.liquidadas);
  acc.pagas = soma(acc.pagas, c.pagas);
}

function linhaDespesa(
  nota: string | null,
  codigo: string | null,
  rotulo: string,
  nivel: NivelLinha,
  c: ColunasDespesa
): LinhaDespesa {
  const atualizada = soma(c.dotacaoInicial, c.creditosAdicionais);
  return {
    nota,
    codigo,
    rotulo,
    nivel,
    dotacaoInicial: serializar(c.dotacaoInicial),
    creditosAdicionais: serializar(c.creditosAdicionais),
    // (g) = e + f
    dotacaoAtualizada: serializar(atualizada),
    empenhadas: serializar(c.empenhadas),
    liquidadas: serializar(c.liquidadas),
    pagas: serializar(c.pagas),
    // (k) = g − h. O saldo da dotação é contra o EMPENHADO: é o empenho que
    // compromete o crédito, não o pagamento.
    saldoDotacao: serializar(sub(atualizada, c.empenhadas)),
  };
}

/**
 * QUADRO 2 — DESPESAS.
 *
 * ⚠️ A COLUNA "PAGAS" É O BRUTO. Um pagamento com retenção na fonte (M07) sai do
 * caixa pelo líquido, mas a DESPESA EXECUTADA é o bruto: o município deve, e
 * paga, o valor cheio — parte em dinheiro ao credor, parte ao consignatário. O
 * líquido que saiu do caixa é assunto do Anexo 13 (Balanço Financeiro), onde a
 * retenção aparece como ingresso extraorçamentário. Publicar o líquido aqui
 * subdeclararia a execução da despesa.
 */
function montarQuadroDespesa(
  fatos: readonly FatoDespesa[]
): { linhas: readonly LinhaDespesa[]; empenhadasComRefin: Money } {
  const porCategoria = new Map<string, Map<string, ColunasDespesa>>();

  for (const f of fatos) {
    const grupos = porCategoria.get(f.codCategoria) ?? new Map<string, ColunasDespesa>();
    const acc = grupos.get(f.codGrupo) ?? colunasDespesaZero();
    acumularDespesa(acc, {
      dotacaoInicial: f.dotacaoInicial,
      creditosAdicionais: f.creditosAdicionais,
      empenhadas: f.empenhadas,
      liquidadas: f.liquidadas,
      pagas: f.pagas,
    });
    grupos.set(f.codGrupo, acc);
    porCategoria.set(f.codCategoria, grupos);
  }

  const linhas: LinhaDespesa[] = [];
  const subtotal = colunasDespesaZero();

  for (const cat of ["3", "4", "9"]) {
    const grupos = porCategoria.get(cat);
    // (X) RESERVA DE CONTINGÊNCIA: só se houver dotação. (VIII) e (IX) sempre.
    if (grupos === undefined && cat === "9") continue;

    const daCategoria = colunasDespesaZero();
    for (const c of (grupos ?? new Map<string, ColunasDespesa>()).values()) {
      acumularDespesa(daCategoria, c);
    }

    const nota = cat === "9" ? "X" : NOTA_CATEGORIA_DESPESA[cat] ?? null;
    linhas.push(
      linhaDespesa(nota, cat, rotuloCategoriaDespesa(cat), "CATEGORIA", daCategoria)
    );
    for (const g of [...(grupos?.keys() ?? [])].sort()) {
      linhas.push(
        linhaDespesa(
          null,
          `${cat}.${g}`,
          rotuloGrupoDespesa(g),
          "GRUPO",
          grupos!.get(g)!
        )
      );
    }

    acumularDespesa(subtotal, daCategoria);
  }

  // (XI) = VIII + IX + X
  linhas.push(linhaDespesa("XI", null, "SUBTOTAL DAS DESPESAS", "SUBTOTAL", subtotal));

  // (XII) AMORTIZAÇÃO DA DÍVIDA / REFINANCIAMENTO — zero hoje, linha existe.
  const refin = colunasDespesaZero();
  linhas.push(
    linhaDespesa("XII", null, "AMORTIZAÇÃO DA DÍVIDA / REFINANCIAMENTO", "SUBTOTAL", refin)
  );

  // (XIII) = XI + XII
  const comRefin = colunasDespesaZero();
  acumularDespesa(comRefin, subtotal);
  acumularDespesa(comRefin, refin);
  linhas.push(
    linhaDespesa("XIII", null, "SUBTOTAL COM REFINANCIAMENTO", "SUBTOTAL", comRefin)
  );

  return { linhas, empenhadasComRefin: comRefin.empenhadas };
}

/**
 * QUADROS 3 e 4 — RESTOS A PAGAR, por categoria econômica.
 *
 * SALDO = inscritos − pagos − cancelados. **A liquidação NÃO baixa saldo de RP** —
 * ela qualifica o não processado para pagamento, mas a obrigação com o credor
 * continua existindo. É a definição que o M08 já usa (`saldoDaInscricao`), e é a
 * única que o sistema conhece: o layout não deu a fórmula desta coluna, e
 * inventar uma segunda aritmética de saldo aqui faria o relatório divergir do
 * razão que ele deveria estar reportando. Ver PENDÊNCIA no MODULO.md.
 */
function montarQuadrosRestos(fatos: readonly FatoRestos[]): {
  naoProcessados: readonly LinhaRestosNaoProcessados[];
  processados: readonly LinhaRestosProcessados[];
} {
  interface ColunasRP {
    inscritosExerciciosAnteriores: Money;
    inscritos31Dez: Money;
    liquidados: Money;
    pagos: Money;
    cancelados: Money;
  }
  const zeroRP = (): ColunasRP => ({
    inscritosExerciciosAnteriores: zero(),
    inscritos31Dez: zero(),
    liquidados: zero(),
    pagos: zero(),
    cancelados: zero(),
  });

  const porTipo = new Map<TipoRestos, Map<string, ColunasRP>>([
    ["NAO_PROCESSADO", new Map()],
    ["PROCESSADO", new Map()],
  ]);

  for (const f of fatos) {
    const porCat = porTipo.get(f.tipo)!;
    const acc = porCat.get(f.codCategoria) ?? zeroRP();
    acc.inscritosExerciciosAnteriores = soma(
      acc.inscritosExerciciosAnteriores,
      f.inscritosExerciciosAnteriores
    );
    acc.inscritos31Dez = soma(acc.inscritos31Dez, f.inscritos31Dez);
    acc.liquidados = soma(acc.liquidados, f.liquidados);
    acc.pagos = soma(acc.pagos, f.pagos);
    acc.cancelados = soma(acc.cancelados, f.cancelados);
    porCat.set(f.codCategoria, acc);
  }

  const saldoDe = (c: ColunasRP): Money =>
    sub(
      sub(soma(c.inscritosExerciciosAnteriores, c.inscritos31Dez), c.pagos),
      c.cancelados
    );

  const monta = <T>(
    tipo: TipoRestos,
    linha: (
      codigo: string | null,
      rotulo: string,
      nivel: NivelLinha,
      c: ColunasRP
    ) => T
  ): readonly T[] => {
    const porCat = porTipo.get(tipo)!;
    const linhas: T[] = [];
    const total = zeroRP();

    // Categorias 3 e 4 SEMPRE (o quadro existe mesmo zerado); 9 nunca inscreve.
    for (const cat of ["3", "4"]) {
      const c = porCat.get(cat) ?? zeroRP();
      linhas.push(linha(cat, rotuloCategoriaDespesa(cat), "CATEGORIA", c));
      total.inscritosExerciciosAnteriores = soma(
        total.inscritosExerciciosAnteriores,
        c.inscritosExerciciosAnteriores
      );
      total.inscritos31Dez = soma(total.inscritos31Dez, c.inscritos31Dez);
      total.liquidados = soma(total.liquidados, c.liquidados);
      total.pagos = soma(total.pagos, c.pagos);
      total.cancelados = soma(total.cancelados, c.cancelados);
    }
    linhas.push(linha(null, "TOTAL", "TOTAL", total));
    return linhas;
  };

  const naoProcessados = monta<LinhaRestosNaoProcessados>(
    "NAO_PROCESSADO",
    (codigo, rotulo, nivel, c) => ({
      codigo,
      rotulo,
      nivel,
      inscritosExerciciosAnteriores: serializar(c.inscritosExerciciosAnteriores),
      inscritos31Dez: serializar(c.inscritos31Dez),
      liquidados: serializar(c.liquidados),
      pagos: serializar(c.pagos),
      cancelados: serializar(c.cancelados),
      saldo: serializar(saldoDe(c)),
    })
  );

  const processados = monta<LinhaRestosProcessados>(
    "PROCESSADO",
    (codigo, rotulo, nivel, c) => ({
      codigo,
      rotulo,
      nivel,
      inscritosExerciciosAnteriores: serializar(c.inscritosExerciciosAnteriores),
      inscritos31Dez: serializar(c.inscritos31Dez),
      pagos: serializar(c.pagos),
      cancelados: serializar(c.cancelados),
      saldo: serializar(saldoDe(c)),
    })
  );

  return { naoProcessados, processados };
}

/**
 * Monta o Anexo 12 inteiro. PURA — a mesma função serve o banco e o teste.
 *
 * ═══ A LINHA DE EQUILÍBRIO ═══
 * O resultado orçamentário é `receita realizada − despesa EMPENHADA` (não paga: é
 * o empenho que compromete o crédito). Quando negativo, o DÉFICIT (VI) entra na
 * coluna "realizadas" da receita; quando positivo, o SUPERÁVIT (XIV) entra na
 * coluna "empenhadas" da despesa. Por construção,
 * `TOTAL receitas (VII) == TOTAL despesas (XV)` — e a função CONFERE isso antes de
 * devolver: se algum dia não fechar, o Anexo 12 não sai.
 */
export function montarBalancoOrcamentario(f: FatosBalanco): BalancoOrcamentario {
  const q1 = montarQuadroReceita(f.receitas);
  const q2 = montarQuadroDespesa(f.despesas);

  const realizadas = q1.realizadasComRefin;
  const empenhadas = q2.empenhadasComRefin;

  // (VI) DÉFICIT — só quando a despesa empenhada supera a receita realizada.
  const deficit = positivo(sub(empenhadas, realizadas));
  // (XIV) SUPERÁVIT — a contrapartida.
  const superavit = positivo(sub(realizadas, empenhadas));

  const receitas: LinhaReceita[] = [
    ...q1.linhas,
    linhaReceita("VI", null, "DÉFICIT", "EQUILIBRIO", {
      previsaoInicial: zero(),
      previsaoAtualizada: zero(),
      realizadas: deficit,
    }),
    linhaReceita("VII", null, "TOTAL", "TOTAL", {
      previsaoInicial: totalColuna(q1.linhas, "previsaoInicial"),
      previsaoAtualizada: totalColuna(q1.linhas, "previsaoAtualizada"),
      realizadas: soma(realizadas, deficit),
    }),
    // Fora dos subtotais e do cálculo do déficit/superávit: é recurso de
    // exercício ANTERIOR, usado como fonte de crédito adicional. Valores só nas
    // colunas (b) e (c), como manda o layout.
    linhaReceita(
      null,
      null,
      "SALDOS DE EXERCÍCIOS ANTERIORES (utilizados para créditos adicionais)",
      "INFORMATIVA",
      {
        previsaoInicial: zero(),
        previsaoAtualizada: f.saldosExerciciosAnteriores,
        realizadas: f.saldosExerciciosAnteriores,
      }
    ),
  ];

  const despesas: LinhaDespesa[] = [
    ...q2.linhas,
    linhaDespesa("XIV", null, "SUPERÁVIT", "EQUILIBRIO", {
      ...colunasDespesaZero(),
      empenhadas: superavit,
    }),
    linhaDespesa("XV", null, "TOTAL", "TOTAL", {
      dotacaoInicial: totalDespesaColuna(q2.linhas, "dotacaoInicial"),
      creditosAdicionais: totalDespesaColuna(q2.linhas, "creditosAdicionais"),
      empenhadas: soma(empenhadas, superavit),
      liquidadas: totalDespesaColuna(q2.linhas, "liquidadas"),
      pagas: totalDespesaColuna(q2.linhas, "pagas"),
    }),
  ];

  const restos = montarQuadrosRestos(f.restos);

  // AMARRAÇÃO (fail-closed): VII == XV. É a razão de ser da linha de equilíbrio.
  const totalReceitas = receitas.find((l) => l.nota === "VII")!.realizadas;
  const totalDespesas = despesas.find((l) => l.nota === "XV")!.empenhadas;
  if (totalReceitas !== totalDespesas) {
    throw new Error(
      `Anexo 12 NÃO FECHA: TOTAL das receitas (VII) = ${totalReceitas} e TOTAL ` +
        `das despesas (XV) = ${totalDespesas}. O déficit/superávit é a linha de ` +
        `equilíbrio — se ela não iguala os dois, há erro de montagem e o ` +
        `relatório não sai.`
    );
  }

  return {
    anexo: "ANEXO 12 — BALANÇO ORÇAMENTÁRIO",
    exercicio: f.exercicio,
    parcial: f.parcial,
    receitas,
    despesas,
    restosNaoProcessados: restos.naoProcessados,
    restosProcessados: restos.processados,
  };
}

/** O valor de uma coluna na linha (V) — a base dos totais. */
function totalColuna(
  linhas: readonly LinhaReceita[],
  coluna: "previsaoInicial" | "previsaoAtualizada"
): Money {
  const v = linhas.find((l) => l.nota === "V");
  return toMoney(v?.[coluna] ?? "0.00");
}

function totalDespesaColuna(
  linhas: readonly LinhaDespesa[],
  coluna: "dotacaoInicial" | "creditosAdicionais" | "liquidadas" | "pagas"
): Money {
  const v = linhas.find((l) => l.nota === "XIII");
  return toMoney(v?.[coluna] ?? "0.00");
}
