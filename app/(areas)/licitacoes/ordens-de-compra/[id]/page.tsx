import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ORDENS_DE_COMPRA } from "../../../../../lib/portas/recursos/compras";
import { verOrdem, opcoesDaOrdem } from "../../../../../lib/portas/recursos/compras-dados";
import { ordensdecompraAction } from "../actions";
import { FormRecebimento } from "./FormRecebimento";

/**
 * O DETALHE DA ORDEM: itens com o pendente derivado, os recebimentos; a ilha de recebimento (por item) e o estorno do molde.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(ORDENS_DE_COMPRA, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verOrdem(id), opcoesDaOrdem(), acoesPermitidas([...ORDENS_DE_COMPRA.acoes.map((a) => a.acaoDoCenso), "REGISTRAR_RECEBIMENTO_DE_ORDEM"])]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={ORDENS_DE_COMPRA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          {permitidas.has("REGISTRAR_RECEBIMENTO_DE_ORDEM") && detalhe.itensParaReceber.length > 0 ? (
            <FormRecebimento ordemId={id} itensDaOrdem={detalhe.itensParaReceber} />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
              {detalhe.itensParaReceber.length === 0 ? "Nada pendente de recebimento nesta ordem." : "Você não tem a permissão REGISTRAR_RECEBIMENTO_DE_ORDEM."}
            </p>
          )}
          <FormsDoRecurso definicao={ORDENS_DE_COMPRA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={ordensdecompraAction} modo="acoes" />
        </div>
      }
    />
  );
}
