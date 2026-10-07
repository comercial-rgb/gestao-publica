import Link from "next/link";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { filtroDosCheques, lerTelaDosCheques } from "../../../../lib/portas/cheques";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { diaCivil } from "../../../../packages/datas/index";
import { FormCancelarCheque, FormChequeAvulso } from "./FormsDoCheque";

/**
 * V36 — CHEQUES (TR 5.10.2.42): os emitidos na rotina de pagamento e os avulsos numa consulta só, com o registro e o
 * cancelamento do avulso. O cheque de pagamento nasce no formulário do pagamento ("número do cheque").
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";
const campo = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-1)] px-2";
const ROTULO_DA_ORIGEM = { PAGAMENTO: "Pagamento", AVULSO: "Avulso" } as const;

export default async function ChequesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const f = filtroDosCheques(await searchParams);
  const hoje = diaCivil(new Date());
  const cabecalho = <PageHeader titulo="Cheques" subtitulo="Cheques emitidos em pagamentos e cheques avulsos, numa consulta só" />;
  if ("erro" in f) {
    return (
      <div className="space-y-6">
        {cabecalho}
        <p role="alert" className="text-sm">{f.erro} <Link className="underline" href="/financeiro/cheques">Voltar ao mês corrente</Link></p>
      </div>
    );
  }
  const [tela, permitidas] = await Promise.all([lerTelaDosCheques(f), acoesPermitidas(["REGISTRAR_MOVIMENTO_BANCARIO", "ESTORNAR_MOVIMENTO_BANCARIO"])]);
  const podeCancelar = permitidas.has("ESTORNAR_MOVIMENTO_BANCARIO");
  return (
    <div className="space-y-6">
      {cabecalho}

      {permitidas.has("REGISTRAR_MOVIMENTO_BANCARIO") ? <FormChequeAvulso contas={tela.contas} hoje={hoje} /> : null}

      <section className="space-y-3" aria-label="Cheques emitidos">
        <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-filtro-cheques>
          <label>
            <span className="block font-semibold">De</span>
            <input name="de" type="date" defaultValue={f.de} className={campo} />
          </label>
          <label>
            <span className="block font-semibold">Até</span>
            <input name="ate" type="date" defaultValue={f.ate} className={campo} />
          </label>
          <label>
            <span className="block font-semibold">Conta</span>
            <select name="conta" defaultValue={f.conta} className={campo}>
              <option value="">Todas</option>
              {tela.contas.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-semibold">Origem</span>
            <select name="origem" defaultValue={f.origem} className={campo}>
              <option value="">Pagamento e avulso</option>
              <option value="PAGAMENTO">Só de pagamento</option>
              <option value="AVULSO">Só avulsos</option>
            </select>
          </label>
          <label>
            <span className="block font-semibold">Situação</span>
            <select name="situacao" defaultValue={f.situacao} className={campo}>
              <option value="">Todas</option>
              <option value="EMITIDO">Emitidos</option>
              <option value="CANCELADO">Cancelados</option>
            </select>
          </label>
          <button type="submit" className={`${campo} font-semibold`}>Consultar</button>
        </form>

        {tela.motivoSemPagamentos !== null ? (
          <p className="text-xs text-[color:var(--color-ink-2)]" data-sem-cheques-de-pagamento>{tela.motivoSemPagamentos}</p>
        ) : null}
        <p className="text-xs text-[color:var(--color-ink-2)]">
          A situação é a do último dia do período. O cheque de pagamento fica cancelado quando o pagamento é anulado por inteiro, e o valor dele é o líquido, depois das retenções.
        </p>

        {tela.linhas.length === 0 ? (
          <EstadoVazio titulo="Nenhum cheque no período" descricao="Mude o período ou os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-tabela-cheques>
              <thead>
                <tr>
                  <th className={celula}>Cheque</th>
                  <th className={celula}>Conta</th>
                  <th className={celula}>Data</th>
                  <th className={celula}>Origem</th>
                  <th className={celula}>Favorecido</th>
                  <th className={celula}>Finalidade</th>
                  <th className={`${celula} text-right`}>Valor</th>
                  <th className={celula}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {tela.linhas.map((l) => (
                  <tr key={l.id} data-cheque={l.numero} data-situacao={l.situacao}>
                    <td className={celula}>{l.numero}</td>
                    <td className={celula}>{l.contaBancaria}</td>
                    <td className={celula}>{l.data}</td>
                    <td className={celula}>{ROTULO_DA_ORIGEM[l.origem]}</td>
                    <td className={celula}>{l.favorecido}</td>
                    <td className={celula}>
                      {l.empenhoId !== null ? <Link className="underline" href={`/despesa/empenhos/${l.empenhoId}`}>{l.finalidade}</Link> : l.finalidade}
                    </td>
                    <td className={`${celula} text-right`}><ValorMonetario valor={l.valor} /></td>
                    <td className={celula}>
                      {l.situacao === "CANCELADO" ? (
                        <span>Cancelado em {l.canceladoEm}{l.motivoDoCancelamento !== null ? ` — ${l.motivoDoCancelamento}` : ""}</span>
                      ) : (
                        <span>Emitido</span>
                      )}
                      {l.origem === "AVULSO" && l.situacao === "EMITIDO" && podeCancelar ? <FormCancelarCheque chequeId={l.id} numero={l.numero} hoje={hoje} /> : null}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className={`${celula} font-semibold`} colSpan={6}>Emitidos ({tela.totais.quantidade} no total)</td>
                  <td className={`${celula} text-right font-semibold`} data-total-emitido><ValorMonetario valor={tela.totais.emitido} /></td>
                  <td className={celula} />
                </tr>
                <tr>
                  <td className={`${celula} font-semibold`} colSpan={6}>Cancelados</td>
                  <td className={`${celula} text-right font-semibold`} data-total-cancelado><ValorMonetario valor={tela.totais.cancelado} /></td>
                  <td className={celula} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
