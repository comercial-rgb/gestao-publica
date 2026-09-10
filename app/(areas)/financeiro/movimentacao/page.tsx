import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  contasComSaldo,
  contasContabeisAnaliticas,
  movimentosBancarios,
  PortaSemBancoError,
} from "../../../../lib/portas/tesouraria";
import { diaCivil } from "../../../../packages/datas/index";
import { FormMovimentacao } from "./FormMovimentacao";

/**
 * MOVIMENTAÇÃO BANCÁRIA POR FONTE — TR 5.62 e 5.10.2.6/.18/.19.
 *
 * É o segundo dos quatro percursos da definição de concluído do ENT03: registrar
 * depósito, saque, aplicação, resgate, rendimento e tarifa, com **saldo por fonte**, e
 * ver o resultado persistido depois de recarregar.
 *
 * ⚠️ O SALDO POR FONTE É PARCIAL, E A TELA DIZ ISSO. O `MovimentoExtraorcamentario` (M07)
 * move a conta e **não tem fonte** no modelo; atribuí-lo à fonte padrão seria inventar
 * justamente no número que prova que recurso vinculado não custeou outra coisa. O que não
 * é atribuível aparece como `(sem fonte declarada)`, e a soma bate com o total.
 */
export const dynamic = "force-dynamic";

export default async function MovimentacaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const contaParam = typeof params["conta"] === "string" ? params["conta"] : "";
  // ⚠️ O CORTE PADRÃO É HOJE, NO DIA CIVIL DO ENTE — nunca `toISOString()`, que às 21:00
  // já mostraria o saldo de amanhã.
  const ate = typeof params["ate"] === "string" ? params["ate"] : diaCivil(new Date());

  const cabecalho = (
    <PageHeader
      titulo="Movimentação bancária"
      subtitulo={`Depósito, saque, aplicação, resgate, rendimento e tarifa — saldo por fonte até ${ate}`}
    />
  );

  try {
    const [contas, contasContabeis] = await Promise.all([
      contasComSaldo(ate),
      contasContabeisAnaliticas(),
    ]);

    const selecionada =
      contas.find((c) => c.id === contaParam) ?? contas[0];
    const movimentos =
      selecionada === undefined ? [] : await movimentosBancarios(selecionada.id);

    return (
      <div className="space-y-6">
        {cabecalho}

        <FormMovimentacao
          contas={contas.map((c) => ({
            id: c.id,
            codigo: c.codigo,
            descricao: c.descricao,
            saldo: c.saldo,
            fontes: c.fontes,
          }))}
          contasContabeis={contasContabeis}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Saldo por conta e por fonte
          </h2>
          {contas.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma conta bancária"
              descricao="Cadastre a conta, a conta contábil e o rol de fontes para movimentar."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {contas.map((c) => (
                <article
                  key={c.id}
                  data-conta={c.codigo}
                  className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-1)] p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
                      {c.codigo} — {c.descricao}
                    </h3>
                    <span data-saldo-total={c.codigo} className="text-sm tabular-nums">
                      {c.saldo}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[color:var(--color-ink-2)]">
                    Conta contábil {c.contaContabil ?? "não parametrizada"}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs">
                    {c.porFonte.length === 0 ? (
                      <li className="text-[color:var(--color-ink-2)]">Sem movimento.</li>
                    ) : (
                      c.porFonte.map((f) => (
                        <li
                          key={f.codigo}
                          data-fonte={f.codigo}
                          className="flex justify-between gap-2"
                        >
                          <span className="text-[color:var(--color-ink-2)]">
                            fonte {f.codigo}
                          </span>
                          <span className="tabular-nums">{f.saldo}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Últimos movimentos
            {selecionada === undefined ? "" : ` — ${selecionada.codigo}`}
          </h2>
          {movimentos.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum movimento nesta conta"
              descricao="Registre um depósito, saque, aplicação, resgate, rendimento ou tarifa acima."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-[color:var(--color-ink-2)]">
                  <tr>
                    <th className="py-2">Data</th>
                    <th>Tipo</th>
                    <th>Fonte</th>
                    <th>Histórico</th>
                    <th className="text-right">Valor</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => (
                    <tr
                      key={m.id}
                      data-movimento={m.id}
                      className="border-t border-[color:var(--color-border)]"
                    >
                      <td className="py-2 tabular-nums">{m.data}</td>
                      <td>{m.tipo}</td>
                      <td className="tabular-nums">{m.fonteCodigo}</td>
                      <td>{m.historico}</td>
                      <td className="text-right tabular-nums">{m.valor}</td>
                      <td>
                        {m.ehEstorno ? (
                          <Badge status="neutro">estorno</Badge>
                        ) : m.estornado ? (
                          <Badge status="alerta">estornado</Badge>
                        ) : (
                          <Badge status="ok">vigente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="A movimentação bancária lê e escreve no banco. Sem ele, esta tela não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
