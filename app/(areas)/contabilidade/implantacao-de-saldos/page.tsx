import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { FormImplantacao } from "./FormImplantacao";

/**
 * A IMPLANTAÇÃO DOS SALDOS INICIAIS — o balancete do sistema anterior vira o lançamento de abertura (V32).
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function ImplantacaoDeSaldosPage(): Promise<React.ReactElement> {
  const cabecalho = <PageHeader titulo="Implantação de saldos" subtitulo="O balancete do sistema anterior como lançamento de abertura" />;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Sem acesso à implantação" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cole ou carregue o balancete de encerramento do sistema anterior: uma conta analítica por linha, com o saldo no lado
        devedor ou no credor. <strong>Confira antes de implantar</strong>: cada conta tem de estar no plano carregado e cada
        subsistema tem de fechar; a diferença não é absorvida por conta nenhuma. A implantação grava um único lançamento de
        abertura por exercício. Para corrigir, estorne esse lançamento em Contabilidade &gt; Lançamentos e implante de novo.
      </div>
      <FormImplantacao />
    </div>
  );
}
