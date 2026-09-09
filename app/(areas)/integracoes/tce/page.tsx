import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { compararEmpenhosLocalTce, type SituacaoComparacao } from "../../../../lib/portas/tce-consulta";
import { formatarMoeda } from "../../../../lib/format/moeda";

/**
 * TELA — CONSULTA API TCE (S4): comparação "dados locais × TCE" por UG/período. MODO MOCK permanente,
 * retorno sintético (fixtures conformes ao schema oficial). Consome a porta (grep trivalente).
 */
export const dynamic = "force-dynamic";

/**
 * O VALOR EM REAL BRASILEIRO — e não o decimal cru que vem da API.
 *
 * ⚠️ A comparação recebe os valores como o TCE os serializa ("50000.50"): ponto decimal, sem
 * separador de milhar. Exibi-los assim numa tela de contabilidade pública brasileira obriga o leitor
 * a converter de cabeça — e numa demonstração ao TCE-PB é justamente onde a diferença de CINQUENTA
 * CENTAVOS entre o local e o remoto precisa saltar aos olhos. `50.000,00 × 50.000,50` mostra a
 * divergência; `50000.00 × 50000.50` a esconde no meio dos dígitos.
 *
 * Ausência (`null`) continua sendo "—": o lado que não tem o registro não tem valor, e zero seria
 * mentira — "só-local" e "só-TCE" são situações próprias, não valores nulos.
 */
function emReal(valor: string | null): string {
  return valor === null ? "—" : formatarMoeda(valor).texto;
}

const TOM: Record<SituacaoComparacao, StatusBadge> = {
  IGUAL: "ok",
  DIVERGENTE: "erro",
  SO_LOCAL: "alerta",
  SO_TCE: "alerta",
};

export default async function ConsultaTcePage(): Promise<React.ReactElement> {
  let r: Awaited<ReturnType<typeof compararEmpenhosLocalTce>> | null = null;
  let erro: string | null = null;
  try {
    r = await compararEmpenhosLocalTce();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha na consulta.";
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="API de Consulta TCE-PB — dados locais × TCE" subtitulo="Comparação de empenhos por UG/período (retorno sintético, contrato oficial)." />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">
          <Badge status="neutro">MODO MOCK</Badge> Retorno sintético — simulação executada
        </p>
        <p className="mt-1 text-[color:var(--color-ink-2)]">
          Os dados do "TCE" vêm de <strong>fixtures conformes ao schema oficial</strong> (OpenAPI versionado), não de uma consulta real.
          <strong> Nenhuma transmissão externa foi realizada.</strong> SANDBOX/LIVE exigem token (por configuração) e respondem <code>CREDENTIAL_NOT_CONFIGURED</code> — sem fallback.
        </p>
      </div>

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Falha na consulta</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      {r !== null && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <strong>Empenhos — UG {"999001"} · jul/2026</strong>
            <span className="text-[color:var(--color-ink-2)]">
              {r.resumo.iguais} iguais · <span className="text-[color:var(--color-status-erro-fg)]">{r.resumo.divergentes} divergentes</span> · {r.resumo.soLocal} só-local · {r.resumo.soTce} só-TCE
            </span>
            <code className="ml-auto text-xs text-[color:var(--color-ink-3)]">corr:{r.correlationId.slice(0, 8)}</code>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Nº Empenho</th>
                  <th className="py-1.5 pr-4">Valor local</th>
                  <th className="py-1.5 pr-4">Valor TCE</th>
                  <th className="py-1.5">Situação</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {r.linhas.map((l) => (
                  <tr key={l.chave} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{l.chave}</td>
                    <td className="py-1.5 pr-4">{emReal(l.valorLocal)}</td>
                    <td className="py-1.5 pr-4">{emReal(l.valorTce)}</td>
                    <td className="py-1.5"><Badge status={TOM[l.situacao]}>{l.situacao}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
