import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { lerTelaDosRealizaveis, type TelaDosRealizaveis } from "../../../../lib/portas/realizavel";
import { FormAnular, FormCategoria, FormDecisao, FormMovimento } from "./Forms";

/**
 * V39-R3 (R3-016, V39-030) — VALORES A RECEBER DE VOLTA (realizáveis de natureza ativa). Valor do município que está com
 * outra pessoa e volta em dinheiro. Não é consignação: consignação é dinheiro de terceiro guardado pelo município.
 */
export default async function RealizaveisPage(): Promise<React.ReactElement> {
  let tela: TelaDosRealizaveis;
  try {
    tela = await lerTelaDosRealizaveis();
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Valores a receber de volta" />
        <EstadoVazio titulo="Não foi possível abrir os valores a receber" descricao={e instanceof Error ? mensagemDoErro(e, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const categorias = tela.categorias.map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }));
  const movimentaveis = tela.categorias.filter((c) => c.decisao?.ativa === true).map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }));
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Valores a receber de volta"
        subtitulo="Valores do município que estão com outra pessoa e voltam em dinheiro (depósito restituível, adiantamento a devolver, crédito a receber). Ficam no ativo, separados das consignações, que são dinheiro de terceiro guardado pelo município."
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Categorias</h2>
        {tela.categorias.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-categorias>Nenhuma categoria cadastrada.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {tela.categorias.map((c) => (
              <li key={c.id} data-categoria={c.codigo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.codigo}</span>
                  <span>{c.descricao}</span>
                  {c.decisao === null ? <Badge status="alerta">Sem conta decidida: não movimenta</Badge> : c.decisao.ativa ? <Badge status="ok">Ativa</Badge> : <Badge status="neutro">Suspensa</Badge>}
                </div>
                {c.decisao === null ? null : (
                  <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                    {c.decisao.conta === null ? "Sem conta." : `Conta do ativo: ${c.decisao.conta}.`} Decidido por {c.decisao.por} em {c.decisao.em}: {c.decisao.fundamento}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {tela.podeParametrizar ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <FormCategoria />
          <FormDecisao categorias={categorias} contas={tela.contasElegiveis} />
        </div>
      ) : null}

      {tela.podeMovimentar ? (
        movimentaveis.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma categoria ativa com a conta decidida: o movimento depende da decisão do ente.</p>
        ) : (
          <FormMovimento categorias={movimentaveis} contas={tela.contasEFontes} hoje={tela.hoje} />
        )
      ) : (
        <p className="text-sm text-[color:var(--color-ink-2)]">Registrar movimentos cabe a quem tem a permissão de movimentar valores a receber.</p>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Saldos por devedor</h2>
        {tela.saldos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum valor constituído.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Categoria</th><th className="py-1 pr-2">Com quem está</th><th className="py-1 pr-2">Conta do ativo</th><th className="py-1 pr-2">Fonte</th><th className="py-1 text-right">Saldo</th></tr></thead>
              <tbody>
                {tela.saldos.map((s) => (
                  <tr key={`${s.categoria}|${s.devedor}|${s.conta}|${s.fonte}`} data-saldo={`${s.categoria}|${s.devedor}`} data-valor={s.saldo} className="border-t border-[color:var(--color-border)]">
                    <td className="py-1 pr-2">{s.categoria}</td><td className="py-1 pr-2">{s.devedor}</td><td className="py-1 pr-2 font-mono text-xs">{s.conta}</td><td className="py-1 pr-2">{s.fonte}</td><td className="py-1 text-right">R$ {formatarMoeda(s.saldo).texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Movimentos</h2>
        {tela.movimentos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum movimento.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {tela.movimentos.map((m) => (
              <li key={m.id} data-movimento={m.id} data-situacao={m.anulacao ? "ANULACAO" : m.anulado ? "ANULADO" : "VIVO"} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.data}</span>
                  <span>{m.anulacao ? "Anulação de " : ""}{m.tipo === "CONSTITUICAO" ? "constituição" : "baixa"}</span>
                  <span>{m.categoria}, {m.devedor}</span>
                  <span>R$ {formatarMoeda(m.valor).texto}</span>
                  <span className="text-xs text-[color:var(--color-ink-2)]">conta {m.contaBancaria}</span>
                  {m.anulado ? <Badge status="neutro">Anulado</Badge> : null}
                </div>
                <p className="text-xs text-[color:var(--color-ink-2)]">{m.historico}. Documento: {m.documento}. Por {m.por}.</p>
                {tela.podeMovimentar && !m.anulacao ? <FormAnular movimentoId={m.id} anulado={m.anulado} hoje={tela.hoje} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
