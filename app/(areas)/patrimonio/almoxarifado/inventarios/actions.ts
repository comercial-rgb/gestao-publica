"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { INVENTARIOS_DE_ESTOQUE } from "../../../../../lib/portas/recursos/almoxarifado";
import { criarInventarioDeEstoque, acaoDoInventarioDeEstoque } from "../../../../../lib/portas/recursos/almoxarifado-dados";

/**
 * A Server Action deste cadastro — uma só, despachando pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO. Saldo, preço
 * médio, bloqueio vigente, cota do setor, lote obrigatório — tudo é decidido dentro da
 * transação. Parafrasear aqui criaria uma segunda explicação para a mesma recusa.
 *
 * ⚠️ E O DESPACHO É FAIL-CLOSED: `__acao` desconhecido ESTOURA em vez de cair num caminho
 * feliz que diria "salvo" sem ter gravado nada.
 */
export async function acaoDeInventariosAction(
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
      await criarInventarioDeEstoque(campos);
    } else {
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDoInventarioDeEstoque(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(INVENTARIOS_DE_ESTOQUE.rota);
  if (id !== "") revalidatePath(`${INVENTARIOS_DE_ESTOQUE.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Inventário aberto." : "Registrado." };
}
