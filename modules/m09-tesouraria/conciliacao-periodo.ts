import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { TipoMovimentoDaConciliacao } from "../../prisma/generated/client/client.js";

/**
 * A CONCILIAÇÃO COMO OBJETO DISCRETO — REGRAS PURAS. Zero I/O.
 *
 * Decidido em `docs/adr/ADR-conciliacao-como-objeto-discreto.md` (aceito).
 *
 * ═══ ⚠️ O QUE SE PERSISTE É O JUÍZO, NÃO O SALDO ═══
 * Saldos e enumeração de fatos continuam DERIVADOS (`caixa.ts`, `conciliacao.ts`).
 * Congelar valor no encerramento criaria a segunda verdade — e a tela de conferência é o
 * pior lugar do sistema para tê-la, porque ela existe justamente para comparar duas
 * fontes. Um valor congelado divergindo do razão faria o operador conferir o sistema
 * contra ele mesmo.
 *
 * O que NÃO é derivável, e por isso é gravado:
 *   · qual fato corresponde a qual linha do extrato (`VinculoConciliacao`, que já
 *     existia);
 *   · por que uma pendência permanece em aberto (`JustificativaDePendencia`);
 *   · uma pendência que o operador DECLARA (`PendenciaManualDeConciliacao`);
 *   · o estado e quem encerrou (`MovimentoDaConciliacao`).
 */

// ═══════════════════════════════════════════════════════════════════════════
// O ESTADO — DERIVADO, como o exercício (M08), o lote (M09) e o processo (M21)
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoDaConciliacao = "ABERTA" | "ENCERRADA";

export interface MovimentoDeConciliacao {
  readonly tipo: TipoMovimentoDaConciliacao;
  readonly criadoEm: Date;
}

/**
 * ⚠️ NÃO HÁ COLUNA DE ESTADO, e a ausência é a regra. Uma coluna exigiria `UPDATE`, e a
 * tabela é append-only — e derraparia no primeiro encerramento concorrente.
 *
 * ⚠️ E NÃO HÁ REABERTURA. O ADR é explícito: conciliação encerrada é imutável, e
 * correção posterior se trata no período em que foi descoberta, referenciando o de
 * origem. Por isso basta "existe ENCERRAR?" — não é preciso ordenar por `criadoEm` como
 * o travamento do M16 faz, onde travar e destravar se alternam.
 */
export function estadoDaConciliacao(
  movimentos: readonly MovimentoDeConciliacao[]
): EstadoDaConciliacao {
  return movimentos.some((m) => m.tipo === "ENCERRAR") ? "ENCERRADA" : "ABERTA";
}

/**
 * ⚠️ O GUARD DA IMUTABILIDADE. Toda escrita na conciliação passa por aqui.
 *
 * Sem ele, uma pendência manual acrescentada depois do encerramento mudaria o
 * fechamento que o controle interno já leu — e a prestação de contas de junho passaria a
 * dizer, em agosto, algo diferente do que dizia em julho.
 */
