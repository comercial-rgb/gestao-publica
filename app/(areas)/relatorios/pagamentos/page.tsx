import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { EscopoDeLeituraError, ExercicioIlegivelError, recorteDePagina, type RecorteDaPagina } from "../../../../lib/portas/contexto";
import {
  type DispendiosDaTela,
  filtroDosPagamentos,
  lerPagamentosEfetuados,
  type PagamentoEfetuadoDaTela,
  type PagamentosEfetuadosDaTela,
} from "../../../../lib/portas/pagamentos-efetuados";
import { dataBr, descreverRecorte } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — RELATÓRIO DE PAGAMENTOS EFETUADOS (TR 5.10.2.71 e 5.10.2.2). Os pagamentos do período — do exercício e de
 * restos a pagar —, com o pago, o retido e o líquido de cada um, filtrados por credor, fonte e conta bancária e
 * agrupáveis por um deles. O filtro mora na URL: a tela, o CSV e o PDF mostram o mesmo recorte.
 */
export const dynamic = "force-dynamic";

const CAMPO = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2";

export default async function PagamentosEfetuadosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  let recorte: RecorteDaPagina;
  let dados: PagamentosEfetuadosDaTela;
  let f: ReturnType<typeof filtroDosPagamentos>;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    f = filtroDosPagamentos(sp, recorte.exercicio);
    dados = await lerPagamentosEfetuados(f, recorte.unidadeCodigo);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Pagamentos efetuados" subtitulo="Pagamentos do período, do exercício e de restos a pagar" />
        <EstadoVazio
          titulo={erro instanceof EscopoDeLeituraError ? "Esta unidade não está no seu acesso" : erro instanceof ExercicioIlegivelError ? "Exercício inválido" : "Não foi possível ler os pagamentos"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const query = new URLSearchParams({ exercicio: String(recorte.exercicio), desde: f.desde, ate: f.ate });
  if (recorte.unidadeCodigo !== undefined) query.set("ug", recorte.unidadeCodigo);
  if (f.credor !== "") query.set("credor", f.credor);
  if (f.fonte !== "") query.set("fonte", f.fonte);
  if (f.conta !== "") query.set("conta", f.conta);
  if (f.agrupar !== "") query.set("agrupar", f.agrupar);
  if (!f.comRetencoes) query.set("retencoes", "nao");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Pagamentos efetuados"
        subtitulo={`${descreverRecorte(recorte)} — pagamentos de ${f.desde.split("-").reverse().join("/")} a ${f.ate.split("-").reverse().join("/")}, do exercício e de restos a pagar`}
      />

      <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-chrome aria-label="Filtrar os pagamentos">
        <input type="hidden" name="exercicio" value={recorte.exercicio} />
        {recorte.unidadeCodigo !== undefined ? <input type="hidden" name="ug" value={recorte.unidadeCodigo} /> : null}
        <label>
          <span className="block font-semibold">De</span>
          <input type="date" name="desde" defaultValue={f.desde} className={CAMPO} />
        </label>
        <label>
          <span className="block font-semibold">Até</span>
          <input type="date" name="ate" defaultValue={f.ate} className={CAMPO} />
        </label>
        <label>
          <span className="block font-semibold">Credor</span>
          <select name="credor" defaultValue={f.credor} className={CAMPO}>
            <option value="">Todos</option>
            {dados.opcoes.credores.map((c) => (
              <option key={c.documento} value={c.documento}>{c.nome ?? formatarDocumento(c.documento)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Fonte</span>
          <select name="fonte" defaultValue={f.fonte} className={CAMPO}>
            <option value="">Todas</option>
            {dados.opcoes.fontes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Conta bancária</span>
          <select name="conta" defaultValue={f.conta} className={CAMPO}>
            <option value="">Todas</option>
            {dados.opcoes.contas.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Agrupar por</span>
          <select name="agrupar" defaultValue={f.agrupar} className={CAMPO}>
            <option value="">Não agrupar</option>
            <option value="credor">Credor</option>
            <option value="fonte">Fonte</option>
            <option value="conta">Conta bancária</option>
          </select>
        </label>
        <label>
          <span className="block font-semibold">Retenções</span>
          <select name="retencoes" defaultValue={f.comRetencoes ? "" : "nao"} className={CAMPO}>
            <option value="">Mostrar retido e líquido</option>
            <option value="nao">Só o valor pago</option>
          </select>
        </label>
        <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]">Filtrar</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3" data-totais-pagamentos>
        <Card>
          <p className="text-xs text-[color:var(--color-ink-3)]">Pago (líquido de anulações)</p>
          <p className="text-lg font-semibold" data-total="pago"><ValorMonetario valor={dados.totais.pagoVivo} /></p>
        </Card>
        {f.comRetencoes ? (
          <>
            <Card>
              <p className="text-xs text-[color:var(--color-ink-3)]">Retido na fonte</p>
              <p className="text-lg font-semibold" data-total="retido"><ValorMonetario valor={dados.totais.retido} /></p>
            </Card>
            <Card>
              <p className="text-xs text-[color:var(--color-ink-3)]">Líquido ao credor</p>
              <p className="text-lg font-semibold" data-total="liquido"><ValorMonetario valor={dados.totais.liquido} /></p>
            </Card>
          </>
        ) : null}
      </div>

      {dados.linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhum pagamento no recorte" descricao="Não há pagamento no período com os filtros escolhidos. Amplie o período ou remova um filtro." />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csv(dados.linhas)} nomeArquivo={`pagamentos-${f.desde}-a-${f.ate}.csv`} />
            <BotaoPdf href={`/relatorios/pagamentos/pdf?${query.toString()}`} />
          </div>
          {dados.grupos.length > 0 ? (
            dados.grupos.map((g) => (
              <Card key={g.chave}>
                <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]" data-grupo={g.chave}>
                  {g.rotulo} — pago R$ {formatarMoeda(g.totais.pagoVivo).texto}
                  {f.comRetencoes ? ` · retido R$ ${formatarMoeda(g.totais.retido).texto} · líquido R$ ${formatarMoeda(g.totais.liquido).texto}` : ""}
                </h2>
                <Tabela linhas={g.linhas} comRetencoes={f.comRetencoes} />
              </Card>
            ))
          ) : (
            <Card>
              <Tabela linhas={dados.linhas} comRetencoes={f.comRetencoes} />
            </Card>
          )}
        </>
      )}

      <SecaoDosDispendios extra={dados.extra} periodo={`${f.desde}-a-${f.ate}`} />
    </div>
  );
}

/**
 * V36 — os dispêndios extraorçamentários do mesmo período (recolhimento ao consignatário, devolução de caução), numa
 * seção própria: não são pagamento de despesa e não somam no total acima. Sem a leitura do financeiro, ou com recorte
 * por unidade, a seção diz por que não está aqui.
 */
function SecaoDosDispendios({ extra, periodo }: { readonly extra: DispendiosDaTela; readonly periodo: string }): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">
        Dispêndios extraorçamentários
        {extra.disponivel ? <> — <span data-total="extra">R$ {formatarMoeda(extra.total).texto}</span></> : null}
      </h2>
      {!extra.disponivel ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-extra-indisponivel>{extra.motivo}</p>
      ) : extra.linhas.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum dispêndio extraorçamentário no período com os filtros escolhidos.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
            Recolhimentos a consignatários e devoluções de depósitos de terceiros. Não são pagamento de despesa e não entram no total acima. O estorno é descontado e a linha permanece.
          </p>
          <div className="mb-2 flex justify-end">
            <BotaoCsv csv={csvDosDispendios(extra.linhas)} nomeArquivo={`dispendios-extra-${periodo}.csv`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-lista="dispendios-extra">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1.5 pr-3">Data</th>
                  <th scope="col" className="py-1.5 pr-3">Tipo</th>
                  <th scope="col" className="py-1.5 pr-3">Consignatário</th>
                  <th scope="col" className="py-1.5 pr-3">Fonte</th>
                  <th scope="col" className="py-1.5 pr-3">Conta</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Valor</th>
                  <th scope="col" className="py-1.5 pr-3 text-right">Estornado</th>
                  <th scope="col" className="py-1.5 text-right">Efetivo</th>
                </tr>
              </thead>
              <tbody>
                {extra.linhas.map((l) => (
                  <tr key={l.id} className="border-t border-[color:var(--color-border)]" data-dispendio={l.id}>
                    <td className="py-1.5 pr-3">{dataBr(l.data)}</td>
                    <td className="py-1.5 pr-3">{l.tipoCodigo}</td>
                    <td className="py-1.5 pr-3"><Link className="underline" href={`/contabilidade/lancamentos/${l.lancamentoId}`}>{l.consignatario}</Link></td>
                    <td className="py-1.5 pr-3">{l.fonteCodigo ?? "não declarada"}</td>
                    <td className="py-1.5 pr-3">{l.contaBancaria}</td>
                    <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={l.valor} /></td>
                    <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={l.estornado} /></td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={l.vivo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function csvDosDispendios(linhas: Extract<DispendiosDaTela, { disponivel: true }>["linhas"]): string {
  return paraCsv(
    ["Data", "Tipo", "Consignatário", "Fonte", "Conta bancária", "Histórico", "Valor", "Estornado", "Efetivo"],
    linhas.map((l) => [dataBr(l.data), l.tipoCodigo, l.consignatario, l.fonteCodigo ?? "", l.contaBancaria, l.historico, formatarMoeda(l.valor).texto, formatarMoeda(l.estornado).texto, formatarMoeda(l.vivo).texto])
  );
}

function Tabela({ linhas, comRetencoes }: { readonly linhas: readonly PagamentoEfetuadoDaTela[]; readonly comRetencoes: boolean }): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" data-lista="pagamentos-efetuados">
        <thead>
          <tr className="text-[color:var(--color-ink-3)]">
            <th scope="col" className="py-1.5 pr-3">Data</th>
            <th scope="col" className="py-1.5 pr-3">Nº</th>
            <th scope="col" className="py-1.5 pr-3">Origem</th>
            <th scope="col" className="py-1.5 pr-3">Empenho</th>
            <th scope="col" className="py-1.5 pr-3">Credor</th>
            <th scope="col" className="py-1.5 pr-3">Fonte</th>
            <th scope="col" className="py-1.5 pr-3">Conta</th>
            <th scope="col" className="py-1.5 pr-3 text-right">Pago</th>
            {comRetencoes ? (
              <>
                <th scope="col" className="py-1.5 pr-3 text-right">Retido</th>
                <th scope="col" className="py-1.5 text-right">Líquido</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-t border-[color:var(--color-border)]" data-pagamento={l.numero} data-origem={l.origem}>
              <td className="py-1.5 pr-3">{dataBr(l.data)}</td>
              <td className="py-1.5 pr-3 font-mono">{l.numero}{l.anulado ? <Badge status="erro">anulado</Badge> : null}</td>
              <td className="py-1.5 pr-3">{l.origem === "RESTOS" ? `Restos a pagar de ${String(l.exercicioDaDotacao)}` : "Exercício"}</td>
              <td className="py-1.5 pr-3"><Link className="underline" href={`/despesa/empenhos/${l.empenhoId}#pagamento-${l.id}`}>{l.empenhoNumero}</Link></td>
              <td className="py-1.5 pr-3">{l.credorNome ?? formatarDocumento(l.credorCpfCnpj)}</td>
              <td className="py-1.5 pr-3">{l.fonteCodigo}</td>
              <td className="py-1.5 pr-3">{l.contaBancaria}</td>
              <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={l.pagoVivo} /></td>
              {comRetencoes ? (
                <>
                  <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={l.retido} /></td>
                  <td className="py-1.5 text-right"><ValorMonetario valor={l.liquido} /></td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** O CSV é a tela: as mesmas linhas e colunas, com os mesmos filtros. */
function csv(linhas: readonly PagamentoEfetuadoDaTela[]): string {
  return paraCsv(
    ["Data", "Nº", "Origem", "Exercício da dotação", "Empenho", "Liquidação", "Credor", "CPF/CNPJ", "Fonte", "Conta bancária", "Pago", "Retido", "Líquido", "Situação"],
    linhas.map((l) => [
      dataBr(l.data), l.numero, l.origem === "RESTOS" ? "Restos a pagar" : "Exercício", String(l.exercicioDaDotacao), l.empenhoNumero, l.liquidacaoNumero,
      l.credorNome ?? "", formatarDocumento(l.credorCpfCnpj), l.fonteCodigo, l.contaBancaria,
      formatarMoeda(l.pagoVivo).texto, formatarMoeda(l.retido).texto, formatarMoeda(l.liquido).texto, l.anulado ? "Anulado" : "Pago",
    ])
  );
}
