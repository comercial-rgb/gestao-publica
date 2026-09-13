import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { SOLICITACOES_DE_COMPRA } from "../../../../../lib/portas/recursos/compras";
import { verSolicitacao, opcoesDaSolicitacao } from "../../../../../lib/portas/recursos/compras-dados";
import { solicitacoesdecompraAction } from "../actions";

/**
 * O DETALHE DA SOLICITAÇÃO: itens e movimentos no histórico; autorizar e anular como ações.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(SOLICITACOES_DE_COMPRA, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verSolicitacao(id), opcoesDaSolicitacao(), acoesPermitidas([...SOLICITACOES_DE_COMPRA.acoes.map((a) => a.acaoDoCenso)])]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={SOLICITACOES_DE_COMPRA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={SOLICITACOES_DE_COMPRA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={solicitacoesdecompraAction} modo="acoes" />}
    />
  );
}