export function exigirConciliacaoAberta(
  movimentos: readonly MovimentoDeConciliacao[],
  periodo: { readonly inicio: Date; readonly fim: Date },
  operacao: string
): void {
  if (estadoDaConciliacao(movimentos) === "ENCERRADA") {
    throw new Error(
      `A conciliação de ${diaCivilBr(periodo.inicio)} a ${diaCivilBr(periodo.fim)} está ` +
        `ENCERRADA — ${operacao} rejeitado. Conciliação encerrada é fato, e fato não se ` +
        `reescreve: se um erro dela foi descoberto agora, trate-o no período ABERTO, ` +
        `referenciando o de origem. Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A SELEÇÃO MÚLTIPLA COM SOMA — TR 5.10.2.47
// ═══════════════════════════════════════════════════════════════════════════

export interface ItemSelecionado {
  readonly id: string;
  readonly valor: Money;
}

export interface ResultadoDaSelecao {
  readonly quantidade: number;
  readonly soma: Money;
  readonly confere: boolean;
  readonly diferenca: Money;
}

/**
 * SOMA A SELEÇÃO e compara com o alvo — TR 5.10.2.47: *"selecionar múltiplos lançamentos
 * contábeis exibindo a soma dos mesmos e permitindo conciliar com um ou vários registros
 * do extrato"*.
 *
 * ⚠️ ELA É PURA, E É A MESMA CONTA QUE A TELA MOSTRA E QUE O SERVIÇO COBRA. Se a tela
 * somasse por conta própria, o operador veria "confere" e o serviço recusaria — ou, pior,
 * o contrário.
 *
 * ⚠️ ITEM REPETIDO NA SELEÇÃO É RECUSADO. Marcar a mesma linha duas vezes dobraria a
 * soma e faria um vínculo de valor inexistente parecer certo na tela. A tela pode não
 * deixar; a tela não é guard.
 */
export function somarSelecao(
  itens: readonly ItemSelecionado[],
  alvo: Money
): ResultadoDaSelecao {
  const vistos = new Set<string>();
  for (const i of itens) {
    if (vistos.has(i.id)) {
      throw new Error(
        `O item ${i.id} aparece duas vezes na seleção. Somá-lo duas vezes faria um ` +
          `vínculo de valor inexistente parecer correto. Nada foi gravado.`
      );
    }
    vistos.add(i.id);
  }

  const soma = itens.reduce((acc, i) => toMoney(acc.plus(i.valor)), toMoney("0.00"));
  const diferenca = toMoney(soma.minus(alvo));
  return {
    quantidade: itens.length,
    soma,
    confere: diferenca.isZero(),
    diferenca,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ENTRADAS
// ═══════════════════════════════════════════════════════════════════════════

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const zAbrirConciliacao = z.object({
  contaBancariaId: z.string().min(1),
  /**
   * ⚠️ DIA CIVIL COMO TEXTO, e não `Date` — ver `packages/datas` e o ADR da data civil.
   * Um `Date` é um instante, e "a conciliação de junho" fala de dias do calendário do
   * ente. Com `Date`, uma tela que enviasse `2026-06-01T00:00:00Z` estaria pedindo um
   * período que começa às 21:00 de 31/05.
   */
  diaInicio: z.string().regex(DIA, "O início do período é `YYYY-MM-DD` (dia civil)."),
  diaFim: z.string().regex(DIA, "O fim do período é `YYYY-MM-DD` (dia civil)."),
  criadoPor: z.string().min(1),
});
export type AbrirConciliacaoInput = z.input<typeof zAbrirConciliacao>;

export const zEncerrarConciliacao = z.object({
  conciliacaoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type EncerrarConciliacaoInput = z.input<typeof zEncerrarConciliacao>;

export const zPendenciaManual = z.object({
  conciliacaoId: z.string().min(1),
  descricao: z.string().trim().min(3),
  /**
   * ⚠️ OBRIGATÓRIO, e com tamanho mínimo. É o motivo que torna a pendência uma DECISÃO
   * registrada em vez de um palpite — e é ele que o controle interno lê ao conferir o
   * fechamento. Uma pendência sem motivo é um número solto no relatório.
   */
  motivo: z
    .string()
    .trim()
    .min(10, "A pendência manual exige motivo (mínimo 10 caracteres): sem ele, ela é um número solto no relatório."),
  valor: zMoney.refine((v) => v.greaterThan(0), {
    message: "O valor da pendência deve ser > 0",
  }),
  natureza: z.enum(["CREDITO", "DEBITO"]),
  criadoPor: z.string().min(1),
});
export type PendenciaManualInput = z.input<typeof zPendenciaManual>;

export const zJustificarPendencia = z.object({
  conciliacaoId: z.string().min(1),
  /** "EXTRATO" ou o `TipoInternoConciliacao` — de que lado está a pendência. */
  lado: z.string().min(1),
  referencia: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(10, "A justificativa exige ao menos 10 caracteres — ela é o que explica ao controle interno por que a pendência atravessou o fechamento."),
  criadoPor: z.string().min(1),
});
export type JustificarPendenciaInput = z.input<typeof zJustificarPendencia>;

/** Rótulo do período, como a tela e o relatório o mostram. */
export function rotuloDoPeriodo(inicio: Date, fim: Date): string {
  return `${diaCivilBr(inicio)} a ${diaCivilBr(fim)}`;
}

/** A chave do período em dias civis — para comparar e ordenar sem ambiguidade. */
export function chaveDoPeriodo(inicio: Date, fim: Date): string {
  return `${diaCivil(inicio)}..${diaCivil(fim)}`;
}
