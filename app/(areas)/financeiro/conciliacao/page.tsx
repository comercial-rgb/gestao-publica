import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { rotuloDoModoDeIntegracao } from "../../../../lib/rotulos-de-modo";
import { lerPainelConciliacao, PortaSemBancoError, type PainelConciliacao } from "../../../../lib/portas/conciliacao";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { FormDesfazerVinculo, FormVincular } from "./FormsDoVinculo";
import { FormImportarExtrato } from "./FormImportarExtrato";
import { lerContasBancarias } from "../../../../lib/portas/pagamento";
import { filtrarEOrdenar, filtroAtivo, filtroDaConciliacao, somaExibida, type FiltroDaConciliacao } from "./filtro";

/** O nome do registro do sistema como o tesoureiro o chama (o tipo interno é código). */
const TIPO_DO_REGISTRO: Readonly<Record<string, string>> = {
  PAGAMENTO: "pagamento",
  ARRECADACAO: "arrecadação",
  MOVIMENTO_EXTRA: "extraorçamentário",
  MOVIMENTO_BANCARIO: "movimentação bancária",
  TRANSFERENCIA: "transferência",
};

/** O valor sem sinal (o residual vem com sinal: negativo = saída). */
const semSinal = (v: string): string => (v.startsWith("-") ? v.slice(1) : v);

/**
 * CONCILIAÇÃO BANCÁRIA (M09 bloco 3 + M17-a) — consulta e, desde a V22 rodada 7, o VÍNCULO entre a
 * linha do extrato e o registro do sistema (e o desfazer dele), para quem tem a permissão.
 *
 * ═══ POR QUE ESTA TELA MORA EM /financeiro E NÃO EM /integracoes ═══
 * A Central de Integrações responde "o canal está de pé, e em que modo?"; esta tela responde "o
 * banco e o razão contam a mesma história?". A segunda pergunta é de TESOURARIA — quem a faz é o
 * tesoureiro fechando o mês, não quem cuida do canal. Por isso ela é `/financeiro/conciliacao`, e
 * a Central apenas APONTA para cá (o card do BB ganhou ação). O hub do Financeiro, que antes
 * mandava o usuário para a Central e a Central para lugar nenhum, agora aponta direto para o
 * número — o anel se fechou no lugar certo.
 *
 * ⚠️ HONESTIDADE (DIRETIVA §4/§7): a massa é FIXTURE POC (modo MOCK). NENHUMA chamada financeira
 * real foi feita — nem para consultar, muito menos para movimentar. Isso está dito no topo da
 * tela, em destaque, e não em nota de rodapé.
 */
export const dynamic = "force-dynamic";

/** dd/mm/aaaa hh:mm (UTC) — o carimbo do vínculo/import, que é evento, não data de fato. */
function carimbo(d: Date): string {
  return `${dataBr(d)} ${d.toISOString().slice(11, 16)}`;
}

