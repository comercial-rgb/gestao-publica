import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { compararPorDiaCivil, diaCivil } from "../../packages/datas/index.js";

/**
 * M29 — PRECATÓRIOS: a aritmética e A FILA CONSTITUCIONAL, puras.
 *
 * ═══ ⚠️ A FILA DO ART. 100 NÃO É A FILA DO ART. 141 ═══
 * O M06 implementa a ordem cronológica de PAGAMENTOS da Lei 14.133 (por fonte, subdividida
 * por categoria de contrato). Esta é outra lei e outra ordem, e a diferença é de três eixos:
 *
 *   1. **natureza** — alimentar antes de comum (CF art. 100, §1º);
 *   2. **preferência** dentro dos alimentares — idoso, doença grave, deficiência (§2º);
 *   3. **apresentação** — dentro de cada grupo, a data de apresentação (a autuação).
 *
 * ⚠️ E O DESEMPATE PELO NÚMERO DO PROCESSO EXISTE, e é o que dá ordem TOTAL. Sem ele, dois
 * precatórios apresentados no MESMO DIA não empatariam de forma estável: a fila mudaria de
 * ordem entre duas leituras, e "sou o próximo" passaria a depender de qual consulta rodou.
 * Foi exatamente o defeito que o eixo de data civil achou no art. 141 — lá o desempate pelo
 * número NUNCA rodava, porque os instantes não empatavam.
 */

export type NaturezaDoPrecatorio = "ALIMENTAR" | "COMUM";
export type PreferenciaDoPrecatorio = "NENHUMA" | "IDOSO" | "DOENCA_GRAVE" | "DEFICIENCIA";

export type TipoMovimentoPrecatorio =
  | "INSCRICAO"
  | "ATUALIZACAO"
  | "PAGAMENTO"
  | "CANCELAMENTO"
  | "ESTORNO_INSCRICAO"
  | "ESTORNO_ATUALIZACAO"
  | "ESTORNO_PAGAMENTO"
  | "ESTORNO_CANCELAMENTO";

/** O sinal de cada tipo no SALDO DEVIDO. */
export const SINAL_MOVIMENTO_PRECATORIO: Record<TipoMovimentoPrecatorio, 1 | -1> = {
  INSCRICAO: 1,
  ATUALIZACAO: 1,
  PAGAMENTO: -1,
  CANCELAMENTO: -1,
  ESTORNO_INSCRICAO: -1,
  ESTORNO_ATUALIZACAO: -1,
  ESTORNO_PAGAMENTO: 1,
  ESTORNO_CANCELAMENTO: 1,
};

export const TIPO_DO_ESTORNO_PRECATORIO: Record<
  TipoMovimentoPrecatorio,
  TipoMovimentoPrecatorio | null
> = {
  INSCRICAO: "ESTORNO_INSCRICAO",
  ATUALIZACAO: "ESTORNO_ATUALIZACAO",
  PAGAMENTO: "ESTORNO_PAGAMENTO",
  CANCELAMENTO: "ESTORNO_CANCELAMENTO",
  ESTORNO_INSCRICAO: null,
  ESTORNO_ATUALIZACAO: null,
  ESTORNO_PAGAMENTO: null,
  ESTORNO_CANCELAMENTO: null,
};

export interface MovimentoParaSaldo {
  readonly tipo: TipoMovimentoPrecatorio;
  readonly valor: Money;
}

/** O SALDO DEVIDO — Σ dos movimentos pelo sinal. Nunca uma coluna. */
export function saldoDoPrecatorio(movimentos: readonly MovimentoParaSaldo[]): Money {
  let saldo = toMoney("0.00");
  for (const m of movimentos) {
    saldo =
      SINAL_MOVIMENTO_PRECATORIO[m.tipo] === 1
        ? toMoney(saldo.plus(m.valor))
        : toMoney(saldo.minus(m.valor));
  }
  return saldo;
}

