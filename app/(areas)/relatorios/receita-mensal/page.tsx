import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { recorteDePagina } from "../../../../lib/portas/contexto";
import { lerReceitaMesAMes, lerReceitaPorNaturezaMesAMes, type LinhaDaReceitaMensal, type LinhaDaReceitaPorNatureza } from "../../../../lib/portas/receita-e-despesa-do-periodo";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — A RECEITA ARRECADADA MÊS A MÊS: o demonstrativo do exercício por receita, com as fontes de cada uma e o resumo
 * por fonte (TR 5.10.2.59), e por fonte nos três últimos exercícios (TR 5.10.2.60), com a planilha (CSV).
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
  let doAno: Awaited<ReturnType<typeof lerReceitaPorNaturezaMesAMes>>;
  let exercicio: number;
  const comFontes = sp["fontes"] === "1";
  try {
    const recorte = await recorteDePagina(sp, "CONSULTAR_RECEITA");
    exercicio = recorte.exercicio;
    [dados, doAno] = await Promise.all([lerReceitaMesAMes(recorte.exercicio), lerReceitaPorNaturezaMesAMes(recorte.exercicio)]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Receita mês a mês" subtitulo="Receita arrecadada por receita e por fonte" />
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
        subtitulo="Receita arrecadada por receita e por fonte de recursos, líquida das anulações. A receita é do ente e não se recorta por unidade."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {dados.anos.map((ano) => (
          <Card key={ano}>
            <p className="text-xs text-[color:var(--color-ink-3)]">Arrecadado em {ano}</p>
            <p className="text-lg font-semibold" data-total-do-ano={ano}><ValorMonetario valor={dados.totaisPorAno.get(ano) ?? "0.00"} /></p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Demonstrativo da receita arrecadada em {exercicio}</h2>
            <p className="text-xs text-[color:var(--color-ink-3)]">Por receita, mês a mês, líquida das anulações; o resumo por fonte vem em seguida.</p>
          </div>
          <form method="get" className="flex items-center gap-3 text-sm" data-chrome data-acao="opcoes-do-demonstrativo">
            {Object.entries(sp)
              .filter(([k, v]) => k !== "fontes" && typeof v === "string")
              .map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
            <label className="flex items-center gap-2">
              <input type="checkbox" name="fontes" value="1" defaultChecked={comFontes} />
              <span>Listar as fontes de cada receita</span>
            </label>
            <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-1.5">Aplicar</button>
          </form>
        </div>
        {doAno.linhas.length === 0 ? (
          <EstadoVazio titulo={`Nenhuma receita arrecadada em ${String(exercicio)}`} descricao="Não há arrecadação registrada no exercício." />
        ) : (
          <div className="space-y-4 overflow-x-auto">
            <div className="flex justify-end">
              <BotaoCsv csv={csvDoAno(doAno)} nomeArquivo={`receita-por-natureza-${String(exercicio)}.csv`} />
            </div>
            <table className="w-full text-left text-xs" data-lista="receita-por-natureza">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1.5 pr-2">Receita</th>
                  {MESES.map((m) => <th key={m} scope="col" className={CELULA}>{m}</th>)}
                  <th scope="col" className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {doAno.linhas.map((l) => (
                  <LinhasDaNatureza key={l.naturezaCodigo} linha={l} comFontes={comFontes} />
                ))}
                <tr className="border-t-2 border-[color:var(--color-border-strong)] font-semibold" data-total-geral>
                  <td className="py-1.5 pr-2">Total</td>
                  {doAno.meses.map((v, i) => <td key={MESES[i]} className={CELULA}><ValorMonetario valor={v} /></td>)}
                  <td className="py-1.5 text-right"><ValorMonetario valor={doAno.total} /></td>
                </tr>
              </tbody>
            </table>
            <table className="w-full text-left text-xs" data-lista="resumo-por-fonte">
              <caption className="pb-1 text-left text-sm font-semibold">Resumo por fonte em {exercicio}</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1.5 pr-2">Fonte</th>
                  {MESES.map((m) => <th key={m} scope="col" className={CELULA}>{m}</th>)}
                  <th scope="col" className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {doAno.resumoPorFonte.map((f) => (
                  <tr key={f.fonteCodigo} className="border-t border-[color:var(--color-border)]" data-resumo-fonte={f.fonteCodigo}>
                    <td className="py-1.5 pr-2">{f.fonteCodigo} {f.fonteDescricao}</td>
                    {f.meses.map((v, i) => <td key={MESES[i]} className={CELULA}><ValorMonetario valor={v} /></td>)}
                    <td className="py-1.5 text-right font-semibold" data-total-da-linha><ValorMonetario valor={f.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <h2 className="text-sm font-semibold">Por fonte, de {primeiro} a {ultimo}</h2>
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

function LinhasDaNatureza({ linha, comFontes }: { readonly linha: LinhaDaReceitaPorNatureza; readonly comFontes: boolean }): React.ReactElement {
  return (
    <>
      <tr className="border-t border-[color:var(--color-border)]" data-natureza={linha.naturezaCodigo}>
        <td className="py-1.5 pr-2"><span className="tabular-nums">{linha.naturezaCodigo}</span> {linha.naturezaDescricao}</td>
        {linha.meses.map((v, i) => <td key={MESES[i]} className={CELULA}><ValorMonetario valor={v} /></td>)}
        <td className="py-1.5 text-right font-semibold" data-total-da-linha><ValorMonetario valor={linha.total} /></td>
      </tr>
      {comFontes
        ? linha.fontes.map((f: LinhaDaReceitaMensal) => (
            <tr key={f.fonteCodigo} className="text-[color:var(--color-ink-2)]" data-fonte-da-natureza={`${linha.naturezaCodigo}/${f.fonteCodigo}`}>
              <td className="py-1 pl-4 pr-2" title={f.fonteDescricao}>Fonte {f.fonteCodigo}</td>
              {f.meses.map((v, i) => <td key={MESES[i]} className={CELULA}><ValorMonetario valor={v} /></td>)}
              <td className="py-1 text-right"><ValorMonetario valor={f.total} /></td>
            </tr>
          ))
        : null}
    </>
  );
}

function csvDoAno(d: Awaited<ReturnType<typeof lerReceitaPorNaturezaMesAMes>>): string {
  const fmt = (v: string): string => formatarMoeda(v).texto;
  const linhas: string[][] = [];
  for (const l of d.linhas) {
    linhas.push(["Receita", l.naturezaCodigo, l.naturezaDescricao, ...l.meses.map(fmt), fmt(l.total)]);
    for (const f of l.fontes) linhas.push(["Fonte da receita", `${l.naturezaCodigo}/${f.fonteCodigo}`, f.fonteDescricao, ...f.meses.map(fmt), fmt(f.total)]);
  }
  linhas.push(["Total", "", "", ...d.meses.map(fmt), fmt(d.total)]);
  for (const f of d.resumoPorFonte) linhas.push(["Resumo por fonte", f.fonteCodigo, f.fonteDescricao, ...f.meses.map(fmt), fmt(f.total)]);
  return paraCsv(["Linha", "Código", "Descrição", ...MESES, "Total"], linhas);
}

function csv(linhas: Awaited<ReturnType<typeof lerReceitaMesAMes>>["linhas"]): string {
  return paraCsv(
    ["Fonte", "Descrição da fonte", "Ano", ...MESES, "Total"],
    linhas.map((l) => [l.fonteCodigo, l.fonteDescricao, String(l.ano), ...l.meses.map((v) => formatarMoeda(v).texto), formatarMoeda(l.total).texto])
  );
}
