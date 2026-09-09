import { createHash } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import type { ExtratoOfx, TransacaoOfx } from "../../packages/ofx/index.js";
// A FONTE ÚNICA DO SINAL do M07 — reusada, nunca recopiada.
import {
  SINAL_MOVIMENTO_EXTRA,
  type TipoMovimentoExtra,
} from "../m07-extraorcamentario/dominio.js";

/**
 * DOMAIN do M09 — SEM I/O (o `node:crypto` é cálculo, não I/O).
 *
 * ═══ "CONCILIADO" É DERIVADO ═══
 * Não existe flag. Um lançamento do extrato está conciliado se a soma dos
 * vínculos dele, COM OS SINAIS, é > 0. Uma coluna `conciliado` exigiria UPDATE
 * (proibido: append-only) e derraparia na primeira anulação — exatamente como o
 * `status` que o M05 se recusou a ter.
 */

export type TipoVinculo = "VINCULO" | "ESTORNO_VINCULO";

/**
 * ⚠️ A FONTE ÚNICA DO SINAL DO VÍNCULO. Simétrico DESDE O DIA 1.
 *
 * A lição do M08 (345af7d/4768cff), aplicada de novo: se o estorno chegasse
 * depois, um `SUM(*)` cru trataria o ESTORNO_VINCULO como MAIS UMA conciliação —
 * e o lançamento apareceria conciliado em dobro, "sem espaço" para o vínculo
 * certo. O `Record` exaustivo faz o TypeScript apontar quem esquecer um tipo novo.
 */
export const SINAL_VINCULO: Record<TipoVinculo, 1 | -1> = {
  VINCULO: 1,
  ESTORNO_VINCULO: -1,
};

export interface MovimentoVinculo {
  readonly tipo: TipoVinculo;
  readonly valor: Money;
}

/**
 * O VÍNCULO LÍQUIDO — o quanto de um lançamento (do extrato ou interno) já está
 * conciliado. PURA. NENHUMA soma de vínculos passa por fora daqui.
 */
export function vinculoLiquido(
  movimentos: readonly MovimentoVinculo[]
): Money {
  return movimentos.reduce(
    (acc, m) =>
      SINAL_VINCULO[m.tipo] === 1
        ? toMoney(acc.plus(m.valor))
        : toMoney(acc.minus(m.valor)),
    toMoney("0.00")
  );
}

/** Um lançamento está conciliado quando o vínculo líquido dele é > 0. DERIVADO. */
export function estaConciliado(movimentos: readonly MovimentoVinculo[]): boolean {
  return vinculoLiquido(movimentos).greaterThan(0);
}

// ═══════════════════════════════════════════════════════════════════════════
// HASHES — a identidade do arquivo e a identidade da LINHA
// ═══════════════════════════════════════════════════════════════════════════

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * O hash do ARQUIVO: reimportar o mesmo arquivo é NO-OP, não erro. O operador que
 * clicou duas vezes não merece um erro — e o sistema não pode duplicar o extrato
 * por causa dele.
 */
export function hashDoArquivo(conteudo: string): string {
  return sha256(conteudo);
}

/**
 * O hash da LINHA — a definição de "esta linha mudou".
 *
 * O conteúdo canônico vem do parser (`linhaCanonica`), para que a definição seja
 * UMA só. Se o banco reemitir o MESMO FITID com conteúdo DIFERENTE, isso não é
 * reimportação: é o banco mudando o passado. O import ABORTA e chama o humano.
 */
export function hashDaLinha(t: TransacaoOfx): string {
  return sha256(t.linhaCanonica);
}

// ═══════════════════════════════════════════════════════════════════════════
// PERÍODO do extrato
// ═══════════════════════════════════════════════════════════════════════════

export interface PeriodoExtrato {
  readonly inicio: Date;
  readonly fim: Date;
}

/**
 * O período do extrato: DTSTART/DTEND quando o banco os manda; senão, o min/max
 * das datas de postagem.
 *
 * FAIL-CLOSED: arquivo sem período declarado E sem transações não tem período
 * nenhum — e um extrato sem período não se concilia contra data de corte alguma.
 */
