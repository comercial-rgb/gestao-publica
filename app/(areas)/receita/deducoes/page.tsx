import { Card } from "../../../../components/ui/Card";
import { formatarMoeda } from "../../../../packages/contracts/moeda";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { lerDeducoesDaReceita, lerEscolhasDaDeducao } from "../../../../lib/portas/deducoes-da-receita";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { exercicioAutorizado } from "../../../../lib/recorte";
import { FormDeducao, FormEstornoDeducao, FormLoteDeDeducoes } from "./Formularios";
import { lerCopiaDaDeducao, type CopiaDaDeducao } from "../../../../lib/portas/duplicacao";
import { AvisoDeDuplicacao, idParaDuplicar, LinkDuplicar } from "../../../../components/ui/Duplicacao";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * AS DEDUÇÕES DA RECEITA (V35, onda B1) — o FUNDEB retido na origem, registrado como dedução da receita arrecadada,
 * pelo valor do documento do banco. A receita realizada do balanço, o banco e a disponibilidade da fonte passam a
 * mostrar o líquido.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

// o formatador contábil do repositório (textual, sem `number` e sem o hospedeiro decidir o formato)
const brl = (v: string): string => formatarMoeda(v).texto;

export default async function DeducoesDaReceitaPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  let exercicio = 0;
  let titulo = <PageHeader titulo="Deduções da receita" subtitulo="FUNDEB retido na origem" />;
  let dados: [Awaited<ReturnType<typeof lerDeducoesDaReceita>>, Awaited<ReturnType<typeof lerEscolhasDaDeducao>>, CopiaDaDeducao | null];
  // V36 (TR 5.10.2.5) — "duplicar" na lista: o formulário vem preenchido com a dedução escolhida.
  const duplicar = idParaDuplicar(sp);
  try {
    // o exercício do contexto, com a recusa do ilegível (nunca o ano do relógio do servidor)
    exercicio = exercicioAutorizado(sp);
    titulo = <PageHeader titulo="Deduções da receita" subtitulo={`FUNDEB retido na origem — exercício ${String(exercicio)}`} />;
    await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
    dados = await Promise.all([lerDeducoesDaReceita(exercicio), lerEscolhasDaDeducao(exercicio), duplicar === "" ? Promise.resolve(null) : lerCopiaDaDeducao(duplicar)]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {titulo}
        <EstadoVazio titulo="Não foi possível ler as deduções" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const [deducoes, escolhas, copia] = dados;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {titulo}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O FPM, o ICMS, o IPVA, o ITR e o IPI-exportação chegam com 20% retidos para o FUNDEB. Registre a arrecadação pelo
        valor bruto e aqui a retenção, pelo valor do demonstrativo do banco. A receita realizada do balanço passa a
        mostrar o líquido, o banco fica com o que de fato entrou e a disponibilidade da fonte diminui na mesma medida.
      </div>

      <AvisoDeDuplicacao pedido={duplicar} achado={copia !== null} />
      <Card>
        {escolhas.naturezas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma receita arrecadada no exercício" descricao="A dedução se registra sobre uma receita já arrecadada. Registre a arrecadação primeiro." />
        ) : escolhas.contas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma conta bancária com conta contábil" descricao="Vincule a conta contábil da conta bancária antes de registrar a dedução." />
        ) : (
          <FormDeducao key={copia === null ? "nova" : duplicar} copia={copia ?? undefined} naturezas={escolhas.naturezas} fontes={escolhas.fontes} contas={escolhas.contas} />
        )}
      </Card>

      {escolhas.naturezas.length > 0 && escolhas.contas.length > 0 ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-primary)]">Registrar várias deduções do mesmo demonstrativo</summary>
            <div className="mt-3">
              <FormLoteDeDeducoes naturezas={escolhas.naturezas} fontes={escolhas.fontes} contas={escolhas.contas} />
            </div>
          </details>
        </Card>
      ) : null}

      <Card>
        {deducoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma dedução registrada" descricao="As deduções do exercício aparecem aqui, com o estorno ao lado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Deduções da receita do exercício</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Data</th>
                  <th scope="col" className="py-2 pr-3">Receita</th>
                  <th scope="col" className="py-2 pr-3">Fonte</th>
                  <th scope="col" className="py-2 pr-3 text-right">Valor</th>
                  <th scope="col" className="py-2 pr-3">Documento</th>
                  <th scope="col" className="py-2 pr-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {deducoes.map((d) => (
                  <tr key={d.id} data-deducao={d.id} className="border-t border-[color:var(--color-border)] align-top">
                    <td className="py-2 pr-3">{d.dia.split("-").reverse().join("/")}</td>
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {d.natureza} — {d.naturezaDescricao}
                      {/* V37 — a dedução é da receita, não de uma guia: o elo leva às guias da receita no mês dela. */}
                      <a className="block text-xs underline" data-elo="guias-da-receita" href={`/receita/arrecadacoes?exercicio=${String(exercicio)}&natureza=${d.natureza}&mes=${d.dia.slice(0, 7)}`}>guias desta receita no mês</a>
                    </th>
                    <td className="py-2 pr-3">{d.fonte}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{d.ehEstorno ? "−" : ""}{brl(d.valor)}</td>
                    <td className="py-2 pr-3">
                      {d.documento}
                      <a className="block underline" data-elo="lancamento" href={`/contabilidade/lancamentos/${d.lancamentoId}`}>abrir o lançamento</a>
                    </td>
                    <td className="py-2 pr-3">
                      {d.ehEstorno ? null : <LinkDuplicar href={`/receita/deducoes?exercicio=${String(exercicio)}&duplicar=${d.id}`} />}{" "}
                      {d.ehEstorno ? "Estorno" : d.estorno !== null ? `Estornada em ${d.estorno.dia.split("-").reverse().join("/")}` : <FormEstornoDeducao deducaoId={d.id} rotulo={`${d.natureza} de ${d.dia}`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
