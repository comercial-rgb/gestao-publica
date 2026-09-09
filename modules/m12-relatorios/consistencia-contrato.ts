import { toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * O CONTRATO DO RELATÓRIO DE CONSISTÊNCIA (7.16) — os tipos e os visitadores da tríade.
 *
 * ⚠️ EXTRAÍDO NA 7.17 para que o motor da LOA (`consistencia-loa.ts`) produza `Verificacao[]` sem
 * ciclo com `consistencia.ts` (que orquestra os escopos). Um contrato, dois produtores.
 *
 * A tríade é a alma: OK (bate) · DIVERGE (não bate, com os dois lados) · SEM_DADO (não há o que
 * verificar — cadastro ausente/motor inexistente). SEM_DADO NUNCA se disfarça de OK.
 */

export type ResultadoVerificacao = "OK" | "DIVERGE" | "SEM_DADO";
export type EscopoConsistencia = "MENSAL" | "PLANEJAMENTO" | "ANUAL";

export interface Verificacao {
  readonly chave: string;
  readonly titulo: string;
  readonly escopo: EscopoConsistencia;
  readonly resultado: ResultadoVerificacao;
  readonly esquerda: string;
  readonly direita: string;
  readonly diferenca: string;
  readonly fonte: string;
  readonly fonteHref: string;
  readonly detalhe?: string;
}

/** O cabeçalho de uma verificação — tudo menos o veredito e os números. */
export type BaseVerificacao = Omit<Verificacao, "resultado" | "esquerda" | "direita" | "diferenca" | "detalhe">;

export function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * ⚠️ A DISTINÇÃO QUE A TRÍADE EXIGE: um dono fail-closed estoura por DOIS motivos, e eles pedem
 * veredictos OPOSTOS. "Conta órfã / mapeie a linha" é CADASTRO AUSENTE → SEM_DADO. "Ativo ≠ Passivo"
 * é os números NÃO baterem → DIVERGE. Jogar os dois em DIVERGE gritaria "erro!" quando falta cadastro.
 */
export function classificarErro(msg: string): "SEM_DADO" | "DIVERGE" {
  return /ÓRFÃ|órf|mapeie|não casa com nenhuma linha|sem cadastro|não mapeada|nenhuma linha do|não semead|de-para vazi/i.test(msg)
    ? "SEM_DADO"
    : "DIVERGE";
}

/** Visita uma identidade de IGUALDADE (esq == dir); compara sem recomputar. */
export async function medir(
  base: BaseVerificacao,
  fn: () => Promise<{ readonly esq: Money; readonly dir: Money; readonly detalhe?: string }>
): Promise<Verificacao> {
  try {
    const { esq, dir, detalhe } = await fn();
    const dif = toMoney(esq.minus(dir));
    return {
      ...base,
      resultado: dif.isZero() ? "OK" : "DIVERGE",
      esquerda: esq.toFixed(2),
      direita: dir.toFixed(2),
      diferenca: dif.toFixed(2),
      ...(detalhe !== undefined ? { detalhe } : {}),
    };
  } catch (e) {
    const msg = mensagem(e);
    return { ...base, resultado: classificarErro(msg), esquerda: "—", direita: "—", diferenca: "—", detalhe: msg };
  }
}

/**
 * Visita um limite de PISO (mínimo constitucional): OK quando o aplicado (esq) ATINGE o mínimo
 * (dir). Abaixo do mínimo é DIVERGE — "insuficiente", mas o campo é o mesmo. A diferença negativa é
 * o quanto falta.
 */
export async function medirPiso(
  base: BaseVerificacao,
  fn: () => Promise<{ readonly aplicado: Money; readonly minimo: Money; readonly detalhe?: string }>
): Promise<Verificacao> {
  try {
    const { aplicado, minimo, detalhe } = await fn();
    const dif = toMoney(aplicado.minus(minimo));
    return {
      ...base,
      resultado: dif.greaterThanOrEqualTo(0) ? "OK" : "DIVERGE",
      esquerda: aplicado.toFixed(2),
      direita: minimo.toFixed(2),
      diferenca: dif.toFixed(2),
      ...(detalhe !== undefined ? { detalhe } : {}),
    };
  } catch (e) {
    const msg = mensagem(e);
    return { ...base, resultado: classificarErro(msg), esquerda: "—", direita: "—", diferenca: "—", detalhe: msg };
  }
}

/** Uma verificação de GERAÇÃO fail-closed: o dono estoura se não fecha; gerar == OK. */
export async function verificarGeracao(base: BaseVerificacao, fn: () => Promise<void>): Promise<Verificacao> {
  try {
    await fn();
    return { ...base, resultado: "OK", esquerda: "fecha", direita: "fecha", diferenca: "0.00" };
  } catch (e) {
    const msg = mensagem(e);
    return { ...base, resultado: classificarErro(msg), esquerda: "—", direita: "—", diferenca: "—", detalhe: msg };
  }
}

/** Um SEM_DADO explícito — o interruptor nomeado (nada a verificar). */
export function semDado(base: BaseVerificacao, detalhe: string): Verificacao {
  return { ...base, resultado: "SEM_DADO", esquerda: "—", direita: "—", diferenca: "—", detalhe };
}
