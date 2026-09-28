"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import {
  ClassificacaoDoManadInvalidaError,
  classificarParaOManad,
  declararCentralizacao,
  type GrupoClassificavel,
} from "../../../../../lib/portas/classificacao-do-manad";

export interface EstadoDaClassificacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const CAMINHO = "/contabilidade/exportacoes-federais/classificacao";
const GRUPOS: readonly GrupoClassificavel[] = ["unidade", "acao", "natureza-despesa", "natureza-receita"];

function campo(formData: FormData, nome: string): string {
  return String(formData.get(nome) ?? "");
}

/**
 * A mensagem que chega à tela. A recusa de cadastro já vem escrita para quem preenche; a de
 * acesso é traduzida; o resto vai para o log do servidor e a tela diz que não gravou.
 */
function mensagemDeErro(e: unknown): string {
  if (e instanceof ClassificacaoDoManadInvalidaError) return e.message;
  if (e instanceof Error && e.name === "CadastroDeResponsavelInvalidoError") return e.message;
  if (e instanceof Error && /^ACESSO NEGADO/u.test(e.message)) {
    return "Seu perfil não permite classificar o cadastro para o arquivo da Receita. Solicite a permissão ao administrador do sistema.";
  }
  if (e instanceof Error && e.name === "ComandoSemChaveError") {
    return "O formulário foi enviado antes de carregar por completo. Recarregue a página e envie de novo.";
  }
  console.error(`[classificacao-do-manad] ${e instanceof Error ? e.message : String(e)}`);
  return "A classificação não foi gravada. O motivo foi registrado no servidor para a equipe de suporte.";
}

export async function classificarAction(_prev: EstadoDaClassificacao, formData: FormData): Promise<EstadoDaClassificacao> {
  return comComandoDoFormulario(formData, async () => {
    const grupo = campo(formData, "grupo") as GrupoClassificavel;
    if (!GRUPOS.includes(grupo)) return { erro: "Formulário inválido. Recarregue a página e tente de novo." };
    try {
      const r = await classificarParaOManad(grupo, { id: campo(formData, "id"), tipo: campo(formData, "tipo"), nivel: campo(formData, "nivel") });
      revalidatePath(CAMINHO);
      revalidatePath("/contabilidade/exportacoes-federais");
      return { sucesso: r.anterior === null ? "Classificação gravada." : `Classificação alterada de ${r.anterior} para ${r.atual}.` };
    } catch (e) {
      return { erro: mensagemDeErro(e) };
    }
  });
}

export async function declararCentralizacaoAction(_prev: EstadoDaClassificacao, formData: FormData): Promise<EstadoDaClassificacao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const r = await declararCentralizacao(campo(formData, "indicador"));
      revalidatePath(CAMINHO);
      revalidatePath("/contabilidade/exportacoes-federais/responsaveis");
      revalidatePath("/contabilidade/exportacoes-federais");
      return { sucesso: r.anterior === r.atual ? "Forma de escrituração mantida." : "Forma de escrituração gravada." };
    } catch (e) {
      return { erro: mensagemDeErro(e) };
    }
  });
}
