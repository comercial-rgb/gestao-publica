import Link from "next/link";
import { Card } from "../../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../../components/ui/ValorMonetario";
import { lerTelaDaPrevia, type TelaDaPrevia } from "../../../../../../lib/portas/previa-da-retencao";
import { lerOpcoesDaRetencao, type OpcoesDaRetencao } from "../../../../../../lib/portas/retencao-calculada";
import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
import { formatarDocumento } from "../../../../../../packages/documento/index";
import { formatarMoeda } from "../../../../../../lib/format/moeda";
import { FormPrevia } from "./FormPrevia";

/**
 * V39-R3 (R3-014, V39-027) — A PRÉVIA DAS RETENÇÕES NA LIQUIDAÇÃO. Previsão, não reconhecimento: nada se lança e nada
 * se reserva. O pagamento oferece reaproveitar os dados fiscais da versão mais recente e recalcula com o valor e a data
 * dele.
 */
export default async function PreviaDasRetencoesPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  const { id } = await params;
  let tela: TelaDaPrevia | null;
  let opcoes: OpcoesDaRetencao;
  try {
    [tela, opcoes] = await Promise.all([lerTelaDaPrevia(id), lerOpcoesDaRetencao()]);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Prévia das retenções" />
        <EstadoVazio titulo="Não foi possível abrir a prévia" descricao={e instanceof Error ? mensagemDoErro(e, "") : "Erro desconhecido."} />
      </div>
    );
  }
  if (tela === null) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Prévia das retenções" />
        <EstadoVazio titulo="Liquidação não encontrada" descricao="Nenhuma liquidação corresponde ao endereço informado. Volte à lista de liquidações." />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Prévia das retenções da liquidação ${tela.numero}`}
        subtitulo={`Empenho ${tela.empenho}, credor ${formatarDocumento(tela.credor)}. Previsão: nada é lançado nem reservado; o pagamento calcula de novo com o valor e a data dele.`}
      />
      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Valor da liquidação</dt><dd><ValorMonetario valor={tela.valor} /></dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Saldo a pagar</dt><dd data-saldo-a-pagar={tela.saldoAPagar}><ValorMonetario valor={tela.saldoAPagar} /></dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Empenho</dt><dd><Link className="text-[color:var(--color-primary)] hover:underline" href={`/despesa/empenhos/${tela.empenhoId}`}>{tela.empenho}</Link></dd></div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Prévias guardadas</h2>
        {tela.previas.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-previa>Nenhuma prévia guardada nesta liquidação.</p>
        ) : (
          <div className="grid gap-3">
            {tela.previas.map((p, i) => (
              <section key={p.versao} data-previa-versao={p.versao} data-vigente={i === 0 ? "sim" : "nao"} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs">
                <p className="mb-2 text-[color:var(--color-ink-2)]">
                  Versão {p.versao}{i === 0 ? " (a que o pagamento oferece)" : " (substituída)"}: pagamento previsto de R$ {formatarMoeda(p.valorPrevisto).texto} em {p.dataPrevista}; retenção prevista de{" "}
                  <span data-total-previsto={p.totalPrevisto}>R$ {formatarMoeda(p.totalPrevisto).texto}</span>. Guardada por {p.por} em {p.em}.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[color:var(--color-ink-2)]">
                        <th className="py-1 pr-2">Tributo</th>
                        <th className="py-1 pr-2">Situação</th>
                        <th className="py-1 pr-2">Base</th>
                        <th className="py-1 pr-2">Alíquota</th>
                        <th className="py-1 pr-2">Valor</th>
                        <th className="py-1">Por quê</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.linhas.map((l) => (
                        <tr key={l.tributo} data-tributo={l.tributo} className="border-t border-[color:var(--color-border)] align-top">
                          <td className="py-1 pr-2 font-medium">{l.tributo}</td>
                          <td className="py-1 pr-2">{l.resultado}</td>
                          <td className="py-1 pr-2">{l.base === null ? "" : `R$ ${formatarMoeda(l.base).texto}`}</td>
                          <td className="py-1 pr-2">{l.aliquota ?? ""}</td>
                          <td className="py-1 pr-2" data-valor={l.valor ?? ""}>{l.valor === null ? "" : `R$ ${formatarMoeda(l.valor).texto}`}</td>
                          <td className="py-1">{l.explicacao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Nova prévia</h2>
        {tela.anulada ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">A liquidação foi anulada: não há pagamento a prever.</p>
        ) : !tela.podeGuardar ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Guardar uma prévia cabe a quem liquida a despesa. Você pode consultar as já guardadas.</p>
        ) : (
          <FormPrevia liquidacaoId={tela.id} credor={tela.credor} saldoAPagar={tela.saldoAPagar} hoje={tela.hoje} opcoes={opcoes} />
        )}
      </Card>
    </div>
  );
}
