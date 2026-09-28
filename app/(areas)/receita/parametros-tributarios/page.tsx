import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../components/ui/ResultadosDosAtos";
import { tabelasParaTela } from "../../../../lib/portas/cadastro-imobiliario";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { FormPublicarTabela } from "../imoveis/FormulariosDoImovel";

/**
 * OS PARÂMETROS DO TRIBUTO (V7 B1) — a fórmula do ente, o fundamento e os valores, por exercício e vigência.
 * Nenhuma alíquota, planta de valores ou fórmula nasce no código: tudo vem daqui, versionado.
 */
export const dynamic = "force-dynamic";

const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function ParametrosTributarios(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const t = await tabelasParaTela();
  const hoje = t.hoje;
  return (
    <ResultadosDosAtos>
      <div className="space-y-4" data-tabelas-tributarias={t.tabelas.length}>
        <PageHeader titulo="Parâmetros do tributo" subtitulo="Fórmulas e valores de cálculo do município, por exercício e vigência, com o fundamento legal." />
        <AvisosDosAtos />
        <Card>
          {t.tabelas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-tabelas>Nenhuma tabela publicada. A simulação de tributos depende da publicação de uma tabela.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm" data-lista-de-tabelas>
                <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Tributo</th><th className="py-1 pr-2">Exercício</th><th className="py-1 pr-2">Versão</th><th className="py-1 pr-2">Vale desde</th><th className="py-1 pr-2">Fundamento</th><th className="py-1 pr-2 text-right">Parâmetros</th><th className="py-1">Fórmula</th></tr></thead>
                <tbody>
                  {t.tabelas.map((x) => (
                    <tr key={x.id} data-tabela={`${x.tributo}-${x.exercicio}-${x.versao}`} className="border-t border-[color:var(--color-border)] align-top">
                      <td className="py-2 pr-2">{x.tributo}</td>
                      <td className="py-2 pr-2 tabular-nums">{x.exercicio}</td>
                      <td className="py-2 pr-2 tabular-nums">{x.versao}</td>
                      <td className="py-2 pr-2">{br(x.vigenciaInicio)}</td>
                      <td className="py-2 pr-2 [overflow-wrap:anywhere]">{x.fundamento}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{x.parametros}</td>
                      <td className="py-2 font-mono text-xs [overflow-wrap:anywhere]">{x.formula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">A simulação de cada imóvel está na página dele, no <Link href="/receita/imoveis" className="text-[color:var(--color-primary)] underline underline-offset-2">cadastro imobiliário</Link>. A publicação de nova versão não altera simulações de datas anteriores.</p>
          {t.podeParametrizar ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-dos-parametros>A publicação de tabelas requer a permissão de gestão de parâmetros tributários.</p>}
        </Card>
        {t.podeParametrizar ? <FormPublicarTabela hoje={hoje} exercicio={Number(hoje.slice(0, 4))} variaveisDoCadastro={t.variaveisDoCadastro} /> : null}
      </div>
    </ResultadosDosAtos>
  );
}
