"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { GRUPOS_DE_MATERIAL } from "../../../../../lib/portas/recursos/almoxarifado";
import { criarGrupoDeMaterial, semAcaoDeDetalhe } from "../../../../../lib/portas/recursos/almoxarifado-dados";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
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
export async function acaoDeGruposAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";

    try {
      if (acao === "criar") {
        await criarGrupoDeMaterial(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await semAcaoDeDetalhe(acao);
      }
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao gravar. Nada foi gravado." };
    }

    revalidatePath(GRUPOS_DE_MATERIAL.rota);
    if (id !== "") revalidatePath(`${GRUPOS_DE_MATERIAL.rota}/${id}`);
    return { sucesso: acao === "criar" ? "Grupo cadastrado." : "Registrado." };
  });
}
