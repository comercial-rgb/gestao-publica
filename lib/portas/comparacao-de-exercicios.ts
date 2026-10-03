import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import {
  compararExercicios,
  ROTULO_AGRUPAMENTO_DESPESA,
  ROTULO_AGRUPAMENTO_RECEITA,
  type AgrupamentoDaDespesa,
  type AgrupamentoDaReceita,
  type ComparacaoDeExercicios,
} from "../../modules/m02-planejamento/comparacao-de-exercicios";

/**
 * A PORTA DA COMPARAÇÃO DE EXERCÍCIOS (V31) — leitura do ENTE (CONSULTAR_PLANEJAMENTO), como a
 * proposta: a comparação reúne as fichas de todas as unidades.
 *
 * ⚠️ O PEDIDO VEM DA URL E É CONFERIDO AQUI: exercício que não existe é recusado com o motivo, e
 * agrupamento fora do rol cai no padrão. A URL escolhe o recorte; não amplia o acesso.
 */

export { PortaSemBancoError, ROTULO_AGRUPAMENTO_DESPESA, ROTULO_AGRUPAMENTO_RECEITA };
export type { ComparacaoDeExercicios, AgrupamentoDaDespesa, AgrupamentoDaReceita };

export class ComparacaoInvalidaError extends Error {
  override readonly name = "ComparacaoInvalidaError";
}

export interface PedidoDeComparacao {
  readonly exercicioA: number;
  readonly exercicioB: number;
  readonly lado: "despesa" | "receita";
  readonly agrupamento: AgrupamentoDaDespesa | AgrupamentoDaReceita;
}

/** Interpreta a URL contra os exercícios cadastrados. Padrão: o exercício do contexto contra o anterior. */
export function pedidoDaUrl(
  sp: Readonly<Record<string, string | string[] | undefined>>,
  anos: readonly number[]
): PedidoDeComparacao {
  const um = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const lado = um("lado") === "receita" ? "receita" : "despesa";
  const por = um("por") ?? "";
  const agrupamento =
    lado === "despesa"
      ? ((Object.hasOwn(ROTULO_AGRUPAMENTO_DESPESA, por) ? por : "unidade") as AgrupamentoDaDespesa)
      : ((Object.hasOwn(ROTULO_AGRUPAMENTO_RECEITA, por) ? por : "natureza") as AgrupamentoDaReceita);
  const ctx = Number(um("exercicio") ?? "");
  const b = Number(um("b") ?? (anos.includes(ctx) ? ctx : (anos[0] ?? 0)));
  const a = Number(um("a") ?? b - 1);
  return { exercicioA: a, exercicioB: b, lado, agrupamento };
}

export async function lerExerciciosComparaveis(): Promise<readonly number[]> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  return (await cliente().exercicio.findMany({ select: { ano: true }, orderBy: { ano: "desc" } })).map((e) => e.ano);
}

export async function lerComparacao(pedido: PedidoDeComparacao, anos: readonly number[]): Promise<ComparacaoDeExercicios> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  for (const ano of [pedido.exercicioA, pedido.exercicioB]) {
    if (!anos.includes(ano)) throw new ComparacaoInvalidaError(`O exercício ${String(ano)} não está cadastrado. Escolha entre ${anos.join(", ")}.`);
  }
  if (pedido.exercicioA === pedido.exercicioB) throw new ComparacaoInvalidaError("Escolha dois exercícios diferentes para comparar.");
  return compararExercicios(cliente(), pedido);
}
