"use server";

import { revalidatePath } from "next/cache";
import {
  ativarUsuarioAdmin,
  concederPerfilAdmin,
  criarUsuarioAdmin,
  inativarUsuarioAdmin,
  resetarSenhaAdmin,
  revogarPerfilAdmin,
  vincularPessoaAoUsuarioAdmin,
  desvincularPessoaDoUsuarioAdmin,
} from "../../../../lib/portas/administracao";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

const ROTA = "/administracao/usuarios";

export interface EstadoUsuario {
  readonly erro?: string;
  readonly sucesso?: string;
  /** ⚠️ A senha inicial/temporária — exibida UMA vez ao admin, NUNCA logada. Ver o cabeçalho da action. */
  readonly senhaParaEntregar?: string;
}

/**
 * ⚠️ A SENHA NUNCA VAI PARA O LOG. Ela volta no ESTADO da action (a UI a mostra uma vez, para o
 * admin entregar ao servidor), mas o `comOperacaoRegistrada` audita a AÇÃO (CRIAR_USUARIO), não a
 * senha — e não há `console.log` dela em lugar nenhum. É a senha do dono, não do sistema.
 */
export async function criarUsuarioAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const nome = String(formData.get("nome") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const senhaInicial = String(formData.get("senhaInicial") ?? "");
    const perfilId = String(formData.get("perfilId") ?? "").trim();

    try {
      await criarUsuarioAdmin({ nome, email, senhaInicial, ...(perfilId !== "" ? { perfilId } : {}) });
      revalidatePath(ROTA);
      return { sucesso: `Usuário ${email} criado.`, senhaParaEntregar: senhaInicial };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível criar o usuário." };
    }
  });
}

export async function concederPerfilAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    const perfilId = String(formData.get("perfilId") ?? "").trim();
    if (perfilId === "") return { erro: "Escolha o perfil a conceder." };
    try {
      await concederPerfilAdmin({ usuarioId, perfilId });
      revalidatePath(ROTA);
      return { sucesso: "Perfil concedido." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível conceder o perfil." };
    }
  });
}

export async function revogarPerfilAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    const perfilId = String(formData.get("perfilId") ?? "").trim();
    try {
      await revogarPerfilAdmin({ usuarioId, perfilId });
      revalidatePath(ROTA);
      return { sucesso: "Perfil revogado." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível revogar o perfil." };
    }
  });
}

export async function ativarUsuarioAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    try {
      await ativarUsuarioAdmin({ usuarioId });
      revalidatePath(ROTA);
      return { sucesso: "Usuário reativado." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível reativar o usuário." };
    }
  });
}

export async function inativarUsuarioAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    try {
      const { sessoesRevogadas } = await inativarUsuarioAdmin({ usuarioId });
      revalidatePath(ROTA);
      return { sucesso: `Usuário inativado — ${sessoesRevogadas} sessão(ões) derrubada(s).` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível inativar o usuário." };
    }
  });
}

export async function resetarSenhaAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    const senhaTemporaria = String(formData.get("senhaTemporaria") ?? "");
    try {
      const { sessoesRevogadas } = await resetarSenhaAdmin({ usuarioId, senhaTemporaria });
      revalidatePath(ROTA);
      return { sucesso: `Senha redefinida — ${sessoesRevogadas} sessão(ões) do usuário derrubada(s).`, senhaParaEntregar: senhaTemporaria };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível redefinir a senha." };
    }
  });
}

/** V3 (pacote 2): vincula a pessoa do cadastro pelo DOCUMENTO — nunca pelo nome. */
export async function vincularPessoaAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    const documento = String(formData.get("documento") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (documento === "") return { erro: "Informe o CPF ou CNPJ da pessoa do cadastro." };
    try {
      const r = await vincularPessoaAoUsuarioAdmin({ usuarioId, documento, motivo });
      revalidatePath("/administracao/usuarios");
      return { sucesso: `Usuário vinculado à pessoa ${r.nome}. O vínculo não concede permissão nenhuma.` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível vincular." };
    }
  });
}

export async function desvincularPessoaAction(_prev: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  return comComandoDoFormulario(formData, async () => {
    const usuarioId = String(formData.get("usuarioId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    try {
      await desvincularPessoaDoUsuarioAdmin({ usuarioId, motivo });
      revalidatePath("/administracao/usuarios");
      return { sucesso: "Vínculo desfeito — a linha anterior fica no histórico." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível desvincular." };
    }
  });
}
