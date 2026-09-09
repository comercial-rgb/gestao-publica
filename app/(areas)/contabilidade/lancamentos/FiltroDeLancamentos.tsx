"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * FILTRO DA CONSULTA DE LANÇAMENTOS — ilha client, no mesmo padrão do `SeletorPeriodo` dos livros:
 * o estado mora na URL, não no componente. Ao aplicar, empurra
 * `?desde=&ate=&conta=&subsistema=&origem=` e o Server Component re-consulta a porta.
 *
 * ⚠️ POR QUE A URL, E NÃO ESTADO LOCAL. Um filtro em `useState` puro não sobrevive ao refresh, não
 * é compartilhável por link e não pode ser lido pelo servidor — e o dado desta tela vem TODO do
 * servidor. Com a URL como fonte, "me manda o que você está vendo" é copiar a barra de endereço,
 * o que numa auditoria é a diferença entre reproduzir uma consulta e descrevê-la.
 *
 * ⚠️ CAMPO VAZIO REMOVE O PARÂMETRO em vez de mandá-lo em branco: `?conta=` seria um filtro por
 * conta de código vazio — nenhuma linha, sem explicação. Ausência de filtro tem de ser AUSÊNCIA.
 */
const CLASSE =
  "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)] focus-visible:outline-2";

export interface FiltroDeLancamentosProps {
  readonly desde: string;
  readonly ate: string;
  readonly conta: string;
  readonly subsistema: string;
  readonly origem: string;
  /** T08 — o IDENTIFICADOR DO FATO (`origemId`): tudo que ESTE documento produziu no razão. */
  readonly fato: string;
  /** T08 — o código da FONTE de recursos, pela ficha da partida. */
  readonly fonte: string;
  /** Os `origemTipo` que EXISTEM no período consultado — a lista sai do dado, não de um enum. */
  readonly origensDisponiveis: readonly string[];
}

export function FiltroDeLancamentos({
  desde,
  ate,
  conta,
  subsistema,
  origem,
  fato,
  fonte,
  origensDisponiveis,
}: FiltroDeLancamentosProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [d, setD] = useState(desde);
  const [a, setA] = useState(ate);
  const [c, setC] = useState(conta);
  const [s, setS] = useState(subsistema);
  const [o, setO] = useState(origem);
  const [f, setF] = useState(fato);
  const [fr, setFr] = useState(fonte);

  const aplicar = (): void => {
    const p = new URLSearchParams(params.toString());
    p.set("desde", d);
    p.set("ate", a);
    for (const [chave, valor] of [
      ["conta", c],
      ["subsistema", s],
      ["origem", o],
      ["fato", f],
      ["fonte", fr],
    ] as const) {
      if (valor.trim() !== "") p.set(chave, valor.trim());
      else p.delete(chave);
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
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Fonte</span>
        <input
          type="text"
          aria-label="Código da fonte de recursos"
          placeholder="500"
          className={`${CLASSE} w-20`}
          value={fr}
          onChange={(e) => setFr(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        {/*
          ⚠️ O IDENTIFICADOR DO FATO, e não o número do documento. O razão amarra pelo
          `origemId` — o id interno do empenho, da liquidação, do pagamento. É ele que traz
          o lançamento E o estorno dele na mesma consulta, que é a pergunta de quem confere.
        */}
        <span className="uppercase tracking-wide">Fato (id)</span>
        <input
          type="text"
          aria-label="Identificador do fato de origem"
          placeholder="id do empenho, da liquidação…"
          className={`${CLASSE} w-52`}
          value={f}
          onChange={(e) => setF(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Conta</span>
        <input
          type="text"
          aria-label="Código da conta"
          placeholder="2.1.8.8.1.01.00"
          className={`${CLASSE} w-44`}
          value={c}
          onChange={(e) => setC(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Subsistema</span>
        {/* ⚠️ Aqui SIM existe a natureza da informação do MSC: ela é atributo da PARTIDA. */}
        <select aria-label="Subsistema" className={`${CLASSE} w-40`} value={s} onChange={(e) => setS(e.target.value)}>
          <option value="">todos</option>
          <option value="ORCAMENTARIO">orçamentário</option>
          <option value="PATRIMONIAL">patrimonial</option>
          <option value="CONTROLE">controle</option>
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        <span className="uppercase tracking-wide">Origem</span>
        <select aria-label="Tipo de origem" className={`${CLASSE} w-52`} value={o} onChange={(e) => setO(e.target.value)}>
          <option value="">todas</option>
          {/* A origem selecionada entra na lista mesmo se sumiu do período — senão o `select`
              perderia o valor que está de fato filtrando e mostraria "todas" mentindo. */}
          {[...new Set([...origensDisponiveis, ...(origem !== "" ? [origem] : [])])].sort().map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={aplicar}
        className="h-8 rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 text-sm font-medium text-[color:var(--color-primary-fg)] hover:opacity-90"
      >
        Aplicar
      </button>
    </div>
  );
}
