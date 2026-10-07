import Link from "next/link";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { EscopoDeLeituraError, ExercicioIlegivelError, recorteDePagina } from "../../../../lib/portas/contexto";
import { lerEmLiquidacao, origemEmLiquidacao, type TelaEmLiquidacao } from "../../../../lib/portas/em-liquidacao";
import { PortaSemBancoError } from "../../../../lib/portas/empenho";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";

/**
 * V36 — EMPENHOS E RESTOS EM LIQUIDAÇÃO: os que têm a entrega verificada (nota fiscal conferida) e ainda não liquidada.
 * A regra é do M05 (`modules/m05-despesa/em-liquidacao.ts`).
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";
const umString = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function EmLiquidacaoPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const origem = origemEmLiquidacao(umString(sp["origem"]));
  let recorte: RecorteDaPagina;
  let dados: TelaEmLiquidacao;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    dados = await lerEmLiquidacao({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo, origem });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Em liquidação" subtitulo="Empenhos e restos com a entrega verificada" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar os empenhos em liquidação"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  const filtro = (o: string): string => `/despesa/em-liquidacao?exercicio=${String(recorte.exercicio)}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}${o !== "" ? `&origem=${o}` : ""}`;
  const csv = paraCsv(
    ["Empenho", "Origem", "Credor", "Fonte", "Saldo a liquidar", "Notas conferidas", "Já liquidado", "Em liquidação"],
    dados.linhas.map((l) => [l.empenhoNumero, l.origem, l.credor, l.fonteCodigo, formatarMoeda(l.saldoALiquidar).texto, l.notas.map((n) => `${n.rotulo} (${formatarMoeda(n.valor).texto})`).join("; "), formatarMoeda(l.liquidado).texto, formatarMoeda(l.emLiquidacao).texto])
  );
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Em liquidação" subtitulo={`${descreverRecorte(recorte)}: empenhos e restos com a entrega verificada e ainda não liquidada`} />

      <p className="text-xs text-[color:var(--color-ink-2)]">
        Entram aqui o empenho do exercício e o resto a pagar não processado que ainda têm saldo a liquidar e cujas notas fiscais conferidas somam mais do que já foi liquidado. O valor em liquidação é essa diferença, limitada ao saldo do empenho.
      </p>

      <nav aria-label="Origem" className="flex gap-3 text-xs" data-filtro-origem>
        {(["", "exercicio", "restos"] as const).map((o) =>
          o === origem ? (
            <span key={o} className="font-semibold">{o === "" ? "Exercício e restos" : o === "exercicio" ? "Só do exercício" : "Só restos"}</span>
          ) : (
            <Link key={o} className="underline" href={filtro(o)}>{o === "" ? "Exercício e restos" : o === "exercicio" ? "Só do exercício" : "Só restos"}</Link>
          )
        )}
      </nav>

      {dados.notasSemAtribuicao > 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-notas-sem-atribuicao>
          {dados.notasSemAtribuicao} nota(s) conferida(s) de ordem de compra com mais de um empenho ficaram fora: a nota não diz de qual dos empenhos da ordem ela é. Para entrar aqui, a nota precisa apontar o empenho.
        </p>
      ) : null}

      {dados.linhas.length === 0 ? (
        <EstadoVazio titulo="Nada em liquidação" descricao="Nenhum empenho ou resto com nota conferida ainda não liquidada neste recorte." />
      ) : (
        <>
          <div className="flex justify-end">
            <BotaoCsv csv={csv} nomeArquivo={`em-liquidacao-${String(recorte.exercicio)}.csv`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-tabela-em-liquidacao>
              <thead>
                <tr>
                  <th className={celula}>Empenho</th>
                  <th className={celula}>Origem</th>
                  <th className={celula}>Credor</th>
                  <th className={celula}>Fonte</th>
                  <th className={`${celula} text-right`}>Saldo a liquidar</th>
                  <th className={celula}>Notas conferidas</th>
                  <th className={`${celula} text-right`}>Já liquidado</th>
                  <th className={`${celula} text-right`}>Em liquidação</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={`${l.empenhoId}-${l.origem}`} data-em-liquidacao={l.empenhoNumero}>
                    <td className={celula}><Link className="underline" href={`/despesa/empenhos/${l.empenhoId}`}>{l.empenhoNumero}</Link></td>
                    <td className={celula}>{l.origem}</td>
                    <td className={celula}>{l.credor}</td>
                    <td className={celula}>{l.fonteCodigo}</td>
                    <td className={`${celula} text-right`}><ValorMonetario valor={l.saldoALiquidar} /></td>
                    <td className={celula}>
                      <ul className="space-y-0.5 text-xs">
                        {l.notas.map((n) => (
                          <li key={n.id}>{n.rotulo}, recebida em {n.recebidaEm}: <ValorMonetario valor={n.valor} /></li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${celula} text-right`}><ValorMonetario valor={l.liquidado} /></td>
                    <td className={`${celula} text-right font-semibold`}><ValorMonetario valor={l.emLiquidacao} /></td>
                  </tr>
                ))}
                <tr>
                  <td className={`${celula} font-semibold`} colSpan={7}>Em liquidação do exercício</td>
                  <td className={`${celula} text-right font-semibold`} data-total-exercicio><ValorMonetario valor={dados.totais.exercicio} /></td>
                </tr>
                <tr>
                  <td className={`${celula} font-semibold`} colSpan={7}>Em liquidação de restos</td>
                  <td className={`${celula} text-right font-semibold`} data-total-restos><ValorMonetario valor={dados.totais.restos} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
