import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { CONTRATOS } from "../../../../../lib/portas/recursos/contratacao";
import { verContrato, opcoesDoContrato } from "../../../../../lib/portas/recursos/contratacao-dados";
import { contratosAction } from "../actions";

/**
 * O DETALHE DO CONTRATO: valor e vigência derivados dos aditivos, os empenhos que o informaram, e as ações. Os aditivos oferecidos ao estorno são SÓ os vivos deste contrato.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a das licitações.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(CONTRATOS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verContrato(id), opcoesDoContrato(id), acoesPermitidas(CONTRATOS.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={CONTRATOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={CONTRATOS} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={contratosAction} modo="acoes" />}
    />
  );
}
