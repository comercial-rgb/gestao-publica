"use client";

import { useState } from "react";

/**
 * SELEÇÃO MÚLTIPLA E SOMA — o T08 pede "selecionar/somar".
 *
 * ═══ ⚠️ POR QUE ISTO NÃO SOMA DINHEIRO EM `number` ═══
 * A soma é em CENTAVOS INTEIROS (string → BigInt → string). É soma de EXIBIÇÃO — ela não
 * decide nada, e mesmo assim: `Number("0.1") + Number("0.2")` é `0.30000000000000004`, e
 * um total de conferência que erra o centavo é pior que total nenhum, porque o operador
 * vai atrás do centavo que não existe.
 *
 * ═══ ⚠️ E POR QUE ELA SOMA D E C SEPARADOS, POR SUBSISTEMA ═══
 * Somar "o valor" de um conjunto de lançamentos não significa nada: cada lançamento tem
 * débitos E créditos, e a soma de tudo junto é sempre o dobro. O que responde a pergunta
 * de quem confere é: neste recorte que eu escolhi, quanto foi a débito e quanto a crédito
 * em cada subsistema — e eles batem?
 */
export interface PartidaSelecionavel {
  readonly tipo: string;
  readonly subsistema: string;
  readonly valor: string;
}

export interface LancamentoSelecionavel {
  readonly id: string;
  readonly rotulo: string;
  readonly partidas: readonly PartidaSelecionavel[];
}

function emReais(centavos: bigint): string {
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  const s = abs.toString().padStart(3, "0");
  const inteiro = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${inteiro},${s.slice(-2)}`;
}

export function SelecaoESoma({
  lancamentos,
}: {
  readonly lancamentos: readonly LancamentoSelecionavel[];
}): React.ReactElement {
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());

  const alternar = (id: string): void => {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const porSubsistema = new Map<string, { d: bigint; c: bigint }>();
  for (const l of lancamentos) {
    if (!marcados.has(l.id)) continue;
    for (const p of l.partidas) {
      const atual = porSubsistema.get(p.subsistema) ?? { d: 0n, c: 0n };
      const centavos = BigInt(p.valor.replace(".", ""));
      if (p.tipo === "DEBITO") atual.d += centavos;
      else atual.c += centavos;
      porSubsistema.set(p.subsistema, atual);
    }
  }
  const totais = [...porSubsistema.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
          Selecionar e somar
        </h2>
        <span className="text-xs text-[color:var(--color-ink-2)]">
          {marcados.size} de {lancamentos.length} selecionado(s)
          {marcados.size > 0 ? (
            <button
              type="button"
              onClick={() => setMarcados(new Set())}
              className="ml-3 text-[color:var(--color-primary)] hover:underline"
            >
              limpar
            </button>
          ) : null}
        </span>
      </div>

      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
        A soma é <strong>por subsistema</strong>, débito e crédito separados. Somar tudo
        junto daria sempre o dobro do valor — todo lançamento tem os dois lados.
      </p>

      <div className="mt-3 max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
        <ul className="divide-y divide-[color:var(--color-border)]">
          {lancamentos.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]">
                <input
                  type="checkbox"
                  checked={marcados.has(l.id)}
                  onChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${l.rotulo}`}
                />
                <span className="text-[color:var(--color-ink)]">{l.rotulo}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {marcados.size === 0 ? (
        <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
          Marque os lançamentos que quer conferir.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-xs">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1 pr-3 text-left font-medium">Subsistema</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Débito</th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">Crédito</th>
                <th scope="col" className="py-1 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {totais.map(([subsistema, { d, c }]) => (
                <tr key={subsistema} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-1 pr-3 text-[color:var(--color-ink-2)]">{subsistema}</td>
                  <td className="py-1 pr-3 text-right tabular">{emReais(d)}</td>
                  <td className="py-1 pr-3 text-right tabular">{emReais(c)}</td>
                  <td
                    className={`py-1 text-right tabular font-semibold ${d - c !== 0n ? "text-[color:var(--color-negativo)]" : ""}`}
                  >
                    {emReais(d - c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