/**
 * ⚠️ O PESO DA PREFERÊNCIA — MENOR é MAIS na frente.
 *
 * A preferência do §2º só existe DENTRO dos alimentares: um comum com beneficiário idoso NÃO
 * passa à frente de um alimentar. Dar-lhe o peso da preferência inverteria a ordem que a
 * Constituição fixa — e o erro seria invisível, porque a fila continuaria "ordenada".
 */
export const PESO_DA_PREFERENCIA: Record<PreferenciaDoPrecatorio, number> = {
  IDOSO: 0,
  DOENCA_GRAVE: 0,
  DEFICIENCIA: 0,
  NENHUMA: 1,
};

export const PESO_DA_NATUREZA: Record<NaturezaDoPrecatorio, number> = {
  ALIMENTAR: 0,
  COMUM: 1,
};

export interface PrecatorioNaFila {
  readonly id: string;
  readonly numeroProcesso: string;
  readonly natureza: NaturezaDoPrecatorio;
  readonly preferencia: PreferenciaDoPrecatorio;
  readonly dataApresentacao: Date;
  readonly saldoDevido: Money;
}

/**
 * A FILA, ORDENADA — e ela é ORDEM TOTAL.
 *
 * Quatro critérios, nesta ordem: natureza, preferência (só nos alimentares), dia civil da
 * apresentação, número do processo.
 *
 * ⚠️ O DIA É CIVIL, e não o instante. Dois precatórios apresentados no mesmo dia mas em horas
 * diferentes DEVEM empatar — é o empate que faz o desempate pelo número rodar. Comparar
 * instantes ordenaria pela hora do protocolo, que não é critério de lei nenhuma.
 */
export function ordenarFilaDePrecatorios(
  precatorios: readonly PrecatorioNaFila[]
): readonly PrecatorioNaFila[] {
  return [...precatorios].sort((a, b) => {
    const natureza = PESO_DA_NATUREZA[a.natureza] - PESO_DA_NATUREZA[b.natureza];
    if (natureza !== 0) return natureza;

    // A preferência só desempata DENTRO dos alimentares — ver `PESO_DA_PREFERENCIA`.
    if (a.natureza === "ALIMENTAR") {
      const pref = PESO_DA_PREFERENCIA[a.preferencia] - PESO_DA_PREFERENCIA[b.preferencia];
      if (pref !== 0) return pref;
    }

    const dia = compararPorDiaCivil(a.dataApresentacao, b.dataApresentacao);
    if (dia !== 0) return dia;

    return a.numeroProcesso.localeCompare(b.numeroProcesso, "pt-BR");
  });
}

export interface QuebraDeOrdem {
  readonly precatorioId: string;
  readonly numeroProcesso: string;
  readonly posicao: number;
  /** Quem está na frente e continua devendo. */
  readonly naFrente: readonly {
    readonly numeroProcesso: string;
    readonly natureza: NaturezaDoPrecatorio;
    readonly preferencia: PreferenciaDoPrecatorio;
    readonly dataApresentacao: string;
    readonly saldoDevido: string;
  }[];
}

/**
 * PAGAR ESTE PRECATÓRIO FURA A ORDEM? — e a resposta nomeia QUEM ficou para trás.
 *
 * ⚠️ SÓ CONTAM OS QUE AINDA DEVEM. Um precatório já quitado (saldo zero) não está na fila: ele
 * não é "quem está na frente". Contá-lo faria toda ordem parecer furada para sempre depois do
 * primeiro pagamento — e um guard que sempre acusa é um guard que alguém desliga.
 *
 * ⚠️ E ELE NÃO DECIDE — ele RESPONDE. Furar a ordem é possível (acordo homologado, sequestro
 * determinado pelo tribunal); o que não é possível é fazê-lo sem dizer por quê. Quem exige a
 * justificativa é o caso de uso, com este resultado na mão.
 */
