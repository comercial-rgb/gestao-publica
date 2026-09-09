import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { lerImportacoes, PortaSemBancoError, type ImportacaoNaLista } from "../../../../lib/portas/importadores";
import { dataBr } from "../../../../lib/recorte";
import { FormImportador } from "./FormImportador";

/**
 * IMPORTADORES (M20, TR 7.10-7.11) — folha e arrecadação tributária, por arquivo com LAYOUT
 * PARAMETRIZÁVEL. Dois atos: prévia (valida, nada grava) e confirmação (gera os fatos pelos
 * serviços reais). A tela consome a PORTA (grep trivalente).
 */
export const dynamic = "force-dynamic";

export default async function ImportadoresPage(): Promise<React.ReactElement> {
  let historico: readonly ImportacaoNaLista[] = [];
  let erro: string | null = null;
  try {
    historico = await lerImportacoes();
  } catch (e) {
    erro = e instanceof PortaSemBancoError ? "Banco de dados não configurado." : e instanceof Error ? e.message : "Erro desconhecido.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Importadores — folha e tributário"
        subtitulo="Arquivo externo → prévia validada → confirmação em lote pelos serviços reais"
      />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">Layout parametrizável — mapa oficial do ente aplicado na implantação</p>
        <ul className="mt-2 space-y-1 text-[color:var(--color-ink-2)]">
          <li>✓ O <strong>mapa de colunas</strong> é configuração (como o SPEC do banco e a registry do SAGRES): trocar de folha é trocar o mapa, não o código.</li>
          <li>✓ A <strong>prévia não grava nada</strong>. Um arquivo com qualquer violação <strong>não é confirmável</strong> — o erro nomeia linha e campo.</li>
          <li>✓ A confirmação gera os fatos pelos <strong>serviços reais</strong> (empenho → liquidação → pagamento com retenções; arrecadação), com a mesma autorização e trilha de sempre.</li>
          <li>⚠ <strong>Não existe layout oficial de folha do município</strong> — o arquivo é insumo do ente. As fixtures da POC são <strong>sintéticas</strong> (nenhum servidor ou contribuinte real).</li>
          <li>○ Reimportar o mesmo arquivo é <strong>recusa nomeada</strong> (idempotência por SHA-256 da origem).</li>
        </ul>
      </div>

      <FormImportador />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Histórico de importações</h2>
        {erro !== null ? (
          <p className="text-sm text-[color:var(--color-status-erro-fg)]">{erro}</p>
        ) : historico.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma importação confirmada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Quando</th><th className="py-1.5 pr-4">Tipo</th><th className="py-1.5 pr-4">Arquivo</th>
                  <th className="py-1.5 pr-4 text-right">Linhas</th><th className="py-1.5 pr-4 text-right">Fatos</th>
                  <th className="py-1.5 pr-4">Correlação</th><th className="py-1.5">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4">{dataBr(h.criadoEm)}</td>
                    <td className="py-1.5 pr-4">{h.tipo === "FOLHA" ? "Folha" : "Tributário"}</td>
                    <td className="py-1.5 pr-4">{h.nomeArquivo}</td>
                    <td className="py-1.5 pr-4 text-right">{h.linhas}</td>
                    <td className="py-1.5 pr-4 text-right">{h.fatosGerados}</td>
                    <td className="py-1.5 pr-4 font-mono text-xs">{h.correlationId.slice(0, 8)}</td>
                    <td className="py-1.5 font-mono text-xs">{h.arquivoHash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
