"use server";

import { redirect } from "next/navigation";
import { entrar } from "../../lib/portas/sessao";

export interface EstadoLogin {
  readonly erro?: string;
}

/** Server Action do login: autentica pela porta; sucesso → redirect ao retorno; falha → mensagem. */
export async function entrarAction(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const identificador = String(formData.get("identificador") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const retornoBruto = String(formData.get("retorno") ?? "/");
  // só caminhos internos (evita open-redirect): tem de começar com "/" e não "//".
  const retorno = retornoBruto.startsWith("/") && !retornoBruto.startsWith("//") ? retornoBruto : "/";

  if (identificador === "" || senha === "") {
    return { erro: "Informe usuário e senha." };
  }

  const r = await entrar({ identificador, senha });
  if (!r.ok) return { erro: r.erro };
  redirect(retorno);
}
