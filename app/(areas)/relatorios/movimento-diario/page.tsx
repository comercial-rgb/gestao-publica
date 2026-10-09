import Link from "next/link";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { lerMovimentoDoDia,
  ultimoDiaComMovimento, type MovimentoDoDia } from "../../../../lib/portas/receita-e-despesa-do-periodo";
import { diaCivil } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — O DEMONSTRATIVO DIÁRIO DA RECEITA ARRECADADA E DA DESPESA PAGA (TR 5.10.2.58). O dia vem da URL; sem dia, o
 * dia civil de hoje. A receita é a soma do M04 na janela do dia; a despesa, os pagamentos efetuados do dia.
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";
const CAMPO = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2";

export default async function MovimentoDiarioPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const bruto = sp["dia"];
  const pedido = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).trim();
  let dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : "";
  let m: MovimentoDoDia;
  try {
    // A receita e a despesa do dia são do ENTE: as duas leituras, declaradas aqui (a porta as cobra de novo).
    await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
    await telaExigeLeituraDoEnte("CONSULTAR_DESPESA");
    // V38 — sem dia pedido, o último com movimento (antes era hoje, e a tela abria vazia).
    if (dia === "") dia = (await ultimoDiaComMovimento()) ?? diaCivil(new Date());
    m = await lerMovimentoDoDia(dia);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Movimento diário" subtitulo="Receita arrecadada e despesa paga no dia" />
        <EstadoVazio titulo="Não foi possível ler o movimento do dia" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Movimento diário" subtitulo={`Receita arrecadada e despesa paga em ${dia.split("-").reverse().join("/")}`} />

      <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-chrome aria-label="Escolher o dia">
        <label>
          <span className="block font-semibold">Dia</span>
          <input type="date" name="dia" defaultValue={dia} className={CAMPO} />
        </label>
        <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]">Ver</button>
        <BotaoPdf href={`/relatorios/movimento-diario/pdf?dia=${dia}`} />
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Receita arrecadada</p>
          <p className="text-lg font-semibold" data-total="receita"><ValorMonetario valor={m.totalDaReceita} /></p>
        </Card>
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Despesa paga</p>
          <p className="text-lg font-semibold" data-total="pago"><ValorMonetario valor={m.totaisDaDespesa.pago} /></p>
        </Card>
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Líquido aos credores</p>
          <p className="text-lg font-semibold" data-total="liquido"><ValorMonetario valor={m.totaisDaDespesa.liquido} /></p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Receita arrecadada ({m.receitas.length})</h2>
        {m.receitas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nenhuma arrecadação no dia.</p>
        ) : (
          <table className="w-full text-left text-xs" data-lista="receita-do-dia">
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className={CELULA}>Natureza</th>
                <th scope="col" className={CELULA}>Descrição</th>
                <th scope="col" className={CELULA}>Fonte</th>
                <th scope="col" className="py-1.5 text-right">Arrecadado</th>
              </tr>
            </thead>
            <tbody>
              {m.receitas.map((r) => (
                <tr key={`${r.naturezaCodigo}-${r.fonteCodigo}`} className="border-t border-[color:var(--color-border)]">
                  <td className={`${CELULA} font-mono`}>{r.naturezaCodigo}</td>
                  <td className={CELULA}>{r.naturezaDescricao}</td>
                  <td className={CELULA}>{r.fonteCodigo}</td>
                  <td className="py-1.5 text-right"><ValorMonetario valor={r.arrecadado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Despesa paga ({m.pagamentos.length})</h2>
        {m.pagamentos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum pagamento no dia.</p>
        ) : (
          <table className="w-full text-left text-xs" data-lista="pagamentos-do-dia">
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className={CELULA}>Pagamento</th>
                <th scope="col" className={CELULA}>Empenho</th>
                <th scope="col" className={CELULA}>Credor</th>
                <th scope="col" className={CELULA}>Fonte</th>
                <th scope="col" className={CELULA}>Origem</th>
                <th scope="col" className={`${CELULA} text-right`}>Pago</th>
                <th scope="col" className={`${CELULA} text-right`}>Retido</th>
                <th scope="col" className="py-1.5 text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {m.pagamentos.map((x) => (
                <tr key={x.id} className="border-t border-[color:var(--color-border)]">
                  <td className={`${CELULA} font-mono`}>{x.numero}</td>
                  <td className={CELULA}><Link className="underline" href={`/despesa/empenhos/${x.empenhoId}#pagamento-${x.id}`}>{x.empenhoNumero}</Link></td>
                  <td className={CELULA}>{x.credor}</td>
                  <td className={CELULA}>{x.fonteCodigo}</td>
                  <td className={CELULA}>{x.origem === "RESTOS" ? "Restos a pagar" : "Exercício"}</td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={x.pago} /></td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={x.retido} /></td>
                  <td className="py-1.5 text-right"><ValorMonetario valor={x.liquido} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
