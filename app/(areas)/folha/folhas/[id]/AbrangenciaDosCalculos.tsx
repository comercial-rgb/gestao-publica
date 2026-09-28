import type { AbrangenciaDeUmCalculo } from "../../../../../lib/portas/recursos/folha-dados";

/**
 * A ABRANGÊNCIA EFETIVA DE CADA CÁLCULO — quem entrou, quem não, e por quê (TR 5.12.50).
 *
 * ⚠️ ESTA SEÇÃO EXISTE PORQUE "12 CONTRACHEQUES" NÃO RESPONDE "QUAIS DOZE". O motor grava o fato
 * desde a V11 V9.5 e a guarda do fechamento o usa para recusar a subtração silenciosa — mas
 * nenhuma tela o lia. O operador declarava um recorte e recebia um número: compatível com a pessoa
 * errada dentro e a certa fora.
 *
 * ⚠️ O MODO APARECE EM CADA CÁLCULO, e não só a contagem. "EXPLÍCITA com 25" e "TODOS com 25" são
 * fatos diferentes num ente de 25 servidores, e é justamente essa diferença que a paginação
 * apagaria se o modo fosse inferido do tamanho da lista.
 *
 * ⚠️ OS CANCELADOS CONTINUAM AQUI, MARCADOS. É deles que sai a segunda saída legítima da recusa do
 * fechamento ("cancele o cálculo que as processou"), e esconder o cancelado deixaria o operador
 * sem ver o efeito do próprio ato.
 */
const MOTIVO_EM_PORTUGUES: Readonly<Record<string, string>> = {
  ADMITIDO_APOS_A_COMPETENCIA: "admitido depois do fim da competência",
  DESLIGADO_ANTES_DA_COMPETENCIA: "desligado antes do início da competência",
  SEM_DIFERENCA_A_PAGAR: "sem diferença a pagar nesta complementar",
};

export function AbrangenciaDosCalculos({
  calculos,
}: {
  readonly calculos: readonly AbrangenciaDeUmCalculo[];
}): React.ReactElement {
  return (
    <section data-abrangencia-dos-calculos className="rounded-lg border border-[color:var(--color-border)] p-4">
      <h2 className="text-base font-semibold">Abrangência dos cálculos</h2>
      <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
        Servidores efetivamente incluídos em cada cálculo desta folha e o motivo de cada exclusão.
      </p>

      {calculos.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">Esta folha ainda não tem cálculo.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {calculos.map((c) => (
            <div key={c.numero} data-abrangencia-do-calculo={c.numero} className="rounded border border-[color:var(--color-border)] p-3">
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">Cálculo nº {c.numero}</span>
                <span data-modo-de-selecao={c.modoDeSelecao} className="text-[color:var(--color-ink-2)]">
                  seleção: {c.modoDeSelecao === "EXPLICITA" ? "servidores selecionados" : "todos os elegíveis"}
                </span>
                {c.cancelado ? (
                  <span data-calculo-cancelado className="rounded bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-medium">
                    Cancelado: este cálculo não produz efeitos
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm">
                <span data-calculados={c.calculados}>{c.calculados} calculado(s)</span>
                {" · "}
                <span data-excluidos={c.excluidos}>{c.excluidos} não incluído(s)</span>
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <caption className="sr-only">Vínculos considerados no cálculo nº {c.numero}, com o motivo de cada exclusão</caption>
                  <thead>
                    <tr className="text-[color:var(--color-ink-2)]">
                      <th scope="col" className="py-1 pr-2">Matrícula</th>
                      <th scope="col" className="py-1 pr-2">Servidor</th>
                      <th scope="col" className="py-1 pr-2">Incluído</th>
                      <th scope="col" className="py-1">Motivo da exclusão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.linhas.map((l) => (
                      <tr key={l.matricula} data-abrangencia-matricula={l.matricula} className="border-t border-[color:var(--color-border)] align-top">
                        <td className="py-1 pr-2 tabular-nums">{l.matricula}</td>
                        <td className="py-1 pr-2 [overflow-wrap:anywhere]">{l.nome}</td>
                        <td data-calculado={l.calculado ? "sim" : "nao"} className="py-1 pr-2">{l.calculado ? "sim" : "não"}</td>
                        <td className="py-1 [overflow-wrap:anywhere]">
                          {l.motivo === null ? "—" : (MOTIVO_EM_PORTUGUES[l.motivo] ?? l.motivo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
