"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";

/**
 * OS FILTROS DO 4.40 — ilha client mínima, no padrão do `FiltroAuditoria`: escreve na URL e deixa
 * o Server Component reler.
 *
 * ⚠️ O FILTRO MORA NA URL, e isso não é detalhe de implementação. Um filtro guardado só no estado
 * do componente não sobrevive ao "Imprimir PDF" (que é uma ROTA, não um clique no React) nem ao
 * link colado num e-mail. Como ele está na query string, o PDF, o CSV e a tela mostram
 * necessariamente o MESMO recorte — e é isso que permite conferir um contra o outro.
 *
 * ⚠️ SELECTS, NÃO CAMPOS LIVRES. As opções vêm das linhas que existem no exercício (ver
 * `opcoesDeFiltro`): toda escolha rende ao menos uma linha, e ninguém digita uma fonte que não
 * existe e conclui "não houve crédito nessa fonte".
 */
export interface OpcoesFiltroProps {
  readonly fichas: readonly string[];
  readonly decretos: readonly string[];
  readonly fontes: readonly string[];
  readonly unidades: readonly string[];
  readonly ficha: string;
  readonly decreto: string;
  readonly fonte: string;
  readonly unidade: string;
}

export function FiltroAtualizacoes(p: OpcoesFiltroProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [ficha, setFicha] = useState(p.ficha);
  const [decreto, setDecreto] = useState(p.decreto);
  const [fonte, setFonte] = useState(p.fonte);
  const [unidade, setUnidade] = useState(p.unidade);

  const aplicar = (): void => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of [["ficha", ficha], ["decreto", decreto], ["fonte", fonte], ["unidade", unidade]] as const) {
      if (v.trim() !== "") q.set(k, v.trim());
      else q.delete(k);
    }
    router.push(`${pathname}?${q.toString()}`);
  };

  const campo = (
    rotulo: string,
    valor: string,
    setar: (v: string) => void,
    opcoes: readonly string[],
    prefixo: string
  ): React.ReactElement => (
    <label className="text-xs text-[color:var(--color-ink-2)]">
      <span className={ROTULO}>{rotulo}</span>
      <select aria-label={rotulo} className={`${CAMPO} w-36`} value={valor} onChange={(e) => setar(e.target.value)}>
        <option value="">todas</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{prefixo}{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-3" data-chrome>
      {campo("Ficha", ficha, setFicha, p.fichas, "")}
      {campo("Decreto", decreto, setDecreto, p.decretos, "")}
      {campo("Fonte", fonte, setFonte, p.fontes, "")}
      {campo("UG", unidade, setUnidade, p.unidades, "")}
      <button type="button" onClick={aplicar} className={CLASSE_BOTAO_PRIMARIO}>Filtrar</button>
    </div>
  );
}
