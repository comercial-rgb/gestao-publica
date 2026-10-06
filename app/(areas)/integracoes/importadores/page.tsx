import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { lerImportacoes, PortaSemBancoError, type ImportacaoNaLista } from "../../../../lib/portas/importadores";
import { dataBr } from "../../../../lib/recorte";
import { FormImportador } from "./FormImportador";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * IMPORTADORES (M20, TR 7.10-7.11) — folha e arrecadação tributária, por arquivo com LAYOUT
 * PARAMETRIZÁVEL. Dois atos: prévia (valida, nada grava) e confirmação (gera os fatos pelos
 * serviços reais). A tela consome a PORTA (grep trivalente).
 */
export const dynamic = "force-dynamic";

export default async function ImportadoresPage(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_INTEGRACOES");
  let historico: readonly ImportacaoNaLista[] = [];
  let erro: string | null = null;
  try {
    historico = await lerImportacoes();
  } catch (e) {
    erro = e instanceof PortaSemBancoError ? "Histórico indisponível no momento." : e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível consultar o histórico.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Importação de folha e arrecadação tributária"
        subtitulo="Envio do arquivo, conferência da prévia e confirmação da importação"
      />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">Como funciona a importação</p>
        <ul className="mt-2 space-y-1 text-[color:var(--color-ink-2)]">
          <li>O leiaute do arquivo é configurado na implantação, conforme o sistema de origem utilizado pelo ente.</li>
          <li>A <strong>prévia não grava dados</strong>. Arquivos com erros de validação não podem ser confirmados; cada erro indica a linha e o campo.</li>
          <li>A confirmação registra empenho, liquidação e pagamento com retenções (folha) ou a arrecadação (tributos), com as mesmas permissões e registros de auditoria das operações manuais.</li>
          <li>Não há leiaute oficial de folha municipal; o arquivo é fornecido pelo ente. Os dados de demonstração são fictícios.</li>
          <li>Um mesmo arquivo não pode ser importado mais de uma vez.</li>
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
                  <th className="py-1.5 pr-4 text-right">Linhas</th><th className="py-1.5 pr-4 text-right">Registros gerados</th>
                  <th className="py-1.5 pr-4">Identificador</th><th className="py-1.5">Código de verificação</th>
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
