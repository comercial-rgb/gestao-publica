"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import {
  CadastroDeResponsavelInvalidoError,
  registrarContabilista,
  registrarEmpresaGeradora,
} from "../../../../../lib/portas/responsaveis-do-manad";

export interface EstadoDoResponsavel {
  readonly erro?: string;
  readonly sucesso?: string;
}

const CAMINHO = "/contabilidade/exportacoes-federais/responsaveis";

function campo(formData: FormData, nome: string): string {
  return String(formData.get(nome) ?? "");
}

/**
 * A mensagem que chega à tela. A recusa de CADASTRO já vem escrita para quem preenche (o domínio
 * nomeia o campo e o motivo) e passa como está. A recusa de ACESSO vem escrita para quem mantém o
 * sistema (nomes de ação, de perfil) e é traduzida. O resto vai para o log do servidor e a tela
 * diz que não gravou — nunca um sucesso.
 */
function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof CadastroDeResponsavelInvalidoError) return e.message;
  if (e instanceof Error && /^ACESSO NEGADO/u.test(e.message)) {
    return "Seu perfil não permite cadastrar os responsáveis pelos arquivos federais. Solicite a permissão ao administrador do sistema.";
  }
  if (e instanceof Error && e.name === "ComandoSemChaveError") {
    return "O formulário foi enviado antes de carregar por completo. Recarregue a página e envie de novo.";
  }
  console.error(`[responsaveis-do-manad] ${e instanceof Error ? e.message : String(e)}`);
  return padrao;
}

export async function registrarContabilistaAction(
  _prev: EstadoDoResponsavel,
  formData: FormData
): Promise<EstadoDoResponsavel> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await registrarContabilista({
        nome: campo(formData, "nome"),
        cpf: campo(formData, "cpf"),
        crc: campo(formData, "crc"),
        cnpjEscritorio: campo(formData, "cnpjEscritorio"),
        dtInicio: campo(formData, "dtInicio"),
        dtFim: campo(formData, "dtFim"),
        endereco: campo(formData, "endereco"),
        numero: campo(formData, "numero"),
        complemento: campo(formData, "complemento"),
        bairro: campo(formData, "bairro"),
        cep: campo(formData, "cep"),
        uf: campo(formData, "uf"),
        fone: campo(formData, "fone"),
        email: campo(formData, "email"),
      });
      revalidatePath(CAMINHO);
      revalidatePath("/contabilidade/exportacoes-federais");
      return { sucesso: `Contabilista ${campo(formData, "nome").trim()} registrado.` };
    } catch (e) {
      return { erro: mensagemDeErro(e, "O contabilista não foi registrado. O motivo foi registrado no servidor para a equipe de suporte.") };
    }
  });
}

export async function registrarEmpresaGeradoraAction(
  _prev: EstadoDoResponsavel,
  formData: FormData
): Promise<EstadoDoResponsavel> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await registrarEmpresaGeradora({
        empresaOuTecnico: campo(formData, "empresaOuTecnico"),
        cargo: campo(formData, "cargo"),
        cnpj: campo(formData, "cnpj"),
        cpf: campo(formData, "cpf"),
        dtInicioServico: campo(formData, "dtInicioServico"),
        dtFimServico: campo(formData, "dtFimServico"),
        fone: campo(formData, "fone"),
        email: campo(formData, "email"),
      });
      revalidatePath(CAMINHO);
      revalidatePath("/contabilidade/exportacoes-federais");
      return { sucesso: `${campo(formData, "empresaOuTecnico").trim()} registrado como responsável pela geração do arquivo.` };
    } catch (e) {
      return { erro: mensagemDeErro(e, "O registro não foi gravado. O motivo foi registrado no servidor para a equipe de suporte.") };
    }
  });
}
