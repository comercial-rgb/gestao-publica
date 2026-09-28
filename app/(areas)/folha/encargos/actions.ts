"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { ENCARGOS_DA_FOLHA } from "../../../../lib/portas/recursos/encargos";
import { acaoDoComponenteDeEncargo, criarComponenteDeEncargo, criarGrupoDosEncargos, criarVersaoDoEncargo } from "../../../../lib/portas/recursos/encargos-dados";

/**
 * AS SERVER ACTIONS DOS ENCARGOS — componente (molde), versão (ilha: rubricas da base), aprovação
 * (molde) e o grupo de empenho dos encargos (ilha).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: autoaprovação, desconto na base, versão ambígua e componente já
 * em outro grupo são recusas do domínio, e sobem COMO VIERAM.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
  return campos;
}

export async function encargosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    let mensagem = "";
    try {
      if (acao === "criar") {
        const novo = await criarComponenteDeEncargo(campos);
        mensagem = `Componente cadastrado. Abra em ${ENCARGOS_DA_FOLHA.rota}/${novo} para cadastrar a versão com alíquota, base e fundamento.`;
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        mensagem = await acaoDoComponenteDeEncargo(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(ENCARGOS_DA_FOLHA.rota);
    if (id !== "") revalidatePath(`${ENCARGOS_DA_FOLHA.rota}/${id}`);
    return { sucesso: mensagem };
  });
}

export async function versaoDoEncargoAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const componenteId = campos["__id"] ?? "";
    const rubricas = linhasDoFormulario(formData, "rubricas", ["id"]).map((l) => l["id"] ?? "").filter((x) => x !== "");
    if (rubricas.length === 0) return { erro: "Marque ao menos uma rubrica para compor a base de cálculo. Nada foi gravado." };
    try {
      await criarVersaoDoEncargo(componenteId, campos, rubricas);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar a versão. Nada foi gravado.") };
    }
    revalidatePath(`${ENCARGOS_DA_FOLHA.rota}/${componenteId}`);
    return { sucesso: `Versão a partir de ${campos["competenciaInicio"] ?? ""} cadastrada, aguardando aprovação por outro usuário. Até a aprovação, ela não é considerada em nenhuma apuração.` };
  });
}

export async function grupoDosEncargosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const componentes = linhasDoFormulario(formData, "componentes", ["id"]).map((l) => l["id"] ?? "").filter((x) => x !== "");
    if (componentes.length === 0) return { erro: "Marque ao menos um componente de encargo. Nada foi gravado." };
    try {
      await criarGrupoDosEncargos(campos, componentes);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar o grupo dos encargos. Nada foi gravado.") };
    }
    revalidatePath("/folha/grupos-de-empenho");
    revalidatePath(ENCARGOS_DA_FOLHA.rota);
    return { sucesso: `Grupo de encargos ${campos["codigo"] ?? ""} cadastrado com ${componentes.length} componente(s), com empenho único para o credor informado.` };
  });
}
