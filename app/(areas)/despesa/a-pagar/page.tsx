import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { faseDoFiltro, lerAPagar, origemDoFiltro, ROTULO_DA_FASE, ROTULO_DA_SITUACAO, venceAteDoFiltro, type APagarDaTela } from "../../../../lib/portas/a-pagar";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { EscopoDeLeituraError, ExercicioIlegivelError, recorteDePagina } from "../../../../lib/portas/contexto";
import { PortaSemBancoError } from "../../../../lib/portas/empenho";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { dataBr, descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * A PAGAR (V33) — o que o ente deve, por credor e por obrigação. A aritmética é do M05 e do M08
 * (`modules/m05-despesa/a-pagar.ts`); esta tela só agrupa e mostra.
 *
 * ⚠️ DUAS FASES, NUNCA SOMADAS: "liquidado a pagar" é obrigação exigível; "a liquidar" é compromisso que ainda
 * depende da entrega. O total do topo e o de cada credor dizem as duas separadas.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const LINK = "text-[color:var(--color-primary)] underline";
const SITUACAO = ROTULO_DA_SITUACAO;
const FASE = ROTULO_DA_FASE;

const umString = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function APagarPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const credor = umString(sp["credor"]).replace(/\D/g, "");
  const fase = faseDoFiltro(umString(sp["fase"]));
  const origem = origemDoFiltro(umString(sp["origem"]));
  const fonte = umString(sp["fonte"]).trim();
  const venceAte = venceAteDoFiltro(umString(sp["venceAte"]));
  let recorte: RecorteDaPagina;
  let dados: APagarDaTela;
  let permitidas: ReadonlySet<string>;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    [dados, permitidas] = await Promise.all([
      lerAPagar({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo, fase, origem, ...(credor !== "" ? { credorCpfCnpj: credor } : {}), ...(fonte !== "" ? { fonteCodigo: fonte } : {}), ...(venceAte !== "" ? { venceAte } : {}) }),
      acoesPermitidas(["PAGAR", "LIQUIDAR"]),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="A pagar" subtitulo="Obrigações por credor" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar o que há a pagar"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  // O recorte de fase e origem e os totais vêm da porta: a tela, o CSV e o PDF leem o mesmo resultado.
  const credores = dados.credores;
  const todas = credores.flatMap((c) => c.obrigacoes);
  const exigivel = dados.totais.liquidadoAPagar;
  const compromisso = dados.totais.aLiquidar;
  const nomeDe = new Map(dados.opcoesDeCredor.map((o) => [o.documento, o.nome]));

  const csv = paraCsv(
    ["Credor", "CPF/CNPJ", "Origem", "Exercício de origem", "Fase", "Empenho", "Liquidação", "Unidade", "Fonte", "Base", "Pago (bruto)", "Retido", "Pago (líquido)", "Cancelado", "Saldo", "Vencimento"],
    todas.map((o) => [
      nomeDe.get(o.credorCpfCnpj) ?? "",
      formatarDocumento(o.credorCpfCnpj),
      SITUACAO[o.situacao],
      String(o.exercicioOrigem),
      FASE[o.fase],
      o.empenhoNumero,
      o.liquidacaoNumero ?? "",
      o.unidadeCodigo,
      o.fonteCodigo,
      formatarMoeda(o.base.toFixed(2)).texto,
      formatarMoeda(o.pagoBruto.toFixed(2)).texto,
      formatarMoeda(o.retido.toFixed(2)).texto,
      formatarMoeda(o.pagoLiquido.toFixed(2)).texto,
      formatarMoeda(o.cancelado.toFixed(2)).texto,
      formatarMoeda(o.saldo.toFixed(2)).texto,
      o.vencimento === null ? "" : dataBr(o.vencimento),
    ])
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="A pagar"
        subtitulo={`${descreverRecorte(recorte)}: obrigações por credor, do exercício e de restos a pagar`}
        acoes={
          <div className="flex gap-2" data-chrome>
            <BotaoCsv csv={csv} nomeArquivo={`a-pagar-${String(recorte.exercicio)}.csv`} />
            <BotaoImprimir />
            <BotaoPdf href={`/despesa/a-pagar/pdf?${new URLSearchParams({ exercicio: String(recorte.exercicio), ...(recorte.unidadeCodigo !== undefined ? { ug: recorte.unidadeCodigo } : {}), ...(credor !== "" ? { credor } : {}), ...(fase !== "" ? { fase } : {}), ...(origem !== "" ? { origem } : {}), ...(fonte !== "" ? { fonte } : {}), ...(venceAte !== "" ? { venceAte } : {}) }).toString()}`} />
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-chrome aria-label="Filtrar o que há a pagar">
        <input type="hidden" name="exercicio" value={recorte.exercicio} />
        {recorte.unidadeCodigo !== undefined ? <input type="hidden" name="ug" value={recorte.unidadeCodigo} /> : null}
        <label>
          <span className="block font-semibold">Credor</span>
          <select name="credor" defaultValue={credor} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2">
            <option value="">Todos</option>
            {dados.opcoesDeCredor.map((o) => (
              <option key={o.documento} value={o.documento}>
                {o.nome ?? formatarDocumento(o.documento)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Fase</span>
          <select name="fase" defaultValue={fase} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2">
            <option value="">As duas</option>
            <option value="LIQUIDADO_A_PAGAR">Liquidado a pagar</option>
            <option value="A_LIQUIDAR">A liquidar</option>
          </select>
        </label>
        <label>
          <span className="block font-semibold">Origem</span>
          <select name="origem" defaultValue={origem} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2">
            <option value="">Exercício e restos</option>
            <option value="exercicio">Só o exercício</option>
            <option value="restos">Só restos a pagar</option>
          </select>
        </label>
        <label>
          <span className="block font-semibold">Fonte</span>
          <select name="fonte" defaultValue={fonte} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2">
            <option value="">Todas</option>
            {dados.opcoesDeFonte.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Vence até</span>
          <input type="date" name="venceAte" defaultValue={venceAte} className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2" />
        </label>
        <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]">Filtrar</button>
      </form>

      {venceAte !== "" ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-filtro-vencimento>
          Mostrando só o que vence até {venceAte.split("-").reverse().join("/")}. O vencimento vem da ordem de pagamento:
          obrigação ainda sem ordem não tem vencimento e fica fora deste recorte.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2" data-totais-a-pagar>
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Liquidado a pagar (obrigação exigível)</p>
          <p className="text-lg font-semibold" data-total="liquidado-a-pagar"><ValorMonetario valor={exigivel} /></p>
        </Card>
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Empenhado a liquidar (compromisso, ainda não exigível)</p>
          <p className="text-lg font-semibold" data-total="a-liquidar"><ValorMonetario valor={compromisso} /></p>
        </Card>
      </div>

      {credores.length === 0 ? (
        <EstadoVazio titulo="Nada a pagar neste recorte" descricao={`Nenhuma obrigação aberta em ${descreverRecorte(recorte).toLowerCase()} com os filtros escolhidos.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-xs" data-lista="a-pagar">
            <caption className="sr-only">Obrigações a pagar, por credor; valores em reais</caption>
            <thead>
              <tr className="border-b border-[color:var(--color-border-strong)] text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-2">Origem</th>
                <th scope="col" className="py-2 pr-2">Fase</th>
                <th scope="col" className="py-2 pr-2">Empenho</th>
                <th scope="col" className="py-2 pr-2">Liquidação</th>
                <th scope="col" className="py-2 pr-2">Unidade · fonte</th>
                <th scope="col" className="py-2 pr-2 text-right">Base</th>
                <th scope="col" className="py-2 pr-2 text-right">Pago (bruto)</th>
                <th scope="col" className="py-2 pr-2 text-right">Retido</th>
                <th scope="col" className="py-2 pr-2 text-right">Pago (líquido)</th>
                <th scope="col" className="py-2 pr-2 text-right">Cancelado</th>
                <th scope="col" className="py-2 pr-2 text-right">Saldo</th>
                <th scope="col" className="py-2 pr-2">Vencimento</th>
                <th scope="col" className="py-2" data-chrome><span className="sr-only">Ação</span></th>
              </tr>
            </thead>
            {credores.map((c) => (
              <tbody key={c.credorCpfCnpj} data-credor={c.credorCpfCnpj}>
                <tr className="border-t-2 border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)]">
                  <th scope="rowgroup" colSpan={13} className="py-2 pr-2 text-left">
                    <Link className={`font-semibold ${LINK}`} data-elo="ficha-do-credor" href={`/relatorios/credor?exercicio=${String(recorte.exercicio)}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}&documento=${c.credorCpfCnpj}`}>{c.credorNome ?? "Credor sem cadastro de pessoa"}</Link>{" "}
                    <span className="font-mono text-[color:var(--color-ink-3)]">{formatarDocumento(c.credorCpfCnpj)}</span>
                    <span className="ml-3 font-normal">
                      liquidado a pagar <strong data-subtotal="liquidado-a-pagar"><ValorMonetario valor={c.liquidadoAPagar.toFixed(2)} /></strong> · a liquidar{" "}
                      <strong data-subtotal="a-liquidar"><ValorMonetario valor={c.aLiquidar.toFixed(2)} /></strong>
                    </span>
                  </th>
                </tr>
                {c.obrigacoes.map((o) => (
                  <tr key={o.chave} className="border-t border-[color:var(--color-border)] align-top" data-obrigacao={o.chave} data-fase={o.fase}>
                    <td className="py-1.5 pr-2">
                      {SITUACAO[o.situacao]}
                      {o.situacao === "EXERCICIO" ? null : <span className="block text-[color:var(--color-ink-3)]">de {o.exercicioOrigem}</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge status={o.fase === "LIQUIDADO_A_PAGAR" ? "alerta" : "neutro"}>{FASE[o.fase]}</Badge>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Link className={LINK} href={`/despesa/empenhos/${o.empenhoId}`}>{o.empenhoNumero}</Link>
                    </td>
                    <td className="py-1.5 pr-2">
                      {o.liquidacaoId === null ? (
                        <span className="text-[color:var(--color-ink-3)]">—</span>
                      ) : (
                        <Link className={LINK} href={`/despesa/documento/LIQUIDACAO/${o.liquidacaoId}`}>{o.liquidacaoNumero}</Link>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 font-mono">{o.unidadeCodigo} · {o.fonteCodigo}</td>
                    <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={o.base.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={o.pagoBruto.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={o.retido.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={o.pagoLiquido.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={o.cancelado.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2 text-right font-semibold" data-saldo><ValorMonetario valor={o.saldo.toFixed(2)} /></td>
                    <td className="py-1.5 pr-2">{o.vencimento === null ? <span className="text-[color:var(--color-ink-3)]">sem ordem</span> : dataBr(o.vencimento)}</td>
                    <td className="py-1.5" data-chrome>
                      {o.fase === "LIQUIDADO_A_PAGAR" && o.situacao === "EXERCICIO" && o.liquidacaoId !== null && permitidas.has("PAGAR") ? (
                        <Link className={LINK} href={`/despesa/pagamentos?exercicio=${String(recorte.exercicio)}&liquidacao=${o.liquidacaoId}`}>Pagar</Link>
                      ) : o.fase === "A_LIQUIDAR" && o.situacao === "EXERCICIO" && permitidas.has("LIQUIDAR") ? (
                        <Link className={LINK} href={`/despesa/liquidacoes?exercicio=${String(recorte.exercicio)}&empenho=${o.empenhoId}`}>Liquidar</Link>
                      ) : o.inscricaoId !== null ? (
                        <Link className={LINK} href={`/despesa/restos-a-pagar/${o.inscricaoId}`}>Inscrição em restos</Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {dados.semInscricao.length > 0 ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Empenhos de exercícios encerrados com saldo e sem inscrição em restos</h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Não entram nos totais acima: sem inscrição, o saldo não é obrigação a pagar. Confira o encerramento do exercício de origem.
          </p>
          <ul className="space-y-1 text-xs" data-sem-inscricao>
            {dados.semInscricao.map((e) => (
              <li key={e.empenhoId}>
                <Link className={LINK} href={`/despesa/empenhos/${e.empenhoId}`}>{e.empenhoNumero}</Link> ({e.exercicio}) · {e.credorNome ?? formatarDocumento(e.credorCpfCnpj)} · a liquidar{" "}
                <ValorMonetario valor={e.saldoALiquidar.toFixed(2)} /> · a pagar <ValorMonetario valor={e.saldoAPagar.toFixed(2)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
