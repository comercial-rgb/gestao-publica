import Link from "next/link";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO, CLASSE_BOTAO_PRIMARIO } from "../../../../components/ui/Formulario";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { lerRelatorioDeIncorporacao, type OpcaoDoFiltro, type RelatorioDeIncorporacaoDaTela } from "../../../../lib/portas/relatorio-de-incorporacao";
import { exercicioAutorizado } from "../../../../lib/recorte";
import { diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil } from "../../../../packages/datas/index";
import { formatarDocumento } from "../../../../packages/documento";

/**
 * V36 — BENS INCORPORADOS E A INCORPORAR (TR 5.10.1.56). As liquidações de capital do exercício com o liquidado, o
 * incorporado e o que falta incorporar (com o empenho), e as incorporações feitas a partir delas. Sem unidade, o
 * relatório é consolidado. Leitura do patrimônio do ente; a conta é do M10, com a mesma régua do teto da aquisição.
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";
const SITUACAO: Record<string, string> = {
  INCORPORADA: "Incorporada",
  INCORPORADA_EM_PARTE: "Incorporada em parte",
  A_INCORPORAR: "A incorporar",
  SEM_SALDO: "Sem saldo (anulada)",
};
const FILTROS = ["unidade", "funcao", "programa", "acao", "natureza", "fonte", "classe", "conta"] as const;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

function um(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

function Selecao({ nome, rotulo, opcoes, valor }: { readonly nome: string; readonly rotulo: string; readonly opcoes: readonly OpcaoDoFiltro[]; readonly valor: string }): React.ReactElement {
  return (
    <label className="block">
      <span className={ROTULO}>{rotulo}</span>
      <select name={nome} defaultValue={valor} className={CAMPO}>
        <option value="">Todas</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
    </label>
  );
}

export default async function IncorporacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const sp = await searchParams;
  const v = Object.fromEntries(FILTROS.map((k) => [k, um(sp[k])])) as Record<(typeof FILTROS)[number], string>;
  const de = um(sp["de"]);
  const ate = um(sp["ate"]);
  const cabecalho = <PageHeader titulo="Bens incorporados e a incorporar" subtitulo="Liquidações de despesa de capital, o que já virou bem e o que falta incorporar, com o empenho de cada uma" />;

  let exercicio: number;
  let r: RelatorioDeIncorporacaoDaTela;
  try {
    exercicio = exercicioAutorizado(sp);
    const opcional = (x: string): string | undefined => (x === "" ? undefined : x);
    r = await lerRelatorioDeIncorporacao({
      exercicio,
      unidadeOrcId: opcional(v.unidade),
      funcaoId: opcional(v.funcao),
      programaId: opcional(v.programa),
      acaoId: opcional(v.acao),
      naturezaDespesaId: opcional(v.natureza),
      fonteId: opcional(v.fonte),
      classeDeBensId: opcional(v.classe),
      contaContabilId: opcional(v.conta),
      de: DIA.test(de) ? inicioDoDiaCivil(de) : undefined,
      ate: DIA.test(ate) ? fimDoDiaCivil(ate) : undefined,
    });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler o relatório" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }

  const csvLiquidacoes = paraCsv(
    ["Liquidação", "Data", "Empenho", "Credor", "Ficha", "Unidade", "Natureza", "Fonte", "Classe do empenho", "Liquidado", "Incorporado", "A incorporar", "Situação"],
    r.liquidacoes.map((l) => [l.liquidacaoNumero, diaCivilBr(l.data), l.empenhoNumero, formatarDocumento(l.credorCpfCnpj), String(l.fichaNumero), l.unidadeCodigo, l.naturezaCodigo, l.fonteCodigo, l.classePrometida ?? "", formatarMoeda(l.liquidado).texto, formatarMoeda(l.incorporado).texto, formatarMoeda(l.aIncorporar).texto, SITUACAO[l.situacao] ?? l.situacao])
  );
  const csvIncorporacoes = paraCsv(
    ["Data", "Bem", "Classe", "Conta do ativo", "Valor", "Liquidação", "Empenho"],
    r.incorporacoes.map((i) => [diaCivilBr(i.data), i.bem ?? "", i.classe, i.conta, formatarMoeda(i.valor).texto, i.liquidacaoNumero, i.empenhoNumero])
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <Card>
        <form method="get" action="/patrimonio/incorporacoes" data-acao="filtrar-incorporacoes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-chrome>
          <label className="block">
            <span className={ROTULO}>Exercício</span>
            <input name="exercicio" inputMode="numeric" defaultValue={String(exercicio)} className={CAMPO} />
          </label>
          <Selecao nome="unidade" rotulo="Unidade orçamentária" opcoes={r.opcoes.unidades} valor={v.unidade} />
          <Selecao nome="funcao" rotulo="Função" opcoes={r.opcoes.funcoes} valor={v.funcao} />
          <Selecao nome="programa" rotulo="Programa" opcoes={r.opcoes.programas} valor={v.programa} />
          <Selecao nome="acao" rotulo="Ação" opcoes={r.opcoes.acoes} valor={v.acao} />
          <Selecao nome="natureza" rotulo="Natureza da despesa" opcoes={r.opcoes.naturezas} valor={v.natureza} />
          <Selecao nome="fonte" rotulo="Fonte de recursos" opcoes={r.opcoes.fontes} valor={v.fonte} />
          <Selecao nome="classe" rotulo="Tipo do bem (classe)" opcoes={r.opcoes.classes} valor={v.classe} />
          <Selecao nome="conta" rotulo="Conta contábil do ativo" opcoes={r.opcoes.contas} valor={v.conta} />
          <label className="block">
            <span className={ROTULO}>Incorporados de</span>
            <input name="de" type="date" defaultValue={de} className={CAMPO} />
          </label>
          <label className="block">
            <span className={ROTULO}>Incorporados até</span>
            <input name="ate" type="date" defaultValue={ate} className={CAMPO} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={CLASSE_BOTAO_PRIMARIO}>Filtrar</button>
            <Link className="text-sm text-[color:var(--color-primary)] underline" href="/patrimonio/incorporacoes">Limpar</Link>
          </div>
        </form>
        <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
          Sem unidade escolhida, o relatório é consolidado. O período de incorporação recorta a lista de bens incorporados; a posição de cada liquidação é a de hoje.
        </p>
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Liquidações de capital ({r.liquidacoes.length})</h2>
          <div className="flex gap-2" data-chrome>
            <BotaoCsv csv={csvLiquidacoes} nomeArquivo={`liquidacoes-de-capital-${String(exercicio)}.csv`} />
            <BotaoImprimir />
          </div>
        </div>
        {r.liquidacoes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma liquidação de despesa de capital no recorte.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="liquidacoes-de-capital">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                  <th className={CELULA}>Liquidação</th>
                  <th className={CELULA}>Empenho</th>
                  <th className={CELULA}>Credor</th>
                  <th className={CELULA}>Dotação</th>
                  <th className={`${CELULA} text-right`}>Liquidado</th>
                  <th className={`${CELULA} text-right`}>Incorporado</th>
                  <th className={`${CELULA} text-right`}>A incorporar</th>
                  <th className={CELULA}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {r.liquidacoes.map((l) => (
                  <tr key={l.liquidacaoId} className="border-t border-[color:var(--color-border)]" data-liquidacao={l.liquidacaoId}>
                    <td className={CELULA}>{l.liquidacaoNumero} · {diaCivilBr(l.data)}</td>
                    <td className={CELULA}>
                      <Link className="text-[color:var(--color-primary)] underline" href={`/despesa/empenhos/${l.empenhoId}`}>{l.empenhoNumero}</Link>
                    </td>
                    <td className={CELULA}>{formatarDocumento(l.credorCpfCnpj)}</td>
                    <td className={CELULA}>ficha {l.fichaNumero} · {l.unidadeCodigo} · {l.naturezaCodigo} · fonte {l.fonteCodigo}</td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.liquidado} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.incorporado} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.aIncorporar} /></td>
                    <td className={CELULA}>{SITUACAO[l.situacao] ?? l.situacao}</td>
                  </tr>
                ))}
                <tr className="border-t border-[color:var(--color-border-strong)] font-semibold">
                  <td className={CELULA} colSpan={4}>Total</td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={r.totais.liquidado} /></td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={r.totais.incorporado} /></td>
                  <td className={`${CELULA} text-right`} data-total="a-incorporar"><ValorMonetario valor={r.totais.aIncorporar} /></td>
                  <td className={CELULA} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Bens incorporados a partir de liquidação ({r.incorporacoes.length})</h2>
          <div className="flex gap-2" data-chrome>
            <BotaoCsv csv={csvIncorporacoes} nomeArquivo={`bens-incorporados-${String(exercicio)}.csv`} />
          </div>
        </div>
        {r.incorporacoes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma incorporação no recorte.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="bens-incorporados">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                  <th className={CELULA}>Data</th>
                  <th className={CELULA}>Bem</th>
                  <th className={CELULA}>Classe</th>
                  <th className={CELULA}>Conta do ativo</th>
                  <th className={`${CELULA} text-right`}>Valor</th>
                  <th className={CELULA}>Liquidação e empenho</th>
                </tr>
              </thead>
              <tbody>
                {r.incorporacoes.map((i) => (
                  <tr key={i.movimentoId} className="border-t border-[color:var(--color-border)]">
                    <td className={CELULA}>{diaCivilBr(i.data)}</td>
                    <td className={CELULA}>{i.bem ?? "por classe, sem bem individualizado"}</td>
                    <td className={CELULA}>{i.classe}</td>
                    <td className={CELULA}>{i.conta}</td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={i.valor} /></td>
                    <td className={CELULA}>{i.liquidacaoNumero} · {i.empenhoNumero}</td>
                  </tr>
                ))}
                <tr className="border-t border-[color:var(--color-border-strong)] font-semibold">
                  <td className={CELULA} colSpan={4}>Total no período</td>
                  <td className={`${CELULA} text-right`}><ValorMonetario valor={r.totais.incorporadoNoPeriodo} /></td>
                  <td className={CELULA} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
