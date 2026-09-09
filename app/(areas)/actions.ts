"use server";

import { redirect } from "next/navigation";
import { encerrarSessao } from "../../lib/portas/sessao";

/** SAIR — revoga a sessão (fato), limpa o cookie e volta ao login. Server Action (form action). */
export async function sairAction(): Promise<void> {
  await encerrarSessao();
  redirect("/login");
}
