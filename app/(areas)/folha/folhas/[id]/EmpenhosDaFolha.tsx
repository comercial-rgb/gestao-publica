import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";

/**
 * OS EMPENHOS QUE ESTA FOLHA GEROU (V6 P2.3b; TR 5.12.71) — o elo entre a competência e a despesa.
 *
 * ⚠️ CADA LINHA LEVA AO EMPENHO DE VERDADE, na tela da despesa: o empenho da folha não é um
 * registro paralelo, é o mesmo `Empenho` do M05, com o mesmo razão, o mesmo saldo de ficha e a
 * mesma fila do art. 141. É o que separa integração de duplicação.
 */
export function EmpenhosDaFolha({ apropriacao, liquidacoes }: {
  readonly apropriacao: { readonly dataDoEmpenho: string; readonly por: string; readonly total: string; readonly empenhos: readonly { readonly numero: string; readonly ficha: number; readonly grupo: string; readonly matricula: string | null; readonly credor: string; readonly valor: string; readonly empenhoId: string }[] };
  /** V6.1 — por número de empenho. Ausente = aquele empenho ainda NÃO virou obrigação liquidada. */
  readonly liquidacoes: Readonly<Record<string, { readonly numero: string; readonly responsavelAtesto: string; readonly data: string }>>;
}): React.ReactElement {
  // ⚠️ ZERO EMPENHOS É UM ESTADO REAL, e a tela tem de dizer qual: a apropriação foi TENTADA e
  // parou antes de gravar o primeiro (saldo da ficha, em geral). Uma tabela vazia com o título
  // "empenhos gerados por esta folha" afirmaria que a folha virou despesa e não virou.
  if (apropriacao.empenhos.length === 0) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Apropriação contábil</h2>
        <p className="text-xs text-[color:var(--color-ink-2)]">
          A apropriação foi iniciada em {apropriacao.dataDoEmpenho} por {apropriacao.por} e parou antes de gravar o primeiro
          empenho. A causa mais comum é saldo insuficiente na ficha do grupo. Nenhum valor foi empenhado; após resolver a
          causa, a apropriação pode ser repetida sem duplicidade.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Empenhos gerados por esta folha</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Apropriada em {apropriacao.dataDoEmpenho} por {apropriacao.por}. Só o bruto é empenhado: a contribuição e o imposto
        retidos do servidor são retenções do pagamento, não despesa orçamentária. A coluna Liquidação indica quais empenhos
        já foram liquidados; esta seção não registra pagamentos.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <th scope="col" className="py-2 pr-3 text-left">Empenho</th>
              <th scope="col" className="py-2 pr-3 text-left">Ficha</th>
              <th scope="col" className="py-2 pr-3 text-left">Grupo</th>
              <th scope="col" className="py-2 pr-3 text-left">Matrícula</th>
              <th scope="col" className="py-2 pr-3 text-left">Credor</th>
              <th scope="col" className="py-2 pr-3 text-left">Liquidação</th>
              <th scope="col" className="py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {apropriacao.empenhos.map((e) => (
              <tr key={e.empenhoId} data-empenho={e.numero} className="border-b border-[color:var(--color-border)]">
                <td className="py-2 pr-3">
                  <Link href={`/despesa/empenhos/${e.empenhoId}`} className="font-medium text-[color:var(--color-acento)] underline underline-offset-2">
                    {e.numero}
                  </Link>
                </td>
                <td className="py-2 pr-3 tabular-nums">{e.ficha}</td>
                <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">{e.grupo}</td>
                <td className="py-2 pr-3 tabular-nums">{e.matricula ?? "—"}</td>
                <td className="py-2 pr-3 tabular-nums text-[color:var(--color-ink-2)]">{e.credor}</td>
                <td className="py-2 pr-3 text-xs" data-liquidacao={liquidacoes[e.numero] === undefined ? "pendente" : "liquidado"}>
                  {liquidacoes[e.numero] === undefined ? (
                    <span className="text-[color:var(--color-ink-3)]">pendente</span>
                  ) : (
                    <span className="text-[color:var(--color-ink-2)]">
                      {liquidacoes[e.numero]?.data}
                      <span className="block text-[11px] break-words [overflow-wrap:anywhere] text-[color:var(--color-ink-3)]">atesto: {liquidacoes[e.numero]?.responsavelAtesto}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 text-right"><ValorMonetario valor={e.valor} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold">
              <td className="py-2 pr-3" colSpan={6}>Total empenhado</td>
              <td className="py-2 text-right"><ValorMonetario valor={apropriacao.total} comSimbolo /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
