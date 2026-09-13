import Link from "next/link";
import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ORDENS_DE_COMPRA } from "../../../../../lib/portas/recursos/compras";
import { verOrdem, opcoesDaOrdem, solicitacoesParaVincular } from "../../../../../lib/portas/recursos/compras-dados";
import { documentosDaOrdemParaReceber } from "../../../../../lib/portas/recursos/documentos-fiscais-dados";
import { ordensdecompraAction } from "../actions";
import { FormRecebimento } from "./FormRecebimento";
import { FormVincularSolicitacao } from "./FormVincularSolicitacao";
import { Origem } from "./Origem";

/**
 * O DETALHE DA ORDEM: itens com o pendente derivado, os recebimentos; a ilha de recebimento (por item) e o
 * estorno do molde; a ORIGEM (V6 P1.1) com as parcelas de solicitação e a ilha de vínculo. Ordem ESTORNADA
 * não recebe, não empenha e não liga solicitação — o estorno é fato, e ela continua no histórico.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(ORDENS_DE_COMPRA, await searchParams);
  const [detalhe, opcoes, permitidas, documentos, solicitacoes] = await Promise.all([
    verOrdem(id),
    opcoesDaOrdem(),
    acoesPermitidas([...ORDENS_DE_COMPRA.acoes.map((a) => a.acaoDoCenso), "REGISTRAR_RECEBIMENTO_DE_ORDEM", "EMPENHAR", "EMITIR_ORDEM_DE_COMPRA"]),
    documentosDaOrdemParaReceber(id),
    solicitacoesParaVincular(id),
  ]);
  if (detalhe === null) notFound();
  const estornada = detalhe.estornada;
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
          {estornada ? (
            <p role="status" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]" data-ordem-estornada>
              Esta ordem está ESTORNADA. Ela continua no histórico; não recebe, não empenha e não liga solicitação. As parcelas de solicitação que ela atendia voltaram a pendente.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={`/licitacoes/ordens-de-compra/espelho?id=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--color-primary)] hover:underline"
            >
              Emitir espelho (PDF)
            </a>
            {permitidas.has("EMPENHAR") && !estornada ? (
              <Link
                href={`/despesa/empenhos?ordemId=${id}`}
                className="font-medium text-[color:var(--color-primary)] hover:underline"
              >
                Empenhar esta ordem
              </Link>
            ) : null}
            <Link
              href={`/licitacoes/documentos-fiscais`}
              className="font-medium text-[color:var(--color-primary)] hover:underline"
            >
              Registrar documento fiscal
            </Link>
          </div>
          <Origem ordemId={id} itens={detalhe.origem} podeDesfazer={permitidas.has("ESTORNAR_ORDEM_DE_COMPRA")} estornada={estornada} />
          {permitidas.has("EMITIR_ORDEM_DE_COMPRA") && !estornada && detalhe.itensParaVincular.length > 0 ? (
            <FormVincularSolicitacao ordemId={id} itensDaOrdem={detalhe.itensParaVincular} solicitacoes={solicitacoes} />
          ) : null}
          {permitidas.has("REGISTRAR_RECEBIMENTO_DE_ORDEM") && detalhe.itensParaReceber.length > 0 ? (
            <FormRecebimento ordemId={id} itensDaOrdem={detalhe.itensParaReceber} documentos={documentos} />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
              {estornada ? "Ordem estornada: não há o que receber." : detalhe.itensParaReceber.length === 0 ? "Nada pendente de recebimento nesta ordem." : "Você não tem a permissão REGISTRAR_RECEBIMENTO_DE_ORDEM."}
            </p>
          )}
          {estornada ? null : <FormsDoRecurso definicao={ORDENS_DE_COMPRA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={ordensdecompraAction} modo="acoes" />}
        </div>
      }
    />
  );
}
