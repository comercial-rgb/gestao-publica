import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { recorteDePagina } from "../../../../lib/portas/contexto";
import { lerReceitaMesAMes } from "../../../../lib/portas/receita-e-despesa-do-periodo";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — A RECEITA ARRECADADA MÊS A MÊS, POR FONTE, NOS TRÊS ÚLTIMOS EXERCÍCIOS (TR 5.10.2.60), com a planilha (CSV).
 * A soma é a do M04 (`arrecadadoPorFonteMesAMes`): líquida das anulações, cada guia no mês do dia civil dela.
 */
export const dynamic = "force-dynamic";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CELULA = "py-1.5 pr-2 text-right whitespace-nowrap";

export default async function ReceitaMensalPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  let dados: Awaited<ReturnType<typeof lerReceitaMesAMes>>;
  try {
    const recorte = await recorteDePagina(sp, "CONSULTAR_RECEITA");
    dados = await lerReceitaMesAMes(recorte.exercicio);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Receita mês a mês" subtitulo="Receita arrecadada por fonte nos três últimos exercícios" />
        <EstadoVazio titulo="Não foi possível ler a receita" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const primeiro = dados.anos[0] ?? 0;
  const ultimo = dados.anos[dados.anos.length - 1] ?? 0;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Receita mês a mês"
        subtitulo={`Receita arrecadada por fonte de recursos, de ${String(primeiro)} a ${String(ultimo)}, líquida das anulações. A receita é do ente e não se recorta por unidade.`}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {dados.anos.map((ano) => (
          <Card key={ano}>
            <p className="text-xs text-[color:var(--color-ink-3)]">Arrecadado em {ano}</p>
            <p className="text-lg font-semibold" data-total-do-ano={ano}><ValorMonetario valor={dados.totaisPorAno.get(ano) ?? "0.00"} /></p>
          </Card>
        ))}
      </div>
      {dados.linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma receita arrecadada no período" descricao="Não há arrecadação registrada nos três exercícios." />
      ) : (
        <Card>
          <div className="mb-2 flex justify-end">
            <BotaoCsv csv={csv(dados.linhas)} nomeArquivo={`receita-mes-a-mes-${String(primeiro)}-${String(ultimo)}.csv`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-lista="receita-mes-a-mes">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1.5 pr-2">Fonte</th>
                  <th scope="col" className="py-1.5 pr-2">Ano</th>
                  {MESES.map((m) => <th key={m} scope="col" className={CELULA}>{m}</th>)}
                  <th scope="col" className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={`${l.fonteCodigo}-${String(l.ano)}`} className="border-t border-[color:var(--color-border)]" data-fonte={l.fonteCodigo} data-ano={l.ano}>
                    <td className="py-1.5 pr-2" title={l.fonteDescricao}>{l.fonteCodigo}</td>
                    <td className="py-1.5 pr-2">{l.ano}</td>
                    {l.meses.map((v, i) => <td key={MESES[i]} className={CELULA}><ValorMonetario valor={v} /></td>)}
                    <td className="py-1.5 text-right font-semibold" data-total-da-linha><ValorMonetario valor={l.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function csv(linhas: Awaited<ReturnType<typeof lerReceitaMesAMes>>["linhas"]): string {
  return paraCsv(
    ["Fonte", "Descrição da fonte", "Ano", ...MESES, "Total"],
    linhas.map((l) => [l.fonteCodigo, l.fonteDescricao, String(l.ano), ...l.meses.map((v) => formatarMoeda(v).texto), formatarMoeda(l.total).texto])
  );
}
