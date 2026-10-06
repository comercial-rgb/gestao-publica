import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EXTENSOES_ACEITAS, lerDocumentosDoMovimento, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { dataBr } from "../../../../../lib/recorte";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { ROTULO_TIPO } from "../rotulos";

/**
 * V36 — OS DOCUMENTOS DE UM MOVIMENTO BANCÁRIO (TR 5.10.2.21): o aviso do banco, o contrato da aplicação. Leitura do
 * financeiro do ente; anexar exige ANEXAR_ARQUIVO global (o movimento é ato do ente, e o M22 cobra).
 */
export const dynamic = "force-dynamic";

export default async function DocumentosDoMovimentoPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const { id } = await params;
  const m = await lerDocumentosDoMovimento(id);
  if (m === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Documentos do movimento bancário" subtitulo="Documentos anexados ao movimento" />
        <EstadoVazio titulo="Movimento não encontrado" descricao="O movimento bancário pedido não existe. Volte à movimentação bancária." />
      </div>
    );
  }
  const podeAnexar = (await acoesPermitidas(["ANEXAR_ARQUIVO"])).has("ANEXAR_ARQUIVO");
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Documentos do movimento bancário" subtitulo={`${ROTULO_TIPO[m.tipo] ?? m.tipo} em ${dataBr(m.data)}`} />
      <p className="text-sm">
        <Link className="text-[color:var(--color-primary)] underline" href="/financeiro/movimentacao">Voltar à movimentação bancária</Link>
      </p>
      <Card>
        <dl className="grid gap-3 text-xs sm:grid-cols-3" data-movimento={m.id}>
          <div><dt className="text-[color:var(--color-ink-3)]">Conta</dt><dd>{m.contaBancaria}</dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Valor</dt><dd><ValorMonetario valor={m.valor} /></dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Histórico</dt><dd>{m.historico}</dd></div>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Documentos anexados ({m.anexos.length})</h2>
        <ListaDeAnexos anexos={m.anexos} />
        {podeAnexar ? (
          <div className="mt-3">
            <FormAnexo accept={EXTENSOES_ACEITAS} dono={{ movimentoBancarioId: m.id }} rotulo="Anexar documento do movimento" tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
