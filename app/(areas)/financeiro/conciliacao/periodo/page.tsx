import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import {
  ConciliacaoNaoFechaError,
  contasComSaldo,
  listarConciliacoes,
  MapeamentoContabilAusenteError,
  PortaSemBancoError,
  verConciliacao,
} from "../../../../../lib/portas/tesouraria";
import {
  FormAbrirPeriodo,
  FormAtribuirConta,
  FormEncerrar,
  FormJustificar,
  FormPendenciaManual,
} from "./FormsDoPeriodo";
import type { ArrecadacaoSemConta } from "../../../../../lib/portas/tesouraria";
import { diaCivilBr } from "../../../../../packages/datas/index";
import { diaCivil } from "../../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";

/**
 * CONCILIAÇÃO POR PERÍODO — TR 5.10.2.45/.46/.49/.52.
 *
 * É o terceiro dos quatro percursos da definição de concluído: conciliar um período, com
 * **encerramento** e **abertura do seguinte**, e ver tudo persistido após recarga.
 *
 * ⚠️ OS SALDOS SÃO DERIVADOS, SEMPRE — nada é congelado no encerramento. Ver
 * `docs/adr/ADR-conciliacao-como-objeto-discreto.md`: um valor congelado divergindo do
 * razão faria esta tela, que existe para comparar duas fontes, comparar o sistema contra
 * ele mesmo.
 *
 * ⚠️ E A HERANÇA DO PERÍODO ANTERIOR É POR REFERÊNCIA. Nenhuma linha é duplicada:
 * duplicar faria a soma contar a mesma pendência duas vezes.
 */
export const dynamic = "force-dynamic";

