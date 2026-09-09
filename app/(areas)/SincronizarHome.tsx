"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUiContext } from "../../lib/ui-context";

/**
 * SINCRONIA UiContext → URL (ilha client, não renderiza nada).
 *
 * A home é Server Component (lê as portas), e o exercício/ do painel vem do UiContext (o mesmo do
 * cabeçalho). Server Component não lê contexto client — então esta ilha faz a ponte: quando o
 * exercício do contexto muda, ela empurra `?exercicio=` para a URL, e o servidor re-renderiza os
 * cards com o número certo. Sem flash de dado velho: só navega quando de fato diverge.
 */
export function SincronizarHome(): null {
  const router = useRouter();
  const params = useSearchParams();
  const { exercicio } = useUiContext();

  useEffect(() => {
    const naUrl = params.get("exercicio");
    if (naUrl !== String(exercicio)) {
      const q = new URLSearchParams(params.toString());
      q.set("exercicio", String(exercicio));
      router.replace(`/?${q.toString()}`);
    }
  }, [exercicio, params, router]);

  return null;
}
