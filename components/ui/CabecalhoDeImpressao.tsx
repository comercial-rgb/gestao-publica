"use client";

import { useEffect, useState } from "react";
import { UG_CONSOLIDADO, useUiContext } from "../../lib/ui-context";

/**
 * V33 — O CABEÇALHO DO PAPEL QUANDO A TELA É IMPRESSA PELO NAVEGADOR. Invisível na tela; no papel diz o ente, o
 * exercício, a unidade escolhida e a data e hora da emissão (no horário do ente), e — fora da produção — que é
 * documento de demonstração. O título e os filtros são os da própria página, que vão impressos logo abaixo.
 *
 * ⚠️ A HORA É A DO MOMENTO DA IMPRESSÃO (`beforeprint`), não a da carga da página: quem deixa a aba aberta e imprime
 * à tarde não pode levar no papel a hora da manhã.
 */
const agora = (): string =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

export function CabecalhoDeImpressao({ ente, rotuloDoAmbiente }: { readonly ente: string | null; readonly rotuloDoAmbiente: string | null }): React.ReactElement {
  const { exercicio, ug, ugsDisponiveis } = useUiContext();
  const unidade = ug === UG_CONSOLIDADO ? "consolidado do ente" : `unidade ${ug} — ${ugsDisponiveis.find((u) => u.codigo === ug)?.nome ?? ""}`;
  const [emitidoEm, setEmitidoEm] = useState<string>("");
  useEffect(() => {
    setEmitidoEm(agora());
    const antes = (): void => setEmitidoEm(agora());
    window.addEventListener("beforeprint", antes);
    return () => window.removeEventListener("beforeprint", antes);
  }, []);
  return (
    <div className="cabecalho-de-impressao" aria-hidden="true" data-cabecalho-de-impressao>
      {rotuloDoAmbiente !== null ? <p className="aviso">Documento de demonstração — sem valor oficial</p> : null}
      <p className="ente">{ente ?? "Ente não configurado"}</p>
      <p>
        Exercício {exercicio} · {unidade} · emitido em {emitidoEm} (horário de Brasília)
      </p>
    </div>
  );
}
