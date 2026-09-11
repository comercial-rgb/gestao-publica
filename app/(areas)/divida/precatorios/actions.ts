"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { PRECATORIOS } from "../../../../lib/portas/recursos/definicoes";
import { acaoDoPrecatorio, criarPrecatorio } from "../../../../lib/portas/recursos/dados";

/**
 * A SERVER ACTION DO CADASTRO DE PRECATORIOS — uma só, e ela despacha pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO. Saldo do termo,
 * empenho obrigatório para o concedente, idempotência da parcela, período aberto — tudo é
 * decidido dentro da transação. Parafrasear aqui criaria uma segunda explicação para a mesma
 * recusa, e as duas divergiriam no dia em que o guard aprendesse um caso novo.
 *
 * ⚠️ E O DESPACHO É FAIL-CLOSED: `__acao` desconhecido ESTOURA, em vez de cair num caminho
 * feliz que diria "salvo" sem ter gravado nada.
 */
export async function acaoDePrecatorioAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  const acao = campos["__acao"] ?? "";
  const id = campos["__id"] ?? "";

  try {
    if (acao === "criar") {
      await criarPrecatorio(campos);
    } else {
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDoPrecatorio(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(PRECATORIOS.rota);
  if (id !== "") revalidatePath(`${PRECATORIOS.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Precatório cadastrado." : "Movimento registrado." };
}
