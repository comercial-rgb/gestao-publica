import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { lerPosicaoPatrimonial, lerDividas, PortaSemBancoError, type DemonstrativoPatrimonial, type DividaPorTipoDaTela } from "../../../../lib/portas/patrimonio";
import { recorteDe } from "../../../../lib/recorte";

/**
 * PATRIMÔNIO (M10, TR 5.82–5.86) — a posição patrimonial por classe (5.86: saldo anterior + ingressos
 * + atualizações = saldo final, por SUM dos lançamentos) e o saldo da dívida consolidada por tipo (o
 * dono que o RGF Anexo 2 já lê). A tela consome a PORTA (grep trivalente); é consulta, não recalcula.
 */
export const dynamic = "force-dynamic";

export default async function BensPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { exercicio } = recorteDe(await searchParams);
  const cabecalho = (
    <PageHeader
      titulo="Patrimônio — bens e dívida"
      subtitulo={`Exercício ${exercicio} — posição por classe e dívida consolidada`}
      acoes={<BotaoPdf href={`/patrimonio/bens/pdf?exercicio=${exercicio}`} />}
    />
  );

  let posicao: DemonstrativoPatrimonial;
  let dividas: DividaPorTipoDaTela;
  try {
    [posicao, dividas] = await Promise.all([lerPosicaoPatrimonial({ exercicio }), lerDividas({ exercicio })]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler o patrimônio"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const temDivida = dividas.total !== "0.00";

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A posição de cada classe é <strong>derivada por SUM</strong> dos lançamentos patrimoniais
        (avaliação, reavaliação, depreciação, baixa): <strong>saldo anterior + ingressos + atualizações
        = saldo final</strong>. A depreciação e a reavaliação são as <em>atualizações</em>.
      </div>

      {/* ── POSIÇÃO POR CLASSE (5.86) ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Posição patrimonial por classe (5.86)</h2>
        {posicao.classes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Sem bens registrados no exercício.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Classe</th><th className="py-1.5 pr-4">Conta</th>
                  <th className="py-1.5 pr-4 text-right">Saldo anterior</th><th className="py-1.5 pr-4 text-right">Ingressos</th>
                  <th className="py-1.5 pr-4 text-right">Atualizações</th><th className="py-1.5 text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {posicao.classes.map((c) => (
                  <tr key={c.classeDeBensId} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{c.codigo} <span className="text-[color:var(--color-ink-3)]">{c.descricao}</span></td>
                    <td className="py-1.5 pr-4 font-mono text-xs">{c.classificacaoContabil}</td>
                    <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={c.saldoAnterior} /></td>
                    <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={c.ingressos} /></td>
                    <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={c.atualizacoes} /></td>
                    <td className="py-1.5 text-right font-semibold"><ValorMonetario valor={c.saldoFinal} /></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[color:var(--color-border-strong)] font-semibold">
                  <td className="py-1.5 pr-4" colSpan={2}>TOTAL</td>
                  <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={posicao.total.saldoAnterior} /></td>
                  <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={posicao.total.ingressos} /></td>
                  <td className="py-1.5 pr-4 text-right"><ValorMonetario valor={posicao.total.atualizacoes} /></td>
                  <td className="py-1.5 text-right"><ValorMonetario valor={posicao.total.saldoFinal} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── DÍVIDA CONSOLIDADA (5.82-5.83) ── */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Dívida consolidada por tipo (5.82–5.83)</h2>
        {!temDivida ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Sem dívida consolidada no exercício. (O mesmo saldo alimenta o RGF Anexo 2.)</p>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span><span className="text-[color:var(--color-ink-2)]">Mobiliária:</span> <strong><ValorMonetario valor={dividas.mobiliaria} /></strong></span>
            <span><span className="text-[color:var(--color-ink-2)]">Contratual:</span> <strong><ValorMonetario valor={dividas.contratual} /></strong></span>
            <span><span className="text-[color:var(--color-ink-2)]">Total (DC):</span> <strong><ValorMonetario valor={dividas.total} /></strong></span>
          </div>
        )}
      </Card>

      <p className="text-xs text-[color:var(--color-ink-3)]">
        O <strong>cadastro de bens</strong> e os <strong>lançamentos</strong> (avaliação, reavaliação,
        depreciação, baixa) são atos do domínio (M10), com o roteiro contábil aplicado na gravação.
        Esta tela é a <strong>consulta e a impressão</strong> da posição consolidada.
      </p>
    </div>
  );
}
