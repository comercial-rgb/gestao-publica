"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";

export function FiltroAuditoria({ usuario, acao, resultado, desde, ate }: { readonly usuario: string; readonly acao: string; readonly resultado: string; readonly desde: string; readonly ate: string }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [u, setU] = useState(usuario);
  const [a, setA] = useState(acao);
  const [r, setR] = useState(resultado);
  const [d, setD] = useState(desde);
  const [t, setT] = useState(ate);

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of [["usuario", u], ["acao", a], ["resultado", r], ["desde", d], ["ate", t]] as const) {
      if (v.trim() !== "") p.set(k, v.trim()); else p.delete(k);
    }
    p.delete("pagina"); // novo filtro volta à página 1
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-4" data-chrome>
      <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Usuário</span><input className={`${CAMPO} w-40`} value={u} onChange={(e) => setU(e.target.value)} placeholder="parte do e-mail" /></label>
      <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Ação</span><input className={`${CAMPO} w-36`} value={a} onChange={(e) => setA(e.target.value)} placeholder="LOGIN, EMPENHAR…" /></label>
      <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Resultado</span>
        <select className={CAMPO} value={r} onChange={(e) => setR(e.target.value)}>
          <option value="">todos</option><option value="SUCESSO">sucesso</option><option value="NEGADO">negado</option><option value="ERRO">erro</option>
        </select></label>
      <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>De</span><input type="date" className={CAMPO} value={d} onChange={(e) => setD(e.target.value)} /></label>
      <label className="text-xs text-[color:var(--color-ink-2)]"><span className={ROTULO}>Até</span><input type="date" className={CAMPO} value={t} onChange={(e) => setT(e.target.value)} /></label>
      <button type="button" onClick={aplicar} className={CLASSE_BOTAO_PRIMARIO}>Filtrar</button>
    </div>
  );
}
