import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PROCESSOS_LICITATORIOS } from "../../../../../lib/portas/recursos/contratacao";
import { verProcesso, opcoesDoProcesso } from "../../../../../lib/portas/recursos/contratacao-dados";
import { processoslicitatoriosAction } from "../actions";

/**
 * O DETALHE DO PROCESSO: situação derivada, reservas vivas, contratos — e as ações que os criam. As reservas oferecidas à liberação são SÓ as deste processo.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a das licitações.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(PROCESSOS_LICITATORIOS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verProcesso(id), opcoesDoProcesso(id), acoesPermitidas(PROCESSOS_LICITATORIOS.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={PROCESSOS_LICITATORIOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={PROCESSOS_LICITATORIOS} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={processoslicitatoriosAction} modo="acoes" />}
    />
  );
}
