import type { Tx } from "../m16-travamento/autorizacao.js";

/**
 * A RECEITA DA ALIENAÇÃO, PELO NÚMERO (V3, pacote 2).
 *
 * ═══ POR QUE PELO NÚMERO, E NÃO POR UM SELETOR ═══
 * O operador que aliena um bem tem em mãos a GUIA da venda: exercício e número da receita.
 * Um `select` com todas as arrecadações do exercício seria um formulário bonito e inútil — e
 * o padrão de entrega proíbe pedir UUID ao operador. A guia é única no exercício por tipo
 * (`uq_receita_guia`), então (exercício, número, ARRECADACAO) aponta para UMA linha.
 *
 * ⚠️ ISTO SÓ ACHA. Quem decide se a receita SUSTENTA a alienação (viva, não anulada, origem
 * 2.2 — alienação de bens) é `alienarBem`, dentro da transação, e a mensagem sobe como veio.
 * Repetir a regra aqui criaria a segunda explicação para a mesma recusa.
 */
export interface ReceitaAchada {
  readonly id: string;
  readonly numeroReceita: string;
  readonly exercicio: number;
  readonly valor: string;
  readonly dataArrecadacao: Date;
  readonly natureza: string;
}

export async function receitaArrecadadaPorNumero(
  tx: Tx,
  pedido: { readonly exercicio: number; readonly numeroReceita: string }
): Promise<ReceitaAchada> {
  const numero = pedido.numeroReceita.trim();
  if (numero === "" || !Number.isInteger(pedido.exercicio)) {
    throw new Error(
      `RECEITA NÃO IDENTIFICADA: informe o exercício e o número da receita arrecadada (a guia da venda). Nada foi gravado.`
    );
  }
  const r = await tx.receitaArrecadada.findUnique({
    where: { uq_receita_guia: { exercicio: pedido.exercicio, numeroReceita: numero, tipo: "ARRECADACAO" } },
    select: {
      id: true,
      numeroReceita: true,
      exercicio: true,
      valor: true,
      dataArrecadacao: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });
  if (r === null) {
    throw new Error(
      `RECEITA NÃO ENCONTRADA: não há arrecadação nº "${numero}" no exercício ${pedido.exercicio}. ` +
        `A alienação se apoia numa receita já ARRECADADA (Receita > Arrecadações); confira o ` +
        `exercício e o número da guia. Nada foi gravado.`
    );
  }
  return {
    id: r.id,
    numeroReceita: r.numeroReceita,
    exercicio: r.exercicio,
    valor: r.valor.toFixed(2),
    dataArrecadacao: r.dataArrecadacao,
    natureza: r.naturezaReceita.codigo,
  };
}