export function quebraDeOrdemAoPagar(
  precatorios: readonly PrecatorioNaFila[],
  precatorioId: string
): QuebraDeOrdem | null {
  const devendo = precatorios.filter((p) => p.saldoDevido.gt(0));
  const fila = ordenarFilaDePrecatorios(devendo);
  const posicao = fila.findIndex((p) => p.id === precatorioId);
  if (posicao <= 0) return null; // é o próximo (0) ou não está na fila (−1: já quitado)

  const alvo = fila[posicao]!;
  return {
    precatorioId: alvo.id,
    numeroProcesso: alvo.numeroProcesso,
    posicao: posicao + 1,
    naFrente: fila.slice(0, posicao).map((p) => ({
      numeroProcesso: p.numeroProcesso,
      natureza: p.natureza,
      preferencia: p.preferencia,
      dataApresentacao: diaCivil(p.dataApresentacao),
      saldoDevido: p.saldoDevido.toFixed(2),
    })),
  };
}

/** A mensagem da recusa — ela AFIRMA O MOTIVO, e nomeia quem ficou para trás. */
export function textoDaQuebra(q: QuebraDeOrdem): string {
  const lista = q.naFrente
    .slice(0, 5)
    .map(
      (p) =>
        `    · ${p.numeroProcesso} (${p.natureza}` +
        `${p.preferencia === "NENHUMA" ? "" : `/${p.preferencia}`}` +
        `, apresentado em ${p.dataApresentacao}, devendo ${p.saldoDevido})`
    )
    .join("\n");
  const resto =
    q.naFrente.length > 5 ? `\n    … e outros ${q.naFrente.length - 5}.` : "";
  return (
    `QUEBRA DA ORDEM DO ART. 100 DA CONSTITUIÇÃO: o precatório ${q.numeroProcesso} está na ` +
    `posição ${q.posicao} da fila, e há ${q.naFrente.length} à frente dele ainda devendo:\n` +
    `${lista}${resto}\n\n` +
    `A ordem é: alimentar antes de comum; dentro dos alimentares, a preferência do §2º; ` +
    `depois, a data de apresentação; e o número do processo como desempate.\n\n` +
    `Pagar fora da ordem é POSSÍVEL — acordo homologado, sequestro de verba determinado pelo ` +
    `tribunal — mas exige JUSTIFICATIVA registrada no mesmo ato. Informe ` +
    `\`justificativaQuebraDeOrdem\`. Nada foi gravado.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OS INPUTS
// ═══════════════════════════════════════════════════════════════════════════

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil YYYY-MM-DD.");

export const zCadastrarPrecatorioInput = z.object({
  numeroProcesso: z.string().trim().min(5).max(60),
  tribunal: z.string().trim().min(2),
  oficioRequisitorio: z.string().trim().min(1).optional(),
  beneficiarioNome: z.string().trim().min(3),
  beneficiarioDocumento: z.string().regex(/^\d{11}$|^\d{14}$/),
  natureza: z.enum(["ALIMENTAR", "COMUM"]),
  preferencia: z
    .enum(["NENHUMA", "IDOSO", "DOENCA_GRAVE", "DEFICIENCIA"])
    .default("NENHUMA"),
  diaApresentacao: zDia,
  exercicioDePagamento: z.number().int().min(2000).max(2100),
  valorOriginal: zMoney,
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarPrecatorioInput = z.input<typeof zCadastrarPrecatorioInput>;

export const zMovimentoPrecatorioInput = z.object({
  precatorioId: z.string().min(1),
  valor: zMoney,
  diaMovimento: zDia,
  /** `YYYY-MM` — obrigatória na ATUALIZACAO (é ela que dá idempotência). */
  competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type MovimentoPrecatorioInput = z.input<typeof zMovimentoPrecatorioInput>;

export const zEstornarMovimentoPrecatorioInput = z.object({
  movimentoId: z.string().min(1),
  diaMovimento: zDia,
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoPrecatorioInput = z.input<
  typeof zEstornarMovimentoPrecatorioInput
>;
