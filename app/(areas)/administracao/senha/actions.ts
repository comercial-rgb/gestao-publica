"use server";

import { redirect } from "next/navigation";
import { trocarPropriaSenha } from "../../../../lib/portas/administracao";

export interface EstadoSenha {
  readonly erro?: string;
}

/** Troca a própria senha. Sucesso → o domínio revoga TODAS as sessões, então volta ao login. */
export async function trocarSenhaAction(_prev: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const nova = String(formData.get("nova") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");
  if (nova !== confirmar) return { erro: "A confirmação não corresponde à nova senha." };

  try {
    await trocarPropriaSenha(nova);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível trocar a senha." };
  }
  // a sessão atual também foi revogada — reautenticar com a nova senha.
  redirect("/login");
}
