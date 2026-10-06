import Link from "next/link";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { NOTA_DO_COMPARATIVO, TIPO_DA_DIVIDA } from "../../../../lib/pdf/relatorio-da-divida";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { lerRelatorioDaDivida, type RelatorioDaDivida } from "../../../../lib/portas/relatorio-da-divida";
import { FormCorrigirParcela, FormInformarParcelas } from "./FormsDaParcela";

/**
 * V36 — O RELATÓRIO GERENCIAL DA DÍVIDA FUNDADA (TR 5.10.1.86) E AS PARCELAS INFORMADAS × AMORTIZADO (TR 5.10.1.84).
 * Todas as dívidas com ingressado, atualizado, amortizado e saldo; escolhida uma (`?divida=`), o comparativo e, para
 * quem cadastra dívida, os atos do cronograma. Leitura do ente (a dívida não é de unidade gestora).
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";
const diaBr = (d: string): string => d.split("-").reverse().join("/");

export default async function RelatorioDaDividaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_DIVIDA");
  const sp = await searchParams;
  const bruto = sp["divida"];
  const dividaId = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).trim();
  let r: RelatorioDaDivida;
  try {
    r = await lerRelatorioDaDivida({ dividaId });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Relatório da dívida fundada" subtitulo="Saldos e parcelas das dívidas fundadas" />
        <EstadoVazio titulo="Não foi possível ler o relatório" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const podeCadastrar = (await acoesPermitidas(["CADASTRAR_DIVIDA"])).has("CADASTRAR_DIVIDA");
  const e = r.escolhida;

  const csvTodas = paraCsv(
    ["Dívida", "Credor", "Tipo", "Lei autorizativa", "Ingressado", "Atualizado", "Amortizado", "Saldo", "Parcelas informadas"],
    r.dividas.map((d) => [d.identificador, d.credorNome, TIPO_DA_DIVIDA[d.tipo], d.leiAutorizativa, formatarMoeda(d.ingressado).texto, formatarMoeda(d.atualizado).texto, formatarMoeda(d.amortizado).texto, formatarMoeda(d.saldo).texto, String(d.parcelasInformadas)])
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Relatório da dívida fundada" subtitulo="Saldos de todas as dívidas fundadas e, para cada uma, as parcelas informadas ao lado do que foi amortizado" />

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Dívidas fundadas ({r.dividas.length})</h2>
          <div className="flex gap-2" data-chrome>
            <BotaoCsv csv={csvTodas} nomeArquivo="dividas-fundadas.csv" />
            <BotaoPdf href="/relatorios/divida/pdf" />
          </div>
        </div>
        {r.dividas.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Nenhuma dívida fundada cadastrada. O cadastro é feito em{" "}
            <Link className="text-[color:var(--color-primary)] underline" href="/divida/fundada">Dívida fundada</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="dividas">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                  <th className={CELULA}>Dívida</th>
                  <th className={CELULA}>Credor</th>
                  <th className={CELULA}>Tipo</th>
                  <th className={`${CELULA} text-right`}>Ingressado</th>
                  <th className={`${CELULA} text-right`}>Atualizado</th>
                  <th className={`${CELULA} text-right`}>Amortizado</th>
                  <th className={`${CELULA} text-right`}>Saldo</th>
                  <th className={CELULA}>Parcelas</th>
                </tr>
              </thead>
              <tbody>
                {r.dividas.map((d) => (
                  <tr key={d.id} className="border-t border-[color:var(--color-border)]" data-divida={d.id}>
                    <td className={CELULA}>{d.identificador}</td>
                    <td className={CELULA}>{d.credorNome}</td>
                    <td className={CELULA}>{TIPO_DA_DIVIDA[d.tipo]}</td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={d.ingressado} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={d.atualizado} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={d.amortizado} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={d.saldo} /></td>
                    <td className={CELULA}>
                      <Link className="font-semibold text-[color:var(--color-primary)] underline" href={`/relatorios/divida?divida=${encodeURIComponent(d.id)}`}>
                        {d.parcelasInformadas === 0 ? "Ver e informar" : `Ver ${String(d.parcelasInformadas)}`}
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[color:var(--color-border-strong)] font-semibold">
                  <td className={CELULA} colSpan={3}>Total</td>
                  <td className={`${CELULA} text-right`} data-total="ingressado"><ValorMonetario valor={r.totais.ingressado} /></td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={r.totais.atualizado} /></td>
                  <td className={`${CELULA} text-right`} data-total="amortizado"><ValorMonetario valor={r.totais.amortizado} /></td>
                  <td className={`${CELULA} text-right`} data-total="saldo"><ValorMonetario valor={r.totais.saldo} /></td>
                  <td className={CELULA} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {e !== null ? (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" data-divida-escolhida={e.id}>
              Parcelas da dívida {e.identificador}: informado e amortizado
            </h2>
            <div className="flex gap-2" data-chrome>
              <BotaoCsv
                csv={paraCsv(
                  ["Parcela", "Vencimento", "Principal informado", "Encargos informados", "Amortizado no período", "Diferença", "Corrigida"],
                  e.linhas.map((l) => [l.numero === null ? "depois do último vencimento" : String(l.numero), l.vencimento === null ? "" : diaBr(l.vencimento), formatarMoeda(l.principalInformado).texto, l.encargosInformados === null ? "" : formatarMoeda(l.encargosInformados).texto, formatarMoeda(l.amortizadoNoPeriodo).texto, formatarMoeda(l.diferenca).texto, l.corrigida ? "sim" : ""])
                )}
                nomeArquivo={`parcelas-${e.identificador}.csv`}
              />
              <BotaoPdf href={`/relatorios/divida/pdf?divida=${encodeURIComponent(e.id)}`} />
            </div>
          </div>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            {e.credorNome} · {e.leiAutorizativa} · {e.objeto}. Saldo atual <ValorMonetario valor={e.saldo} />.
          </p>
          {e.linhas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma parcela informada para esta dívida.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-lista="parcelas">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                    <th className={CELULA}>Parcela</th>
                    <th className={CELULA}>Vencimento</th>
                    <th className={`${CELULA} text-right`}>Principal informado</th>
                    <th className={`${CELULA} text-right`}>Encargos informados</th>
                    <th className={`${CELULA} text-right`}>Amortizado no período</th>
                    <th className={`${CELULA} text-right`}>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {e.linhas.map((l) => (
                    <tr key={l.parcelaId ?? "depois"} className="border-t border-[color:var(--color-border)]" data-parcela={l.numero ?? "depois"}>
                      <td className={CELULA}>{l.numero === null ? "Pago depois do último vencimento" : `${String(l.numero)}${l.corrigida ? " (corrigida)" : ""}`}</td>
                      <td className={CELULA}>{l.vencimento === null ? "" : diaBr(l.vencimento)}</td>
                      <td className={`${CELULA} text-right`}><ValorMonetario valor={l.principalInformado} /></td>
                      <td className={`${CELULA} text-right`}>{l.encargosInformados === null ? "" : <ValorMonetario valor={l.encargosInformados} />}</td>
                      <td className={`${CELULA} text-right`}><ValorMonetario valor={l.amortizadoNoPeriodo} /></td>
                      <td className={`${CELULA} text-right`}><ValorMonetario valor={l.diferenca} /></td>
                    </tr>
                  ))}
                  <tr className="border-t border-[color:var(--color-border-strong)] font-semibold">
                    <td className={CELULA} colSpan={2}>Total</td>
                    <td className={`${CELULA} text-right`} data-total="informado"><ValorMonetario valor={e.totalInformado} /></td>
                    <td className={CELULA} />
                    <td className={`${CELULA} text-right`} data-total="amortizado-nas-parcelas"><ValorMonetario valor={e.totalAmortizadoNasLinhas} /></td>
                    <td className={CELULA} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">{NOTA_DO_COMPARATIVO}</p>
          {podeCadastrar ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <FormInformarParcelas dividaId={e.id} />
              <FormCorrigirParcela
                parcelas={e.linhas
                  .filter((l) => l.parcelaId !== null)
                  .map((l) => ({ id: l.parcelaId!, rotulo: `${String(l.numero)} · ${diaBr(l.vencimento!)} · R$ ${formatarMoeda(l.principalInformado).texto}` }))}
              />
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
