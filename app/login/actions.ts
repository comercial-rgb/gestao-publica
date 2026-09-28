"use server";

import { redirect } from "next/navigation";
import { entrar } from "../../lib/portas/sessao";

export interface EstadoLogin {
  /** A recusa geral (credencial, indisponibilidade) — uma mensagem só, de timing uniforme. */
  readonly erro?: string;
  /** Os erros POR CAMPO, quando cabem: campo vazio é do campo, não da credencial. */
  readonly erros?: { readonly identificador?: string; readonly senha?: string };
  /** O identificador digitado, devolvido para a tarefa não se perder na recusa. */
  readonly identificador?: string;
}

/** Server Action do login: autentica pela porta; sucesso → redirect ao retorno; falha → mensagem. */
export async function entrarAction(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const identificador = String(formData.get("identificador") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const retornoBruto = String(formData.get("retorno") ?? "/");
  // só caminhos internos (evita open-redirect): tem de começar com "/" e não "//".
  const retorno = retornoBruto.startsWith("/") && !retornoBruto.startsWith("//") ? retornoBruto : "/";

  const erros: { identificador?: string; senha?: string } = {};
  if (identificador === "") erros.identificador = "Informe seu usuário.";
  if (senha === "") erros.senha = "Informe sua senha.";
  if (erros.identificador !== undefined || erros.senha !== undefined) {
    return { erros, identificador };
  }

  const r = await entrar({ identificador, senha });
  if (!r.ok) return { erro: r.erro, identificador };
  redirect(retorno);
}
