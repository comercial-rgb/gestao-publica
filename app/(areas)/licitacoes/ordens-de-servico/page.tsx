import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { ordensDeServicoDaSessao } from "../../../../lib/portas/contrato-acompanhado";
import { exigirSessao } from "../../../../lib/portas/sessao";

/**
 * AS ORDENS DE SERVIÇO (V38, AUD-122) — antes só se achavam dentro do contrato. A lista alcança os mesmos contratos que
 * a tela do contrato mostra à sessão (designação vigente, administrador da fiscalização ou visão financeira); cada
 * ordem leva à sua tela, onde estão a medição, o recebimento e a liquidação.
 */
export const dynamic = "force-dynamic";

const SITUACAO: Readonly<Record<string, { readonly texto: string; readonly status: "ok" | "neutro" | "alerta" | "erro" }>> = {
  EMITIDA: { texto: "emitida", status: "ok" },
  RASCUNHO: { texto: "rascunho", status: "neutro" },
  SUSPENSA: { texto: "suspensa", status: "alerta" },
  DESCARTADA: { texto: "descartada", status: "neutro" },
};

export default async function OrdensDeServico(): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const { ordens, limitada, todos } = await ordensDeServicoDaSessao(sessao);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ordens de serviço</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {todos ? "As ordens de serviço de todos os contratos." : "As ordens de serviço dos contratos em que você tem designação vigente."} A
          ordem se emite, mede e recebe na tela do contrato; a liquidação usa o que foi recebido.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/licitacoes/contratos" className="text-[color:var(--color-primary)] underline underline-offset-2">Contratos</Link>
          {" · "}
          <Link href="/licitacoes/fiscalizacao" className="text-[color:var(--color-primary)] underline underline-offset-2">Fiscalização</Link>
        </p>
      </header>
      <Card>
        {ordens.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-ordens>
            {todos ? "Nenhuma ordem de serviço cadastrada." : "Nenhuma ordem de serviço nos contratos que você acompanha. A ordem aparece aqui para quem está designado no contrato, para o administrador da fiscalização e para quem empenha, liquida ou paga."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm" data-ordens-de-servico={String(ordens.length)}>
              <caption className="sr-only">Ordens de serviço</caption>
              <thead>
                <tr className="text-xs text-[color:var(--color-ink-2)]">
                  <th className="py-1 pr-2">Ordem</th>
                  <th className="py-1 pr-2">Contrato</th>
                  <th className="py-1 pr-2">Finalidade</th>
                  <th className="py-1 pr-2">Previsto</th>
                  <th className="py-1 pr-2">Situação</th>
                  <th className="py-1">Empenho</th>
                </tr>
              </thead>
              <tbody>
                {ordens.map((o) => {
                  const s = SITUACAO[o.situacao] ?? { texto: o.situacao, status: "neutro" as const };
                  return (
                    <tr key={o.id} data-ordem={o.id} className="border-t border-[color:var(--color-border)]">
                      <td className="py-2 pr-2">
                        <Link href={`/licitacoes/contratos/${o.contratoId}/ordens/${o.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">
                          {String(o.numero)}/{String(o.ano)}
                        </Link>
                      </td>
                      <td className="py-2 pr-2">
                        <Link href={`/licitacoes/contratos/${o.contratoId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{o.contrato}</Link>
                        <span className="block text-xs text-[color:var(--color-ink-2)]">{o.contratado}</span>
                      </td>
                      <td className="py-2 pr-2 [overflow-wrap:anywhere]">{o.finalidade}</td>
                      <td className="py-2 pr-2">{o.previsto}</td>
                      <td className="py-2 pr-2">
                        <Badge status={s.status}>{s.texto}</Badge>
                        {o.emitidaEm === null ? null : <span className="block text-xs text-[color:var(--color-ink-2)]">emitida em {o.emitidaEm}</span>}
                      </td>
                      <td className="py-2">{o.empenho ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {limitada ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Mostrando as 300 mais recentes. Para as anteriores, abra o contrato.</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}
