import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import type { ObrigacoesLidas } from "../../../../../lib/portas/recursos/obrigacoes-dos-encargos";
import { baixarGuiaAction, cancelarGuiaAction, registrarGuiaAction } from "../guias-actions";
import { FormBaixaDaGuia, FormCancelarGuia, FormGuiaDeRecolhimento } from "./FormulariosDaGuia";

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = { RECEBIDA: "Recebida — não paga", BAIXADA: "Baixada por pagamento", CANCELADA: "Cancelada" };

/**
 * AS OBRIGAÇÕES DOS ENCARGOS E AS GUIAS (V7 M1 U3.2) — quatro objetos lado a lado e nenhum no lugar do outro:
 * a obrigação (liquidado), o pago, a restituição a providenciar e as guias do emissor com a situação.
 * O demonstrativo interno (PDF/CSV) é a mesma leitura e diz que NÃO é guia.
 */
export function ObrigacoesDaFolha({ folhaId, obrigacoes, podeGerir }: { readonly folhaId: string; readonly obrigacoes: ObrigacoesLidas; readonly podeGerir: boolean }): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Obrigações dos encargos e guias de recolhimento</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Liquidado é a obrigação reconhecida; pago vem dos pagamentos; guia é o documento do emissor. Encargo apurado não prova recolhimento, e guia recebida não prova pagamento.{" "}
        <a href={`/folha/folhas/${folhaId}/obrigacoes?formato=pdf`} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-primary)] hover:underline">Demonstrativo interno (PDF) — não é guia</a>{" · "}
        <a href={`/folha/folhas/${folhaId}/obrigacoes?formato=csv`} className="font-medium text-[color:var(--color-primary)] hover:underline">CSV</a>
      </p>
      {obrigacoes.length === 0 ? (
        <p data-obrigacoes="vazio" className="text-xs text-[color:var(--color-ink-2)]">Nenhum encargo empenhado nesta competência — não há obrigação a recolher registrada.</p>
      ) : (
        <div className="space-y-4" data-obrigacoes="grupos">
          {obrigacoes.map((o) => (
            <section key={o.grupoId} data-obrigacao={o.grupo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
              <h3 className="text-sm font-semibold">{o.grupo} — {o.destinatario}</h3>
              <p className="text-xs text-[color:var(--color-ink-2)]">{o.naturezas.join("; ")}</p>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-[color:var(--color-ink-3)]">Liquidado (obrigação)</dt><dd data-liquidado><ValorMonetario valor={o.liquidado} comSimbolo /></dd></div>
                <div><dt className="text-xs text-[color:var(--color-ink-3)]">Pago</dt><dd data-pago><ValorMonetario valor={o.pago} comSimbolo /></dd></div>
                <div><dt className="text-xs text-[color:var(--color-ink-3)]">Restituição a providenciar</dt><dd data-restituicao><ValorMonetario valor={o.restituicaoAProvidenciar} comSimbolo /></dd></div>
              </dl>
              {o.guias.length === 0 ? (
                <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Nenhuma guia registrada para esta obrigação.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[42rem] border-collapse text-sm" data-guias={o.grupo}>
                    <caption className="sr-only">Guias de {o.grupo}</caption>
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                        <th scope="col" className="py-2 pr-3">Guia</th><th scope="col" className="pr-3">Vencimento</th><th scope="col" className="pr-3 text-right">Total</th><th scope="col" className="pr-3">Situação</th><th scope="col">Arquivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.guias.map((g) => (
                        <tr key={g.id} data-guia={g.identificador} data-situacao={g.situacao} className="border-b border-[color:var(--color-border)] align-top">
                          <td className="py-2 pr-3">{g.identificador}<div className="text-xs text-[color:var(--color-ink-3)]">{g.natureza}</div></td>
                          <td className="pr-3">{g.vencimento === null ? "não informado" : g.vencimento}</td>
                          <td className="pr-3 text-right"><ValorMonetario valor={g.total} comSimbolo /></td>
                          <td className="pr-3">{ROTULO_DA_SITUACAO[g.situacao] ?? g.situacao}</td>
                          <td>{g.anexoId === null ? "—" : <a href={`/documentos/anexos/${g.anexoId}`} className="text-[color:var(--color-primary)] underline">arquivo do emissor</a>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {podeGerir ? (
                <div className="mt-3 space-y-2">
                  {o.guias.filter((g) => g.situacao === "RECEBIDA").map((g) => (
                    <div key={g.id} className="space-y-2 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-2">
                      <p className="text-xs font-medium">Guia {g.identificador}</p>
                      <FormBaixaDaGuia folhaId={folhaId} guiaId={g.id} identificador={g.identificador} pagamentos={o.pagamentosDisponiveis} action={baixarGuiaAction} />
                      <FormCancelarGuia folhaId={folhaId} guiaId={g.id} identificador={g.identificador} action={cancelarGuiaAction} />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
          {podeGerir ? <FormGuiaDeRecolhimento folhaId={folhaId} grupos={obrigacoes.map((o) => ({ valor: o.grupoId, rotulo: `${o.grupo} — ${o.destinatario}` }))} action={registrarGuiaAction} /> : null}
        </div>
      )}
    </Card>
  );
}
