import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import {
  lerConferenciaDaComposicao, lerEventosExtra, lerSaldosExtra, lerRetencoes, lerDispendiosExtra, PortaSemBancoError,
  type TipoConsignacaoNaLista, type SaldoConsignatarioNaLista, type RetencaoNaLista, type DispendioNaLista,
} from "../../../../lib/portas/extraorcamentario";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

/**
 * EXTRAORÇAMENTÁRIO (M07, TR 5.39–5.49) — dinheiro de terceiros no caixa: eventos (consignações),
 * saldos por consignatário (o que o ente deve, 5.41), retenções na fonte com drill ao pagamento
 * (5.25) e despesas extra (recolhimentos). A tela consome a PORTA (grep trivalente); é consulta.
 */
export const dynamic = "force-dynamic";

/** Dinheiro em reais na tela — o formato interno (`0.00`) nunca chega a quem lê. */
const brl = (v: string): string =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ExtraorcamentarioPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const sp = await searchParams;

  // ⚠️ SÓ O EXERCÍCIO: o extraorçamentário é dinheiro de terceiros no caixa do ENTE, e o
  // caixa é um só. `lerEventosExtra` e `lerSaldosExtra` não recebem nem exercício; as outras
  // duas recebem só ele. Não há unidade a recusar — só o silêncio do `?exercicio=abc`.
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(sp);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Extraorçamentário"
          subtitulo="Consignações, retenções e recolhimentos (dinheiro de terceiros no caixa)"
        />
        <EstadoVazio
          titulo={
            erro instanceof ExercicioIlegivelError
              ? "O exercício pedido não é um ano"
              : "Não foi possível ler o recorte"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }
  const cabecalho = (
    <PageHeader
      titulo="Extraorçamentário"
      subtitulo={`Exercício ${exercicio} — consignações, retenções e recolhimentos (dinheiro de terceiros no caixa)`}
      acoes={<BotaoPdf href={`/financeiro/extraorcamentario/pdf?exercicio=${exercicio}`} />}
    />
  );

  let eventos: readonly TipoConsignacaoNaLista[];
  let saldos: readonly SaldoConsignatarioNaLista[];
  let retencoes: readonly RetencaoNaLista[];
  let dispendios: readonly DispendioNaLista[];
  let composicao: Awaited<ReturnType<typeof lerConferenciaDaComposicao>>;
  try {
    [eventos, saldos, retencoes, dispendios, composicao] = await Promise.all([
      lerEventosExtra(), lerSaldosExtra(), lerRetencoes({ exercicio }), lerDispendiosExtra({ exercicio }),
      lerConferenciaDaComposicao(),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler o extraorçamentário"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O extraorçamentário é <strong>dinheiro de terceiros</strong>: entra sem ser receita, sai sem ser
        despesa, não toca dotação. A <strong>retenção na fonte</strong> nasce dentro de um pagamento (o
        líquido vai ao fornecedor; o retido vira <strong>passivo com o consignatário</strong>).
        O <strong>recolhimento</strong> (despesa extra) repassa o retido — e nunca repassa mais do que se
        reteve (o saldo nunca fica negativo).
      </div>

      {/* ── C37: RETIDO, RECOLHIDO, ESTORNADO E A RECOLHER, SEPARADOS ── */}
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Composição das consignações
          </h2>
          <Link className="text-sm underline hover:no-underline" href="/financeiro/extraorcamentario/recolher">
            Recolher consignações
          </Link>
        </div>
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
          Aqui o <strong>estorno aparece como coluna, não embutido</strong>: um recolhimento de 500,00
          desfeito por um estorno de 500,00 mostra os dois, e não &quot;recolhido zero&quot;. O que falta
          recolher é derivado, nunca digitado.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left">
                <th className="py-2" scope="col">Consignação</th>
                <th className="py-2" scope="col">Consignatário</th>
                <th className="py-2 text-right" scope="col">Retido</th>
                <th className="py-2 text-right" scope="col">Estorno de retenção</th>
                <th className="py-2 text-right" scope="col">Recolhido</th>
                <th className="py-2 text-right" scope="col">Estorno de recolhimento</th>
                <th className="py-2 text-right" scope="col">A recolher</th>
                <th className="py-2 text-right" scope="col">Recolhido sem composição</th>
              </tr>
            </thead>
            <tbody>
              {composicao.obrigacoes.map((o) => (
                <tr className="border-b border-[color:var(--color-border)]" key={`${o.tipoCodigo}|${o.consignatario}`}>
                  <td className="py-2">{o.tipoCodigo} — {o.tipoDescricao}</td>
                  <td className="py-2">{o.consignatario}</td>
                  <td className="py-2 text-right">{brl(o.retido)}</td>
                  <td className="py-2 text-right">{brl(o.estornoDeRetencao)}</td>
                  <td className="py-2 text-right">{brl(o.recolhido)}</td>
                  <td className="py-2 text-right">{brl(o.estornoDeRecolhimento)}</td>
                  <td className="py-2 text-right font-medium">{brl(o.aRecolher)}</td>
                  <td className="py-2 text-right">{brl(o.recolhidoSemComposicao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/*
          ⚠️ A CONFERÊNCIA COMPARA DOIS CAMINHOS INDEPENDENTES — a soma das linhas acima e uma
          passada única sobre todos os movimentos, sem agrupar. Quando divergem, a tela DIZ, em vez
          de mostrar um visto. Selo sem comparação independente é o que esta obra proíbe.
        */}
        <p className="mt-3 text-sm">
          {composicao.confere ? (
            <>
              Soma das obrigações {brl(composicao.somaDasObrigacoes)}, igual ao total apurado por
              contagem independente dos movimentos.
            </>
          ) : (
            <strong className="text-[color:var(--color-status-erro-fg)]">
              Divergência: a soma das obrigações é {brl(composicao.somaDasObrigacoes)} e a contagem
              independente dos movimentos dá {brl(composicao.totalGlobal)}. Não emita conferência
              deste quadro até a diferença ser explicada.
            </strong>
          )}
        </p>
      </Card>

      {/* ── SALDOS POR CONSIGNATÁRIO ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Saldos por consignatário</h2>
        {saldos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Sem movimento extraorçamentário.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Tipo</th><th className="py-1.5 pr-4">Consignatário</th>
                  <th className="py-1.5 pr-4 text-right">Ingressado</th><th className="py-1.5 pr-4 text-right">Recolhido</th>
                  <th className="py-1.5 text-right">Saldo a repassar</th>
                </tr>
              </thead>
              <tbody>
                {saldos.map((s, i) => (
                  <tr key={i} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{s.tipoCodigo} <span className="text-[color:var(--color-ink-3)]">{s.tipoDescricao}</span></td>
                    <td className="py-1.5 pr-4">{s.consignatario}</td>
                    <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={s.ingressado} /></td>
                    <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={s.dispendido} /></td>
                    <td className="py-1.5 text-right font-semibold"><ValorMonetario valor={s.saldo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── RETENÇÕES (drill ao pagamento/empenho) ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Retenções na fonte</h2>
        {retencoes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Sem retenções no exercício.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th><th className="py-1.5 pr-4">Tipo</th>
                  <th className="py-1.5 pr-4">Consignatário</th><th className="py-1.5 pr-4">Empenho</th>
                  <th className="py-1.5 pr-4">Pagamento</th><th className="py-1.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {retencoes.map((r) => (
                  <tr key={r.id} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{dataBr(r.data)}</td>
                    <td className="py-1.5 pr-4">{r.tipoCodigo}</td>
                    <td className="py-1.5 pr-4">{r.consignatario}</td>
                    <td className="py-1.5 pr-4 font-mono">{r.empenhoNumero ?? "—"}</td>
                    <td className="py-1.5 pr-4 font-mono">{r.pagamentoNumero ?? "—"}</td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={r.valor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── DESPESAS EXTRA (recolhimentos) ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Recolhimentos (despesa extra)</h2>
        {dispendios.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Sem recolhimentos no exercício.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th><th className="py-1.5 pr-4">Tipo</th>
                  <th className="py-1.5 pr-4">Consignatário</th><th className="py-1.5 pr-4">Histórico</th>
                  <th className="py-1.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dispendios.map((d) => (
                  <tr key={d.id} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{dataBr(d.data)}</td>
                    <td className="py-1.5 pr-4">{d.tipoCodigo}</td>
                    <td className="py-1.5 pr-4">{d.consignatario}</td>
                    <td className="py-1.5 pr-4">{d.historico}</td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={d.valor} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── EVENTOS (tipos de consignação) ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Eventos (tipos de consignação)</h2>
        {eventos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum evento cadastrado.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1">
                <strong>{e.codigo}</strong> <span className="text-[color:var(--color-ink-3)]">{e.descricao}</span>
                {e.ativo ? <Badge status="ok">ativo</Badge> : <Badge status="neutro">inativo</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-[color:var(--color-ink-3)]">
        O <strong>cadastro de eventos</strong> e o <strong>lançamento de retenções/recolhimentos</strong>
        são atos do domínio (M07/M05), com as travas de saldo aplicadas na gravação. Esta tela é a
        consulta com <strong>drill ao documento</strong> e a impressão; o cadastro por formulário fica
        nomeado como próxima fatia.
      </p>
    </div>
  );
}