export function periodoDoExtrato(e: ExtratoOfx): PeriodoExtrato {
  if (e.periodoInicio !== undefined && e.periodoFim !== undefined) {
    if (e.periodoFim < e.periodoInicio) {
      throw new Error(
        `Extrato com período invertido: DTSTART ` +
          `${e.periodoInicio.toISOString().slice(0, 10)} > DTEND ` +
          `${e.periodoFim.toISOString().slice(0, 10)}.`
      );
    }
    return { inicio: e.periodoInicio, fim: e.periodoFim };
  }

  if (e.transacoes.length === 0) {
    throw new Error(
      "Extrato sem DTSTART/DTEND e sem nenhuma transação: não há período a " +
        "registrar, e um extrato sem período não se concilia contra data de " +
        "corte nenhuma."
    );
  }

  const datas = e.transacoes.map((t) => t.dataPostagem.getTime());
  return {
    inicio: new Date(Math.min(...datas)),
    fim: new Date(Math.max(...datas)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Entrada
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// O SINAL DO EXTRATO — e o teto conciliável de cada fato interno
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ A FONTE ÚNICA DO SINAL DO EXTRATO. Nenhuma soma de lançamentos de extrato
 * passa por fora daqui.
 *
 * O `valor` do lançamento é SEMPRE positivo (normalizado no parser); quem dá o
 * sinal é a NATUREZA. Um `SUM(valor)` cru somaria débitos e créditos juntos e
 * devolveria um "saldo" que é a soma dos módulos — um número que não significa
 * nada, e que ainda por cima cresce quando o dinheiro sai.
 */
export const SINAL_NATUREZA_EXTRATO: Record<NaturezaExtratoDb, 1 | -1> = {
  CREDITO: 1,
  DEBITO: -1,
};

export interface LinhaDeExtrato {
  readonly natureza: NaturezaExtratoDb;
  readonly valor: Money;
}

/** Saldo do extrato = Σ (valor × sinal da natureza). PURA. */
export function saldoDoExtrato(linhas: readonly LinhaDeExtrato[]): Money {
  return linhas.reduce(
    (acc, l) =>
      SINAL_NATUREZA_EXTRATO[l.natureza] === 1
        ? toMoney(acc.plus(l.valor))
        : toMoney(acc.minus(l.valor)),
    toMoney("0.00")
  );
}

/** Aplica o sinal da natureza a um valor (o residual de uma linha, p.ex.). */
export function comSinalDaNatureza(
  natureza: NaturezaExtratoDb,
  valor: Money
): Money {
  return SINAL_NATUREZA_EXTRATO[natureza] === 1 ? valor : toMoney(valor.negated());
}

/** Aplica o sinal do sentido interno (ENTRADA = +, SAIDA = −). */
export function comSinalDoSentido(
  sentido: SentidoInterno,
  valor: Money
): Money {
  return sentido === "ENTRADA" ? valor : toMoney(valor.negated());
}

/**
 * ⚠️ O TETO CONCILIÁVEL DE UM PAGAMENTO É O LÍQUIDO, NÃO O BRUTO.
 *
 * Um pagamento de 6.000 com 500 retidos de INSS (M07) tira 5.500 do banco — é
 * isso, e só isso, que o extrato mostra. O retido não sumiu: ele apenas NÃO SAIU
 * ainda (sai no repasse, que tem linha bancária própria).
 *
 * PURA, e ÚNICA: o `vincular()` a usa para o limite, e a conciliação a usa para o
 * residual. Se as duas divergissem, um pagamento poderia ser "conciliável" pelo
 * serviço e aparecer como diferença no relatório — ao mesmo tempo.
 *
 * O sinal de cada retenção vem do `SINAL_MOVIMENTO_EXTRA` (M07), reusado.
 */
export function tetoConciliavelDoPagamento(
  bruto: Money,
  retencoes: readonly { readonly tipo: TipoMovimentoExtra; readonly valor: Money }[]
): Money {
  const retido = retencoes.reduce(
    (acc, r) =>
      SINAL_MOVIMENTO_EXTRA[r.tipo] === 1
        ? toMoney(acc.plus(r.valor))
        : toMoney(acc.minus(r.valor)),
    toMoney("0.00")
  );
  return toMoney(bruto.minus(retido));
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPATIBILIDADE DE NATUREZA — pura, e a razão de ser da conciliação
// ═══════════════════════════════════════════════════════════════════════════

export type NaturezaExtratoDb = "CREDITO" | "DEBITO";
export type TipoInternoConciliacao =
  | "PAGAMENTO"
  | "ARRECADACAO"
  | "MOVIMENTO_EXTRA";

/** O sentido do dinheiro no lado INTERNO. */
export type SentidoInterno = "ENTRADA" | "SAIDA";

/**
 * O sentido que cada natureza do extrato exige do lado interno.
 *
 * DÉBITO no banco = dinheiro SAIU → só casa com o que, no sistema, é SAÍDA.
 * CRÉDITO no banco = dinheiro ENTROU → só casa com ENTRADA.
 *
 * Conciliar cruzado (um crédito do banco contra um pagamento) faria o sistema
 * "explicar" uma entrada de dinheiro com uma saída — e o saldo continuaria
 * batendo em cada lado sozinho, enquanto a conciliação inteira estaria mentindo.
 */
export const SENTIDO_EXIGIDO: Record<NaturezaExtratoDb, SentidoInterno> = {
  CREDITO: "ENTRADA",
  DEBITO: "SAIDA",
};

export function exigirNaturezasCompativeis(
  natureza: NaturezaExtratoDb,
  sentidoInterno: SentidoInterno,
  descricaoInterno: string
): void {
  const exigido = SENTIDO_EXIGIDO[natureza];
  if (sentidoInterno !== exigido) {
    throw new Error(
      `NATUREZA CRUZADA: o lançamento do extrato é ${natureza} (dinheiro ` +
        `${natureza === "CREDITO" ? "ENTROU" : "SAIU"} do banco), e ${descricaoInterno} ` +
        `é ${sentidoInterno} no sistema. ${natureza} só concilia com ` +
        `${exigido}. Conciliar cruzado faria o sistema explicar uma ` +
        `${natureza === "CREDITO" ? "entrada" : "saída"} de dinheiro com uma ` +
        `${sentidoInterno === "ENTRADA" ? "entrada" : "saída"}.`
    );
  }
}

/** Quanto ainda cabe: capacidade = valor total − já vinculado (líquido). */
export function capacidadeRestante(
  valorTotal: Money,
  jaVinculado: Money
): Money {
  return toMoney(valorTotal.minus(jaVinculado));
}

export function exigirCapacidade(
  valorTotal: Money,
  jaVinculado: Money,
  valor: Money,
  lado: string
): void {
  const restante = capacidadeRestante(valorTotal, jaVinculado);
  if (valor.greaterThan(restante)) {
    throw new Error(
      `ESTOURO no ${lado}: valor ${valorTotal.toFixed(2)}, já vinculado ` +
        `${jaVinculado.toFixed(2)}, restam ${restante.toFixed(2)}, e o vínculo ` +
        `pede ${valor.toFixed(2)}. Conciliar mais do que o fato vale é casar ` +
        `dinheiro que não existe.`
    );
  }
}

export const zVincularInput = z.object({
  lancamentoExtratoId: z.string().min(1),
  tipoInterno: z.enum(["PAGAMENTO", "ARRECADACAO", "MOVIMENTO_EXTRA"]),
  internoId: z.string().min(1),
  valor: zMoney.refine((v) => v.greaterThan(0), {
    message: "Valor do vínculo deve ser > 0",
  }),
  criadoPor: z.string().min(1),
});
export type VincularInput = z.input<typeof zVincularInput>;

export const zEstornarVinculoInput = z.object({
  vinculoId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(10, "O motivo do estorno do vínculo precisa de ao menos 10 caracteres"),
  criadoPor: z.string().min(1),
});
export type EstornarVinculoInput = z.input<typeof zEstornarVinculoInput>;

export const zImportarExtratoInput = z.object({
  contaBancariaId: z.string().min(1),
  /** O conteúdo do arquivo OFX, cru. */
  arquivoOfx: z.string().min(1, "Arquivo OFX vazio."),
  importadoPor: z.string().min(1),
});
export type ImportarExtratoInput = z.input<typeof zImportarExtratoInput>;

/** Uma linha que o banco reemitiu com conteúdo diferente. */
export interface ConflitoDeLinha {
  readonly fitid: string;
  readonly hashNoBanco: string;
  readonly hashNoArquivo: string;
  readonly memoNoArquivo: string;
}

export interface ResultadoImport {
  readonly extratoId: string;
  /** O arquivo JÁ tinha sido importado: no-op idempotente, não é erro. */
  readonly jaImportado: boolean;
  readonly inseridas: number;
  /** Já existiam, com o MESMO conteúdo (extratos com período sobreposto). */
  readonly puladas: number;
  /** Sempre vazio num import bem-sucedido — conflito ABORTA a transação. */
  readonly conflitos: readonly ConflitoDeLinha[];
}

/**
 * O banco reemitiu um FITID com conteúdo diferente. NÃO se resolve sozinho: ou o
 * banco corrigiu um erro dele (e alguém precisa saber), ou o arquivo está
 * adulterado. Nos dois casos, é decisão HUMANA.
 */
export class ConflitoDeFitidError extends Error {
  constructor(readonly conflitos: readonly ConflitoDeLinha[]) {
    super(
      `Import ABORTADO: o banco reemitiu ${conflitos.length} FITID(s) com ` +
        `conteúdo DIFERENTE do que já está registrado ` +
        `(${conflitos.map((c) => c.fitid).join(", ")}). Isto não é ` +
        `reimportação — é o banco mudando o passado. NADA foi importado. ` +
        `Um humano precisa decidir: o extrato antigo estava errado, ou este ` +
        `arquivo está?`
    );
    this.name = "ConflitoDeFitidError";
  }
}
