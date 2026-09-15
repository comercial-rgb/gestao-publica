"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * ═══ O RESULTADO QUE SOBREVIVE AO FORMULÁRIO ═══
 *
 * Um ato que muda a página (emitir, receber, confirmar uma prévia, medir) faz a recarga deixar de oferecer o formulário
 * que o disparou — e, com ele, sumiria a mensagem do que foi gravado. Cada formulário (a instância) se registra no
 * provedor, que fica acima dos formulários e que a recarga não desmonta, e publica o resultado quando a action responde;
 * `AvisosDosAtos` mostra o aviso no topo SÓ quando aquela instância não está mais na página — enquanto está, a mensagem
 * fica junto dos campos.
 *
 * Medido duas vezes antes de virar componente: a ponte do contrato (candidato 208246f, sete atos sem mensagem) e a
 * confirmação da prévia da planilha da obra (candidato 8ed0806, passo 2.2). Sem provedor na árvore, o formulário
 * funciona como antes (a publicação é ignorada).
 */

interface AvisoDoAto { readonly acao: string; readonly instancia: string; readonly tipo: "ok" | "erro"; readonly texto: string; readonly seq: number; readonly link?: { readonly href: string; readonly rotulo: string } }
interface Resultados {
  readonly publicar: (aviso: Omit<AvisoDoAto, "seq">) => void;
  readonly montar: (instancia: string) => () => void;
  readonly avisos: readonly AvisoDoAto[];
  readonly montados: Readonly<Record<string, number>>;
}
const ContextoDosResultados = createContext<Resultados | null>(null);

export function ResultadosDosAtos({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const [avisos, setAvisos] = useState<readonly AvisoDoAto[]>([]);
  const [montados, setMontados] = useState<Readonly<Record<string, number>>>({});
  const seq = useRef(0);
  const acoes = useMemo(() => ({
    publicar: (aviso: Omit<AvisoDoAto, "seq">) => {
      seq.current += 1;
      const n = seq.current;
      setAvisos((xs) => [...xs.filter((x) => x.acao !== aviso.acao), { ...aviso, seq: n }]);
    },
    montar: (instancia: string) => {
      setMontados((m) => ({ ...m, [instancia]: 1 }));
      return () => setMontados((m) => ({ ...m, [instancia]: 0 }));
    },
  }), []);
  return <ContextoDosResultados.Provider value={{ ...acoes, avisos, montados }}>{children}</ContextoDosResultados.Provider>;
}

export function AvisosDosAtos(): React.ReactElement | null {
  const ctx = useContext(ContextoDosResultados);
  const visiveis = (ctx?.avisos ?? []).filter((a) => (ctx?.montados[a.instancia] ?? 0) === 0);
  return (
    <div aria-live="polite" data-avisos-dos-atos className={visiveis.length === 0 ? "hidden" : "space-y-2"}>
      {visiveis.map((a) => (
        <p key={a.acao} role={a.tipo === "erro" ? "alert" : "status"} data-resultado-da-acao={a.acao} data-resultado-seq={a.seq}
          className={a.tipo === "erro" ? "whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]" : "rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"}>
          {a.texto}
          {a.link === undefined ? null : <> <a href={a.link.href} className="font-semibold underline underline-offset-2">{a.link.rotulo}</a></>}
        </p>
      ))}
    </div>
  );
}

/**
 * A instância do formulário no provedor: registra-se enquanto montada e devolve `publicar`, a chamar DENTRO da função
 * do `useActionState`, quando a action responde — antes de a recarga decidir se o formulário continua na página.
 */
export function useResultadoDoAto(acao: string): (tipo: "ok" | "erro", texto: string, link?: { readonly href: string; readonly rotulo: string }) => void {
  const ctx = useContext(ContextoDosResultados);
  const publicar = ctx?.publicar;
  const montar = ctx?.montar;
  const instancia = useId();
  useEffect(() => montar?.(instancia), [montar, instancia]);
  return (tipo, texto, link) => publicar?.({ acao, instancia, tipo, texto, ...(link === undefined ? {} : { link }) });
}