export default async function ConciliacaoBancariaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const sp = await searchParams;

  // ⚠️ SÓ O EXERCÍCIO: a conciliação confronta o extrato do BANCO com o razão, e conta
  // bancária não pertence a unidade orçamentária — `lerPainelConciliacao({ exercicio })` não
  // recebe unidade. Não há `?ug=` a recusar aqui.
  //
  // ⚠️ E A RECUSA VEM ANTES DO TRY PRINCIPAL, o que deixa o `cabecalho` onde estava: ele é
  // usado em TRÊS saídas desta tela, e a essa altura `exercicio` já foi autorizado, então
  // as três podem afirmá-lo sem mentir.
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(sp);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Conciliação bancária"
          subtitulo="Confronto do extrato bancário com os registros contábeis"
        />
        <EstadoVazio
          titulo={
            erro instanceof ExercicioIlegivelError
              ? "O exercício pedido não é um ano"
              : "Não foi possível carregar a consulta"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const cabecalho = (
    <PageHeader
      titulo="Conciliação bancária"
      subtitulo={`Exercício ${exercicio}: confronto do extrato bancário com os registros contábeis, com pendências e diferenças`}
    />
  );

  let painel: PainelConciliacao | null;
  try {
    painel = await lerPainelConciliacao({ exercicio });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível carregar a conciliação"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // V36 — a importação do OFX mora aqui, para quem tem a ação (a mesma fonte que o serviço confere).
  const podeImportar = (await acoesPermitidas(["IMPORTAR_EXTRATO"])).has("IMPORTAR_EXTRATO");
  const importar = podeImportar ? <FormImportarExtrato contas={(await lerContasBancarias()).map((c) => ({ codigo: c.codigo, descricao: c.descricao }))} /> : null;

  // Sem extrato importado NÃO é "tudo conciliado" — é "não há o que conciliar". A diferença
  // importa: um zero mudo aqui faria a Comissão ler uma conta fechada onde não há conta nenhuma.
  if (painel === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        {/* V36: na MESMA posição do estado com extrato — o primeiro extrato troca o estado da tela, e um
            formulário em outra posição seria remontado e perderia a mensagem do próprio sucesso. */}
        {importar}
        <EstadoVazio
          titulo={`Nenhum extrato bancário importado no exercício ${exercicio}`}
          descricao={podeImportar ? "A conciliação exige um extrato importado. Importe o arquivo OFX acima, ou use a API do Banco do Brasil na Central de Integrações." : "A conciliação exige um extrato importado. A importação é feita por quem tem a permissão de importar extratos."}
          acao={
            <Link href="/integracoes" className="text-sm font-semibold text-[color:var(--color-primary)] underline">
              Ir para a Central de Integrações
            </Link>
          }
        />
      </div>
    );
  }

  const { conta, extrato, resumo, modo } = painel;
  // V36 (TR 5.10.2.50/51) — filtros e ordem pela coluna de valor. Recorte de EXIBIÇÃO: o resumo continua o do motor.
  const filtro = filtroDaConciliacao(sp);
  const comFiltro = filtroAtivo(filtro);
  const correspondencias = filtrarEOrdenar(painel.correspondencias, filtro, {
    data: (c) => c.extrato.data,
    texto: (c) => `${c.extrato.memo} ${c.extrato.fitid} ${c.interno.rotulo} ${c.interno.detalhe ?? ""}`,
    valor: (c) => c.valorConciliado,
  });
  const pendenciasExtrato = filtrarEOrdenar(painel.pendenciasExtrato, filtro, { data: (l) => l.data, texto: (l) => l.descricao, valor: (l) => l.residual });
  const pendenciasInternas = filtrarEOrdenar(painel.pendenciasInternas, filtro, { data: (l) => l.data, texto: (l) => l.descricao, valor: (l) => l.residual, tipo: (l) => l.tipo });
  const fecha = resumo.diferenca === resumo.diferencaExplicada;
  // O menu e os botões mostram só o que o servidor autoriza — a MESMA fonte que o ato confere.
  const permitidas = await acoesPermitidas(["VINCULAR_CONCILIACAO", "ESTORNAR_VINCULO"]);
  const podeVincular = permitidas.has("VINCULAR_CONCILIACAO");
  const podeDesfazer = permitidas.has("ESTORNAR_VINCULO");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}
      {importar}

      {/* ══ HONESTIDADE, NO TOPO — não é nota de rodapé (DIRETIVA §4/§7) ══ */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Origem dos dados: demonstração.</strong>{" "}
        As linhas do extrato abaixo são <strong>dados de demonstração</strong> no formato da API de
        Extratos do Banco do Brasil, importados pelo mesmo processo utilizado em produção.{" "}
        <strong>Nenhuma operação financeira real foi realizada</strong>, nem de consulta nem de
        movimentação. {modo.live} Agência e conta são exibidas{" "}
        <strong>mascaradas</strong>.
      </div>

      {/* ══ A CONTA, A ORIGEM E O MODO ══ */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
              {conta.codigo} — {conta.descricao}
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              Conta contábil correspondente: <span className="font-mono">{conta.contaContabil}</span>.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge status="neutro">origem {extrato.origem}</Badge>
            <Badge status={modo.estado === "DISPONIVEL" ? "ok" : "alerta"}>{rotuloDoModoDeIntegracao(modo.modo)}</Badge>
          </div>
        </div>

        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Banco (FEBRABAN)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.banco ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Agência (mascarada)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.agenciaMascarada}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Conta (mascarada)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.contaMascarada}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Competência do extrato</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">
              {dataBr(extrato.periodoInicio)} a {dataBr(extrato.periodoFim)}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Data de corte do relatório</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">{dataBr(painel.corte)}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Vínculos considerados até</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">{carimbo(painel.conhecimento)} (agora)</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Linhas importadas</dt>
            <dd className="mt-0.5 tabular text-[color:var(--color-ink)]">{extrato.quantidadeLinhas}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Importado por / em</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">
              {extrato.importadoPor} · {carimbo(extrato.importadoEm)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[color:var(--color-ink-3)]">Código de verificação do arquivo (SHA-256)</dt>
            <dd className="mt-0.5 truncate font-mono text-[color:var(--color-ink-2)]" title={extrato.hashOrigem}>
              {extrato.hashOrigem.slice(0, 24)}…
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">{modo.mensagem}</p>
      </Card>

      <FiltrosDaConciliacao exercicio={exercicio} filtro={filtro} />

      {/* ══ CORRESPONDÊNCIAS — os dois lados, lado a lado ══ */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
          Correspondências entre o extrato e os registros do sistema
        </h2>
        <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
          A correspondência pode ser parcial em qualquer dos lados; por isso o valor conciliado é
          exibido separadamente dos valores do extrato e do sistema.
        </p>
        {correspondencias.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">{comFiltro && painel.correspondencias.length > 0 ? "Nenhuma correspondência passa nos filtros." : "Nenhuma linha do extrato foi conciliada ainda."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="correspondencias">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Extrato — data</th>
                  <th className="py-1.5 pr-4">Extrato — histórico (FITID)</th>
                  <th className="py-1.5 pr-4 text-right">Extrato — valor</th>
                  <th className="py-1.5 pr-4">Interno — data</th>
                  <th className="py-1.5 pr-4">Interno — documento</th>
                  <th className="py-1.5 pr-4 text-right">Interno — valor</th>
                  <th className="py-1.5 text-right">Conciliado</th>
                  {podeDesfazer ? <th className="py-1.5 pl-4">Desfazer</th> : null}
                </tr>
              </thead>
              <tbody>
                {correspondencias.map((c) => (
                  <tr key={c.vinculoId} className="border-b border-[color:var(--color-border)] align-top">
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(c.extrato.data)}</td>
                    <td className="py-1.5 pr-4">
                      <span className="text-[color:var(--color-ink)]">{c.extrato.memo}</span>
                      <span className="ml-1 text-[color:var(--color-ink-3)]">({c.extrato.natureza})</span>
                      <div className="font-mono text-xs text-[color:var(--color-ink-3)]">FITID {c.extrato.fitid}</div>
                    </td>
                    <td className="py-1.5 pr-4 text-right whitespace-nowrap"><ValorMonetario valor={c.extrato.valor} /></td>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(c.interno.data)}</td>
                    <td className="py-1.5 pr-4">
                      <span className="text-[color:var(--color-ink)]">{c.interno.rotulo}</span>
                      {c.interno.detalhe !== null ? (
                        <div className="text-xs text-[color:var(--color-ink-3)]">{c.interno.detalhe}</div>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-4 text-right whitespace-nowrap"><ValorMonetario valor={c.interno.valor} /></td>
                    <td className="py-1.5 text-right font-semibold whitespace-nowrap">
                      <ValorMonetario valor={c.valorConciliado} />
                      <div className="text-xs font-normal text-[color:var(--color-ink-3)]">
                        {carimbo(c.conciliadoEm)} · {c.conciliadoPor}
                      </div>
                    </td>
                    {podeDesfazer ? (
                      <td className="py-1.5 pl-4">
                        <FormDesfazerVinculo vinculoId={c.vinculoId} rotulo={`${c.extrato.memo} com ${c.interno.rotulo}`} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">
                    {comFiltro ? "Total conciliado (todas) · das linhas exibidas" : "Total conciliado"}
                  </td>
                  <td className="py-2 text-right font-semibold">
                    <ValorMonetario valor={resumo.totalConciliado} />
                    {comFiltro ? <div className="text-xs font-normal" data-soma-exibida="correspondencias"><ValorMonetario valor={somaExibida(correspondencias, (c) => c.valorConciliado)} /></div> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ══ PENDÊNCIAS — os dois lados, cada um com o seu significado ══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
            No banco e não no razão
          </h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Lançamentos do extrato sem registro correspondente no sistema, como tarifas não
            contabilizadas ou créditos não registrados. Valores positivos são entradas; negativos, saídas.
          </p>
          {pendenciasExtrato.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">{comFiltro && painel.pendenciasExtrato.length > 0 ? "Nenhuma pendência deste lado passa nos filtros." : "Nada pendente deste lado."}</p>
          ) : (
            <table className="w-full text-sm" data-lista="pendencias-extrato">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th>
                  <th className="py-1.5 pr-4">Linha do extrato</th>
                  <th className="py-1.5 text-right">Residual</th>
                </tr>
              </thead>
              <tbody>
                {pendenciasExtrato.map((l, i) => (
                  <tr key={i} className="border-b border-[color:var(--color-border)]" data-residual={l.residual}>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">{l.descricao}</td>
                    <td className="py-1.5 text-right whitespace-nowrap"><ValorMonetario valor={l.residual} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">{comFiltro ? "Soma (todas) · das linhas exibidas" : "Soma"}</td>
                  <td className="py-2 text-right font-semibold">
                    <ValorMonetario valor={resumo.totalPendenteExtrato} />
                    {comFiltro ? <div className="text-xs font-normal" data-soma-exibida="pendencias-extrato"><ValorMonetario valor={somaExibida(pendenciasExtrato, (l) => l.residual)} /></div> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
            No razão e não no banco
          </h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Registros do sistema nesta conta que ainda não constam do extrato, como cheques não
            compensados ou depósitos não creditados.
          </p>
          {pendenciasInternas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">{comFiltro && painel.pendenciasInternas.length > 0 ? "Nenhuma pendência deste lado passa nos filtros." : "Nada pendente deste lado."}</p>
          ) : (
            <table className="w-full text-sm" data-lista="pendencias-internas">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th>
                  <th className="py-1.5 pr-4">Documento</th>
                  <th className="py-1.5 text-right">Residual</th>
                </tr>
              </thead>
              <tbody>
                {pendenciasInternas.map((l, i) => (
                  <tr key={i} className="border-b border-[color:var(--color-border)]" data-residual={l.residual} data-tipo={l.tipo}>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">
                      {l.descricao} <span className="text-[color:var(--color-ink-3)]">({TIPO_DO_REGISTRO[l.tipo] ?? l.tipo})</span>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap"><ValorMonetario valor={l.residual} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">{comFiltro ? "Soma (todas) · das linhas exibidas" : "Soma"}</td>
                  <td className="py-2 text-right font-semibold">
                    <ValorMonetario valor={resumo.totalPendenteInterno} />
                    {comFiltro ? <div className="text-xs font-normal" data-soma-exibida="pendencias-internas"><ValorMonetario valor={somaExibida(pendenciasInternas, (l) => l.residual)} /></div> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>

      {podeVincular && painel.pendenciasExtrato.length > 0 && painel.pendenciasInternas.length > 0 ? (
        <FormVincular
          linhas={painel.pendenciasExtrato.map((l) => ({ valor: l.id, residual: semSinal(l.residual), rotulo: `${dataBr(l.data)} · ${l.descricao} · R$ ${formatarMoeda(l.residual).texto}` }))}
          registros={painel.pendenciasInternas.map((l) => ({ valor: `${l.tipo}:${l.id}`, residual: semSinal(l.residual), rotulo: `${dataBr(l.data)} · ${l.descricao} (${TIPO_DO_REGISTRO[l.tipo] ?? l.tipo}) · R$ ${formatarMoeda(l.residual).texto}` }))}
        />
      ) : null}

      {painel.lancamentosSemContaBancaria.length > 0 ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Lançamentos na conta contábil sem conta bancária</h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            A conta contábil <span className="font-mono">{conta.contaContabil}</span> é de mais de uma conta bancária. Estes
            lançamentos não vêm de pagamento, arrecadação, transferência ou movimentação de conta nenhuma, e por isso não entram
            na conciliação de nenhuma delas. Confira no razão a que conta cada um pertence.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Data</th>
                <th className="py-1.5 pr-4">Lançamento</th>
                <th className="py-1.5 text-right">Valor na conta</th>
              </tr>
            </thead>
            <tbody>
              {painel.lancamentosSemContaBancaria.map((l) => (
                <tr key={l.numeroControle + l.data.toISOString()} className="border-b border-[color:var(--color-border)]">
                  <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(l.data)}</td>
                  <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">{l.numeroControle} — {l.historico}</td>
                  <td className="py-1.5 text-right whitespace-nowrap"><ValorMonetario valor={l.valor} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* ══ O RESUMO QUE FECHA ══ */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Resumo e conferência</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
          A diferença entre os saldos deve ser igual à soma das pendências dos dois lados. A
          conciliação <strong>não é emitida</strong> com diferença sem explicação.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Saldo pelo extrato bancário, até a data de corte</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.saldoExtrato} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">
                  Saldo pelo razão (conta <span className="font-mono">{conta.contaContabil}</span>), até a data de corte
                </td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.saldoContabil} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 font-semibold text-[color:var(--color-ink)]">Diferença (extrato − razão)</td>
                <td className="py-1.5 text-right font-semibold"><ValorMonetario valor={resumo.diferenca} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Pendente no banco (+) menos pendente no razão (−)</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.diferencaExplicada} /></td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Total conciliado</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.totalConciliado} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge status={fecha ? "ok" : "erro"}>{fecha ? "diferença explicada" : "diferença não explicada"}</Badge>
          <span className="text-xs text-[color:var(--color-ink-2)]">
            {fecha
              ? "A diferença está integralmente explicada pelas pendências listadas acima."
              : "Há diferença sem explicação: pode faltar um registro ou haver vínculo com data posterior à data de corte."}
          </span>
        </div>
      </Card>

      <p className="text-xs text-[color:var(--color-ink-3)]">
        Aqui se vincula e se desfaz o vínculo entre o extrato e o sistema. A abertura, a justificativa de
        pendências e o encerramento por período são feitos em{" "}
        <Link href="/financeiro/conciliacao/periodo" className="text-[color:var(--color-primary)] underline">
          Conciliação por período
        </Link>
        .
      </p>
    </div>
  );
}

const CAMPO_DO_FILTRO = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2";

/** V36 — os filtros da conciliação, na URL (GET não muda estado). O vínculo continua oferecendo todas as pendências. */
function FiltrosDaConciliacao({ exercicio, filtro }: { readonly exercicio: number; readonly filtro: FiltroDaConciliacao }): React.ReactElement {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-chrome aria-label="Filtrar a conciliação">
      <input type="hidden" name="exercicio" value={exercicio} />
      <label>
        <span className="block font-semibold">De</span>
        <input type="date" name="desde" defaultValue={filtro.desde} className={CAMPO_DO_FILTRO} />
      </label>
      <label>
        <span className="block font-semibold">Até</span>
        <input type="date" name="ate" defaultValue={filtro.ate} className={CAMPO_DO_FILTRO} />
      </label>
      <label>
        <span className="block font-semibold">Histórico, documento ou FITID</span>
        <input type="text" name="texto" defaultValue={filtro.texto} className={CAMPO_DO_FILTRO} />
      </label>
      <label>
        <span className="block font-semibold">Valor</span>
        <input type="text" inputMode="decimal" name="valor" defaultValue={filtro.valor === "" ? filtro.valorIgnorado : formatarMoeda(filtro.valor).texto} className={CAMPO_DO_FILTRO} />
      </label>
      <label>
        <span className="block font-semibold">Tipo do registro</span>
        <select name="tipo" defaultValue={filtro.tipo} className={CAMPO_DO_FILTRO}>
          <option value="">Todos</option>
          {Object.entries(TIPO_DO_REGISTRO).map(([v, r]) => (
            <option key={v} value={v}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="block font-semibold">Ordenar</span>
        <select name="ordem" defaultValue={filtro.ordem} className={CAMPO_DO_FILTRO}>
          <option value="">Por data</option>
          <option value="valor-asc">Por valor, do menor ao maior</option>
          <option value="valor-desc">Por valor, do maior ao menor</option>
        </select>
      </label>
      <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]">Filtrar</button>
      {filtro.valorIgnorado !== "" ? (
        <p className="w-full text-[color:var(--color-status-alerta-fg)]" data-valor-ignorado>
          O valor "{filtro.valorIgnorado}" não é um número e foi ignorado.
        </p>
      ) : null}
    </form>
  );
}
