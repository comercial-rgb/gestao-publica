"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { SERVICOS_DA_CARTA } from "../../../../lib/portas/recursos/servicos-da-carta";
import { acaoDoServicoDaCarta, criarServicoDaCarta, criarVersaoDoServicoDaCarta } from "../../../../lib/portas/recursos/servicos-da-carta-dados";

/**
 * AS AÇÕES DA CONFIGURAÇÃO DA CARTA — serviço (molde), versão (ilha: a lista de campos) e publicação
 * (barra). ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: o caso de uso recusa formulário fora do vocabulário, campo
 * fora do cadastro, prazo sem fundamento e versão já publicada, nomeando.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
  return campos;
}

export async function servicosDaCartaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    let mensagem = "";
    try {
      if (acao === "criar") {
        const novo = await criarServicoDaCarta(campos);
        mensagem = `Serviço cadastrado, ainda FORA DA CARTA. Abra em ${SERVICOS_DA_CARTA.rota}/${novo} para cadastrar a versão com o formulário e publicá-la.`;
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        mensagem = await acaoDoServicoDaCarta(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(SERVICOS_DA_CARTA.rota);
    if (id !== "") revalidatePath(`${SERVICOS_DA_CARTA.rota}/${id}`);
    revalidatePath("/servicos");
    return { sucesso: mensagem };
  });
}

export async function versaoDoServicoAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const servicoId = campos["__id"] ?? "";
    const linhas = linhasDoFormulario(formData, "campos", ["nome", "rotulo", "tipo", "obrigatorio"], ["nome", "rotulo"]).map((l) => ({ nome: l["nome"] ?? "", rotulo: l["rotulo"] ?? "", tipo: l["tipo"] ?? "", obrigatorio: l["obrigatorio"] ?? "" }));
    let numero = 0;
    try {
      numero = await criarVersaoDoServicoDaCarta(servicoId, campos, linhas);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar a versão. Nada foi gravado.") };
    }
    revalidatePath(`${SERVICOS_DA_CARTA.rota}/${servicoId}`);
    return { sucesso: `Versão ${numero} cadastrada em RASCUNHO. A carta continua mostrando a versão publicada até você publicar esta.` };
  });
}
