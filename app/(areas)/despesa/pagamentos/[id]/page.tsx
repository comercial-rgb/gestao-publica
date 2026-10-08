import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EXTENSOES_ACEITAS, lerDocumentosDoPagamento, TAMANHO_MAXIMO_BYTES, type DocumentosDoPagamento } from "../../../../../lib/portas/documentos";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { dataBr } from "../../../../../lib/recorte";
import { FormAnexo } from "../../../documentos/FormAnexo";

/**
 * V36 — OS DOCUMENTOS DE UM PAGAMENTO (TR 5.10.2.68): o registro, os anexos e o formulário de anexar. A leitura é a
 * da despesa NA UNIDADE do pagamento (a porta cobra); anexar exige ANEXAR_ARQUIVO na mesma unidade (o M22 cobra).
 */
export const dynamic = "force-dynamic";

export default async function DocumentosDoPagamentoPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  const { id } = await params;
  let p: DocumentosDoPagamento | null;
  try {
    p = await lerDocumentosDoPagamento(id);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Documentos do pagamento" subtitulo="Comprovantes e documentos anexados ao pagamento" />
        <EstadoVazio titulo="Não foi possível abrir o pagamento" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  if (p === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Documentos do pagamento" subtitulo="Comprovantes e documentos anexados ao pagamento" />
        <EstadoVazio titulo="Pagamento não encontrado" descricao="O pagamento pedido não existe. Volte à lista de pagamentos realizados." />
      </div>
    );
  }
  const podeAnexar = (await acoesPermitidas(["ANEXAR_ARQUIVO"])).has("ANEXAR_ARQUIVO");
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={`Documentos do pagamento ${p.numero}`} subtitulo="Comprovantes e documentos anexados ao pagamento" />
      <p className="flex flex-wrap gap-4 text-sm" data-chrome>
        <Link className="text-[color:var(--color-primary)] underline" href="/despesa/pagamentos">Voltar aos pagamentos</Link>
        <Link className="text-[color:var(--color-primary)] underline" href={`/despesa/empenhos/${p.empenhoId}`}>Empenho {p.empenhoNumero}</Link>
        <Link className="text-[color:var(--color-primary)] underline" href={`/despesa/documento/LIQUIDACAO/${p.liquidacaoId}`}>Liquidação {p.liquidacaoNumero}</Link>
      </p>
      <Card>
        <dl className="grid gap-3 text-xs sm:grid-cols-3" data-pagamento={p.id}>
          <div><dt className="text-[color:var(--color-ink-3)]">Data</dt><dd>{dataBr(p.data)}</dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Valor</dt><dd><ValorMonetario valor={p.valor} /></dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Situação</dt><dd>{p.anulado ? "anulado" : "pago"}</dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Empenho e liquidação</dt><dd>{p.empenhoNumero} · {p.liquidacaoNumero}</dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Credor</dt><dd>{p.credorCpfCnpj}</dd></div>
          <div><dt className="text-[color:var(--color-ink-3)]">Unidade e conta</dt><dd>{p.unidadeCodigo} · {p.contaBancaria}</dd></div>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Documentos anexados ({p.anexos.length})</h2>
        <ListaDeAnexos anexos={p.anexos} />
        {podeAnexar ? (
          <div className="mt-3">
            <FormAnexo accept={EXTENSOES_ACEITAS} dono={{ pagamentoId: p.id }} rotulo="Anexar documento do pagamento" tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
