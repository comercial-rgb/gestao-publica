"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { baixarGuiaNaTela, cancelarGuiaNaTela, registrarGuiaNaTela } from "../../../../lib/portas/recursos/obrigacoes-dos-encargos";

/**
 * AS AÇÕES DA GUIA DE RECOLHIMENTO — registrar (com o arquivo do emissor), baixar e cancelar.
 * ⚠️ NENHUMA REGRA AQUI: total que não fecha, destinatário alheio, duplicidade e guia cancelada/baixada
 * são recusas do domínio, e sobem como vieram.
 */
function camposDe(f: FormData): Record<string, string> {
  const c: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (typeof v === "string") c[k] = v;
  return c;
}

export async function registrarGuiaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const c = camposDe(formData);
    const folhaId = c["__id"] ?? "";
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Anexe o arquivo da guia emitida pelo órgão arrecadador." };
    const componentes = linhasDoFormulario(formData, "componentes", ["rotulo", "valor"]).map((l) => ({ rotulo: l["rotulo"] ?? "", valor: l["valor"] ?? "" }));
    try {
      await registrarGuiaNaTela(folhaId, c, componentes, arquivo);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a guia. Nada foi gravado.") };
    }
    revalidatePath(`/folha/folhas/${folhaId}`);
    return { sucesso: `Guia ${c["identificador"] ?? ""} registrada com o arquivo do emissor. O registro não efetua pagamento: a baixa da guia exige um pagamento já realizado.` };
  });
}

export async function baixarGuiaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const c = camposDe(formData);
    let mensagem = "";
    try {
      mensagem = await baixarGuiaNaTela(c);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível baixar a guia. Nada foi gravado.") };
    }
    revalidatePath(`/folha/folhas/${c["__id"] ?? ""}`);
    return { sucesso: mensagem };
  });
}

export async function cancelarGuiaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const c = camposDe(formData);
    let mensagem = "";
    try {
      mensagem = await cancelarGuiaNaTela(c);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cancelar a guia. Nada foi gravado.") };
    }
    revalidatePath(`/folha/folhas/${c["__id"] ?? ""}`);
    return { sucesso: mensagem };
  });
}