export default async function PeriodoDeConciliacaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const params = await searchParams;
  const contaParam = typeof params["conta"] === "string" ? params["conta"] : "";
  const idParam = typeof params["id"] === "string" ? params["id"] : "";

  const cabecalho = (
    <PageHeader
      titulo="Conciliação por período"
      subtitulo="Abertura, justificativa de pendências e encerramento; o que não for resolvido passa ao período seguinte"
    />
  );

  try {
    const contas = await contasComSaldo(diaCivil(new Date()));
    const conta = contas.find((c) => c.id === contaParam) ?? contas[0];

    if (conta === undefined) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Nenhuma conta bancária"
            descricao="Cadastre a conta bancária e a conta contábil correspondente para iniciar a conciliação."
          />
        </div>
      );
    }

    const periodos = await listarConciliacoes(conta.id);
    const escolhido = periodos.find((p) => p.id === idParam) ?? periodos[0];

    // ⚠️ A CONTA SEM MAPEAMENTO CONTÁBIL É UM CASO CONHECIDO, e a tela DIZ isso.
    //
    // `conciliacaoBancaria` recusa emitir o relatório quando a conta não tem
    // `contaContabilId` — e com razão: sem ele não há contra o que fechar. A primeira
    // versão desta página deixava a exceção subir, e o Next devolvia **500**. Um 500
    // esconde a única informação que o operador precisava ler: QUAL conta parametrizar.
    let detalhe = null;
    let semMapeamento: string | null = null;
    // ⚠️ V4 (§10): a conciliação que NÃO FECHA também é estado da tela, não 500. O tripwire da
    // identidade (diferença == linhas sem vínculo) acusou no banco dos percursos — e a tela
    // devolvia 500, escondendo quanto sobra sem explicação. Agora ela diz.
    let naoFecha: string | null = null;
    // V6 P1.2: as guias da fonte SEM conta bancária (legado) — o que o tesoureiro pode resolver.
    // Vêm no relatório quando ele sai, e no ERRO quando não fecha: é justamente aí que importam.
    let semConta: readonly ArrecadacaoSemConta[] = [];
    if (escolhido !== undefined) {
      try {
        detalhe = await verConciliacao(escolhido.id);
        semConta = detalhe.relatorio.arrecadacoesSemConta;
      } catch (erro) {
        if (erro instanceof MapeamentoContabilAusenteError) semMapeamento = erro.message;
        else if (erro instanceof ConciliacaoNaoFechaError) {
          naoFecha = erro.message;
          semConta = erro.arrecadacoesSemConta;
        } else throw erro;
      }
    }
    const contasParaAtribuir = contas.map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }));

    return (
      <div className="space-y-6">
        {cabecalho}

        <FormAbrirPeriodo
          contas={contas.map((c) => ({
            id: c.id,
            codigo: c.codigo,
            descricao: c.descricao,
          }))}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Períodos de {conta.codigo}
          </h2>
          {periodos.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum período aberto"
              descricao="Abra o primeiro período acima. As pendências não resolvidas passam ao período seguinte."
            />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {periodos.map((p) => (
                <li key={p.id} data-periodo={p.id}>
                  <a
                    href={`/financeiro/conciliacao/periodo?conta=${conta.id}&id=${p.id}`}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs"
                  >
                    <span className="tabular-nums">{p.rotulo}</span>
                    <Badge status={p.estado === "ENCERRADA" ? "neutro" : "ok"}>
                      {p.estado === "ENCERRADA" ? "encerrada" : "aberta"}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {semMapeamento === null ? null : (
          <div
            role="alert"
            data-sem-mapeamento
            className="whitespace-pre-line rounded-[var(--radius-lg)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-status-alerta-bg)] p-4 text-sm text-[color:var(--color-status-alerta-fg)]"
          >
            {semMapeamento}
          </div>
        )}

        {naoFecha === null ? null : (
          <div
            role="alert"
            data-nao-fecha
            className="whitespace-pre-line rounded-[var(--radius-lg)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-status-erro-bg)] p-4 text-sm text-[color:var(--color-status-erro-fg)]"
          >
            <strong className="block">A conciliação deste período apresenta diferença.</strong>
            {naoFecha}
          </div>
        )}

        {semConta.length === 0 ? null : (
          <section className="space-y-2" data-sem-conta>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
              Arrecadações sem conta bancária informada
            </h2>
            <p className="text-[11px] text-[color:var(--color-ink-2)]">
              Guias registradas antes da obrigatoriedade da conta, ou importadas. Elas não entram na
              conciliação até que a conta seja atribuída, e a atribuição só é aceita se a guia tiver sido
              contabilizada na conta contábil da conta escolhida ({conta.codigo} usa {contas.find((c) => c.id === conta.id)?.contaContabil ?? "sem mapeamento"}).
            </p>
            <ul className="space-y-1 text-xs">
              {semConta.map((g) => (
                <li key={g.id} data-guia-sem-conta={g.id} className="border-t border-[color:var(--color-border)] py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      Guia {g.numeroReceita} · {diaCivilBr(g.data)} · fonte {g.fonteCodigo} · conta contábil debitada{" "}
                      <span className="tabular-nums">{g.contaContabilDebitada ?? "—"}</span>
                    </span>
                    <span className="tabular-nums">{g.valor}</span>
                  </div>
                  <FormAtribuirConta receitaArrecadadaId={g.id} contaPadraoId={conta.id} contas={contasParaAtribuir} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {detalhe === null ? null : (
          <>
            <section
              data-conciliacao={detalhe.id}
              className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-1)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                  {detalhe.rotulo}
                </h2>
                <span data-estado={detalhe.estado}>
                  <Badge status={detalhe.estado === "ENCERRADA" ? "neutro" : "ok"}>
                    {detalhe.estado === "ENCERRADA"
                      ? `encerrada por ${detalhe.encerradaPor ?? ""}`
                      : "aberta"}
                  </Badge>
                </span>
              </div>

              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-[color:var(--color-ink-2)]">Saldo do extrato</dt>
                  <dd data-saldo-extrato className="tabular-nums">
                    {detalhe.relatorio.saldoExtrato}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-2)]">Saldo contábil</dt>
                  <dd data-saldo-contabil className="tabular-nums">
                    {detalhe.relatorio.saldoContabil}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-2)]">Diferença</dt>
                  <dd data-diferenca className="tabular-nums">
                    {detalhe.relatorio.diferenca}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
                Os valores são calculados a partir da contabilidade e do extrato na data da
                consulta.
              </p>

              {detalhe.estado === "ABERTA" ? (
                <FormEncerrar conciliacaoId={detalhe.id} rotulo={detalhe.rotulo} />
              ) : null}
            </section>

            {detalhe.herdadasDaAnterior.length > 0 ? (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                  Herdadas do período anterior
                </h2>
                <p className="text-[11px] text-[color:var(--color-ink-2)]">
                  Pendências não resolvidas na conciliação anterior.
                </p>
                <ul className="space-y-1 text-xs">
                  {detalhe.herdadasDaAnterior.map((h) => (
                    <li
                      key={`${h.lado}:${h.referencia}`}
                      data-herdada={`${h.lado}:${h.referencia}`}
                      className="flex flex-wrap justify-between gap-2 border-t border-[color:var(--color-border)] py-2"
                    >
                      <span>
                        [{h.lado}] {h.descricao}
                        {h.justificativa === null ? null : (
                          <em className="ml-2 text-[color:var(--color-ink-2)]">
                            — {h.justificativa}
                          </em>
                        )}
                      </span>
                      <span className="tabular-nums">{h.residual}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                Pendências do extrato
              </h2>
              {detalhe.relatorio.noExtratoSemVinculo.length === 0 ? (
                <p className="text-xs text-[color:var(--color-ink-2)]">
                  Nenhuma pendência do extrato.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {detalhe.relatorio.noExtratoSemVinculo.map((l) => (
                    <li
                      key={l.id}
                      data-pendencia-extrato={l.id}
                      className="border-t border-[color:var(--color-border)] py-2"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>{l.descricao}</span>
                        <span className="tabular-nums">{l.residual}</span>
                      </div>
                      {detalhe.estado === "ABERTA" ? (
                        <FormJustificar
                          conciliacaoId={detalhe.id}
                          lado="EXTRATO"
                          referencia={l.id}
                          descricao={l.descricao}
                          motivoAtual={
                            detalhe.justificativas.find(
                              (j) => j.lado === "EXTRATO" && j.referencia === l.id
                            )?.motivo ?? null
                          }
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                Pendências do razão
              </h2>
              {detalhe.relatorio.internoSemVinculo.length === 0 ? (
                <p className="text-xs text-[color:var(--color-ink-2)]">
                  Nenhuma pendência contábil.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {detalhe.relatorio.internoSemVinculo.map((l) => (
                    <li
                      key={l.id}
                      data-pendencia-interna={l.id}
                      className="border-t border-[color:var(--color-border)] py-2"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          [{l.tipoInterno}] {l.descricao}
                        </span>
                        <span className="tabular-nums">{l.residual}</span>
                      </div>
                      {detalhe.estado === "ABERTA" ? (
                        <FormJustificar
                          conciliacaoId={detalhe.id}
                          lado={l.tipoInterno}
                          referencia={l.id}
                          descricao={l.descricao}
                          motivoAtual={
                            detalhe.justificativas.find(
                              (j) => j.lado === l.tipoInterno && j.referencia === l.id
                            )?.motivo ?? null
                          }
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                Pendências declaradas
              </h2>
              {detalhe.pendenciasManuais.length === 0 ? (
                <p className="text-xs text-[color:var(--color-ink-2)]">
                  Nenhuma pendência declarada neste período.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {detalhe.pendenciasManuais.map((p) => (
                    <li
                      key={p.id}
                      data-pendencia-manual={p.id}
                      className="flex flex-wrap justify-between gap-2 border-t border-[color:var(--color-border)] py-2"
                    >
                      <span>
                        [{p.natureza}] {p.descricao}
                        <em className="ml-2 text-[color:var(--color-ink-2)]">
                          — {p.motivo}
                        </em>
                      </span>
                      <span className="tabular-nums">{p.valor}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detalhe.estado === "ABERTA" ? (
                <FormPendenciaManual conciliacaoId={detalhe.id} />
              ) : null}
            </section>
          </>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Serviço indisponível"
            descricao="Não foi possível carregar a conciliação. Tente novamente mais tarde."
          />
        </div>
      );
    }
    throw e;
  }
}
