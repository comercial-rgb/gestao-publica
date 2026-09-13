import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";

/**
 * OS CONTRACHEQUES DO CÁLCULO VIVO — a segunda coleção do detalhe da folha (TR 5.12.51).
 *
 * ⚠️ CADA LINHA LEVA À MEMÓRIA DE CÁLCULO daquele servidor: o operador confere o pagamento sem
 * imprimir relatório nenhum, que é o que o requisito pede. Sem cálculo vivo, o vazio DIZ o motivo
 * em vez de mostrar uma tabela de zeros.
 */
export function Contracheques({ folhaId, linhas }: { readonly folhaId: string; readonly linhas: readonly { readonly vinculoId: string; readonly matricula: string; readonly servidor: string; readonly regime: string; readonly dias: number; readonly proventos: string; readonly descontos: string; readonly liquido: string }[] }): React.ReactElement {
  if (linhas.length === 0) {
    return (
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Contracheques</h2>
        <EstadoVazio titulo="Esta folha ainda não foi calculada" descricao="Calcule a folha para ver um contracheque por vínculo vivo na competência, cada um com a memória de cálculo e a sua impressão digital." />
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Contracheques do cálculo vivo</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Um por vínculo vivo na competência. Abra para ver a memória: as tabelas usadas com a fundamentação, as faixas
        percorridas, os cenários do imposto e a conta de cada rubrica.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <th scope="col" className="py-2 pr-3 text-left">Matrícula</th>
              <th scope="col" className="py-2 pr-3 text-left">Servidor</th>
              <th scope="col" className="py-2 pr-3 text-left">Regime</th>
              <th scope="col" className="py-2 pr-3 text-right">Dias</th>
              <th scope="col" className="py-2 pr-3 text-right">Proventos</th>
              <th scope="col" className="py-2 pr-3 text-right">Descontos</th>
              <th scope="col" className="py-2 text-right">Líquido</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.vinculoId} data-contracheque={l.vinculoId} className="border-b border-[color:var(--color-border)]">
                <td className="py-2 pr-3">
                  <Link href={`/folha/folhas/${folhaId}/contracheque/${l.vinculoId}`} className="font-medium text-[color:var(--color-acento)] underline underline-offset-2">
                    {l.matricula}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-[color:var(--color-ink)]">{l.servidor}</td>
                <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">{l.regime}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{l.dias}/30</td>
                <td className="py-2 pr-3 text-right"><ValorMonetario valor={l.proventos} /></td>
                <td className="py-2 pr-3 text-right"><ValorMonetario valor={l.descontos} /></td>
                <td className="py-2 text-right font-medium"><ValorMonetario valor={l.liquido} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
