"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";

/**
 * SELETOR de PERÍODO (e conta, opcional) dos livros — ilha client. O dado mora na URL; ao aplicar,
 * empurra `?desde=&ate=&conta=` e o Server Component re-consulta a porta.
 */
const CLASSE = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export function SeletorPeriodo({ desde, ate, conta, comConta }: { readonly desde: string; readonly ate: string; readonly conta?: string; readonly comConta?: boolean }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [d, setD] = useState(desde);
  const [a, setA] = useState(ate);
  const [c, setC] = useState(conta ?? "");

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    p.set("desde", d);
    p.set("ate", a);
    if (comConta === true) {
      if (c.trim() !== "") p.set("conta", c.trim());
      else p.delete("conta");
    }
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-chrome>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">De</span>
        <input type="date" aria-label="Data inicial" className={CLASSE} value={d} onChange={(e) => setD(e.target.value)} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Até</span>
        <input type="date" aria-label="Data final" className={CLASSE} value={a} onChange={(e) => setA(e.target.value)} />
      </label>
      {comConta === true ? (
        // V38 (AUD-067) — a conta pela busca (código ou nome), como no lançamento manual. A conta já na URL é conferida
        // pelo mesmo catálogo antes de virar escolha.
        <div className="w-80 text-xs" data-conta-do-razao>
          <CampoReferenciado
            name="conta"
            rotulo="Conta"
            catalogo="contas-do-razao"
            placeholder="Código ou nome da conta"
            {...(conta !== undefined && conta !== "" ? { valorInicial: conta } : {})}
            aoEscolher={(o) => setC(o?.valor ?? "")}
          />
        </div>
      ) : null}
      <button type="button" onClick={aplicar} className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 text-sm font-medium text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]">Aplicar</button>
    </div>
  );
}
