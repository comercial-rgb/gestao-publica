import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { compararEmpenhosLocalTce, type SituacaoComparacao } from "../../../../lib/portas/tce-consulta";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
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

const ROTULO_DA_SITUACAO: Record<SituacaoComparacao, string> = {
  IGUAL: "igual",
  DIVERGENTE: "divergente",
  SO_LOCAL: "somente no sistema",
  SO_TCE: "somente no TCE",
};

export default async function ConsultaTcePage(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_INTEGRACOES");
  let r: Awaited<ReturnType<typeof compararEmpenhosLocalTce>> | null = null;
  let erro: string | null = null;
  try {
    r = await compararEmpenhosLocalTce();
  } catch (e) {
    erro = e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível realizar a consulta.";
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Consulta ao TCE-PB" subtitulo="Comparação entre os empenhos registrados no sistema e os informados pelo TCE-PB." />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">
          <Badge status="neutro">Simulação</Badge> Consulta simulada
        </p>
        <p className="mt-1 text-[color:var(--color-ink-2)]">
          Os dados atribuídos ao TCE são fictícios e seguem o padrão oficial da API; nenhuma consulta real foi feita.
          <strong> Nenhuma transmissão externa foi realizada.</strong> A consulta real depende da configuração da credencial de acesso.
        </p>
      </div>

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível realizar a consulta</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      {r !== null && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <strong>Empenhos · unidade gestora {"999001"} · jul/2026</strong>
            <span className="text-[color:var(--color-ink-2)]">
              {r.resumo.iguais} iguais · <span className="text-[color:var(--color-status-erro-fg)]">{r.resumo.divergentes} divergentes</span> · {r.resumo.soLocal} somente no sistema · {r.resumo.soTce} somente no TCE
            </span>
            <code className="ml-auto text-xs text-[color:var(--color-ink-3)]">consulta {r.correlationId.slice(0, 8)}</code>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Nº Empenho</th>
                  <th className="py-1.5 pr-4">Valor no sistema</th>
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
                    <td className="py-1.5"><Badge status={TOM[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}</Badge></td>
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
